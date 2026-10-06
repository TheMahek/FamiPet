// =====================================================
// DIET SERVICE (Phase 9 diet logic shared with Phase 10 AI tools)
// =====================================================
// Owner-scoped diet/nutrition operations extracted *verbatim* from
// diet.controller.js so the HTTP routes and the AI tool layer run identical
// validation and business rules. Feeding-plan reads also live here so the AI
// never touches models directly. Ownership is always derived from the
// authenticated caller; the client/AI can never choose the owner.

const Pet = require("../models/Pet");
const PetDiet = require("../models/PetDiet");
const Reminder = require("../models/Reminder");
const mongoose = require("mongoose");
const petService = require("../services/pet.service");
const reminderService = require("../services/reminder.service");
const notificationService = require("../services/notification.service");
const { buildDietGuidance } = require("../utils/dietGuide.util");
const {
  isValidObjectId,
  FOOD_TYPES,
  DIET_ACTIVITY_LEVELS,
  MAX_MEALS,
  MAX_PORTION_GRAMS,
} = require("../utils/validation");

const logReminderSync = (err, context) =>
  console.error(`[Diet] reminder sync failed (${context}):`, err && err.message);

// Validate an owned-pet reference through the shared owner gate. Returns
// { ok:true, pet } or { ok:false, status, message }.
const ownedPetResult = (args) => petService.ownedPetResult(args);

const strLen = (value, max) => {
  if (value === undefined) return { ok: true, empty: true };
  if (typeof value !== "string" && typeof value !== "number") {
    return { ok: false, message: "Invalid value." };
  }
  const s = String(value).trim();
  if (!s) return { ok: true, value: "" };
  if (s.length > max) return { ok: false, message: `Value must be at most ${max} characters.` };
  return { ok: true, value: s };
};

const validateAllergies = (value) => {
  if (value === undefined) return { ok: true, empty: true };
  if (!Array.isArray(value)) return { ok: false, message: "Allergies must be an array of strings." };
  if (value.length > 20) return { ok: false, message: "Allergies can contain at most 20 items." };
  const out = [];
  for (const item of value) {
    if (typeof item !== "string" && typeof item !== "number") {
      return { ok: false, message: "Allergy entries must be strings." };
    }
    const s = String(item).trim();
    if (!s) continue;
    if (s.length > 60) return { ok: false, message: "Each allergy must be at most 60 characters." };
    out.push(s);
  }
  return { ok: true, value: out };
};

const validateMeals = (value) => {
  if (value === undefined) return { ok: true, empty: true };
  if (!Array.isArray(value)) return { ok: false, message: "Meals must be an array." };
  if (value.length > MAX_MEALS) return { ok: false, message: `At most ${MAX_MEALS} meal times are allowed.` };
  const out = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, message: "Each meal entry must be an object." };
    }
    const label = strLen(item.label, 40);
    if (!label.ok) return label;
    const timeErr = reminderService.timeError(item.time);
    if (timeErr) return { ok: false, message: `Meal time error: ${timeErr}` };
    let portion;
    if (item.portionGrams !== undefined && item.portionGrams !== null && item.portionGrams !== "") {
      const n = Number(item.portionGrams);
      if (!Number.isInteger(n) || n < 0 || n > MAX_PORTION_GRAMS) {
        return { ok: false, message: `Each portion must be a whole number of grams (0–${MAX_PORTION_GRAMS}).` };
      }
      portion = n;
    }
    const isActive = item.isActive === undefined ? true : Boolean(item.isActive);
    const entry = { label: label.value || "", time: String(item.time).trim(), isActive };
    if (portion !== undefined) entry.portionGrams = portion;
    if (item._id !== undefined && item._id !== null && item._id !== "") entry.preservedId = item._id;
    out.push(entry);
  }
  return { ok: true, value: out };
};

// List all of the user's diet profiles with pet identity + guidance.
const listDiets = async ({ user }) => {
  const diets = await PetDiet.find({ user: user._id || user.id })
    .populate("pet", "name species age weight images breed")
    .lean();

  const payload = diets.map((d) => ({
    ...d,
    guidance: buildDietGuidance({ pet: d.pet || {}, diet: d }),
  }));

  return { ok: true, status: 200, data: { count: payload.length, diets: payload } };
};

// One owned pet's diet profile + guidance (diet may be null -> empty state).
const getPetDiet = async ({ user, petId }) => {
  const owned = await ownedPetResult({ user, petId });
  if (!owned.ok) return owned;

  const pet = await Pet.findById(petId).populate("breed").lean();
  const diet = await PetDiet.findOne({ user: user._id || user.id, pet: petId }).lean();

  const guidance = buildDietGuidance({
    pet: pet || { _id: petId },
    breed: pet && pet.breed ? pet.breed : null,
    diet,
  });

  return { ok: true, status: 200, data: { diet: diet || null, guidance } };
};

// The pet's feeding plan: active meals + their linked daily feeding reminders
// (source "diet" + sourceId) with schedule status. Read-only assembly of data
// from the owned diet + the reminder service domain.
const getFeedingPlan = async ({ user, petId }) => {
  const owned = await ownedPetResult({ user, petId });
  if (!owned.ok) return owned;

  const diet = await PetDiet.findOne({ user: user._id || user.id, pet: petId }).lean();
  if (!diet) {
    return {
      ok: true,
      status: 200,
      data: { pet: petId, exists: false, timezone: "UTC", meals: [] },
    };
  }

  const reminders = await Reminder.find({
    user: user._id || user.id,
    source: "diet",
    pet: petId,
  })
    .select("title time timezone nextRunAt isActive lastStatus sourceId")
    .lean();

  const byMeal = new Map(reminders.map((r) => [String(r.sourceId), r]));
  const meals = (Array.isArray(diet.meals) ? diet.meals : []).map((m) => ({
    mealId: String(m._id),
    label: m.label || "",
    time: m.time,
    portionGrams: m.portionGrams,
    isActive: m.isActive !== false,
    reminder: byMeal.has(String(m._id)) ? {
      id: String(byMeal.get(String(m._id))._id),
      title: byMeal.get(String(m._id)).title,
      nextRunAt: byMeal.get(String(m._id)).nextRunAt,
      isActive: byMeal.get(String(m._id)).isActive,
      lastStatus: byMeal.get(String(m._id)).lastStatus,
    } : null,
  }));

  meals.sort((a, b) => String(a.time).localeCompare(String(b.time)));

  return {
    ok: true,
    status: 200,
    data: {
      pet: petId,
      exists: true,
      foodType: diet.foodType || null,
      dailyPortionGrams: diet.dailyPortionGrams || null,
      timezone: diet.timezone || "UTC",
      meals,
    },
  };
};

/**
 * Upsert the pet's diet profile (idempotent full replace of meals), sync the
 * feeding-schedule reminders, notify only on first create. Mirrors the Phase 9
 * controller path exactly.
 */
const upsertPetDiet = async ({ user, petId, input }) => {
  const owned = await ownedPetResult({ user, petId });
  if (!owned.ok) return owned;
  petId = String(petId);

  const updates = {};

  if (input.foodType !== undefined && input.foodType !== null && input.foodType !== "") {
    const foodType = String(input.foodType).trim();
    if (!FOOD_TYPES.includes(foodType)) {
      return { ok: false, status: 400, message: "Invalid food type." };
    }
    updates.foodType = foodType;
  }

  const brand = strLen(input.brand, 200);
  if (!brand.ok) return { ok: false, status: 400, message: brand.message };
  if (!brand.empty) updates.brand = brand.value;

  if (input.dailyPortionGrams !== undefined && input.dailyPortionGrams !== null && input.dailyPortionGrams !== "") {
    const n = Number(input.dailyPortionGrams);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PORTION_GRAMS) {
      return {
        ok: false,
        status: 400,
        message: `Daily portion must be a whole number of grams (1–${MAX_PORTION_GRAMS}).`,
      };
    }
    updates.dailyPortionGrams = n;
  }

  let timezone;
  if (input.timezone !== undefined && input.timezone !== null && input.timezone !== "") {
    const tz = String(input.timezone).trim();
    if (!reminderService.isValidTimeZone(tz)) {
      return { ok: false, status: 400, message: "Invalid timezone." };
    }
    timezone = tz;
  }

  if (input.activityLevel !== undefined && input.activityLevel !== null && input.activityLevel !== "") {
    const lvl = String(input.activityLevel).trim();
    if (!DIET_ACTIVITY_LEVELS.includes(lvl)) {
      return { ok: false, status: 400, message: "Invalid activity level." };
    }
    updates.activityLevel = lvl;
  }

  const allergies = validateAllergies(input.allergies);
  if (!allergies.ok) return { ok: false, status: 400, message: allergies.message };
  if (!allergies.empty) updates.allergies = allergies.value;

  const treatPolicy = strLen(input.treatPolicy, 300);
  if (!treatPolicy.ok) return { ok: false, status: 400, message: treatPolicy.message };
  if (!treatPolicy.empty) updates.treatPolicy = treatPolicy.value;

  const notes = strLen(input.notes, 1000);
  if (!notes.ok) return { ok: false, status: 400, message: notes.message };
  if (!notes.empty) updates.notes = notes.value;

  const meals = validateMeals(input.meals);
  if (!meals.ok) return { ok: false, status: 400, message: meals.message };

  const existing = await PetDiet.findOne({ user: user._id || user.id, pet: petId });
  const created = !existing;
  const knownMealIds = new Set(
    (existing && Array.isArray(existing.meals) ? existing.meals : []).map((m) => String(m._id))
  );

  const normalizedMeals = (meals.value || []).map((m) => {
    const preserved = isValidObjectId(m.preservedId) && knownMealIds.has(String(m.preservedId))
      ? m.preservedId
      : new mongoose.Types.ObjectId();
    const entry = { _id: preserved, label: m.label || "", time: m.time, isActive: m.isActive !== false };
    if (m.portionGrams !== undefined) entry.portionGrams = m.portionGrams;
    return entry;
  });

  const base = Object.assign(
    { user: user._id || user.id, pet: petId, meals: normalizedMeals },
    updates
  );
  if (timezone) base.timezone = timezone;
  else if (created) base.timezone = "UTC";

  const diet = await PetDiet.findOneAndUpdate(
    { user: user._id || user.id, pet: petId },
    { $set: base },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  try {
    const activeMealIds = normalizedMeals.filter((m) => m.isActive).map((m) => String(m._id));
    const previousMealIds = existing && Array.isArray(existing.meals)
      ? existing.meals.map((m) => String(m._id))
      : [];
    const removedIds = previousMealIds.filter((id) => !activeMealIds.includes(id));

    await reminderService.deactivateDietMealReminders({
      user: user._id || user.id,
      mealIds: removedIds,
    });

    const contextParts = [];
    if (updates.brand) contextParts.push(`Food: ${updates.brand}`);
    if (updates.dailyPortionGrams) contextParts.push(`Daily portion: ${updates.dailyPortionGrams} g`);
    const context = contextParts.join(" • ");

    for (const meal of normalizedMeals) {
      if (!meal.isActive) continue;
      await reminderService.upsertFeedingMealReminder({
        user: user._id || user.id,
        pet: petId,
        meal,
        timezone: timezone || diet.timezone || "UTC",
        context: context || `${diet.foodType || "Food"} portion per meal.`,
      });
    }
  } catch (syncErr) {
    logReminderSync(syncErr, petId);
  }

  if (created) {
    const pet = await Pet.findById(petId).select("name").lean();
    await notificationService.createNotification({
      user: user._id || user.id,
      type: "pet",
      category: "pet",
      title: "Diet profile created",
      message: `Diet profile for ${pet && pet.name ? pet.name : "your pet"} created — feeding reminders will follow the scheduled meal times.`,
      referenceType: "pet",
      referenceId: petId,
      metadata: { petId, petName: pet && pet.name ? pet.name : "" },
      dedupKey: `diet-created-${petId}`,
    });
  }

  return {
    ok: true,
    status: 200,
    data: {
      message: created ? "Diet profile created." : "Diet profile updated.",
      created,
      diet,
    },
  };
};

module.exports = {
  listDiets,
  getPetDiet,
  getFeedingPlan,
  upsertPetDiet,
};