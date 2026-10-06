const mongoose = require("mongoose");

// Per-user notification preferences (Phase 5). One document per user, created
// lazily with defaults + additive per-type toggles. `channels` controls which
// delivery channel a notification reaches; Phase 5 only consumes `inApp` —
// `email`/`push` are stored now so Phase 6 (push) and Phase 8 (integration)
// can build on them without a data migration.
//
// `types` is a Map of notification-type -> enabled (Boolean). Absent keys
// (future/unknown types) are treated as enabled.
const notificationPreferenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      push: { type: Boolean, default: false },
    },

    types: {
      type: Map,
      of: Boolean,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "NotificationPreference",
  notificationPreferenceSchema
);