// =========================================================
// Push delivery service — notification delivery ONLY.
// ---------------------------------------------------------
// The MongoDB Notification document stays the single source of
// truth for the inbox and for read/unread state. This service
// never writes one; it only mirrors an already-persisted
// notification onto the user's registered devices.
//
// Contract with the caller (this is the important part):
//   * sendToUser() NEVER throws and NEVER rejects. A push service
//     that is down, misconfigured, or rejecting an endpoint must
//     not be able to fail the business operation that created the
//     notification (booking an appointment, approving an adoption).
//   * The payload is minimal on purpose: the same title/message
//     the user already sees in their own inbox, a stable tag, the
//     notification id, and an in-app deep link. No pet records, no
//     health/vaccination/diet data, no owner details, no tokens
//     (AGENTS §10) — a push is rendered on a lock screen.
// =========================================================

const PushSubscription = require("../models/PushSubscription");
const pushConfig = require("../config/push");
const logger = require("../utils/logger");

// A push endpoint a service has repeatedly refused is not worth
// keeping. 404/410 is the authoritative "gone" signal and removes
// the row immediately; anything else only counts toward this cap.
const MAX_FAILURES = 5;

// Lock-screen text is bounded. The full message stays in Mongo and
// in the inbox; the truncated text is only a heads-up.
const MAX_TITLE = 120;
const MAX_BODY = 200;

function clamp(value, max) {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// Deep link must be a same-origin in-app path. A client-supplied
// absolute URL is never trusted (it would be an open redirect out
// of the app), and nothing outside the app is linked to.
function safeUrl(value, fallback) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

function buildPayload({ title, body, type, url, notificationId }) {
  return {
    title: clamp(title, MAX_TITLE) || "FamiPet",
    body: clamp(body, MAX_BODY),
    // Notification type drives the icon/tag only — no user data.
    tag: `famipet-${clamp(type, 32) || "system"}`,
    url: safeUrl(url, "/app/dashboard"),
    notificationId: notificationId ? String(notificationId) : undefined,
  };
}

// A push service reports a dead endpoint as an HTTP status. web-push
// puts it on `statusCode` (and some paths on `body.statusCode`).
function goneStatus(error) {
  const status = error && (error.statusCode || (error.body && error.body.statusCode));
  return status === 404 || status === 410;
}

async function deliver(subscription, payload) {
  try {
    await pushConfig.sendToSubscription(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Mirror a persisted notification onto every device the user has
 * subscribed. Always resolves with a per-outcome summary so tests
 * (and logs) can see what happened without any failure escaping.
 */
async function sendToUser(userId, notification) {
  const summary = { delivered: 0, removed: 0, failed: 0, skipped: null };

  if (!userId) return { ...summary, skipped: "no-user" };
  if (!pushConfig.isPushConfigured()) return { ...summary, skipped: "not-configured" };

  let subscriptions;
  try {
    // User-scoped: a user can only ever push to their own devices.
    subscriptions = await PushSubscription.find({ user: userId });
  } catch (error) {
    logger.error(`Push lookup failed for user ${userId}: ${error.message}`);
    return { ...summary, skipped: "lookup-failed" };
  }

  if (subscriptions.length === 0) return { ...summary, skipped: "no-subscriptions" };

  const payload = buildPayload(notification);

  for (const subscription of subscriptions) {
    const { ok, error } = await deliver(subscription, payload);

    if (ok) {
      summary.delivered += 1;
      if (subscription.failureCount > 0) {
        // Best effort; a failed reset must not abort delivery.
        await PushSubscription.updateOne(
          { _id: subscription._id },
          { $set: { failureCount: 0, lastFailureAt: null } }
        ).catch(() => {});
      }
      continue;
    }

    summary.failed += 1;

    if (goneStatus(error)) {
      // 404/410: the push service will never accept this endpoint
      // again (browser unsubscribed, or the service dropped it).
      await PushSubscription.deleteOne({ _id: subscription._id }).catch(() => {});
      summary.removed += 1;
      continue;
    }

    const failureCount = (subscription.failureCount || 0) + 1;
    const patch = { failureCount, lastFailureAt: new Date() };
    if (failureCount >= MAX_FAILURES) {
      await PushSubscription.deleteOne({ _id: subscription._id }).catch(() => {});
      summary.removed += 1;
    } else {
      await PushSubscription.updateOne({ _id: subscription._id }, { $set: patch }).catch(() => {});
    }
  }

  return summary;
}

module.exports = {
  sendToUser,
  buildPayload,
  // Exported for tests: MAX_FAILURES is the pruning ceiling.
  MAX_FAILURES,
};
