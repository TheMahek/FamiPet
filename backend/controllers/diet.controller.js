// =====================================================
// DIET & NUTRITION CONTROLLER (Phase 9)
// =====================================================
// Owner-scoped CRUD for a pet's diet/nutrition profile (one per pet).
//   - Ownership: every route validates the pet belongs to the authenticated
//     user before reading/writing (Pet.findOne({_id, owner})); the client can
//     never choose the owner.
//   - Meal times drive daily "feeding" reminders through the Phase 7 scheduler
//     via the shared reminder service (source "diet" + sourceId meal._id).
//     Reminder sync is best-effort: a schedule failure must never break the
//     diet save.
//   - Notifications: conservative. A single "diet profile created" event rides
//     the Phase 5 service on first creation only; routine edits stay silent so
//     users are not spammed, and the scheduler already handles the
//     user-facing feeding reminders (no duplicates).

const Pet = require("../models/Pet");
const PetDiet = require("../models/PetDiet");
const mongoose = require("mongoose");
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

// Validate an owned-pet reference. Sends the error response and returns false
// when invalid; otherwise returns true.
const validateOwnedPet = async (req, res, petId) => {
  if (!isValidObjectId(petId)) {
    res.status(400).json({ success: false, message: "Invalid pet ID." });
    return false;
  }
  const petExists = await Pet.findOne({ _id: petId, owner: req.user._id });
  if (!petExists) {
    res.status(404).json({ success: false, message: "Pet not found or not owned by you." });
    return false;
  }
  return true;
};

// Returns { ok:true, value } with a trimmed string or "" for blank/falsy, or
// { ok:false, message } when the value is the wrong type or exceeds `max`.
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

// { ok:true, value:string[] } normalized allergy list, or { ok:false, message }.
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

// { ok:true, value:mealEntry[] } normalized meal list, or { ok:false, message }.
// Each entry preserves an owned existing meal._id when the client forwarded one
// (carried on `preservedId` so id reuse is explicit and validated against the
// existing profile below).
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

/**
 * GET /diet — the user's diet profiles (with pet identity + guidance).
 */
exports.getDiets = async (req, res) => {
  try {
    const diets = await PetDiet.find({ user: req.user._id })
      .populate("pet", "name species age weight images breed")
      .lean();

    const payload = diets.map((d) => ({
      ...d,
      guidance: buildDietGuidance({ pet: d.pet || {}, diet: d }),
    }));

    res.json({ success: true, count: payload.length, diets: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * GET /diet/:petId — one owned pet's diet profile + informational guidance.
 * Returns `diet: null` with empty-state guidance when none exists yet.
 */
exports.getPetDiet = async (req, res) => {
  try {
    const ok = await validateOwnedPet(req, res, req.params.petId);
    if (!ok) return;

    const pet = await Pet.findById(req.params.petId).populate("breed").lean();
    const diet = await PetDiet.findOne({
      user: req.user._id,
      pet: req.params.petId,
    }).lean();

    const guidance = buildDietGuidance({
      pet: pet || { _id: req.params.petId },
      breed: pet && pet.breed ? pet.breed : null,
      diet,
    });

    res.json({ success: true, diet: diet || null, guidance });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * PUT /diet/:petId — upsert the pet's diet profile (idempotent full replace of
 * meals), sync the feeding-schedule reminders, and notify only on first create.
 */
exports.upsertPetDiet = async (req, res) => {
  try {
    const ok = await validateOwnedPet(req, res, req.params.petId);
    if (!ok) return;
    const petId = req.params.petId;

    // --- field-by-field validation (allowlist-built, no mass assignment) ---
    const updates = {};

    if (req.body.foodType !== undefined && req.body.foodType !== null && req.body.foodType !== "") {
      const foodType = String(req.body.foodType).trim();
      if (!FOOD_TYPES.includes(foodType)) {
        return res.status(400).json({ success: false, message: "Invalid food type." });
      }
      updates.foodType = foodType;
    }

    const brand = strLen(req.body.brand, 200);
    if (!brand.ok) return res.status(400).json({ success: false, message: brand.message });
    if (!brand.empty) updates.brand = brand.value;

    if (req.body.dailyPortionGrams !== undefined && req.body.dailyPortionGrams !== null && req.body.dailyPortionGrams !== "") {
      const n = Number(req.body.dailyPortionGrams);
      if (!Number.isInteger(n) || n < 1 || n > MAX_PORTION_GRAMS) {
        return res.status(400).json({
          success: false,
          message: `Daily portion must be a whole number of grams (1–${MAX_PORTION_GRAMS}).`,
        });
      }
      updates.dailyPortionGrams = n;
    }

    let timezone;
    if (req.body.timezone !== undefined && req.body.timezone !== null && req.body.timezone !== "") {
      const tz = String(req.body.timezone).trim();
      if (!reminderService.isValidTimeZone(tz)) {
        return res.status(400).json({ success: false, message: "Invalid timezone." });
      }
      timezone = tz;
    }

    if (req.body.activityLevel !== undefined && req.body.activityLevel !== null && req.body.activityLevel !== "") {
      const lvl = String(req.body.activityLevel).trim();
      if (!DIET_ACTIVITY_LEVELS.includes(lvl)) {
        return res.status(400).json({ success: false, message: "Invalid activity level." });
      }
      updates.activityLevel = lvl;
    }

    const allergies = validateAllergies(req.body.allergies);
    if (!allergies.ok) return res.status(400).json({ success: false, message: allergies.message });
    if (!allergies.empty) updates.allergies = allergies.value;

    const treatPolicy = strLen(req.body.treatPolicy, 300);
    if (!treatPolicy.ok) return res.status(400).json({ success: false, message: treatPolicy.message });
    if (!treatPolicy.empty) updates.treatPolicy = treatPolicy.value;

    const notes = strLen(req.body.notes, 1000);
    if (!notes.ok) return res.status(400).json({ success: false, message: notes.message });
    if (!notes.empty) updates.notes = notes.value;

    const meals = validateMeals(req.body.meals);
    if (!meals.ok) return res.status(400).json({ success: false, message: meals.message });

    // --- load existing profile for meal-id preservation + create detection ---
    const existing = await PetDiet.findOne({ user: req.user._id, pet: petId });
    const created = !existing;
    const knownMealIds = new Set(
      (existing && Array.isArray(existing.meals) ? existing.meals : []).map((m) => String(m._id))
    );

    const normalizedMeals = (meals.value || []).map((m) => {
      // Reuse a legitimately-owned existing meal id so its feeding reminder
      // stays linked across edits; unknown/unowned ids are always fresh ones.
      const preserved = isValidObjectId(m.preservedId) && knownMealIds.has(String(m.preservedId))
        ? m.preservedId
        : new mongoose.Types.ObjectId();
      const entry = { _id: preserved, label: m.label || "", time: m.time, isActive: m.isActive !== false };
      if (m.portionGrams !== undefined) entry.portionGrams = m.portionGrams;
      return entry;
    });

    // --- persist (upsert) ---
    const base = Object.assign(
      { user: req.user._id, pet: petId, meals: normalizedMeals },
      updates
    );
    if (timezone) base.timezone = timezone;
    else if (created) base.timezone = "UTC";

    const diet = await PetDiet.findOneAndUpdate(
      { user: req.user._id, pet: petId },
      { $set: base },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    // --- sync feeding reminders (best effort; never breaks the save) ---
    try {
      const activeMealIds = normalizedMeals.filter((m) => m.isActive).map((m) => String(m._id));
      const previousMealIds = existing && Array.isArray(existing.meals)
        ? existing.meals.map((m) => String(m._id))
        : [];
      const removedIds = previousMealIds.filter((id) => !activeMealIds.includes(id));

      await reminderService.deactivateDietMealReminders({
        user: req.user._id,
        mealIds: removedIds,
      });

      const contextParts = [];
      if (updates.brand) contextParts.push(`Food: ${updates.brand}`);
      if (updates.dailyPortionGrams) contextParts.push(`Daily portion: ${updates.dailyPortionGrams} g`);
      const context = contextParts.join(" • ");

      for (const meal of normalizedMeals) {
        if (!meal.isActive) continue;
        await reminderService.upsertFeedingMealReminder({
          user: req.user._id,
          pet: petId,
          meal,
          timezone: timezone || diet.timezone || "UTC",
          context: context || `${diet.foodType || "Food"} portion per meal.`,
        });
      }
    } catch (syncErr) {
      logReminderSync(syncErr, petId);
    }

    // --- conservative notification: first creation only ---
    if (created) {
      const pet = await Pet.findById(petId).select("name").lean();
      await notificationService.createNotification({
        user: req.user._id,
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

    res.json({
      success: true,
      message: created ? "Diet profile created." : "Diet profile updated.",
      created,
      diet,
    });
  } catch (error) {
    console.error("[Diet] upsert error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * DELETE /diet/:petId — remove the profile and deactivate its feeding
 * reminders. Silent (no notification) — conservative by design.
 */
exports.deletePetDiet = async (req, res) => {
  try {
    const ok = await validateOwnedPet(req, res, req.params.petId);
    if (!ok) return;

    const diet = await PetDiet.findOneAndDelete({
      user: req.user._id,
      pet: req.params.petId,
    });

    if (!diet) {
      return res.status(404).json({ success: false, message: "Diet profile not found." });
    }

    const mealIds = (Array.isArray(diet.meals) ? diet.meals : []).map((m) => m._id);
    try {
      await reminderService.deactivateDietMealReminders({ user: req.user._id, mealIds });
    } catch (syncErr) {
      logReminderSync(syncErr, req.params.petId);
    }

    res.json({ success: true, message: "Diet profile removed." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};