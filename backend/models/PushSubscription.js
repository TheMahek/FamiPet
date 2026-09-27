// =========================================================
// PushSubscription — one browser push endpoint per device.
// ---------------------------------------------------------
// Created ONLY from an authenticated request, and `user` is
// always taken from the authenticated session (never from the
// body), so ownership cannot be forged (AGENTS §2, §3).
//
// `endpoint` is the unique key: a push endpoint belongs to one
// browser, so re-subscribing (after a token rotation, a logout,
// or a second account on the same device) rebinds that endpoint
// to the current user instead of accumulating dead rows.
// =========================================================

const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    endpoint: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 2048,
    },

    p256dh: {
      type: String,
      required: true,
      maxlength: 256,
    },

    auth: {
      type: String,
      required: true,
      maxlength: 256,
    },

    // Consecutive delivery failures that were NOT an explicit
    // 404/410 "gone" (those delete the row immediately). Reset on
    // a successful send; used only to eventually drop endpoints a
    // push service has stopped accepting.
    failureCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastFailureAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
