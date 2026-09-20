// =====================================================
// AI RECOMMENDATION SERVICE (Phase 11 AI Recommendations)
// =====================================================
// Deterministic, data-driven suggestion engine that ONLY reads the caller's
// real application data (pets, diet profiles, reminders, appointments, health
// records) through the shared services — never models directly, never invents
// facts. Each recommendation is informational ("not medical advice") and may
// carry a `suggestedAction` whose args are built ONLY from verified data +
// explicit, user-reviewable policy cadences (e.g. "checkup reminder every
// 365 days") so the Phase 10 tool layer re-validates and the user confirms
// before anything executes.
//
// Safety rules (verified by the Phase 11 suites):
//   - No fabricated pet/diet/weight values; no diagnoses or prescriptions.
//   - Every suggested action is a MUTATION proposal; reads stay readable via
//     the chat/tool endpoints. Feeding reminders are never suggested directly
//     (they follow the pet's diet meal times on Phase 9).
//   - Cross-user data is impossible by construction: every aggregation starts
//     from petService.listUserPets (owner = caller).
//   - Any single pet's failures are isolated (a malformed row cannot kill the
//     whole list).

const petService = require("./pet.service");
const dietService = require("./diet.service");
const reminderService = require("./reminder.service");
const appointmentService = require("./appointment.service");
const healthService = require("./health.service");

const DISCLAIMER =
  "Suggestions are informational only and are not a diagnosis or a " +
  "prescription. Pet care depends on age, breed, health and individual " +
  "condition — confirm vaccination, diet, portion sizes and vet schedules " +
  "with a qualified veterinarian.";

const MAX_RECOMMENDATIONS = 12;
const RECOMMENDED_TIME = "10:00";
const RECOMMENDED_EVENING_TIME = "17:30";

const toDateKey = (d) => d.toISOString().slice(0, 10);

const makeAction = (tool, args) => ({ tool, args });

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const CATEGORY_ORDER = ["diet", "feeding_plan", "reminder", "appointment", "exercise", "care", "health"];

const item = (category, priority, title, summary, detail, pet, action) => ({
  id: `${category}-${pet && pet.id ? String(pet.id).slice(-8) : "family"}-${Math.random().toString(36).slice(2, 8)}`,
  category,
  priority,
  title,
  summary,
  detail,
  pet: pet ? { id: pet.id, name: pet.name } : null,
  action: action || null,
});

const reminderTypesForPet = (reminders, petId) =>
  new Set(
    (reminders || [])
      .filter((r) => r && r.pet && String(r.pet._id || r.pet) === String(petId) && r.isActive !== false && r.isCompleted !== true)
      .map((r) => r.type)
  );

const safePetRef = (pet) =>
  pet && pet._id
    ? { id: String(pet._id), name: pet.name || "", species: pet.species || "" }
    : null;

const petSignatureSuggestion = ({ pet, now }) => {
  const petId = String(pet._id);
  const petName = pet.name || "your pet";
  const reminderDesc = "Suggested by PetGPT from your pet profile — confirm the schedule with your veterinarian.";
  const vaccinationAction = makeAction("create_reminder", {
    title: `Vaccination check — ${petName}`,
    type: "vaccination",
    date: toDateKey(now),
    time: RECOMMENDED_TIME,
    pet: petId,
    frequency: "interval",
    repeatInterval: Number(pet.age) < 1 ? 30 : 365,
    description: reminderDesc,
    notificationEnabled: true,
  });
  const checkupAction = makeAction("create_reminder", {
    title: `Vet checkup — ${petName}`,
    type: "appointment",
    date: toDateKey(now),
    time: RECOMMENDED_TIME,
    pet: petId,
    frequency: "interval",
    repeatInterval: 365,
    description: "Suggested by PetGPT as a yearly wellness checkup reminder — pick a date convenient for you.",
    notificationEnabled: true,
  });
  const exerciseAction = makeAction("create_reminder", {
    title: `Daily exercise — ${petName}`,
    type: "exercise",
    date: toDateKey(now),
    time: RECOMMENDED_EVENING_TIME,
    pet: petId,
    frequency: "daily",
    description: "Suggested by PetGPT — regular daily activity supports a healthy routine for dogs.",
    notificationEnabled: true,
  });
  return { petId, petName, vaccinationAction, checkupAction, exerciseAction };
};

/**
 * Build the caller's recommendation set from real application data.
 * @param {object} opts { user, now? }
 * @returns {Promise<{ ok: true, status: 200, data: { recommendations, disclaimer } }>}
 */
const buildRecommendations = async ({ user, now }) => {
  const nowDate = new Date(now || Date.now());
  const items = [];
  const seenTypeByPet = new Map();
  let appointmentCount = 0;

  const petsResult = await petService.listUserPets({ user });
  const pets = Array.isArray(petsResult.data && petsResult.data.pets) ? petsResult.data.pets : [];

  if (!pets.length) {
    items.push(
      item(
        "care",
        "low",
        "Add your first pet",
        "Add a pet profile so PetGPT suggestions are personalized to your family.",
        "Sign in is active but no pets are recorded yet. Add a pet to unlock diet, reminder and checkup suggestions built from real data.",
        null,
        null
      )
    );
    items.push(
      item(
        "care",
        "low",
        "Keep PetGPT handy",
        "Ask PetGPT about pet nutrition, grooming, training and general care any time.",
        "PetGPT answers general care questions conversationally and proposes data-changing actions only after you confirm them.",
        null,
        null
      )
    );
    return { ok: true, status: 200, data: { recommendations: items, disclaimer: DISCLAIMER } };
  }

  try {
    const apptResult = await appointmentService.listAppointments({ user });
    if (apptResult && apptResult.ok) {
      appointmentCount = (apptResult.data && Array.isArray(apptResult.data.appointments) ? apptResult.data.appointments : []).length;
    }
  } catch (e) {
    console.error("[Recommendations] appointments unavailable:", e && e.message);
  }

  let allReminders = [];
  try {
    allReminders = await reminderService.listReminders({ user, filter: "all" });
  } catch (e) {
    console.error("[Recommendations] reminders unavailable:", e && e.message);
  }

  for (const pet of pets) {
    try {
      const ref = safePetRef(pet);
      if (!ref) continue;
      const petRef = { id: ref.id, name: ref.name };
      const sig = petSignatureSuggestion({ pet, now: nowDate });
      const types = new Set(seenTypeByPet.get(ref.id) || []);
      seenTypeByPet.set(ref.id, types);
      const typesForPet = reminderTypesForPet(allReminders, ref.id);
      for (const t of typesForPet) types.add(t);

      if (typesForPet.has("vaccination")) types.add("vaccination");
      if (typesForPet.has("appointment")) types.add("appointment");
      if (typesForPet.has("exercise")) types.add("exercise");

      // ---- diet / feeding-plan ----
      let diet = null;
      let dietGuidance = null;
      try {
        const dietRes = await dietService.getPetDiet({ user, petId: ref.id });
        if (dietRes && dietRes.ok) {
          diet = dietRes.data && dietRes.data.diet ? dietRes.data.diet : null;
          dietGuidance = dietRes.data && dietRes.data.guidance ? dietRes.data.guidance : null;
        }
      } catch (e) {
        console.error(`[Recommendations] diet unavailable for ${ref.name}:`, e && e.message);
      }

      if (!diet) {
        items.push(
          item(
            "diet",
            "medium",
            `Add a diet profile for ${ref.name}`,
            `${ref.name} has no diet profile yet.`,
            "Recording food type, daily portion and meal times lets PetGPT (and the Diet & Nutrition page) give you feeding-plan suggestions — and each saved meal time becomes a daily feeding reminder.",
            petRef,
            null
          )
        );
      } else {
        const meals = Array.isArray(diet.meals) ? diet.meals : [];
        const activeMeals = meals.filter((m) => m && m.isActive !== false);
        if (!activeMeals.length) {
          items.push(
            item(
              "feeding_plan",
              "medium",
              `Add meal times for ${ref.name}`,
              `${ref.name}'s diet profile has no active meal times yet.`,
              "Add one or more HH:mm meal times to the diet profile and each one will create a daily feeding reminder through the reminder scheduler.",
              petRef,
              null
            )
          );
        } else {
          const times = activeMeals.map((m) => `${m.label || "meal"} ${m.time}`).join(", ");
          items.push(
            item(
              "feeding_plan",
              "low",
              `${ref.name}'s feeding routine is active`,
              `${activeMeals.length} daily feeding time${activeMeals.length === 1 ? "" : "s"} scheduled: ${times}.`,
              "Feeding reminders follow the diet plan's meal times automatically; adjust the plan any time in Diet & Nutrition.",
              petRef,
              null
            )
          );
        }
      }

      // ---- vaccination reminder ----
      const unvaccinated = pet.vaccinated === false || pet.vaccinated === undefined;
      if (unvaccinated && !types.has("vaccination")) {
        items.push(
          item(
            "reminder",
            "high",
            `Vaccination reminder for ${ref.name}`,
            `${ref.name} is marked as not vaccinated with no vaccination reminder set.`,
            "A regular vaccination reminder keeps boosters from being forgotten. Confirm the actual vaccine schedule with your veterinarian, then accept the suggested reminder.",
            petRef,
            sig.vaccinationAction
          )
        );
        types.add("vaccination");
      }

      // ---- appointment / checkup ----
      if (appointmentCount === 0 && !types.has("appointment")) {
        items.push(
          item(
            "appointment",
            "medium",
            `Schedule a vet checkup for ${ref.name}`,
            "No vet appointments are recorded yet.",
            "A yearly wellness visit is a good baseline for most pets. This suggestion adds a checkup reminder you accept — call your veterinary clinic to book the actual appointment.",
            petRef,
            sig.checkupAction
          )
        );
        types.add("appointment");
      }

      // ---- activity suggestion (dogs) ----
      if (String(pet.species || "").toLowerCase() === "dog" && !types.has("exercise")) {
        items.push(
          item(
            "exercise",
            "low",
            `Daily exercise for ${ref.name}`,
            "Add a daily exercise reminder for your dog.",
            "Regular daily activity supports a healthy weight and routine. Accept to create a daily walk reminder you can reschedule.",
            petRef,
            sig.exerciseAction
          )
        );
        types.add("exercise");
      }

      // ---- general care (text-only) ----
      if (unvaccinated) {
        items.push(
          item(
            "care",
            "medium",
            `Check ${ref.name}'s vaccination status`,
            `${ref.name} is marked as not vaccinated in the profile.`,
            "Visit a veterinarian to confirm which vaccinations are appropriate for your pet's age and species.",
            petRef,
            null
          )
        );
      }
      const weight = Number(pet.weight);
      if (!weight || weight <= 0) {
        items.push(
          item(
            "care",
            "low",
            `Record ${ref.name}'s weight`,
            "No weight is recorded for this pet.",
            "Recording weight enables weight-based feeding guidance from food labels and makes future weight changes visible to you and your vet.",
            petRef,
            null
          )
        );
      }
      if (Number(pet.age) < 1) {
        items.push(
          item(
            "care",
            "low",
            `${ref.name} is still young`,
            "Puppies and kittens have different needs.",
            "Young pets typically need more frequent veterinary visits and age-appropriate nutrition — confirm a schedule with your veterinarian.",
            petRef,
            null
          )
        );
      }

      // ---- health records ----
      try {
        const healthRes = await healthService.listHealthRecords({ user, petId: ref.id });
        const records = healthRes && healthRes.ok && Array.isArray(healthRes.data && healthRes.data.records)
          ? healthRes.data.records
          : [];
        if (records.length === 0) {
          items.push(
            item(
              "health",
              "low",
              `Health history for ${ref.name}`,
              "No health records recorded yet.",
              "Adding vet visits and notes to the pet's health history builds a useful record you and your veterinarian can review.",
              petRef,
              null
            )
          );
        }
      } catch (e) {
        console.error(`[Recommendations] health records unavailable for ${ref.name}:`, e && e.message);
      }
    } catch (e) {
      console.error("[Recommendations] per-pet failure (isolated):", e && e.message);
    }
  }

  items.sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) ||
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  );

  const recommendations = items.slice(0, MAX_RECOMMENDATIONS);
  return { ok: true, status: 200, data: { recommendations, disclaimer: DISCLAIMER } };
};

module.exports = { buildRecommendations, DISCLAIMER, MAX_RECOMMENDATIONS };