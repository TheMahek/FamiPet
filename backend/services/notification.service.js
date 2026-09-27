// =========================================================
// Notification dispatch — the ONE place a notification is
// persisted and then mirrored to the user's devices.
// ---------------------------------------------------------
// Existing call sites used to call `Notification.create(...)`
// directly, which meant push delivery would have to be repeated
// at each of them (and forgotten at the next new one). Both
// halves now happen here, in this order:
//
//   1. persist the Notification  — authoritative, and the only
//      write. The inbox, the unread badge and read state all read
//      this document; nothing about push can change them.
//   2. mirror it to push         — best effort. A push service
//      outage, a misconfigured VAPID key or a dead endpoint must
//      never fail the operation that produced the notification
//      (booking an appointment, submitting/approving an adoption).
//
// So a notification write failure DOES propagate (the caller
// decides whether that matters — appointment.service.js does not
// want it to), while a push failure never does.
// =========================================================

const Notification = require("../models/Notification");
const pushService = require("./push.service");
const logger = require("../utils/logger");

/**
 * Persist a notification for `user` and deliver it to their devices.
 *
 * `user` is always the authenticated owner (or a pet owner resolved
 * server-side), never a client-supplied value. `url` is an in-app
 * path used as the push deep link and is sanitised by push.service.
 */
async function createNotification({ user, title, message, type, url }) {
  const notification = await Notification.create({
    user,
    title,
    message,
    type: type || "system",
  });

  try {
    await pushService.sendToUser(user, {
      title,
      body: message,
      type: notification.type,
      url,
      notificationId: notification._id,
    });
  } catch (error) {
    // sendToUser is documented never to throw; this is the belt to
    // its braces so a future change there can never fail a booking.
    logger.error(`Push delivery failed for notification ${notification._id}: ${error.message}`);
  }

  return notification;
}

module.exports = { createNotification };
