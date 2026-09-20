// =====================================================
// SHARED INPUT VALIDATION HELPERS (Phase 3 security)
// =====================================================
// Small, reusable helpers used by controllers to:
//   - strictly validate MongoDB ObjectIds before queries
//   - build explicit field allowlists (anti mass-assignment)
//   - reject MongoDB operator objects in user input
//   - escape user-controlled search terms used in regexes
//   - enforce sensible string length limits
//   - validate enums against the project's real values

const mongoose = require("mongoose");

// Strict 24-char hex check. mongoose.Types.ObjectId.isValid() accepts some
// non-hex 12-byte strings; this extra guard keeps malformed IDs away from
// MongoDB entirely (no CastError, no unexpected queries).
const STRICT_OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const isValidObjectId = (value) =>
  typeof value === "string" &&
  STRICT_OBJECT_ID.test(value) &&
  mongoose.Types.ObjectId.isValid(value);

// Express middleware: validates req.params[paramName] and returns HTTP 400
// when the value is not a well-formed ObjectId.
const validateIdParam = (paramName) => (req, res, next) => {
  const value = req.params && req.params[paramName];
  if (!value || !isValidObjectId(value)) {
    return res.status(400).json({
      success: false,
      message: "Invalid ID",
    });
  }
  next();
};

// True only for plain objects (not arrays, dates, ObjectIds, null...).
const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.prototype.toString.call(value) === "[object Object]";

// Returns the value only when it is a plain string (rejects objects/arrays
// so clients cannot smuggle MongoDB operators such as { $ne: null }).
const stringOrUndefined = (value) =>
  typeof value === "string" ? value : undefined;

// Build an explicit allowlist object from a request body.
// Only keys present in `allowedFields` and with a defined value are copied.
const pickFields = (body, allowedFields) => {
  const picked = {};
  if (body === null || typeof body !== "object") return picked;
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      picked[field] = body[field];
    }
  }
  return picked;
};

// Escape a string before embedding it in a RegExp so user-controlled search
// text can never form a malicious/expensive pattern.
const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Length cap used for search terms / free text that reaches a RegExp.
const MAX_SEARCH_LENGTH = 100;

// Common allowed value sets used across controllers. These mirror the
// enums defined in the Mongoose models.
const SPECIES = ["dog", "cat", "bird", "rabbit", "fish", "other"];
const GENDERS = ["male", "female"];
const PET_STATUSES = ["available", "adopted", "lost", "inactive"];
const LOST_FOUND_TYPES = ["lost", "found"];
const LOST_FOUND_STATUSES = ["active", "resolved"];
const LOST_FOUND_GENDERS = ["male", "female", "unknown"];
const COMMUNITY_CATEGORIES = [
  "general",
  "pet-care",
  "adoption",
  "question",
  "lost-found",
  "health",
  "training",
  "other",
];
const APPOINTMENT_TYPES = [
  "checkup",
  "vaccination",
  "surgery",
  "emergency",
  "grooming",
  "consultation",
];
const REMINDER_TYPES = [
  "feeding",
  "medicine",
  "vaccination",
  "grooming",
  "appointment",
  "exercise",
  "custom",
];
const REMINDER_FREQUENCIES = ["once", "daily", "weekly", "monthly"];
const VACCINATION_STATUSES = ["Pending", "Completed"];
const ADOPTION_STATUSES = ["Pending", "Approved", "Rejected"];
// Notification enums (Phase 5). Additive only — values must match
// backend/models/Notification.js; new values appended, never reordered.
const NOTIFICATION_TYPES = [
  "adoption",
  "appointment",
  "vaccination",
  "health",
  "reminder",
  "system",
  "other",
];
const NOTIFICATION_CATEGORIES = [
  "adoption",
  "appointment",
  "vaccination",
  "health",
  "reminder",
  "community",
  "lost_found",
  "system",
  "other",
];
const NOTIFICATION_PRIORITIES = ["low", "normal", "high", "urgent"];

module.exports = {
  isValidObjectId,
  validateIdParam,
  isPlainObject,
  stringOrUndefined,
  pickFields,
  escapeRegExp,
  MAX_SEARCH_LENGTH,
  SPECIES,
  GENDERS,
  PET_STATUSES,
  LOST_FOUND_TYPES,
  LOST_FOUND_STATUSES,
  LOST_FOUND_GENDERS,
  COMMUNITY_CATEGORIES,
  APPOINTMENT_TYPES,
  REMINDER_TYPES,
  REMINDER_FREQUENCIES,
  VACCINATION_STATUSES,
  ADOPTION_STATUSES,
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITIES,
};