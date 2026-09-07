const express = require("express");

const router = express.Router();

const {
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../controllers/notification.controller");

const { protect } = require("../middleware/auth");

router.get("/", protect, getNotifications);

router.get("/unread", protect, getUnreadNotifications);

router.put("/read-all", protect, markAllAsRead);

router.put("/:id/read", protect, markAsRead);

router.delete("/:id", protect, deleteNotification);

module.exports = router;