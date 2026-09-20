const express = require("express");

const router = express.Router();

const {
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationPreferences,
  updateNotificationPreferences,
} = require("../controllers/notification.controller");

const { protect } = require("../middleware/auth");

router.get("/", protect, getNotifications);

router.get("/unread", protect, getUnreadNotifications);

// Static paths must stay above the `/:id` routes so they are never treated
// as an ObjectId.
router.get("/preferences", protect, getNotificationPreferences);

router.put("/preferences", protect, updateNotificationPreferences);

router.put("/read-all", protect, markAllAsRead);

router.put("/:id/read", protect, markAsRead);

router.delete("/:id", protect, deleteNotification);

module.exports = router;