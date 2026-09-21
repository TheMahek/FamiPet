const Notification = require("../models/Notification");
const {
  isValidObjectId,
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
} = require("../utils/validation");
const {
  getOrCreatePreferences,
  updatePreferences,
  countUnread,
} = require("../services/notification.service");

// Pagination caps keep list pages bounded while remaining backward-compatible
// with the old "return everything" shape until a page exceeds the limit.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const parsePage = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) || n < 1 ? fallback : n;
};

const parseTypeFilter = (rawTypes) => {
  if (rawTypes === undefined) return [];
  const values = Array.isArray(rawTypes) ? rawTypes : [rawTypes];
  const parsed = values
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  if (parsed.some((v) => !NOTIFICATION_TYPES.includes(v))) return null;
  return parsed;
};

const parseCategoryFilter = (rawCategories) => {
  if (rawCategories === undefined) return [];
  const values = Array.isArray(rawCategories) ? rawCategories : [rawCategories];
  const parsed = values
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  if (parsed.some((v) => !NOTIFICATION_CATEGORIES.includes(v))) return null;
  return parsed;
};

exports.getNotifications = async (req, res) => {
  try {
    const query = { user: req.user._id };

    const types = parseTypeFilter(req.query.type);
    if (types === null) {
      return res.status(400).json({ success: false, message: "Invalid type filter." });
    }
    if (types.length > 0) query.type = { $in: types };

    const categories = parseCategoryFilter(req.query.category);
    if (categories === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid category filter.",
      });
    }
    if (categories.length > 0) query.category = { $in: categories };

    const page = parsePage(req.query.page, 1);
    const limit = Math.min(parsePage(req.query.limit, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

    const [total, notifications] = await Promise.all([
      Notification.countDocuments(query),
      Notification.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ]);

    res.json({
      success: true,
      count: notifications.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      notifications,
    });
  } catch (error) {
    console.error("Get Notifications Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getUnreadNotifications = async (req, res) => {
  try {
    const query = { user: req.user._id, isRead: false };

    const types = parseTypeFilter(req.query.type);
    if (types === null) {
      return res.status(400).json({ success: false, message: "Invalid type filter." });
    }
    if (types.length > 0) query.type = { $in: types };

    const categories = parseCategoryFilter(req.query.category);
    if (categories === null) {
      return res.status(400).json({ success: false, message: "Invalid category filter." });
    }
    if (categories.length > 0) query.category = { $in: categories };

    // Unpaginated on purpose: the unread badge in the existing UI derives its
    // number from `count`, so it must equal the true unread total.
    const notifications = await Notification.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: notifications.length,
      unreadCount: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error("Unread Notifications Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
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
      unreadCount: await countUnread(req.user._id),
    });
  } catch (error) {
    console.error("Mark Read Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true }
    );

    res.json({
      success: true,
      message: "All notifications marked as read.",
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Mark All Read Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
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
    console.error("Delete Notification Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/* =====================================================
   PREFERENCES (self-only; lazily created with defaults)
   ===================================================== */

exports.getNotificationPreferences = async (req, res) => {
  try {
    const result = await getOrCreatePreferences(req.user._id);
    if (!result.success) {
      return res.status(500).json({ success: false, message: "Could not load notification preferences." });
    }
    res.json({ success: true, preferences: result.preferences });
  } catch (error) {
    console.error("Get Preferences Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    const body = req.body || {};

    // Field allowlist — clients may only adjust channels + per-type toggles.
    if (body.channels !== undefined && (typeof body.channels !== "object" || Array.isArray(body.channels))) {
      return res.status(400).json({ success: false, message: "Invalid channels." });
    }
    if (body.types !== undefined && (typeof body.types !== "object" || Array.isArray(body.types) || body.types === null)) {
      return res.status(400).json({ success: false, message: "Invalid types." });
    }
    if (Object.keys(body).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update." });
    }

    const result = await updatePreferences(req.user._id, {
      channels: body.channels,
      types: body.types,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error || "Invalid notification preferences." });
    }

    res.json({
      success: true,
      message: "Notification preferences updated.",
      preferences: result.preferences,
      unchanged: Boolean(result.unchanged),
    });
  } catch (error) {
    console.error("Update Preferences Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};