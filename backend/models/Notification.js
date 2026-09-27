const mongoose = require("mongoose");

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
    },

    message: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: [
        "adoption",
        "appointment",
        "vaccination",
        "health",
        "system",
        "other",
      ],
      default: "system",
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

// Every notification read is user-scoped (GET /api/notifications,
// GET /api/notifications/unread, mark-read, mark-all-read) and the
// list is sorted newest-first, so this index serves the filter AND
// the sort. Without it each poll is a collection scan of a
// collection that only ever grows.
notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);