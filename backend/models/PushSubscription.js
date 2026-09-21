const mongoose = require("mongoose");

// =====================================================
// PUSH SUBSCRIPTION (Phase 6 Web Push)
// =====================================================
// One document per device/browser registration, owned by the authenticating
// user. The `endpoint` is globally unique — a browser profile has a single
// PushManager subscription per origin, so on account switch the endpoint is
// re-attributed to the newly signed-in user (see push.service.js).
//
// SECURITY: `user` is ALWAYS taken from the authenticated request context
// (req.user._id); clients never supply it. Release of a subscription to a
// push service happens privately server-side (no VAPID secret exposure).
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Push-service URL identifying this device's subscription.
    endpoint: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1024,
    },

    // Subscription auth keys (p256dh + auth) as base64url strings as
    // returned by PushSubscription.getKey().
    keys: {
      p256dh: { type: String, required: true, maxlength: 512, trim: true },
      auth: { type: String, required: true, maxlength: 512, trim: true },
    },

    // Optional: when the push service considers the subscription expired
    // (null when no expiration is set).
    expirationTime: {
      type: Number,
      default: null,
    },

    // Best-effort device description (client-supplied User-Agent, capped).
    userAgent: {
      type: String,
      default: "",
      maxlength: 500,
    },

    // Refreshed on every successful send so stale rows can be pruned.
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Global uniqueness: one row per push endpoint. Prevents duplicate rows on
// repeated subscribes and detects account-switch re-attribution.
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

// Primary owner-scoped access path (list for owner, sends by user).
pushSubscriptionSchema.index({ user: 1, lastUsedAt: -1 });

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);