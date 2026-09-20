// =====================================================
// SHARED NOTIFICATION SERVICE (Phase 5 Notification Core)
// =====================================================
// Single entry point for creating in-app notifications across all features.
// Future phases plug additional channels (push = Phase 6, reminders = Phase 7,
// feature-event integration = Phase 8) behind this same API without changing
// producers.
//
// Contract:
//   - Producers call createNotification(...) and never branch on its result.
//   - Any failure (validation / DB / preferences) is logged and returned as a
//     graceful `{ success:false, skipped:true, ... }` so the triggering
//     feature operation is never broken by a notification problem.
//   - Ownership is enforced by the caller context (userId comes from the
//     authenticated request or the owning document), never from client input.
//   - De-duplication is optional per-event (dedupKey + time window).
//   - User preferences can suppress a type or the whole in-app channel.
const Notification = require("../models/Notification");
const NotificationPreference = require("../models/NotificationPreference");
const pushService = require("./push.service");
const { isValidObjectId, isPlainObject } = require("../utils/validation");

const NOTIFICATION_TYPES = Notification.NOTIFICATION_TYPES;
const NOTIFICATION_CATEGORIES = Notification.NOTIFICATION_CATEGORIES;
const NOTIFICATION_PRIORITIES = Notification.NOTIFICATION_PRIORITIES;

// Default de-duplication window: identical events within 1 hour collapse into
// one notification. Producers may override per call (bounded).
const DEFAULT_DEDUP_WINDOW_MS = 60 * 60 * 1000;
const MAX_DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Metadata payload cap (serialized) — keeps document sizes predictable.
const MAX_METADATA_BYTES = 2000;

const log = (err) =>
  console.error("[Notification] create failed:", err && err.message);

// Accepts a string id or a Mongoose ObjectId and normalizes to a well-formed
// 24-hex string ("" when not). Controllers pass req.user._id (an ObjectId
// instance) while seed/metadata paths may pass plain strings.
const toIdString = (value) => {
  if (!value) return "";
  const str = typeof value === "string" ? value : String(value);
  return /^[0-9a-fA-F]{24}$/.test(str) ? str : "";
};

const resolveUserId = (user) => {
  if (!user) return "";
  return toIdString(user._id ? user._id : user);
};

/**
 * Create a single in-app notification for a user.
 *
 * @param {object} input
 * @param {ObjectId|User|string} input.user        owning user (req.user._id or owner doc)
 * @param {string} [input.type='system']           backend-domain type
 * @param {string} [input.category]                UI group; defaults to `type`
 * @param {string} input.title                     required (<=200 chars)
 * @param {string} input.message                   required (<=2000 chars)
 * @param {string} [input.priority='normal']       low|normal|high|urgent
 * @param {string} [input.referenceType]           e.g. 'pet' | 'adoption' (<=60)
 * @param {ObjectId} [input.referenceId]           target entity id
 * @param {object} [input.metadata]                plain-object payload (size capped)
 * @param {string} [input.dedupKey]                optional dedup key (<=200)
 * @param {number} [input.dedupWindowMs]           optional dedup window override
 * @param {object} [input.options]                 { skipPreferences?: boolean }
 *
 * @returns {Promise<object>} { success, notification?, skipped?, deduped?, reason? }
 *   Always resolves; never throws.
 */
const createNotification = async (input = {}) => {
  const userId = resolveUserId(input.user);

  // --- INPUT VALIDATION (service-side; producers can't forge ownership) ---
  if (!userId || !isValidObjectId(userId)) {
    console.error("[Notification] create skipped: invalid user id.");
    return { success: false, skipped: true, reason: "invalid-user" };
  }

  const type = input.type || "system";
  if (!NOTIFICATION_TYPES.includes(type)) {
    console.error(`[Notification] create skipped: unknown type "${type}".`);
    return { success: false, skipped: true, reason: "invalid-type" };
  }

  const category = input.category || type;
  if (!NOTIFICATION_CATEGORIES.includes(category)) {
    console.error(
      `[Notification] create skipped: unknown category "${category}".`
    );
    return { success: false, skipped: true, reason: "invalid-category" };
  }

  if (typeof input.title !== "string" || !input.title.trim()) {
    console.error("[Notification] create skipped: title required.");
    return { success: false, skipped: true, reason: "invalid-title" };
  }
  const title = input.title.trim().slice(0, 200);

  if (typeof input.message !== "string" || !input.message.trim()) {
    console.error("[Notification] create skipped: message required.");
    return { success: false, skipped: true, reason: "invalid-message" };
  }
  const message = input.message.trim().slice(0, 2000);

  const priority = input.priority || "normal";
  if (!NOTIFICATION_PRIORITIES.includes(priority)) {
    console.error(`[Notification] create skipped: bad priority "${priority}".`);
    return { success: false, skipped: true, reason: "invalid-priority" };
  }

  let referenceType = undefined;
  let referenceId = undefined;
  if (input.referenceType !== undefined || input.referenceId !== undefined) {
    if (
      typeof input.referenceType !== "string" ||
      !input.referenceType.trim() ||
      input.referenceType.trim().length > 60
    ) {
      console.error("[Notification] create skipped: bad referenceType.");
      return { success: false, skipped: true, reason: "invalid-reference" };
    }
    const referenceIdStr = toIdString(input.referenceId);
    if (!referenceIdStr) {
      console.error("[Notification] create skipped: bad referenceId.");
      return { success: false, skipped: true, reason: "invalid-reference" };
    }
    referenceType = input.referenceType.trim();
    referenceId = referenceIdStr;
  }

  let metadata = {};
  if (input.metadata !== undefined) {
    if (!isPlainObject(input.metadata)) {
      console.error("[Notification] create skipped: metadata not an object.");
      return { success: false, skipped: true, reason: "invalid-metadata" };
    }
    try {
      if (JSON.stringify(input.metadata).length > MAX_METADATA_BYTES) {
        console.error(
          `[Notification] create skipped: metadata too large (limit ${MAX_METADATA_BYTES} bytes).`
        );
        return { success: false, skipped: true, reason: "invalid-metadata" };
      }
    } catch (metaErr) {
      console.error(
        "[Notification] create skipped: metadata not serializable.",
        metaErr.message
      );
      return { success: false, skipped: true, reason: "invalid-metadata" };
    }
    metadata = input.metadata;
  }

  let dedupKey;
  if (input.dedupKey !== undefined && input.dedupKey !== null) {
    if (typeof input.dedupKey !== "string" || input.dedupKey.length > 200) {
      console.error("[Notification] create skipped: bad dedupKey.");
      return { success: false, skipped: true, reason: "invalid-dedup-key" };
    }
    dedupKey = input.dedupKey;
  }

  // --- PREFERENCES GATE (Phase 5: in-app channel only) ---
  const opts = input.options || {};
  if (!opts.skipPreferences) {
    try {
      const prefs = await NotificationPreference.findOne({ user: userId });
      if (prefs) {
        if (prefs.channels && prefs.channels.inApp === false) {
          return { success: true, skipped: true, reason: "channel-inapp-disabled" };
        }
        const typeEnabled = prefs.types && prefs.types.get(type);
        if (typeEnabled === false) {
          return { success: true, skipped: true, reason: "type-disabled" };
        }
      }
    } catch (prefErr) {
      log(prefErr);
    }
  }

  // --- DE-DUPLICATION (opt-in via dedupKey) ---
  if (dedupKey) {
    const windowMs =
      typeof input.dedupWindowMs === "number" && input.dedupWindowMs > 0
        ? Math.min(input.dedupWindowMs, MAX_DEDUP_WINDOW_MS)
        : DEFAULT_DEDUP_WINDOW_MS;

    try {
      const existing = await Notification.findOne({
        user: userId,
        type,
        category,
        dedupKey,
        createdAt: { $gte: new Date(Date.now() - windowMs) },
      })
        .sort({ createdAt: -1 })
        .lean();
      if (existing) {
        return {
          success: true,
          skipped: true,
          deduped: true,
          reason: "duplicate-within-window",
          notification: existing,
        };
      }
    } catch (dedupErr) {
      // Log but continue — dedup is best-effort; never block creation on it.
      log(dedupErr);
    }
  }

  // --- CREATE (fail-safe: a notification problem never breaks the caller) ---
  try {
    const doc = {
      user: userId,
      title,
      message,
      type,
      category,
      priority,
      metadata,
    };
    if (dedupKey) doc.dedupKey = dedupKey;
    if (referenceType) doc.referenceType = referenceType;
    if (referenceId) doc.referenceId = referenceId;

    const notification = await Notification.create(doc);

    // --- PUSH DELIVERY (Phase 6) ---
    // Fire-and-forget. Unlike the in-app record (always stored), browser push
    // only fires when the user enabled the `push` channel AND type-level
    // preferences allow it. Never waits, never throws, never breaks the
    // caller. Producers (Phase 5-8) are unchanged — this is the single
    // Notification-Core → Push-Delivery → Browser path.
    if (!opts.skipPreferences) {
      deliverPush({
        userId,
        notificationId: notification._id,
        title,
        message,
        type,
        category,
        referenceType,
        referenceId,
      }).catch(logPush);
    }

    return { success: true, notification };
  } catch (error) {
    log(error);
    return { success: false, skipped: true, reason: "create-failed" };
  }
};

const logPush = (err) =>
  console.error("[Notification] push delivery failed:", err && err.message);

// Maps a notification reference to a frontend route for the notificationclick
// handler. Conservative: unknown references fall back to the dashboard.
const pushTargetUrl = (referenceType, referenceId) => {
  const id = referenceId ? String(referenceId) : "";
  switch (referenceType) {
    case "adoption":
      return "/pages/adoption.html" + (id ? `?id=${encodeURIComponent(id)}` : "");
    case "pet":
      if (id) return `/pages/pet-details.html?id=${encodeURIComponent(id)}`;
      return "/pages/dashboard.html";
    default:
      return "/pages/dashboard.html";
  }
};

/**
 * Deliver a created notification to the user's push-enabled devices.
 * Re-checks the push channel + per-type gate (independent of the in-app gate)
 * so turning off push alone never silences the on-screen bell and vice versa.
 * Resolves { skipped } when push is off or not configured; never throws.
 */
const deliverPush = async ({
  userId,
  notificationId,
  title,
  message,
  type,
  category,
  referenceType,
  referenceId,
}) => {
  if (!pushService.isConfigured()) return { skipped: "not-configured" };

  try {
    const prefs = await NotificationPreference.findOne({ user: userId });
    // Push is OPT-IN: no preferences row yet means the user never enabled it,
    // so no push (unlike in-app, which is green by default).
    if (!prefs) return { skipped: "channel-push-disabled" };
    if (prefs.channels && prefs.channels.push === false) {
      return { skipped: "channel-push-disabled" };
    }
    if (prefs.types && prefs.types.get(type) === false) {
      return { skipped: "type-disabled" };
    }

    const result = await pushService.sendPushToUser(userId, {
      title,
      body: message,
      tag: String(notificationId),
      data: {
        url: pushTargetUrl(referenceType, referenceId),
        notificationId: String(notificationId),
        type,
        category,
      },
    });
    return result;
  } catch (error) {
    logPush(error);
    return { skipped: "delivery-failed" };
  }
};

/* =====================================================
   PREFERENCES (used by routes; future phases reuse these)
   ===================================================== */

const buildDefaultPreferences = () => ({
  channels: { inApp: true, email: false, push: false },
  types: {},
});

/**
 * Get a user's notification preferences, lazily creating defaults.
 * @returns {Promise<object>} { success, preferences? }
 */
const getOrCreatePreferences = async (userId) => {
  const normalizedId = toIdString(userId);
  if (!normalizedId || !isValidObjectId(normalizedId)) {
    return { success: false, reason: "invalid-user" };
  }
  try {
    let prefs = await NotificationPreference.findOne({ user: normalizedId });
    if (!prefs) {
      prefs = await NotificationPreference.create({
        user: normalizedId,
        ...buildDefaultPreferences(),
      });
    }
    return { success: true, preferences: prefs };
  } catch (error) {
    console.error("[Notification] preferences read failed:", error.message);
    return { success: false, reason: "read-failed" };
  }
};

/**
 * Update a user's own notification preferences.
 * Strict field allowlist — client input can never touch user/roles/ids.
 * @param {ObjectId} userId
 * @param {object} updates { channels?: {...booleans}, types?: {type: bool} }
 * @returns {Promise<object>} { success, preferences?, error? }
 */
const updatePreferences = async (userId, updates = {}) => {
  const normalizedId = toIdString(userId);
  if (!normalizedId || !isValidObjectId(normalizedId)) {
    return { success: false, error: "invalid-user" };
  }

  const found = await getOrCreatePreferences(normalizedId);
  if (!found.success) return { success: false, error: found.reason };
  const prefs = found.preferences;

  const changed = {};

  if (updates.channels !== undefined) {
    if (!isPlainObject(updates.channels)) {
      return { success: false, error: "invalid-channels" };
    }
    for (const key of ["inApp", "email", "push"]) {
      if (updates.channels[key] !== undefined) {
        if (typeof updates.channels[key] !== "boolean") {
          return { success: false, error: `invalid-channel-${key}` };
        }
        prefs.channels[key] = updates.channels[key];
        changed[`channels.${key}`] = updates.channels[key];
      }
    }
  }

  if (updates.types !== undefined) {
    if (!isPlainObject(updates.types)) {
      return { success: false, error: "invalid-types" };
    }
    for (const [type, enabled] of Object.entries(updates.types)) {
      if (typeof enabled !== "boolean") {
        return { success: false, error: `invalid-type-${type}` };
      }
      // Unknown future types are accepted (Map is open) so preferences stay
      // forward-compatible; the controller already validates known types.
      prefs.types.set(type, enabled);
      changed[`types.${type}`] = enabled;
    }
  }

  if (Object.keys(changed).length === 0) {
    return { success: true, preferences: prefs, unchanged: true };
  }

  try {
    await prefs.save();
    return { success: true, preferences: prefs };
  } catch (error) {
    console.error("[Notification] preferences update failed:", error.message);
    return { success: false, preferences: prefs, error: "save-failed" };
  }
};

/**
 * Quick unread counter for badges.
 * @returns {Promise<number>}
 */
const countUnread = async (userId) => {
  const normalizedId = toIdString(userId);
  if (!normalizedId || !isValidObjectId(normalizedId)) return 0;
  try {
    return await Notification.countDocuments({
      user: normalizedId,
      isRead: false,
    });
  } catch (error) {
    console.error("[Notification] unread count failed:", error.message);
    return 0;
  }
};

module.exports = {
  createNotification,
  getOrCreatePreferences,
  updatePreferences,
  countUnread,
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITIES,
  DEFAULT_DEDUP_WINDOW_MS,
};