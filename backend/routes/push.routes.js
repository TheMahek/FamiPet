const express = require("express");

const router = express.Router();

const {
  getVapidPublicKey,
  subscribe,
  listSubscriptions,
  unsubscribeById,
  unsubscribeByEndpoint,
  sendTestNotification,
} = require("../controllers/push.controller");

const { protect } = require("../middleware/auth");

// Public (no auth): the VAPID public key a browser needs BEFORE subscribing.
// Exposes only the public key — never the private one.
router.get("/vapid-public-key", getVapidPublicKey);

// Authenticated subscription lifecycle. The owning user is resolved from the
// JWT; clients can never pick a different owner.
router.post("/subscribe", protect, subscribe);

router.get("/subscriptions", protect, listSubscriptions);

router.delete("/subscriptions/:id", protect, unsubscribeById);

router.delete("/unsubscribe", protect, unsubscribeByEndpoint);

// User-scoped "send a test push" action.
router.post("/test", protect, sendTestNotification);

module.exports = router;