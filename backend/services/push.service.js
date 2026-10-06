// =====================================================
// PUSH DELIVERY SERVICE (Phase 6 Web Push)
// =====================================================
// Encapsulates everything Web-Push specific so business modules NEVER touch
// the push protocol (Phase 6 rule: no business module couples to Web Push).
// Producers call the Phase 5 notification service; this service is invoked
// from inside notification.service.js after a notification is created and the
// user's push channel is enabled.
//
// Contract:
//   - NEVER leaks the VAPID private key. Only the public key leaves this file,
//     via the controller (GET /api/push/vapid-public-key).
//   - Ownership is enforced by the caller: every function takes the userName
//     derived from the authenticated request context.
//   - sendPushToUser NEVER throws and never blocks — delivery failures are
//     logged; only definitive 404/410 ("gone") responses remove a
//     subscription so stale devices are cleaned up.
//   - When VAPID env vars are missing the service is inert (subscriptions
//     still validate and persist, but no push is sent).
const webPush = require("web-push");
const PushSubscription = require("../models/PushSubscription");
const { isValidObjectId } = require("../utils/validation");

const DEFAULT_TTL_SECONDS = 86400; // 24h
const SEND_TIMEOUT_MS = 10000; // never let a send hang the request/loop
const MAX_SUBSCRIPTIONS_PER_USER = 10;
const MAX_ENDPOINT_LENGTH = 1024;
const MAX_KEY_LENGTH = 512;
const MAX_USER_AGENT_LENGTH = 500;

const configure = () => {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (subject && publicKey && privateKey) {
    webPush.setVapidDetails(subject, publicKey, privateKey);
  }
};

configure();

const isConfigured = () =>
  Boolean(
    process.env.VAPID_SUBJECT &&
      process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY
  );

const getPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

// True only for absolute http(s) URIs (rejects javascript:, file:, etc).
const isHttpUrl = (value) => {
  if (typeof value !== "string") return false;
  let url;
  try {
    url = new URL(value);
  } catch (e) {
    return false;
  }
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    Boolean(url.hostname)
  );
};

const normalizeUserAgent = (userAgent) =>
  typeof userAgent === "string"
    ? userAgent.slice(0, MAX_USER_AGENT_LENGTH)
    : "";

// Converts a stored document into the shape web-push expects.
const toWebPushSubscription = (doc) => ({
  endpoint: doc.endpoint,
  keys: {
    p256dh: doc.keys && doc.keys.p256dh,
    auth: doc.keys && doc.keys.auth,
  },
  expirationTime: doc.expirationTime ?? null,
});

const log = (err) =>
  console.error("[Push] delivery failed:", err && err.message);

/**
 * Register (or refresh) a push subscription for a user.
 * - Same endpoint already on the same user  -> refresh (dedupe)
 * - Same endpoint registered by another user -> re-attribute to the current
 *   user (browser profile only exposes one subscription per origin; logging
 *   into a different account on the same device takes it over).
 * @param {ObjectId|string} userId authenticated user (req.user._id)
 * @param {object} subscription { endpoint, keys: { p256dh, auth }, expirationTime? }
 * @param {string} [userAgent]
 * @returns {Promise<{success:boolean, subscription?, created?:boolean, updated?:boolean, error?}>}
 */
const registerSubscription = async (userId, subscription = {}, userAgent = "") => {
  const userStr = typeof userId === "string" ? userId : String(userId);
  if (!isValidObjectId(userStr)) {
    return { success: false, error: "invalid-user" };
  }

  if (!isPlainSub(subscription)) {
    return { success: false, error: "invalid-subscription" };
  }
  const endpoint = String(subscription.endpoint).trim();
  const keys = subscription.keys;
  const p256dh = String(keys.p256dh).trim();
  const auth = String(keys.auth).trim();

  if (!isHttpUrl(endpoint) || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return { success: false, error: "invalid-endpoint" };
  }
  if (
    !p256dh ||
    p256dh.length > MAX_KEY_LENGTH ||
    !auth ||
    auth.length > MAX_KEY_LENGTH
  ) {
    return { success: false, error: "invalid-keys" };
  }

  const fields = {
    user: userStr,
    endpoint,
    keys: { p256dh, auth },
    expirationTime:
      subscription.expirationTime == null
        ? null
        : Number(subscription.expirationTime),
    userAgent: normalizeUserAgent(userAgent),
    lastUsedAt: new Date(),
  };

  try {
    const existing = await PushSubscription.findOne({ endpoint });

    if (existing) {
      const reassigned = existing.user.toString() !== userStr;
      existing.set(fields);
      await existing.save();
      return {
        success: true,
        created: false,
        updated: true,
        reassigned,
        subscription: existing,
      };
    }

    const ownedCount = await PushSubscription.countDocuments({ user: userStr });
    if (ownedCount >= MAX_SUBSCRIPTIONS_PER_USER) {
      return {
        success: false,
        error: "device-limit-reached",
      };
    }

    const doc = await PushSubscription.create(fields);
    return { success: true, created: true, subscription: doc };
  } catch (error) {
    // Unique-index race (two identical subscribes in flight): re-fetch and
    // update instead of failing.
    if (error && error.code === 11000) {
      try {
        const existing = await PushSubscription.findOne({ endpoint });
        if (existing) {
          const reassigned = existing.user.toString() !== userStr;
          existing.set(fields);
          await existing.save();
          return {
            success: true,
            created: false,
            updated: true,
            reassigned,
            subscription: existing,
          };
        }
      } catch (retryErr) {
        log(retryErr);
      }
    }
    console.error("[Push] register failed:", error && error.message);
    return { success: false, error: "save-failed" };
  }
};

const isPlainSub = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof value.endpoint === "string" &&
  value.keys !== null &&
  typeof value.keys === "object" &&
  !Array.isArray(value.keys) &&
  typeof value.keys.p256dh === "string" &&
  typeof value.keys.auth === "string";

/**
 * List the current user's subscriptions (newest-refreshed first).
 */
const listSubscriptions = async (userId) => {
  const userStr = typeof userId === "string" ? userId : String(userId);
  if (!isValidObjectId(userStr)) return [];
  return PushSubscription.find({ user: userStr }).sort({ lastUsedAt: -1 }).lean();
};

const countSubscriptions = async (userId) => {
  const userStr = typeof userId === "string" ? userId : String(userId);
  if (!isValidObjectId(userStr)) return 0;
  return PushSubscription.countDocuments({ user: userStr });
};

/**
 * Remove ONE of the user's subscriptions by id (owner-scoped).
 */
const removeSubscriptionById = async (userId, subscriptionId) => {
  const userStr = typeof userId === "string" ? userId : String(userId);
  if (!isValidObjectId(userStr) || !isValidObjectId(subscriptionId)) {
    return { success: false, error: "invalid-id" };
  }
  const result = await PushSubscription.findOneAndDelete({
    _id: subscriptionId,
    user: userStr,
  });
  return result
    ? { success: true, removed: true }
    : { success: false, error: "not-found" };
};

/**
 * Remove a subscription by push endpoint (owner-scoped, idempotent).
 * Used when the service worker unsubscribes from the push service.
 */
const removeSubscriptionByEndpoint = async (userId, endpoint) => {
  const userStr = typeof userId === "string" ? userId : String(userId);
  if (!isValidObjectId(userStr)) return { success: false, error: "invalid-user" };
  if (typeof endpoint !== "string" || !isHttpUrl(endpoint)) {
    return { success: false, error: "invalid-endpoint" };
  }
  const result = await PushSubscription.findOneAndDelete({
    endpoint,
    user: userStr,
  });
  return {
    success: true,
    removed: Boolean(result),
  };
};

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("push-send-timeout")),
        ms
      );
      // Let the underlying request finish cleanly if it resolves later.
      promise.then(
        () => clearTimeout(),
        () => clearTimeout()
      );
    }),
  ]);

/**
 * Deliver a push payload to every device of a user, respecting the push
 * channel preference (the caller previously applied the in-app gate).
 *
 * NEVER throws. Collects per-subscription results and prunes endpoints the
 * push service reports as gone (404/410). Transient/network errors are logged
 * and counted as failures (no removal — the subscription may still work).
 *
 * @param {ObjectId|string} userId
 * @param {object} payload { title, body, data }
 * @param {object} [sendOptions] advanced web-push options forwarded verbatim
 *   (e.g. { agent } to reach a push service with a self-signed cert in test
 *   environments; production always uses web-push defaults over TLS).
 * @returns {Promise<{success:boolean, attempted:number, sent:number, failed:number, removed:number, skipped?:string}>}
 */
const sendPushToUser = async (userId, payload, sendOptions = {}) => {
  if (!isConfigured()) {
    return { success: true, attempted: 0, sent: 0, failed: 0, removed: 0, skipped: "not-configured" };
  }
  const userStr = typeof userId === "string" ? userId : String(userId);
  if (!isValidObjectId(userStr)) {
    return { success: true, attempted: 0, sent: 0, failed: 0, removed: 0, skipped: "invalid-user" };
  }

  const subscriptions = await PushSubscription.find({ user: userStr });
  if (!subscriptions.length) {
    return { success: true, attempted: 0, sent: 0, failed: 0, removed: 0, skipped: "no-subscriptions" };
  }

  let sent = 0;
  let failed = 0;
  const goneIds = [];
  const body = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await withTimeout(
        webPush.sendNotification(toWebPushSubscription(sub), body, {
          TTL: DEFAULT_TTL_SECONDS,
          urgency: "normal",
          ...sendOptions,
        }),
        SEND_TIMEOUT_MS
      );
      sub.lastUsedAt = new Date();
      await sub.save();
      sent += 1;
    } catch (error) {
      // 404/410 → the push service no longer knows this endpoint (device
      // uninstalled, subscription revoked). Remove the stale row.
      if (error && (error.statusCode === 404 || error.statusCode === 410)) {
        goneIds.push(sub._id);
        continue;
      }
      failed += 1;
      log(error);
    }
  }

  let removed = 0;
  if (goneIds.length) {
    const result = await PushSubscription.deleteMany({ _id: { $in: goneIds } });
    removed = result.deletedCount || 0;
  }

  return {
    success: true,
    attempted: subscriptions.length,
    sent,
    failed,
    removed,
  };
};

module.exports = {
  getPublicKey,
  isConfigured,
  registerSubscription,
  listSubscriptions,
  countSubscriptions,
  removeSubscriptionById,
  removeSubscriptionByEndpoint,
  sendPushToUser,
  MAX_SUBSCRIPTIONS_PER_USER,
};