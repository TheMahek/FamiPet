const mongoose = require("mongoose");

// Scheduler-related lifecycle states (Phase 7), recorded after each scheduler
// pass so failures are diagnosable and never silently look like a delivery.
const REMINDER_STATUSES = [
  "pending",
  "fired",
  "failed",
  "skipped",
  "skipped-no-user",
  "skipped-no-pet",
];

const reminderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet" },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "feeding",
        "medicine",
        "vaccination",
        "grooming",
        "appointment",
        "exercise",
        "droplet",
        "bath",
        "custom",
      ],
      required: true,
    },
    description: { type: String, default: "" },
    date: { type: Date, required: true },
    time: { type: String, required: true },

    // IANA timezone in which `date` + `time` form the intended wall-clock.
    // Defaults to "UTC", matching the app's historical convention where the
    // stored `date` is a UTC timestamp and `time` is an HH:mm wall-clock.
    timezone: { type: String, default: "UTC", maxlength: 64 },

    frequency: {
      type: String,
      enum: ["once", "daily", "interval", "weekly", "monthly"],
      default: "once",
    },

    // Repeat schedule (Phase 8 Pet Care Reminders):
    //   - frequency "interval": repeat every `repeatInterval` days (1..365).
    //   - frequency "weekly": when `daysOfWeek` is non-empty the reminder runs
    //     on those weekdays (0=Sun..6=Sat) instead of every 7 days.
    repeatInterval: { type: Number, default: 1, min: 1, max: 365 },
    daysOfWeek: {
      type: [Number],
      default: [],
      validate: {
        validator: (v) =>
          Array.isArray(v) && v.every((n) => Number.isInteger(n) && n >= 0 && n <= 6),
        message: "daysOfWeek values must be integers 0 (Sunday) to 6 (Saturday).",
      },
    },

    // Display + delivery preferences (Phase 8).
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },

    // When false the scheduler CONSUMES each occurrence without creating a
    // notification (silent tracking, e.g. routine hygiene chores).
    notificationEnabled: { type: Boolean, default: true },

    isActive: { type: Boolean, default: true },
    isCompleted: { type: Boolean, default: false },

    // =====================================================
    // SCHEDULER STATE (Phase 7) — persistent, restart-safe.
    // =====================================================
    // Canonical UTC instant of the next occurrence. Missing on legacy rows
    // (created before Phase 7); the scheduler "materializes" them on boot
    // (once = its date/time, recurring = first future occurrence).
    nextRunAt: { type: Date },

    // Lease held while one scheduler pass is processing this reminder. A
    // crashed pass leaves it stale; the next tick treats it as free again. This
    // (plus the unique dedupKey in the notification service) makes overlapping
    // cycles / processes safe.
    claimedUntil: { type: Date },

    // Delivery/processing state.
    lastFiredAt: { type: Date },
    lastNotificationId: { type: mongoose.Schema.Types.ObjectId },
    lastStatus: { type: String, enum: REMINDER_STATUSES, default: "pending" },
    lastError: { type: String, default: "", maxlength: 500 },
    failedAttempts: { type: Number, default: 0, min: 0 },

    // Precise producer linkage. `source` distinguishes manual reminders from
    // auto-created ones (e.g. appointments); `sourceId` identifies the exact
    // origin document so updates/cancels never match the wrong reminder.
    source: { type: String, enum: ["manual", "appointment"], default: "manual" },
    sourceId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

// Scheduler scan: eligible, non-completed, by next run time (ascending). A
// partial index keeps the scan tiny and covers the claim query too.
reminderSchema.index(
  { isActive: 1, isCompleted: 1, nextRunAt: 1 },
  { partialFilterExpression: { isActive: true, isCompleted: false } }
);

// Exact auto-reminder linkage: at most ONE appointment reminder per (user,
// source, sourceId) so rescheduling/cancelling cannot hit a wrong reminder.
reminderSchema.index(
  { user: 1, source: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceId: { $type: "objectId" } },
  }
);

// User timeline listing (`GET /reminders`: active, sorted by date + time).
reminderSchema.index({ user: 1, isActive: 1, date: 1, time: 1 });

module.exports = mongoose.model("Reminder", reminderSchema);
module.exports.REMINDER_STATUSES = REMINDER_STATUSES;