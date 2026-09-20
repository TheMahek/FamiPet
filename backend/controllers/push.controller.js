// =====================================================
// PUSH CONTROLLER (Phase 6 Web Push)
// =====================================================
// Subscription lifecycle + test delivery. Every route derives the owning user
// from the authenticated request (req.user._id) — a client-supplied userId
// is NEVER accepted. Only the VAPID PUBLIC key is ever exposed; the private
// key lives exclusively in backend/.env.
const {
  getPublicKey,
  isConfigured,
  registerSubscription,
  listSubscriptions,
  countSubscriptions,
  removeSubscriptionById,
  removeSubscriptionByEndpoint,
  sendPushToUser,
} = require("../services/push.service");
const { isValidObjectId } = require("../utils/validation");

// Public, unauthenticated: the browser needs the VAPID public key before it
// can subscribe. Contains NO secret material by design.
exports.getVapidPublicKey = (req, res) => {
  res.json({
    success: true,
    vapidConfigured: isConfigured(),
    vapidPublicKey: getPublicKey(),
  });
};

// Register / refresh the current user's push subscription (dedupe/reassigned
// inside the service).
exports.subscribe = async (req, res) => {
  try {
    const body = req.body || {};
    const subscription = body.subscription;

    if (!subscription || typeof subscription !== "object") {
      return res
        .status(400)
        .json({ success: false, message: "subscription is required." });
    }

    const result = await registerSubscription(
      req.user._id,
      subscription,
      req.headers["user-agent"]
    );

    if (!result.success) {
      const message =
        result.error === "device-limit-reached"
          ? "Too many devices registered for this account."
          : "Invalid push subscription.";
      return res.status(400).json({ success: false, message });
    }

    res.status(201).json({
      success: true,
      message: result.updated
        ? "Push subscription updated."
        : "Push subscription registered.",
      subscription: result.subscription,
      created: Boolean(result.created),
      reassigned: Boolean(result.reassigned),
    });
  } catch (error) {
    console.error("Push Subscribe Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.listSubscriptions = async (req, res) => {
  try {
    const [subscriptions, count] = await Promise.all([
      listSubscriptions(req.user._id),
      countSubscriptions(req.user._id),
    ]);
    res.json({ success: true, count, subscriptions });
  } catch (error) {
    console.error("Push List Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Remove one of the user's subscriptions by its stored id.
exports.unsubscribeById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid subscription ID." });
    }
    const result = await removeSubscriptionById(req.user._id, req.params.id);
    if (!result.success) {
      return res.status(404).json({ success: false, message: "Push subscription not found." });
    }
    res.json({ success: true, message: "Push subscription removed." });
  } catch (error) {
    console.error("Push Unsubscribe Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Remove by push endpoint (idempotent) — used when the browser unsubscribes
// from the push service directly.
exports.unsubscribeByEndpoint = async (req, res) => {
  try {
    const endpoint = (req.body && req.body.endpoint) || "";
    const result = await removeSubscriptionByEndpoint(req.user._id, endpoint);
    if (!result.success) {
      return res.status(400).json({ success: false, message: "Invalid push endpoint." });
    }
    res.json({
      success: true,
      message: "Push subscription removed.",
      removed: Boolean(result.removed),
    });
  } catch (error) {
    console.error("Push Unsubscribe Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// User-scoped "send a test push" action for the preferences UI.
exports.sendTestNotification = async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Push notifications are not configured on this server yet.",
      });
    }

    const count = await countSubscriptions(req.user._id);
    if (count === 0) {
      return res.status(404).json({
        success: false,
        message: "No push subscription found. Enable push for this device first.",
      });
    }

    const result = await sendPushToUser(req.user._id, {
      title: "Famipet Test Notification",
      body: "This is a test push from your Famipet settings. It works!",
      data: {
        url: "/pages/settings.html",
        type: "system",
        category: "system",
        sentAt: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      message:
        result.removed > 0
          ? "Test push sent; outdated devices were removed."
          : "Test push sent.",
      attempted: result.attempted,
      sent: result.sent,
      failed: result.failed,
      removed: result.removed,
    });
  } catch (error) {
    console.error("Push Test Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};