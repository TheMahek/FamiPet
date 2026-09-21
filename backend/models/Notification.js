const mongoose = require("mongoose");

// Additive enums (Phase 5): new values are appended, never reordered/removed,
// so stored documents keep validating. `type` is the existing backend-domain
// enum from before Phase 5 (backward compatible).
const NOTIFICATION_TYPES = [
  "adoption",
  "appointment",
  "vaccination",
  "health",
  "reminder",
  "system",
  "other",
  // Phase 8 feature-event integration: community, lost & found and pet
  // management now flow through the same notification service.
  "community",
  "lost_found",
  "pet",
];

// Broader UI-facing group (superset of `type`). Service defaults category to
// the notification's type, so old documents without a category still sort into
// a meaningful group.
const NOTIFICATION_CATEGORIES = [
  "adoption",
  "appointment",
  "vaccination",
  "health",
  "reminder",
  "community",
  "lost_found",
  "system",
  "other",
  "pet",
];

const NOTIFICATION_PRIORITIES = ["low", "normal", "high", "urgent"];

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    message: {
      type: String,
      required: true,
      maxlength: 2000,
    },

    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      default: "system",
    },

    // UI grouping; service fills this with `type` when not supplied. Kept
    // optional so legacy documents (no category) remain valid.
    category: {
      type: String,
      enum: NOTIFICATION_CATEGORIES,
    },

    priority: {
      type: String,
      enum: NOTIFICATION_PRIORITIES,
      default: "normal",
    },

    // Optional structural reference to the entity that produced the event
    // (e.g. pet/adoption/appointment ids) so future features can deep-link.
    referenceType: {
      type: String,
      maxlength: 60,
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    // Free-form event payload; validated by the service (plain object, size cap).
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // De-duplication key: identical events for the same user/type/category
    // within the dedup window are collapsed into one notification.
    dedupKey: {
      type: String,
      maxlength: 200,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// User-first read/unread + chronological retrieval (list + unread count).
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

// Dedup lookups: same user, type, category, dedupKey — newest first.
notificationSchema.index({
  user: 1,
  type: 1,
  category: 1,
  dedupKey: 1,
  createdAt: -1,
});

// Cross-feature back-links by target entity.
notificationSchema.index({ referenceType: 1, referenceId: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.NOTIFICATION_CATEGORIES = NOTIFICATION_CATEGORIES;
module.exports.NOTIFICATION_PRIORITIES = NOTIFICATION_PRIORITIES;