const multer = require("multer");
const rateLimit = require("express-rate-limit");
const path = require("path");

// Allowed image formats for FamiPet uploads. 'image/jpg' is kept because
// some browsers/clients still send it for JPEG files.
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

// Extension whitelist derived from the original filename. This mirrors the
// MIME allowlist: an attacker cannot smuggle a .html/.js/.svg file through
// even if the reported MIME type is spoofed.
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// Maximum size per uploaded image: 5 MB.
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Memory storage keeps uploads in RAM. Files are validated (magic bytes)
// and pushed to Cloudinary / safe local storage by the upload helper, so
// no temporary disk files are left behind on failed requests.
const storage = multer.memoryStorage();

// Rejections raised from fileFilter are tagged with a 400 status so the
// centralised error handler answers with a client error (and a safe message)
// instead of a generic 500.
const rejectFile = (message) =>
  Object.assign(new Error(message), { status: 400 });

const fileFilter = (req, file, cb) => {
  // 1) MIME type must be an allowed image type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(rejectFile("Only image files are allowed"), false);
  }

  // 2) The reported extension must match an allowed image extension.
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(rejectFile("Only .jpg, .png and .webp images are allowed"), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // single() endpoints: one file per request
  },
  fileFilter,
});

// Focused rate limiter for upload endpoints. The general /api limiter is
// more permissive (300/15min); uploads get a tighter budget to prevent
// bulk upload abuse while leaving plenty of room for normal usage.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many uploads, please try again later.",
  },
});

module.exports = upload;
module.exports.uploadLimiter = uploadLimiter;
module.exports.MAX_FILE_SIZE = MAX_FILE_SIZE;
module.exports.ALLOWED_MIME_TYPES = ALLOWED_MIME_TYPES;
module.exports.ALLOWED_EXTENSIONS = ALLOWED_EXTENSIONS;