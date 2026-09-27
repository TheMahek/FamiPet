// =========================================================
// Web Push (VAPID) configuration — the only place the push
// keys are read and the only place the transport is touched.
// ---------------------------------------------------------
// Fails CLOSED: with no VAPID keys configured the app is fully
// usable and push is simply off. `isPushConfigured()` is false,
// `sendToSubscription()` refuses, and the browser's push
// toggle in Settings reports "not configured" instead of
// pretending. Nothing here ever throws at require time — a
// missing key must not take the API down.
//
// The VAPID PRIVATE key is read from the environment, handed
// straight to web-push, and never logged, echoed, returned by
// any endpoint, or attached to an error. Only the PUBLIC key
// leaves the server, and only via the authenticated
// GET /api/notifications/vapid-public-key.
// =========================================================

const webpush = require("web-push");
const logger = require("../utils/logger");

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:admin@famipet.app";

// Snapshot at load time, like config/ai.js: the keys are
// deployment configuration, not per-request input.
const publicKey = process.env.VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";

// Cleared again if web-push rejects the keys, so a malformed
// pair fails closed exactly like a missing one.
let configured = Boolean(publicKey && privateKey);

if (configured) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
    logger.info("Push notifications: VAPID configured.");
  } catch (error) {
    configured = false;
    logger.error(`Push notifications: invalid VAPID configuration (${error.message}). Push disabled.`);
  }
} else {
  logger.warn(
    "Push notifications: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set. Push is disabled; the rest of the app is unaffected."
  );
}

// ponytail: transport seam. push.service.js always sends through
// this function, so a test can replace delivery without a real
// push service. Upgrade path (if a second transport is ever
// needed): keep this one-line indirection and add a map.

let transport = (subscription, payload) =>
  webpush.sendNotification(subscription, payload);

function isPushConfigured() {
  return configured;
}

function getVapidPublicKey() {
  return publicKey;
}

async function sendToSubscription(subscription, payload) {
  return transport(subscription, payload);
}

// Test-only. Passing no argument restores the real web-push transport.
function setTransport(fn) {
  transport = typeof fn === "function" ? fn : (subscription, payload) =>
    webpush.sendNotification(subscription, payload);
}

module.exports = {
  isPushConfigured,
  getVapidPublicKey,
  sendToSubscription,
  setTransport,
};
