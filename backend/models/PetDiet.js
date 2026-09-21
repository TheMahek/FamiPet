const mongoose = require("mongoose");

// =====================================================
// PET DIET / NUTRITION PROFILE (Phase 9 Diet & Nutrition)
// =====================================================
// One per owned pet (unique on user+pet). Stores ONLY user-entered values —
// the recommendation layer never writes silently. Meal-time entries double as
// the source of daily "feeding" reminders (Phase 7 scheduler) via the shared
// reminder service, linked by `source: "diet"` + `sourceId: <meal._id>`.
//
// Content-safety rule: nothing stored here is a diagnosis or prescription.
// Any displayed guidance is derived deterministically from stored + pet data
// and labelled informational (see utils/dietGuide.util.js).

// One scheduled meal. `_id` is the stable anchor for its feeding reminder
// (upserting by source+sourceId keeps edits precise; removals deactivate).
const mealSchema = new mongoose.Schema(
  {
    label: { type: String, default: "", trim: true, maxlength: 40 },
    // Strict 24-hour HH:mm wall-clock (matches <input type="time"> and the
    // reminder service's TIME_RE).
    time: { type: String, required: true, trim: true },
    // Optional per-meal portion in grams (whole grams).
    portionGrams: { type: Number, min: 0, max: 20000 },
    // Inactive meals stop producing reminders but stay on the profile so the
    // user can re-enable without retyping.
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const petDietSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },

    foodType: {
      type: String,
      enum: ["dry", "wet", "raw", "homemade", "mixed"],
    },
    brand: { type: String, default: "", trim: true, maxlength: 200 },
    // Whole daily portion across all meals (grams).
    dailyPortionGrams: { type: Number, min: 1, max: 20000 },

    // IANA timezone in which meal `time` values form the intended wall-clock
    // (same convention as Reminder.timezone; feeding reminders inherit it).
    timezone: { type: String, default: "UTC", maxlength: 64 },

    activityLevel: { type: String, enum: ["low", "moderate", "high"] },

    allergies: { type: [String], default: [] },
    treatPolicy: { type: String, default: "", trim: true, maxlength: 300 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },

    meals: { type: [mealSchema], default: [] },
  },
  { timestamps: true }
);

// One diet profile per pet (per user). Race-safe: upserts keyed on this pair.
petDietSchema.index({ user: 1, pet: 1 }, { unique: true });

module.exports = mongoose.model("PetDiet", petDietSchema);