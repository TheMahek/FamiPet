// =====================================================
// AI TOOL LAYER (Phase 10)
// =====================================================
// The ONE boundary between the AI provider/model and the application data.
// Every tool is declared here with an explicit argument schema; arguments are
// validated against the schema (allowlisted keys only — unknown keys, MongoDB
// operator objects, owner overrides and raw model/collection names are
// rejected), ownership is resolved against the authenticated caller, and the
// actual work always flows through the shared application services (pet /
// diet / reminder / appointment). The model/controller NEVER touches models
// directly.
//
// Trust model:
//   - Reads auto-execute (owned data only) and return a NORMALIZED payload.
//   - Mutations are NEVER executed from model input. runTool() only validates
//     and creates a server-issued confirmation proposal (random token stored
//     as an HMAC-SHA256 hash). The raw token is handed to the client exactly
//     once; on user confirmation confirmTool() atomically consumes the
//     proposal (pending -> consumed => exactly-once) and then re-validates +
//     re-checks ownership and executes through the same services.
//   - The raw confirmation token is never passed to the model — resultForModel
//     strips it out. A leaked DB dump contains only hashes.
//
// Safety invariants (verified by the Phase 10 suites):
//   - No tool handler ever calls a mongoose model or builds a query.
//   - Unknown tool names are rejected; arbitrary function names never execute.
//   - Per-request call budget + per-user sliding-window quota cap execution.
//   - Every execution is audited to ToolAuditLog (who/what/read|mutation/ok).

const crypto = require("crypto");

const petService = require("../services/pet.service");
const dietService = require("../services/diet.service");
const reminderService = require("../services/reminder.service");
const appointmentService = require("../services/appointment.service");
const ToolConfirmation = require("../models/ToolConfirmation");
const ToolAuditLog = require("../models/ToolAuditLog");

const {
  isValidObjectId,
  isPlainObject,
  SPECIES,
  GENDERS,
  REMINDER_TYPES,
  REMINDER_FREQUENCIES,
  REMINDER_PRIORITIES,
  FOOD_TYPES,
  DIET_ACTIVITY_LEVELS,
  MAX_MEALS,
  MAX_PORTION_GRAMS,
} = require("../utils/validation");

// -----------------------------------------------------
// BUDGETS / LIMITS
// -----------------------------------------------------
const TOOL_MAX_CALLS_PER_REQUEST = 8; // model tool calls per /ai/ask request
const TOOL_MAX_ROUNDS = 5; // Gemini function-calling turns per request
// Per-user sliding-window quota (in-memory; resets on process restart). The
// global /api rate limiter stays as-is; this is the AI tool layer's OWN
// per-user cap (ROADMAP Phase 10 §3 task 4).
const USER_TOOL_QUOTA_WINDOW_MS = 15 * 60 * 1000;
const USER_TOOL_QUOTA_LIMIT = 60;

const HASH_KEY = "famipet-tool-confirmation";
const hmacHash = (value) =>
  crypto.createHmac("sha256", HASH_KEY).update(String(value)).digest("hex");
const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

// -----------------------------------------------------
// ERROR CATEGORIES (match ToolAuditLog.errorCategory enum)
// -----------------------------------------------------
const CATEGORIES = {
  VALIDATION: "validation",
  AUTH: "auth",
  AUTHORIZATION: "authorization",
  NOT_FOUND: "not_found",
  CONFIRMATION_REQUIRED: "confirmation_required",
  CONFIRMATION_INVALID: "confirmation_invalid",
  TOOL_UNAVAILABLE: "tool_unavailable",
  EXECUTION: "execution",
};

const STATUS_FOR_CATEGORY = {
  validation: 400,
  auth: 401,
  authorization: 403,
  not_found: 404,
  confirmation_required: 409,
  confirmation_invalid: 400,
  tool_unavailable: 409,
  execution: 500,
};

// -----------------------------------------------------
// ARGUMENT VALIDATION (allowlist only, no raw queries)
// -----------------------------------------------------
const TYPES = {
  oid: "oid",
  string: "string",
  bool: "bool",
  int: "int",
  num: "num",
  stringArray: "stringArray",
  intArray: "intArray",
  mealArray: "mealArray",
  dateString: "dateString",
  timeString: "timeString",
  timezoneString: "timezoneString",
};

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const numOrNumString = (v) =>
  typeof v === "string" && v.trim() !== "" ? Number(v) : v;

const validateField = (spec, key, value, out) => {
  const { t, optional } = spec;
  if (value === undefined || value === null || value === "") {
    if (optional) return { ok: true };
    return { ok: false, message: `Field "${key}" is required.` };
  }

  switch (t) {
    case TYPES.oid:
      if (!isValidObjectId(value)) {
        return { ok: false, message: `Field "${key}" must be a valid 24-character id.` };
      }
      out[key] = value;
      return { ok: true };

    case TYPES.string: {
      if (typeof value !== "string") {
        return { ok: false, message: `Field "${key}" must be a string.` };
      }
      if (spec.enum && !spec.enum.includes(value)) {
        return { ok: false, message: `Field "${key}" must be one of: ${spec.enum.join(", ")}.` };
      }
      if (spec.max && value.trim().length > spec.max) {
        return { ok: false, message: `Field "${key}" must be at most ${spec.max} characters.` };
      }
      if (spec.min && value.trim().length < spec.min) {
        return { ok: false, message: `Field "${key}" must be at least ${spec.min} characters.` };
      }
      out[key] = value.trim();
      return { ok: true };
    }

    case TYPES.bool:
      if (typeof value !== "boolean") {
        return { ok: false, message: `Field "${key}" must be a boolean.` };
      }
      out[key] = value;
      return { ok: true };

    case TYPES.int: {
      const n = numOrNumString(value);
      if (typeof n !== "number" || Number.isNaN(n) || !Number.isInteger(n)) {
        return { ok: false, message: `Field "${key}" must be a whole number.` };
      }
      if (spec.min !== undefined && n < spec.min) {
        return { ok: false, message: `Field "${key}" must be at least ${spec.min}.` };
      }
      if (spec.max !== undefined && n > spec.max) {
        return { ok: false, message: `Field "${key}" must be at most ${spec.max}.` };
      }
      out[key] = n;
      return { ok: true };
    }

    case TYPES.num: {
      const n = numOrNumString(value);
      if (typeof n !== "number" || Number.isNaN(n)) {
        return { ok: false, message: `Field "${key}" must be a number.` };
      }
      if (spec.min !== undefined && n < spec.min) {
        return { ok: false, message: `Field "${key}" must be at least ${spec.min}.` };
      }
      if (spec.max !== undefined && n > spec.max) {
        return { ok: false, message: `Field "${key}" must be at most ${spec.max}.` };
      }
      out[key] = n;
      return { ok: true };
    }

    case TYPES.stringArray: {
      if (!Array.isArray(value)) {
        return { ok: false, message: `Field "${key}" must be an array of strings.` };
      }
      if (spec.maxItems !== undefined && value.length > spec.maxItems) {
        return { ok: false, message: `Field "${key}" can contain at most ${spec.maxItems} items.` };
      }
      const items = [];
      for (const item of value) {
        if (typeof item !== "string") {
          return { ok: false, message: `Field "${key}" entries must be strings.` };
        }
        const s = item.trim();
        if (!s) continue;
        if (spec.itemMax !== undefined && s.length > spec.itemMax) {
          return { ok: false, message: `Field "${key}" entries must be at most ${spec.itemMax} characters.` };
        }
        items.push(s);
      }
      out[key] = items;
      return { ok: true };
    }

    case TYPES.intArray: {
      if (!Array.isArray(value)) {
        return { ok: false, message: `Field "${key}" must be an array of numbers.` };
      }
      if (spec.maxItems !== undefined && value.length > spec.maxItems) {
        return { ok: false, message: `Field "${key}" can contain at most ${spec.maxItems} items.` };
      }
      const items = [];
      for (const item of value) {
        const n = numOrNumString(item);
        if (typeof n !== "number" || Number.isNaN(n) || !Number.isInteger(n)) {
          return { ok: false, message: `Field "${key}" entries must be whole numbers.` };
        }
        if (spec.min !== undefined && n < spec.min) {
          return { ok: false, message: `Field "${key}" entries must be at least ${spec.min}.` };
        }
        if (spec.max !== undefined && n > spec.max) {
          return { ok: false, message: `Field "${key}" entries must be at most ${spec.max}.` };
        }
        items.push(n);
      }
      out[key] = items;
      return { ok: true };
    }

    case TYPES.mealArray: {
      if (!Array.isArray(value)) {
        return { ok: false, message: `Field "${key}" must be an array of meal objects.` };
      }
      if (value.length > MAX_MEALS) {
        return { ok: false, message: `Field "${key}" can contain at most ${MAX_MEALS} meal times.` };
      }
      const meals = [];
      const allowedMealKeys = ["label", "time", "portionGrams", "isActive", "_id"];
      for (const meal of value) {
        if (!isPlainObject(meal)) {
          return { ok: false, message: `Field "${key}" entries must be objects.` };
        }
        for (const k of Object.keys(meal)) {
          if (!allowedMealKeys.includes(k)) {
            return { ok: false, message: `Unknown meal field "${k}" is not allowed.` };
          }
        }
        const entry = {};
        if (meal.label !== undefined && meal.label !== null && meal.label !== "") {
          if (typeof meal.label !== "string" || meal.label.trim().length > 40) {
            return { ok: false, message: "Meal labels must be at most 40 characters." };
          }
          entry.label = meal.label.trim();
        }
        if (typeof meal.time !== "string" || !TIME_RE.test(meal.time.trim())) {
          return { ok: false, message: "Each meal needs a valid 24-hour HH:mm time." };
        }
        entry.time = meal.time.trim();
        if (meal.portionGrams !== undefined && meal.portionGrams !== null && meal.portionGrams !== "") {
          const n = numOrNumString(meal.portionGrams);
          if (typeof n !== "number" || Number.isNaN(n) || !Number.isInteger(n) || n < 0 || n > MAX_PORTION_GRAMS) {
            return { ok: false, message: `Meal portion must be a whole number of grams (0–${MAX_PORTION_GRAMS}).` };
          }
          entry.portionGrams = n;
        }
        if (meal.isActive !== undefined) {
          if (typeof meal.isActive !== "boolean") {
            return { ok: false, message: "Meal isActive must be a boolean." };
          }
          entry.isActive = meal.isActive;
        }
        if (meal._id !== undefined && meal._id !== null && meal._id !== "") {
          if (!isValidObjectId(meal._id)) {
            return { ok: false, message: 'Meal "_id" must be a valid 24-character id.' };
          }
          entry._id = meal._id;
        }
        meals.push(entry);
      }
      out[key] = meals;
      return { ok: true };
    }

    case TYPES.dateString: {
      if (typeof value !== "string" || !DATE_RE.test(value.trim())) {
        return { ok: false, message: `Field "${key}" must be a YYYY-MM-DD date.` };
      }
      const d = new Date(value.trim());
      if (Number.isNaN(d.getTime())) {
        return { ok: false, message: `Field "${key}" is not a valid date.` };
      }
      out[key] = value.trim();
      return { ok: true };
    }

    case TYPES.timeString:
      if (typeof value !== "string" || !TIME_RE.test(value.trim())) {
        return { ok: false, message: `Field "${key}" must be a valid 24-hour HH:mm time.` };
      }
      out[key] = value.trim();
      return { ok: true };

    case TYPES.timezoneString:
      if (typeof value !== "string" || !reminderService.isValidTimeZone(value)) {
        return { ok: false, message: `Field "${key}" must be a valid IANA timezone.` };
      }
      out[key] = value.trim();
      return { ok: true };

    default:
      return { ok: false, message: `Unsupported field type for "${key}".` };
  }
};

const validateArgs = (schema, args) => {
  if (!isPlainObject(args)) {
    return { ok: false, message: "Tool arguments must be a plain object." };
  }
  for (const k of Object.keys(args)) {
    if (!schema || !Object.prototype.hasOwnProperty.call(schema, k)) {
      return { ok: false, message: `Unknown field "${k}" is not allowed.` };
    }
  }
  const sanitized = {};
  for (const key of Object.keys(schema || {})) {
    const spec = schema[key];
    const res = validateField(spec, key, args[key], sanitized);
    if (!res.ok) return { ok: false, message: res.message };
    if (args[key] === undefined && spec.default !== undefined) {
      sanitized[key] = spec.default;
    }
  }
  return { ok: true, value: sanitized };
};

// -----------------------------------------------------
// NORMALIZED (model-safe) PAYLOAD HELPERS
// -----------------------------------------------------
// Reads strip owner, __v, timestamps and bulky/private fields (e.g. pet QR
// data URLs) so the model receives only compact, useful facts. petId is always
// the source of truth for downstream calls (never the raw ingested value).
const toSafePet = (p) =>
  p
    ? {
        id: String(p._id),
        name: p.name,
        species: p.species,
        breed:
          p.breed && p.breed._id
            ? { id: String(p.breed._id), name: p.breed.name, species: p.breed.species }
            : typeof p.breed === "string"
              ? { id: p.breed, name: "" }
              : null,
        gender: p.gender,
        age: p.age,
        weight: p.weight,
        color: p.color,
        vaccinated: p.vaccinated,
        health: p.health,
        adopted: p.adopted,
        description: p.description,
      }
    : null;

const toSafePetRef = (pet) =>
  pet && pet._id
    ? { id: String(pet._id), name: pet.name, species: pet.species }
    : pet || null;

const toSafeReminder = (r) =>
  r
    ? {
        id: String(r._id),
        title: r.title,
        type: r.type,
        description: r.description,
        pet: toSafePetRef(r.pet),
        date: r.date ? String(r.date).slice(0, 10) : null,
        time: r.time,
        timezone: r.timezone,
        frequency: r.frequency,
        repeatInterval: r.repeatInterval,
        daysOfWeek: r.daysOfWeek,
        priority: r.priority,
        isActive: r.isActive,
        isCompleted: r.isCompleted,
        nextRunAt: r.effectiveNext !== undefined ? r.effectiveNext : r.nextRunAt || null,
      }
    : null;

const toSafeDiet = (d) =>
  d
    ? {
        id: String(d._id),
        petId: String(d.pet && d.pet._id ? d.pet._id : d.pet),
        foodType: d.foodType,
        brand: d.brand,
        dailyPortionGrams: d.dailyPortionGrams,
        timezone: d.timezone,
        activityLevel: d.activityLevel,
        allergies: Array.isArray(d.allergies) ? d.allergies : [],
        treatPolicy: d.treatPolicy,
        notes: d.notes,
        meals: Array.isArray(d.meals)
          ? d.meals.map((m) => ({
              id: String(m._id),
              label: m.label,
              time: m.time,
              portionGrams: m.portionGrams,
              isActive: m.isActive !== false,
            }))
          : [],
      }
    : null;

const toSafeAppointment = (a) =>
  a
    ? {
        id: String(a._id),
        pet: toSafePetRef(a.pet),
        veterinarian:
          a.veterinarian && a.veterinarian._id
            ? {
                id: String(a.veterinarian._id),
                name: a.veterinarian.name,
                clinic: a.veterinarian.clinic,
                specialization: a.veterinarian.specialization,
                phone: a.veterinarian.phone,
              }
            : a.veterinarian || null,
        date: a.date ? String(a.date).slice(0, 10) : null,
        time: a.time,
        type: a.type,
        status: a.status,
        symptoms: a.symptoms,
        notes: a.notes,
        diagnosis: a.diagnosis,
      }
    : null;

// -----------------------------------------------------
// TOOL REGISTRY (declarative source of truth)
// -----------------------------------------------------
const TOOL_SCHEMAS = {
  get_pet: {
    kind: "read",
    description:
      "Get one of the user's own pets by id. Ownership is always enforced; a pet belonging to another user is never returned.",
    params: { petId: { t: TYPES.oid, description: "The pet's 24-character id." } },
    required: ["petId"],
  },

  create_pet: {
    kind: "mutation",
    description:
      "Add a new pet to the user's family. Requires explicit confirmation before it runs. breed may be a breed name or id; species must match the pet.",
    params: {
      breed: { t: TYPES.string, min: 1, max: 100, description: "Breed name or breed id." },
      name: { t: TYPES.string, min: 1, max: 100, description: "Pet name (max 100 characters)." },
      species: { t: TYPES.string, enum: SPECIES, description: "dog, cat, bird, rabbit, fish or other." },
      gender: { t: TYPES.string, enum: GENDERS, description: "male or female." },
      age: { t: TYPES.int, min: 0, description: "Age in years (whole number, 0 or more)." },
      weight: { t: TYPES.num, min: 0, optional: true, description: "Weight in kg." },
      color: { t: TYPES.string, max: 50, optional: true },
      vaccinated: { t: TYPES.bool, optional: true },
      health: { t: TYPES.string, max: 300, optional: true },
      adopted: { t: TYPES.bool, optional: true },
      description: { t: TYPES.string, max: 2000, optional: true },
    },
    required: ["breed", "name", "species", "gender", "age"],
  },

  update_pet: {
    kind: "mutation",
    description: "Update one of the user's own pets. Requires explicit confirmation before it runs.",
    params: {
      petId: { t: TYPES.oid, description: "The pet's 24-character id." },
      breed: { t: TYPES.string, min: 1, max: 100, optional: true, description: "Breed name or breed id." },
      name: { t: TYPES.string, min: 1, max: 100, optional: true },
      species: { t: TYPES.string, enum: SPECIES, optional: true },
      gender: { t: TYPES.string, enum: GENDERS, optional: true },
      age: { t: TYPES.int, min: 0, optional: true },
      weight: { t: TYPES.num, min: 0, optional: true },
      color: { t: TYPES.string, max: 50, optional: true },
      vaccinated: { t: TYPES.bool, optional: true },
      health: { t: TYPES.string, max: 300, optional: true },
      adopted: { t: TYPES.bool, optional: true },
      description: { t: TYPES.string, max: 2000, optional: true },
    },
    required: ["petId"],
  },

  get_diet: {
    kind: "read",
    description:
      "Get the diet profile and informational-only guidance for one of the user's own pets (guidance is always non-medical).",
    params: { petId: { t: TYPES.oid, description: "The pet's 24-character id." } },
    required: ["petId"],
  },

  update_diet: {
    kind: "mutation",
    description:
      "Create or update the diet profile for one of the user's own pets. Meals added here become daily feeding reminders. Requires explicit confirmation before it runs.",
    params: {
      petId: { t: TYPES.oid, description: "The pet's 24-character id." },
      foodType: { t: TYPES.string, enum: FOOD_TYPES, optional: true, description: "dry, wet, raw, homemade or mixed." },
      brand: { t: TYPES.string, max: 200, optional: true },
      dailyPortionGrams: { t: TYPES.int, min: 1, max: MAX_PORTION_GRAMS, optional: true },
      timezone: { t: TYPES.timezoneString, optional: true, description: "IANA timezone, e.g. UTC, Asia/Kolkata." },
      activityLevel: { t: TYPES.string, enum: DIET_ACTIVITY_LEVELS, optional: true },
      allergies: { t: TYPES.stringArray, maxItems: 20, itemMax: 60, optional: true },
      treatPolicy: { t: TYPES.string, max: 300, optional: true },
      notes: { t: TYPES.string, max: 1000, optional: true },
      meals: {
        t: TYPES.mealArray,
        optional: true,
        description:
          `Meal schedule (max ${MAX_MEALS}): array of {label, time "HH:mm", portionGrams, isActive, _id (include to keep an existing meal)}.`,
      },
    },
    required: ["petId"],
  },

  get_appointments: {
    kind: "read",
    description: "List the user's own veterinary appointments, soonest first.",
    params: {},
    required: [],
  },

  get_reminders: {
    kind: "read",
    description: "List the user's own care reminders for a status filter, soonest next occurrence first.",
    params: {
      filter: {
        t: TYPES.string,
        enum: ["active", "completed", "inactive", "all"],
        optional: true,
        default: "active",
        description: "active (default), completed, inactive or all.",
      },
    },
    required: [],
  },

  create_reminder: {
    kind: "mutation",
    description:
      "Create a care reminder for one of the user's own pets. Requires explicit confirmation before it runs. date is the calendar day; time is 24-hour HH:mm.",
    params: {
      title: { t: TYPES.string, min: 1, max: 200, description: "Reminder title." },
      type: {
        t: TYPES.string,
        enum: REMINDER_TYPES,
        description: "feeding, medicine, vaccination, grooming, appointment, exercise, droplet, bath or custom.",
      },
      date: { t: TYPES.dateString, description: "Calendar date YYYY-MM-DD." },
      time: { t: TYPES.timeString, description: "24-hour HH:mm." },
      pet: { t: TYPES.oid, description: "The pet's 24-character id." },
      description: { t: TYPES.string, max: 1000, optional: true },
      frequency: {
        t: TYPES.string,
        enum: REMINDER_FREQUENCIES,
        optional: true,
        default: "once",
        description: "once, daily, interval, weekly or monthly.",
      },
      timezone: { t: TYPES.timezoneString, optional: true, default: "UTC" },
      repeatInterval: { t: TYPES.int, min: 1, max: 365, optional: true, description: "Days between repeats when frequency is interval." },
      daysOfWeek: { t: TYPES.intArray, maxItems: 7, min: 0, max: 6, optional: true, description: "Weekday numbers 0=Sun..6=Sat (weekly only)." },
      priority: { t: TYPES.string, enum: REMINDER_PRIORITIES, optional: true, default: "normal" },
      notificationEnabled: { t: TYPES.bool, optional: true },
    },
    required: ["title", "type", "date", "time", "pet"],
  },

  update_reminder: {
    kind: "mutation",
    description: "Update one of the user's own reminders. Requires explicit confirmation before it runs.",
    params: {
      reminderId: { t: TYPES.oid, description: "The reminder's 24-character id." },
      title: { t: TYPES.string, min: 1, max: 200, optional: true },
      type: { t: TYPES.string, enum: REMINDER_TYPES, optional: true },
      description: { t: TYPES.string, max: 1000, optional: true },
      date: { t: TYPES.dateString, optional: true },
      time: { t: TYPES.timeString, optional: true },
      timezone: { t: TYPES.timezoneString, optional: true },
      frequency: { t: TYPES.string, enum: REMINDER_FREQUENCIES, optional: true },
      repeatInterval: { t: TYPES.int, min: 1, max: 365, optional: true },
      daysOfWeek: { t: TYPES.intArray, maxItems: 7, min: 0, max: 6, optional: true },
      priority: { t: TYPES.string, enum: REMINDER_PRIORITIES, optional: true },
      notificationEnabled: { t: TYPES.bool, optional: true },
      isActive: { t: TYPES.bool, optional: true },
      isCompleted: { t: TYPES.bool, optional: true },
      pet: { t: TYPES.oid, optional: true, description: "Move the reminder to another of the user's pets." },
    },
    required: ["reminderId"],
  },
};

// SAFE tool names (exactly the required registry — no extras).
const TOOL_NAMES = Object.keys(TOOL_SCHEMAS);

// -----------------------------------------------------
// PREVIEWS + EXECUTION HANDLERS (service-backed, never model-touching)
// -----------------------------------------------------
const previewForMutation = async ({ tool, user, args }) => {
  let petName = null;
  let petId = args.petId !== undefined ? args.petId : args.pet !== undefined ? args.pet : null;
  if (petId) {
    const owned = await petService.getOwnedPet({ user, petId });
    if (owned.ok && owned.data && owned.data.pet && owned.data.pet.name) {
      petName = owned.data.pet.name;
    }
  }

  const base = { petId: petId || undefined, petName, summary: "", fields: {} };
  switch (tool) {
    case "create_pet":
      base.summary = `Add a new ${args.species || "pet"} named "${args.name}"`;
      base.fields = { name: args.name, species: args.species, gender: args.gender, age: args.age, breed: args.breed };
      break;
    case "update_pet": {
      const changed = Object.keys(args).filter((k) => k !== "petId");
      base.summary = `Update ${petName ? `"${petName}"` : "a pet"} (${changed.join(", ") || "details"})`;
      base.fields = Object.assign({}, args);
      delete base.fields.petId;
      break;
    }
    case "update_diet":
      base.summary =
        `Set a diet profile for ${petName ? `"${petName}"` : "the pet"}` +
        (Array.isArray(args.meals) ? ` (${args.meals.length} meal time${args.meals.length === 1 ? "" : "s"})` : "");
      base.fields = {
        foodType: args.foodType,
        dailyPortionGrams: args.dailyPortionGrams,
        meals: Array.isArray(args.meals) ? args.meals.map((m) => ({ label: m.label, time: m.time, portionGrams: m.portionGrams })) : undefined,
      };
      break;
    case "create_reminder":
      base.summary =
        `Create a ${args.type || ""} reminder "${args.title}"` +
        (petName ? ` for ${petName}` : "") +
        ` on ${args.date} at ${args.time}`;
      base.fields = { title: args.title, type: args.type, date: args.date, time: args.time, petName, frequency: args.frequency };
      break;
    case "update_reminder": {
      const changed = Object.keys(args).filter((k) => k !== "reminderId");
      base.summary = `Update a reminder (${changed.join(", ") || "details"})`;
      base.fields = Object.assign({}, args);
      delete base.fields.reminderId;
      break;
    }
    default:
      base.summary = tool;
  }
  return base;
};

// Mutation handlers run ONLY through confirmTool(). Each returns the matched
// service's native contract ({ ok, status, message | data }).
const MUTATION_RUNNERS = {
  create_pet: async ({ user, args }) => petService.createPetForUser({ user, input: args }),
  update_pet: async ({ user, args }) => {
    const { petId, ...input } = args;
    return petService.updatePetForUser({ user, petId, input });
  },
  update_diet: async ({ user, args }) => {
    const { petId, ...input } = args;
    return dietService.upsertPetDiet({ user, petId, input });
  },
  create_reminder: async ({ user, args }) => reminderService.createReminderForUser({ user, input: args }),
  update_reminder: async ({ user, args }) => {
    const { reminderId, ...input } = args;
    return reminderService.updateReminderForUser({ user, reminderId, input });
  },
};

const READ_RUNNERS = {
  get_pet: async ({ user, args }) => petService.getOwnedPet({ user, petId: args.petId }),
  get_diet: async ({ user, args }) => dietService.getPetDiet({ user, petId: args.petId }),
  get_appointments: async ({ user }) => appointmentService.listAppointments({ user }),
  get_reminders: async ({ user, args }) => {
    const rows = await reminderService.listReminders({ user, filter: args.filter || "active" });
    const reminders = Array.isArray(rows) ? rows : [];
    return { ok: true, status: 200, data: { count: reminders.length, reminders } };
  },
};

const normalizeRead = (tool, result) => {
  const data = result.data || {};
  switch (tool) {
    case "get_pet":
      return { pet: toSafePet(data.pet) };
    case "get_diet":
      return {
        petId: data.diet && data.diet.pet ? String(data.diet.pet) : null,
        diet: toSafeDiet(data.diet),
        guidance: data.guidance || null,
      };
    case "get_appointments":
      return { count: data.count || (data.appointments || []).length, appointments: (data.appointments || []).map(toSafeAppointment) };
    case "get_reminders":
      return { count: (data.reminders || []).length, reminders: (data.reminders || []).map(toSafeReminder) };
    default:
      return data;
  }
};

const normalizeMutationResult = (result, tool) => {
  // pet/diet services return `data`; reminder service returns `body`.
  const data = result.data || result.body || {};
  let resource = null;
  let pet = null;
  let reminder = null;
  let diet = null;
  let message = (data.message || result.message || "Done.").toString();
  if (data.pet && data.pet._id) {
    resource = { id: String(data.pet._id), label: data.pet.name || "pet" };
    pet = toSafePet(data.pet);
    message = `Pet ${data.pet.name ? `"${data.pet.name}"` : "updated"} saved.`;
  } else if (data.reminder && data.reminder._id) {
    resource = { id: String(data.reminder._id), label: data.reminder.title || "reminder" };
    reminder = toSafeReminder(data.reminder);
  } else if (data.diet && data.diet._id) {
    resource = { id: String(data.diet._id), label: "diet profile" };
    diet = toSafeDiet(data.diet);
  }
  return { message, resource, created: data.created, pet, reminder, diet };
};

// -----------------------------------------------------
// PER-USER QUOTA (in-memory sliding window)
// -----------------------------------------------------
const userToolCalls = new Map(); // userId -> [timestamps]
const checkAndMarkUserQuota = (userId) => {
  const now = Date.now();
  const key = String(userId || "");
  const arr = (userToolCalls.get(key) || []).filter((t) => now - t < USER_TOOL_QUOTA_WINDOW_MS);
  if (arr.length >= USER_TOOL_QUOTA_LIMIT) {
    userToolCalls.set(key, arr);
    return false;
  }
  arr.push(now);
  userToolCalls.set(key, arr);
  return true;
};

// -----------------------------------------------------
// AUDIT LOG (fire-and-forget, TTL 30 days)
// -----------------------------------------------------
const logAudit = ({ user, requestId, tool, kind, ok, errorCategory = "", resourceId = "" }) => {
  ToolAuditLog.create({
    user: user && user._id ? user._id : user,
    requestId: requestId || "",
    tool,
    kind,
    ok: ok ? true : false,
    ...(errorCategory ? { errorCategory } : {}),
    resourceId: resourceId || "",
  }).catch((err) => console.error("[ToolAudit] log failed:", err && err.message));
};

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Tool execution timed out.")), ms)),
  ]);

const safeHandlerError = (err) => {
  console.error("[ToolLayer] execution error:", err && err.message);
  return { ok: false, errorCategory: CATEGORIES.EXECUTION, statusCode: STATUS_FOR_CATEGORY.execution, message: "Something went wrong while executing that action." };
};

// Service result -> tool-layer result (status-driven error categorization).
const resultFromService = (result) => {
  if (!result || result.ok !== true) {
    const status = result && result.status ? result.status : 400;
    let category = CATEGORIES.VALIDATION;
    if (status === 404) category = CATEGORIES.NOT_FOUND;
    else if (status === 403) category = CATEGORIES.AUTHORIZATION;
    else if (status === 401) category = CATEGORIES.AUTH;
    else if (status >= 500) category = CATEGORIES.EXECUTION;
    return {
      ok: false,
      errorCategory: category,
      statusCode: status,
      message: (result && (result.message || (result.body && result.body.message))) || "The action was rejected.",
    };
  }
  return { ok: true, result };
};

// Proposal-time authorization: any pet reference in mutation args must be the
// caller's own (cross-user proposals are denied before a token is minted).
const checkProposalReferences = async ({ tool, user, args }) => {
  const deny = (owned) => ({
    ok: false,
    errorCategory: owned.status === 400 ? CATEGORIES.VALIDATION : CATEGORIES.AUTHORIZATION,
    statusCode: STATUS_FOR_CATEGORY.authorization,
    message: "That pet does not belong to you.",
  });
  if (args.petId !== undefined) {
    const owned = await petService.ownedPetResult({ user, petId: args.petId });
    if (!owned.ok) return deny(owned);
  }
  if (args.pet !== undefined) {
    const owned = await petService.ownedPetResult({ user, petId: args.pet });
    if (!owned.ok) return deny(owned);
  }
  return { ok: true };
};

const createProposal = async ({ user, requestId, tool, args, callBudget }) => {
  if (callBudget && callBudget.used >= callBudget.max) {
    return { ok: false, errorCategory: CATEGORIES.TOOL_UNAVAILABLE, statusCode: STATUS_FOR_CATEGORY.tool_unavailable, message: "Tool call limit reached for this request." };
  }
  const refs = await checkProposalReferences({ tool, user, args });
  if (!refs.ok) return refs;

  const preview = await previewForMutation({ tool, user, args });
  const token = crypto.randomBytes(32).toString("base64url");
  const fingerprint = sha256(JSON.stringify({ tool, args }));
  const expiresAt = new Date(Date.now() + ToolConfirmation.CONFIRM_TTL_MS);

  // Reuse-dedupe: supersede any prior IDENTICAL pending proposal so only one
  // valid token exists per (user, tool, args) — repeated identical emission
  // from the model never leaves a pile of live tokens.
  await ToolConfirmation.updateMany(
    { user: user._id || user.id, tool, fingerprint, status: "pending" },
    { $set: { status: "cancelled" } }
  );

  const proposal = await ToolConfirmation.create({
    tokenHash: hmacHash(token),
    user: user._id || user.id,
    tool,
    args,
    fingerprint,
    kind: "mutation",
    status: "pending",
    expiresAt,
  });

  return {
    ok: true,
    tool,
    kind: "mutation",
    requiresConfirmation: true,
    action: tool,
    preview,
    confirmation: { id: String(proposal._id), token, expiresAt: expiresAt.toISOString() },
  };
};

// -----------------------------------------------------
// PUBLIC API: runTool / confirmTool / cancelTool / defs
// -----------------------------------------------------

/**
 * Execute a read tool (auto) or mint a confirmation proposal for a mutation.
 * NEVER executes mutations. `user` is the authenticated caller (req.user) and
 * is the ONLY ownership source — the model can never choose an owner.
 * @param {object} opts { user, requestId, tool, args, callBudget }
 */
async function runTool({ user, requestId, tool, args, callBudget }) {
  if (!user) {
    return { ok: false, errorCategory: CATEGORIES.AUTH, statusCode: STATUS_FOR_CATEGORY.auth, message: "Authentication required." };
  }

  if (callBudget && callBudget.used >= callBudget.max) {
    return { ok: false, errorCategory: CATEGORIES.TOOL_UNAVAILABLE, statusCode: STATUS_FOR_CATEGORY.tool_unavailable, message: "Tool call limit reached for this request." };
  }

  if (typeof tool !== "string" || !TOOL_SCHEMAS[tool]) {
    return { ok: false, errorCategory: CATEGORIES.TOOL_UNAVAILABLE, statusCode: STATUS_FOR_CATEGORY.tool_unavailable, message: "Unknown tool." };
  }

  if (!checkAndMarkUserQuota(user._id || user.id)) {
    return { ok: false, errorCategory: CATEGORIES.TOOL_UNAVAILABLE, statusCode: STATUS_FOR_CATEGORY.tool_unavailable, message: "Tool use limit reached. Please try again later." };
  }

  const schema = TOOL_SCHEMAS[tool];
  const validated = validateArgs(schema.params, args);
  if (!validated.ok) {
    logAudit({ user, requestId, tool, kind: schema.kind, ok: false, errorCategory: CATEGORIES.VALIDATION });
    return { ok: false, errorCategory: CATEGORIES.VALIDATION, statusCode: STATUS_FOR_CATEGORY.validation, message: validated.message };
  }
  const safeArgs = validated.value;

  if (schema.kind === "mutation") {
    const proposal = await createProposal({ user, requestId, tool, args: safeArgs, callBudget });
    logAudit({
      user,
      requestId,
      tool,
      kind: "mutation",
      ok: proposal.ok,
      errorCategory: proposal.ok ? "" : proposal.errorCategory,
      resourceId: proposal.ok && proposal.preview ? proposal.preview.petId || "" : "",
    });
    return proposal;
  }

  // Read: auto-execute through the service behind a per-call timeout.
  try {
    const result = await withTimeout(READ_RUNNERS[tool]({ user, args: safeArgs }), 15000);
    const mapped = resultFromService(result);
    if (!mapped.ok) {
      logAudit({ user, requestId, tool, kind: "read", ok: false, errorCategory: mapped.errorCategory, resourceId: safeArgs.petId || "" });
      return { ok: false, errorCategory: mapped.errorCategory, statusCode: mapped.statusCode, message: mapped.message };
    }
    const normalized = normalizeRead(tool, mapped.result);
    logAudit({ user, requestId, tool, kind: "read", ok: true, resourceId: safeArgs.petId || (normalized && normalized.pet ? String(normalized.pet.id) : "") });
    return { ok: true, tool, kind: "read", data: normalized };
  } catch (err) {
    logAudit({ user, requestId, tool, kind: "read", ok: false, errorCategory: CATEGORIES.EXECUTION, resourceId: safeArgs.petId || "" });
    return safeHandlerError(err);
  }
}

/**
 * User has confirmed a pending proposal. Atomically consumes the token
 * (exactly-once), re-validates, re-checks ownership and executes through the
 * service.
 */
async function confirmTool({ user, requestId, token }) {
  if (!user) {
    return { ok: false, errorCategory: CATEGORIES.AUTH, statusCode: STATUS_FOR_CATEGORY.auth, message: "Authentication required." };
  }
  if (typeof token !== "string" || !token.trim() || token.length > 256) {
    return { ok: false, errorCategory: CATEGORIES.CONFIRMATION_INVALID, statusCode: STATUS_FOR_CATEGORY.confirmation_invalid, message: "Invalid confirmation token." };
  }

  const proposal = await ToolConfirmation.findOne({ tokenHash: hmacHash(token.trim()) }).lean();
  const invalid = () => ({ ok: false, errorCategory: CATEGORIES.CONFIRMATION_INVALID, statusCode: STATUS_FOR_CATEGORY.confirmation_invalid, message: "This confirmation is invalid or has expired." });

  if (!proposal) return invalid();
  if (String(proposal.user) !== String(user._id || user.id)) {
    logAudit({ user, requestId, tool: proposal.tool, kind: "mutation", ok: false, errorCategory: CATEGORIES.AUTHORIZATION });
    return { ok: false, errorCategory: CATEGORIES.AUTHORIZATION, statusCode: STATUS_FOR_CATEGORY.authorization, message: "This confirmation does not belong to your account." };
  }
  if (proposal.status === "consumed") return invalid();
  if (proposal.status === "cancelled") return { ok: false, errorCategory: CATEGORIES.CONFIRMATION_INVALID, statusCode: STATUS_FOR_CATEGORY.confirmation_invalid, message: "This action was cancelled." };
  if (!proposal.expiresAt || new Date(proposal.expiresAt).getTime() <= Date.now()) return invalid();

  // Exactly-once: only a pristine pending row may flip to consumed.
  const consumed = await ToolConfirmation.findOneAndUpdate(
    { _id: proposal._id, status: "pending", expiresAt: { $gt: new Date() } },
    { $set: { status: "consumed" } },
    { new: true }
  );
  if (!consumed) return invalid();

  const schema = TOOL_SCHEMAS[proposal.tool];
  if (!schema || schema.kind !== "mutation" || !MUTATION_RUNNERS[proposal.tool]) {
    return { ok: false, errorCategory: CATEGORIES.TOOL_UNAVAILABLE, statusCode: STATUS_FOR_CATEGORY.tool_unavailable, message: "Unknown tool." };
  }

  // Re-validate the sanitized snapshot (still allowlisted) against the live
  // schema, then re-check ownership before executing.
  const validated = validateArgs(schema.params, proposal.args || {});
  if (!validated.ok) {
    logAudit({ user, requestId, tool: proposal.tool, kind: "mutation", ok: false, errorCategory: CATEGORIES.VALIDATION });
    return { ok: false, errorCategory: CATEGORIES.VALIDATION, statusCode: STATUS_FOR_CATEGORY.validation, message: validated.message };
  }
  const args = validated.value;
  const refs = await checkProposalReferences({ tool: proposal.tool, user, args });
  if (!refs.ok) {
    logAudit({ user, requestId, tool: proposal.tool, kind: "mutation", ok: false, errorCategory: refs.errorCategory });
    return refs;
  }

  try {
    const result = await withTimeout(MUTATION_RUNNERS[proposal.tool]({ user, args }), 15000);
    const mapped = resultFromService(result);
    if (!mapped.ok) {
      logAudit({ user, requestId, tool: proposal.tool, kind: "mutation", ok: false, errorCategory: mapped.errorCategory, resourceId: args.petId || args.pet || args.reminderId || "" });
      return { ok: false, errorCategory: mapped.errorCategory, statusCode: mapped.statusCode, message: mapped.message };
    }
    const normalized = normalizeMutationResult(mapped.result, proposal.tool);
    logAudit({
      user,
      requestId,
      tool: proposal.tool,
      kind: "mutation",
      ok: true,
      resourceId: normalized.resource ? String(normalized.resource.id) : args.petId || args.pet || args.reminderId || "",
    });
    return { ok: true, tool: proposal.tool, kind: "mutation", action: proposal.tool, data: normalized };
  } catch (err) {
    logAudit({ user, requestId, tool: proposal.tool, kind: "mutation", ok: false, errorCategory: CATEGORIES.EXECUTION, resourceId: args.petId || args.reminderId || "" });
    return safeHandlerError(err);
  }
}

/** Cancel a pending proposal (single-use token is invalidated immediately). */
async function cancelTool({ user, requestId, token }) {
  if (!user) {
    return { ok: false, errorCategory: CATEGORIES.AUTH, statusCode: STATUS_FOR_CATEGORY.auth, message: "Authentication required." };
  }
  if (typeof token !== "string" || !token.trim() || token.length > 256) {
    return { ok: false, errorCategory: CATEGORIES.CONFIRMATION_INVALID, statusCode: STATUS_FOR_CATEGORY.confirmation_invalid, message: "Invalid confirmation token." };
  }
  const invalid = () => ({ ok: false, errorCategory: CATEGORIES.CONFIRMATION_INVALID, statusCode: STATUS_FOR_CATEGORY.confirmation_invalid, message: "This confirmation is invalid or has expired." });

  const proposal = await ToolConfirmation.findOne({ tokenHash: hmacHash(token.trim()) }).lean();
  if (!proposal) return invalid();
  if (String(proposal.user) !== String(user._id || user.id)) {
    return { ok: false, errorCategory: CATEGORIES.AUTHORIZATION, statusCode: STATUS_FOR_CATEGORY.authorization, message: "This confirmation does not belong to your account." };
  }
  if (proposal.status === "consumed" || proposal.status === "cancelled") {
    // Already handled — cancel is idempotent from the user's perspective.
    return { ok: true, message: "Action cancelled." };
  }
  await ToolConfirmation.updateOne({ _id: proposal._id, status: "pending" }, { $set: { status: "cancelled" } });
  return { ok: true, message: "Action cancelled." };
}

const geminiPropertyType = (spec) => {
  switch (spec.t) {
    case TYPES.oid:
    case TYPES.string:
    case TYPES.dateString:
    case TYPES.timeString:
    case TYPES.timezoneString:
      return "STRING";
    case TYPES.bool:
      return "BOOLEAN";
    case TYPES.int:
    case TYPES.num:
      return "NUMBER";
    case TYPES.stringArray:
      return { type: "ARRAY", items: { type: "STRING" } };
    case TYPES.intArray:
      return { type: "ARRAY", items: { type: "NUMBER" } };
    case TYPES.mealArray:
      return {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            label: { type: "STRING" },
            time: { type: "STRING", description: "24-hour HH:mm" },
            portionGrams: { type: "NUMBER" },
            isActive: { type: "BOOLEAN" },
            _id: { type: "STRING", description: "existing meal id to keep" },
          },
        },
      };
    default:
      return "STRING";
  }
};

/** Gemini function declarations derived from the registry. */
function getToolDefinitions() {
  return TOOL_NAMES.map((name) => {
    const s = TOOL_SCHEMAS[name];
    const properties = {};
    for (const key of Object.keys(s.params)) {
      const spec = s.params[key];
      const base = {
        type: geminiPropertyType(spec),
        description: spec.description || `${key}${spec.optional ? " (optional)" : ""}`,
      };
      if (spec.enum) base.enum = spec.enum;
      properties[key] = base;
    }
    return {
      name,
      description: s.description,
      parameters: {
        type: "OBJECT",
        properties,
        required: s.required.slice(),
      },
    };
  });
}

/** Strip anything a mutation proposal carries that must never reach the model. */
function resultForModel(result) {
  if (!result) return { ok: false };
  if (result.ok && result.requiresConfirmation) {
    return {
      ok: true,
      requiresConfirmation: true,
      tool: result.tool,
      action: result.action,
      preview: result.preview,
      // NOTE: confirmation token intentionally omitted.
    };
  }
  if (result.ok) {
    return { ok: true, tool: result.tool, data: result.data || {} };
  }
  return { ok: false, errorCategory: result.errorCategory, message: result.message };
}

module.exports = {
  CATEGORIES,
  STATUS_FOR_CATEGORY,
  TOOL_NAMES,
  TOOL_SCHEMAS,
  TOOL_MAX_CALLS_PER_REQUEST,
  TOOL_MAX_ROUNDS,
  USER_TOOL_QUOTA_LIMIT,
  USER_TOOL_QUOTA_WINDOW_MS,
  runTool,
  confirmTool,
  cancelTool,
  getToolDefinitions,
  resultForModel,
};