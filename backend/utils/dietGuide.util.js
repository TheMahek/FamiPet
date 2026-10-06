// =====================================================
// DIET & NUTRITION GUIDANCE HELPER (Phase 9)
// =====================================================
// Deterministic, purely informational guidance derived from data the user
// already provided (pet + breed + diet profile). Rules:
//   - NO diagnosis, prescription, or fabricated precision (no invented
//     calorie/dose numbers, no breed-specific feeding tables).
//   - Generic, common-sense care language only, always + "confirm with your
//     veterinarian" framing.
//   - `completion` reflects how many profile fields the user filled in —
//     replacing the old hard-coded frontend "85%" with a real signal.
// Anything that asserts a medical fact belongs in vet education, not here.

const DISCLAIMER =
  "Diet information is informational only and is not a diagnosis or " +
  "prescription. Feeding amounts depend on age, health, breed and individual " +
  "condition — confirm portion sizes, food type and schedule with your veterinarian.";

const ONE_MEAL_FIELDS = [
  ["foodType", "food type"],
  ["brand", "food brand"],
  ["dailyPortionGrams", "daily portion (grams)"],
  ["activityLevel", "activity level"],
];
const LIST_FIELDS = [
  ["allergies", "allergies"],
  ["treatPolicy", "treat policy"],
  ["notes", "notes"],
];

const countText = (n) =>
  n === 0 ? "no meal times set" : `${n} meal time${n === 1 ? "" : "s"} set`;

// Deterministic meal-times-per-day reference per species (informational).
const speciesCadence = (species) => {
  const map = {
    dog: "Adult dogs commonly eat one to two meals a day",
    cat: "Cats often prefer several small meals through the day over one large bowl",
    rabbit: "Rabbits' hay-based diets are usually offered continuously, with measured pellet and vegetable portions",
    bird: "Birds eat small, frequent meals; portion sizes depend strongly on species size",
    fish: "Fish are typically fed a small pinch once or twice a day",
  };
  return map[species] || "Meal frequency should suit the species and life stage";
};

/**
 * Build the informational guidance payload for one pet's diet profile.
 *
 * @param {object} input
 * @param {object} input.pet   Pet lean doc (species, age, weight available)
 * @param {object} [input.breed] Breed lean doc (optional)
 * @param {object} [input.diet] PetDiet doc (optional)
 * @param {number} [input.now] optional timestamp (unused — deterministic)
 *
 * @returns {object} { completion, summary[], notes[], gaps[], feedsPerDayLabel, disclaimer }
 */
const buildDietGuidance = ({ pet = {}, breed = null, diet = null }) => {
  const summary = [];
  const notes = [];
  const gaps = [];

  const foodType = diet && typeof diet.foodType === "string" ? diet.foodType : "";
  const brand = diet && typeof diet.brand === "string" ? diet.brand.trim() : "";
  const portion = Number(
    diet && diet.dailyPortionGrams !== undefined && diet.dailyPortionGrams !== null
      ? diet.dailyPortionGrams
      : 0
  );
  const meals = diet && Array.isArray(diet.meals) ? diet.meals : [];
  const mealCount = meals.filter(
    (m) => m && m.isActive !== false && typeof m.time === "string" && /^\d{2}:\d{2}$/.test(m.time.trim())
  ).length;
  const weight = Number(pet.weight) > 0 ? Number(pet.weight) : 0;
  const species = typeof pet.species === "string" ? pet.species : "";
  const activity = diet && typeof diet.activityLevel === "string" ? diet.activityLevel : "";

  // --- completion: share of the self-reported profile that is filled in ---
  const present = ONE_MEAL_FIELDS.filter(([field]) => {
    const v = diet && diet[field];
    return v !== undefined && v !== null && v !== "" && v !== 0;
  }).length;
  const listDone = LIST_FIELDS.filter(([field]) => {
    const v = diet && diet[field];
    return Array.isArray(v)
      ? v.length > 0
      : typeof v === "string" && v.trim().length > 0;
  }).length;
  const mealDone = mealCount > 0 ? 1 : 0;
  const filled = present + listDone + mealDone;
  const total = ONE_MEAL_FIELDS.length + LIST_FIELDS.length + 1;
  const completion = Math.round((filled / total) * 100);

  // --- user-entered recap (never invented) ---
  if (foodType) {
    summary.push({
      label: "Food type",
      text: `${foodType.charAt(0).toUpperCase()}${foodType.slice(1)}${brand ? ` • ${brand}` : ""}`,
    });
  } else if (brand) {
    summary.push({ label: "Food brand", text: brand });
  }
  if (portion > 0) {
    const perMeal = mealCount > 0 ? Math.round(portion / mealCount) : 0;
    summary.push({
      label: "Daily portion",
      text: `${portion} g${perMeal > 0 ? ` (~${perMeal} g per meal)` : ""}`,
    });
  }
  if (mealCount > 0) {
    summary.push({ label: "Meals", text: countText(mealCount) });
  }
  if (!summary.length) {
    summary.push({
      label: "No diet profile",
      text: "Nothing recorded yet — add food type, portion and meal times to build this pet's plan.",
    });
  }

  // --- informational guidance (conservative, vet-confirm framing) ---
  notes.push(`${speciesCadence(species)}.`);
  if (mealCount > 0 && portion > 0) {
    notes.push(
      "Portions are a starting point you recorded; spread them across the day and adjust only gradually."
    );
  } else if (mealCount > 0 && portion === 0) {
    gaps.push("A daily portion (grams) is not recorded — amount still needs confirming with your veterinarian.");
  }
  if (species === "dog" && pet.age !== undefined && pet.age >= 0 && Number(pet.age) < 1) {
    notes.push("Puppies usually need smaller, more frequent meals than adults — confirm amounts with your veterinarian as they grow.");
  }
  if (breed && typeof breed.weightRange === "object" && breed.weightRange) {
    const lo = Number(breed.weightRange.min) || Number(breed.weightRange.from) || 0;
    const hi = Number(breed.weightRange.max) || Number(breed.weightRange.to) || 0;
    if (lo > 0 && hi > 0 && weight > 0 && (weight < lo || weight > hi)) {
      notes.push(`The recorded weight (${weight} kg) is outside the typical ${lo}–${hi} kg range for this breed — check feeding with your veterinarian.`);
    }
  }
  if (weight > 0) {
    notes.push("Use the food label's weight-based feeding guide as the primary reference for amounts.");
  } else {
    gaps.push("Pet weight is not recorded, so weight-based feeding guidance from the food label cannot be cross-checked.");
  }
  if (activity) {
    notes.push(`An ${activity}-activity pet may need somewhat different daily amounts than a sedentary one — adjust gradually and confirm with your veterinarian.`);
  }
  const allergies = diet && Array.isArray(diet.allergies) ? diet.allergies : [];
  if (allergies.length) {
    notes.push(`Allergies/restrictions are marked (${allergies.join(", ")}) — keep them out of meals and treats.`);
  }

  return {
    completion,
    summary,
    notes,
    gaps,
    feedsPerDayLabel: countText(mealCount),
    disclaimer: DISCLAIMER,
  };
};

module.exports = { buildDietGuidance, DISCLAIMER };