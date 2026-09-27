const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const PushSubscription = require("../models/PushSubscription");
const pushConfig = require("../config/push");

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ success: true, count: notifications.length, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUnreadNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user._id,
      isRead: false,
    }).sort({ createdAt: -1 });
    res.json({ success: true, count: notifications.length, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid notification ID." });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    res.json({
      success: true,
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ success: true, message: "All notifications marked as read." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid notification ID." });
    }

    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    res.json({ success: true, message: "Notification deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================================================
// PUSH SUBSCRIPTIONS
// ---------------------------------------------------------
// `user` is ALWAYS req.user._id. No endpoint here reads a user id
// from the request body, so a client cannot subscribe — or
// unsubscribe — on somebody else's devices (AGENTS §2, §3).
//
// The browser-supplied endpoint and keys are untrusted input:
// validated, length-bounded and stored verbatim, but never
// interpolated into a query or a log line.
// =========================================================

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

// VAPID subscription keys are base64url (with optional padding).
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

// A real push endpoint is always HTTPS and belongs to a known push
// service. Requiring a known host is what stops this endpoint from
// being used to make the server hold attacker-chosen URLs.
const PUSH_ENDPOINT_HOSTS = new Set(["fcm.googleapis.com"]);
const PUSH_ENDPOINT_HOST_SUFFIXES = [
  "push.services.mozilla.com",
  "notify.windows.com",
  "web.push.apple.com",
];

function isPushServiceHost(hostname) {
  return (
    PUSH_ENDPOINT_HOSTS.has(hostname) ||
    PUSH_ENDPOINT_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
    )
  );
}

function validatePushSubscriptionBody(body) {
  const endpoint = typeof (body && body.endpoint) === "string" ? body.endpoint.trim() : "";
  const keys = (body && body.keys) || {};
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";

  if (!endpoint) return { error: "A push subscription endpoint is required." };
  if (endpoint.length > MAX_ENDPOINT_LENGTH) return { error: "Push subscription endpoint is too long." };

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return { error: "Push subscription endpoint is not a valid URL." };
  }
  if (url.protocol !== "https:") {
    return { error: "Push subscription endpoint must be an https URL." };
  }
  if (!isPushServiceHost(url.hostname)) {
    return { error: "Push subscription endpoint is not a recognised push service." };
  }

  for (const [name, value] of [["p256dh", p256dh], ["auth", auth]]) {
    if (!value) return { error: `Push subscription ${name} is required.` };
    if (value.length > MAX_KEY_LENGTH) return { error: `Push subscription ${name} is too long.` };
    if (!BASE64URL.test(value)) return { error: `Push subscription ${name} is not a valid key.` };
  }

  return { endpoint, p256dh, auth };
}

exports.getVapidPublicKey = async (req, res) => {
  // The PUBLIC key is designed to be public: the browser needs it to
  // build a subscription. The private key is never read here and no
  // endpoint anywhere returns it.
  const configured = pushConfig.isPushConfigured();
  res.json({
    success: true,
    configured,
    publicKey: configured ? pushConfig.getVapidPublicKey() : null,
  });
};

exports.savePushSubscription = async (req, res) => {
  try {
    const { error, endpoint, p256dh, auth } = validatePushSubscriptionBody(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    // One row per endpoint. Re-subscribing (token rotation, a second
    // account on the same device) rebinds that endpoint to the
    // authenticated user instead of piling up duplicates.
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { $set: { user: req.user._id, p256dh, auth, failureCount: 0, lastFailureAt: null } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );

    res.json({ success: true, message: "Push subscription saved." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePushSubscription = async (req, res) => {
  try {
    const raw = (req.body && req.body.endpoint) || (req.query && req.query.endpoint);
    const endpoint = typeof raw === "string" ? raw.trim() : "";

    if (!endpoint) {
      return res.status(400).json({ success: false, message: "A push subscription endpoint is required." });
    }
    if (endpoint.length > MAX_ENDPOINT_LENGTH) {
      return res.status(400).json({ success: false, message: "Push subscription endpoint is too long." });
    }

    // Scoped to the authenticated user: another user's endpoint is
    // simply not found, never deleted.
    await PushSubscription.deleteOne({ endpoint, user: req.user._id });

    res.json({ success: true, message: "Push subscription removed." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
