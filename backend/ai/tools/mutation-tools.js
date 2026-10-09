// =========================================================
// PetGPT mutation tools (Phase 6)
// ---------------------------------------------------------
// The ONLY way the model can change FamiPet data, and deliberately
// limited to low-risk, clearly authorized actions:
//
//   create_reminder    — create a reminder on the authenticated user's
//                        own pet (additive, never overwrites anything).
//   create_appointment — book a vet appointment for the authenticated
//                        user's own pet, through the SAME workflow the
//                        POST /api/appointments route uses.
//   complete_reminder  — mark one of the user's own reminders completed
//                        (a reversible status flag; nothing is deleted).
//
// Destructive/high-risk mutations (delete, hard update of existing
// records, payments) are intentionally NOT implemented: there is no
// confirmation UX for them, so they stay out
// (product rule 5 + petGPT.md §20). Booking an appointment IS part of
// the product's normal flow (it already notifies the user and
// auto-creates a reminder), so it is exposed rather than reinvented.
// The model's requested action is reported as success ONLY after the
// backend write is verified, and a retried job replays the recorded
// result instead of executing twice (registry + MutationEffect
// ledger). Each tool also supplies describe(), the one-line summary the
// user is asked to confirm.
// ------------------------------------------------------
// Ask-before-mutating is NOT this file's job and NOT the prompt's job:
// the registry (tools/registry.js) refuses every mutation until a LATER
// user turn explicitly confirms it, using the describe() summary here.
// Provider-neutral: no provider knowledge lives here.
// =========================================================

const { registerTool, ToolError, TOOL_ERRORS } = require("./registry");
const { requireOwnedPet, isValidObjectId } = require("../pet-context");
const Reminder = require("../../models/Reminder");
const {
  createAppointmentForUser,
  AppointmentError,
  APPOINTMENT_TYPES,
} = require("../../services/appointment.service");

const REMINDER_TYPES = ["feeding", "medicine", "vaccination", "grooming", "appointment", "exercise", "custom"];
const REMINDER_FREQUENCIES = ["once", "daily", "weekly", "monthly"];
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 500;

// Strict YYYY-MM-DD with a real calendar date ("2026-02-30" is invalid). The
// schema layer only checks "string"; the loose `new Date()` parser accepts
// e.g. "01/31/2026", so model-generated dates are validated deterministically.
function isValidCalendarDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidTime(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function normalizeCreatedReminder(r) {
  return {
    id: r._id,
    title: r.title,
    type: r.type,
    description: r.description || undefined,
    date: r.date,
    time: r.time,
    frequency: r.frequency,
    petId: r.pet,
    isActive: !!r.isActive,
    isCompleted: !!r.isCompleted,
  };
}

// Ownership gate for pet-scoped mutations. Unlike the read-tool gate
// this returns the FULL validated args (minus none), so the caller keeps
// every field it needs after the ownership check passed. Foreign/invalid
// pet ids fail identically ("not found or not owned").
async function authorizePetMutation({ args, userId }) {
  const pet = await requireOwnedPet(userId, args && args.petId);
  if (!pet) {
    throw new ToolError(TOOL_ERRORS.FORBIDDEN, "Pet not found or not owned by you.");
  }
  // petName travels into the confirmation preview so the user is asked to
  // confirm the pet BY NAME instead of a raw ObjectId they cannot check.
  return { ...args, petId: args.petId, petName: pet.name };
}

// Shown to the user as the action they are being asked to confirm. The
// registry bounds the rendered string, so these stay short and are
// written from arguments the schema already type-checked.
const CONFIRMATION_GUIDE =
  " The backend will not write anything until the user has explicitly confirmed on a later message; " +
  "if the tool result asks for confirmation, nothing has changed yet — say so and ask them to confirm.";

// Ownership gate for complete_reminder. Runs before the confirmation gate,
// so a malformed or foreign reminder id is refused outright instead of
// being turned into a confirmation prompt for an action that can never
// succeed (which would also be a small existence oracle). The check is
// owner-scoped, so foreign and unknown ids are indistinguishable.
async function authorizeOwnedReminder({ args, userId }) {
  if (!userId) {
    throw new ToolError(TOOL_ERRORS.FORBIDDEN, "Authenticated user is required.");
  }
  if (!isValidObjectId(args && args.reminderId)) {
    throw new ToolError(TOOL_ERRORS.ARGS, 'Argument "reminderId" must be a valid reminder ID.');
  }
  const reminder = await Reminder.findOne({ _id: args.reminderId, user: userId }).select("title").lean();
  if (!reminder) {
    throw new ToolError(TOOL_ERRORS.FORBIDDEN, "Reminder not found or not owned by you.");
  }
  // The title reaches the confirmation preview, so the user confirms the
  // reminder they actually mean rather than a raw ObjectId.
  return { ...args, reminderTitle: reminder.title };
}

function registerMutationTools() {
  registerTool({
    name: "create_reminder",
    description:
      "Create a reminder for one of the authenticated user's own pets (e.g. feeding, medicine, vaccination). Requires petId, title, a valid date (YYYY-MM-DD) and time (HH:MM)." +
      CONFIRMATION_GUIDE +
      " Reports the created reminder exactly as returned.",
    readOnly: false,
    describe: (a) => `create a "${String(a.title).trim()}" ${a.type} reminder for ${a.petName || "your pet"} on ${a.date} at ${a.time}`,
    schema: {
      type: "object",
      properties: {
        petId: { type: "string", description: "The authenticated user's pet ID." },
        title: { type: "string", description: "Short reminder title." },
        type: { type: "string", description: "One of: feeding, medicine, vaccination, grooming, appointment, exercise, custom." },
        description: { type: "string", description: "Optional reminder notes." },
        date: { type: "string", description: "Reminder date in YYYY-MM-DD format." },
        time: { type: "string", description: "Reminder time in HH:MM format." },
        frequency: { type: "string", description: "Optional: once, daily, weekly or monthly. Defaults to once." },
      },
      required: ["petId", "title", "type", "date", "time"],
    },
    authorize: authorizePetMutation,
    execute: async ({ args, userId }) => {
      if (!REMINDER_TYPES.includes(args.type)) {
        throw new ToolError(TOOL_ERRORS.ARGS, `Argument "type" must be one of: ${REMINDER_TYPES.join(", ")}.`);
      }
      if (args.frequency && !REMINDER_FREQUENCIES.includes(args.frequency)) {
        throw new ToolError(TOOL_ERRORS.ARGS, `Argument "frequency" must be one of: ${REMINDER_FREQUENCIES.join(", ")}.`);
      }
      if (typeof args.title !== "string" || !args.title.trim()) {
        throw new ToolError(TOOL_ERRORS.ARGS, 'Argument "title" must be a non-empty string.');
      }
      if (args.title.trim().length > TITLE_MAX) {
        throw new ToolError(TOOL_ERRORS.ARGS, `Argument "title" must be at most ${TITLE_MAX} characters.`);
      }
      if (typeof args.time !== "string" || !isValidTime(args.time)) {
        throw new ToolError(TOOL_ERRORS.ARGS, 'Argument "time" must be a valid HH:MM time (00:00-23:59).');
      }
      if (!isValidCalendarDate(String(args.date))) {
        throw new ToolError(TOOL_ERRORS.ARGS, 'Argument "date" must be a valid calendar date in YYYY-MM-DD format.');
      }
      if (args.description !== undefined && String(args.description).length > DESCRIPTION_MAX) {
        throw new ToolError(TOOL_ERRORS.ARGS, `Argument "description" must be at most ${DESCRIPTION_MAX} characters.`);
      }

      if (!userId) {
        throw new ToolError(TOOL_ERRORS.FORBIDDEN, "Authenticated user is required.");
      }
      const reminder = await Reminder.create({
        user: userId,
        pet: args.petId,
        title: String(args.title).trim(),
        type: args.type,
        description: args.description ? String(args.description).trim() : "",
        date: String(args.date),
        time: String(args.time).trim(),
        frequency: args.frequency || "once",
      });

      // Return the normalized, bounded record — success is only claimed
      // now that the backend write actually succeeded.
      return { reminder: normalizeCreatedReminder(reminder) };
    },
  });

  registerTool({
    name: "complete_reminder",
    description:
      "Mark one of the authenticated user's own reminders as completed by its reminder ID." +
      CONFIRMATION_GUIDE +
      " Reports the completed reminder exactly as returned.",
    readOnly: false,
    describe: (a) => `mark your reminder "${a.reminderTitle || a.reminderId}" as completed`,
    authorize: authorizeOwnedReminder,
    schema: {
      type: "object",
      properties: {
        reminderId: { type: "string", description: "The user's own reminder ID." },
      },
      required: ["reminderId"],
    },
    execute: async ({ args, userId }) => {
      if (!userId) {
        throw new ToolError(TOOL_ERRORS.FORBIDDEN, "Authenticated user is required.");
      }
      const reminder = await Reminder.findOneAndUpdate(
        { _id: args.reminderId, user: userId },
        { isCompleted: true },
        { new: true, runValidators: true }
      );
      if (!reminder) {
        // Foreign or unknown reminder ids fail identically (no existence oracle).
        throw new ToolError(TOOL_ERRORS.FORBIDDEN, "Reminder not found or not owned by you.");
      }
      return { reminder: normalizeCreatedReminder(reminder) };
    },
  });

  // ---- create_appointment -------------------------------------------
  // Exposes the EXISTING booking workflow (services/appointment.service.js,
  // shared with POST /api/appointments) to the model: same owner check,
  // same active-vet requirement, same past-date and double-booking
  // guards, same notification and auto-created reminder. Nothing about
  // booking is re-implemented here.
  //
  // The model cannot invent a veterinarian: `veterinarianId` must be one
  // the user can already see via get_pet_appointments / the app, and the
  // service rejects inactive or unknown ids. When the user has not
  // supplied a vet, the tool refuses with a model-safe message that
  // tells the model to ASK the user which vet and when, rather than
  // guessing a booking.
  registerTool({
    name: "create_appointment",
    description:
      "Book a veterinary appointment for one of the authenticated user's own pets. " +
      "Requires petId, veterinarianId (an existing active veterinarian), a date (YYYY-MM-DD) and time (HH:MM). " +
      "If the user has not said which veterinarian or which date/time, ask them instead of guessing. " +
      CONFIRMATION_GUIDE +
      " Reports the booked appointment exactly as returned.",
    readOnly: false,
    describe: (a) => `book a ${a.type || "vet"} appointment for ${a.petName || "your pet"} on ${a.date} at ${a.time}`,
    schema: {
      type: "object",
      properties: {
        petId: { type: "string", description: "The authenticated user's pet ID." },
        veterinarianId: { type: "string", description: "ID of an existing active veterinarian." },
        date: { type: "string", description: "Appointment date in YYYY-MM-DD format (today or later)." },
        time: { type: "string", description: "Appointment time in HH:MM format." },
        type: { type: "string", description: `One of: ${APPOINTMENT_TYPES.join(", ")}.` },
        symptoms: { type: "string", description: "Optional symptoms to record." },
        notes: { type: "string", description: "Optional appointment notes." },
      },
      required: ["petId", "veterinarianId", "date", "time"],
    },
    authorize: authorizePetMutation,
    execute: async ({ args, userId }) => {
      if (!isValidObjectId(args.veterinarianId)) {
        throw new ToolError(TOOL_ERRORS.ARGS, 'Argument "veterinarianId" must be a valid veterinarian ID.');
      }
      if (typeof args.time !== "string" || !isValidTime(args.time)) {
        throw new ToolError(TOOL_ERRORS.ARGS, 'Argument "time" must be a valid HH:MM time (00:00-23:59).');
      }
      if (!isValidCalendarDate(String(args.date))) {
        throw new ToolError(TOOL_ERRORS.ARGS, 'Argument "date" must be a valid calendar date in YYYY-MM-DD format.');
      }
      if (args.type && !APPOINTMENT_TYPES.includes(args.type)) {
        throw new ToolError(TOOL_ERRORS.ARGS, `Argument "type" must be one of: ${APPOINTMENT_TYPES.join(", ")}.`);
      }

      try {
        const { appointment } = await createAppointmentForUser({
          userId,
          pet: args.petId,
          veterinarian: args.veterinarianId,
          date: args.date,
          time: args.time,
          type: args.type,
          symptoms: args.symptoms,
          notes: args.notes,
        });
        return {
          appointment: {
            id: appointment._id,
            petId: appointment.pet,
            veterinarianId: appointment.veterinarian,
            date: appointment.date,
            time: appointment.time,
            type: appointment.type,
            status: appointment.status,
          },
        };
      } catch (error) {
        if (error instanceof AppointmentError) {
          // The service's own refusal text is already user-safe and is
          // exactly what the HTTP route returns, so the model reports
          // the same reason verbatim instead of inventing a failure.
          throw new ToolError(TOOL_ERRORS.FORBIDDEN, error.message);
        }
        throw error;
      }
    },
  });
}

module.exports = { registerMutationTools, normalizeCreatedReminder, REMINDER_TYPES, REMINDER_FREQUENCIES };