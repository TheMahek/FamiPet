const express = require("express");

const router = express.Router();

const {
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
} = require("../controllers/notification.controller");

const { protect } = require("../middleware/auth");
const rateLimiter = require("../middleware/rateLimiter");

router.get("/", protect, getNotifications);

router.get("/unread", protect, getUnreadNotifications);

router.put("/read-all", protect, markAllAsRead);

// Push subscription endpoints. Registered BEFORE the `/:id` routes so
// "push-subscription" is never parsed as a notification id.
// Rate limited with the project's existing in-memory limiter — a
// subscription is a rare, explicit user action, so this is purely a
// guard against a client hammering the write with junk endpoints.
const pushLimiter = rateLimiter({ windowMs: 60 * 1000, max: 10 });

router.get("/vapid-public-key", protect, pushLimiter, getVapidPublicKey);

router.post("/push-subscription", protect, pushLimiter, savePushSubscription);

router.delete("/push-subscription", protect, pushLimiter, deletePushSubscription);

router.put("/:id/read", protect, markAsRead);

router.delete("/:id", protect, deleteNotification);

module.exports = router;