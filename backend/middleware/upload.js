const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error('Only image files are allowed');
    err.status = 400;
    cb(err, false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter,
});

// =========================================================
// TRANSIENT UPLOAD (memory only)
// ---------------------------------------------------------
// Some endpoints need the bytes and nothing else. Breed
// identification (POST /api/breeds/analyze) is that case: the image
// is forwarded to the ML service and discarded, so writing it to
// uploads/ would leave a permanent copy of someone's pet photo on
// disk for no reason.
//
// memoryStorage holds the upload in RAM for the lifetime of the
// request and never creates a file, so there is nothing to clean up
// and nothing to leak later. The size limit is the one from
// config/breed-ai.js rather than a second hard-coded 5MB, and the
// MIME filter is intentionally permissive here: the handler
// sniffs the real content (magic numbers) before trusting it, so a
// mislabelled file is rejected on content rather than on the
// client-supplied Content-Type.
// =========================================================

const { BREED_AI_CONFIG } = require('../config/breed-ai');

const uploadTransientImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: BREED_AI_CONFIG.maxUploadBytes,
    // One file, and the field name the route documents.
    files: 1,
    fields: 4,
  },
});

module.exports = upload;
module.exports.uploadTransientImage = uploadTransientImage;
