// =====================================================
// SHARED IMAGE UPLOAD / STORAGE HELPERS (Phase 4 security)
// =====================================================
// Centralized, server-controlled handling for every image upload:
//   - magic-byte detection (never trust filename / Content-Type alone)
//   - Cloudinary uploads by buffer with server-chosen folders/public IDs
//   - safe local fallback storage with server-generated filenames
//   - cleanup of stored assets (Cloudinary destroy / local unlink)
//   - validation of user-supplied image strings (body URLs / dataURLs)

const fs = require("fs");
const path = require("path");

const cloudinary = require("../config/cloudinary");

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

// ------------------------------------------------------------------
// MAGIC BYTES
// ------------------------------------------------------------------
// Identify the real content type of an image buffer from its leading
// bytes. Content-Type and file extension are attacker-controlled and
// must never be the sole source of truth.

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP_SIG = Buffer.from("WEBP");

const EXT_BY_TYPE = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
};

const MIME_BY_TYPE = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Returns 'jpeg' | 'png' | 'webp' | null
const detectImageType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer.equals(PNG_SIG) || buffer.subarray(0, 8).equals(PNG_SIG)) return "png";

  // JPEG: FF D8 FF
  if (buffer.subarray(0, 3).equals(JPEG_SIG)) return "jpeg";

  // WEBP: "RIFF" at 0..3 and "WEBP" at 8..11
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  return null;
};

// ------------------------------------------------------------------
// CLOUDINARY CONFIGURED?
// ------------------------------------------------------------------
// The credentials live only in environment variables; when they are
// present (and not the placeholder values) Cloudinary is used, otherwise
// images fall back to safe local storage just like the original design.

const VALID_RUNNING_SECRET = (v) => !!v && v.trim() && v.trim() !== "your_api_secret";

const isCloudinaryConfigured = () =>
  VALID_RUNNING_SECRET(process.env.CLOUDINARY_CLOUD_NAME) &&
  VALID_RUNNING_SECRET(process.env.CLOUDINARY_API_KEY) &&
  VALID_RUNNING_SECRET(process.env.CLOUDINARY_API_SECRET);

// ------------------------------------------------------------------
// UPLOAD TO CLOUDINARY (by buffer, server-controlled)
// ------------------------------------------------------------------
// The folder is decided by the backend, never by the client. The client
// may not choose public_id / folder / resource_type / type.

const uploadImageToCloudinary = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        type: "upload",
        folder,
        unique_filename: true,
        overwrite: false,
        allowed_formats: ["jpg", "png", "webp"],
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result || !result.secure_url) {
          return reject(new Error("Cloudinary upload returned no URL"));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });

// ------------------------------------------------------------------
// SAFE LOCAL FALLBACK STORAGE
// ------------------------------------------------------------------
// The filename is generated server-side from the detected content type
// (never from file.originalname), so the emitted name always carries a
// safe image extension and no traversal characters. The file is written
// only inside UPLOADS_DIR.

const uploadImageToLocal = (buffer, imageType) => {
  const ext = EXT_BY_TYPE[imageType] || ".jpg";
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);

  // Ensure the directory exists; writing is limited to UPLOADS_DIR by
  // construction (dest is always path.join(UPLOADS_DIR, generatedName)).
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(dest, buffer);

  return { filename, absolutePath: dest };
};

const removeLocalUpload = (filename) => {
  // Only ever unlink a file whose name is a bare generated filename.
  const base = path.basename(filename || "");
  if (base !== filename) return; // caller passed a path → refuse
  const dest = path.join(UPLOADS_DIR, base);
  fs.unlink(dest, () => {});
};

// ------------------------------------------------------------------
// STORED ASSET PARSING + REMOVAL
// ------------------------------------------------------------------
// Given a URL that the application itself generated (Cloudinary secure
// URL or local /uploads/<filename>), determine the stored asset so it
// can be removed safely. Arbitrary external URLs are never touched.

const CLOUDINARY_HOST_RE = /res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]+)?$/;

const storedImageInfo = (url) => {
  if (typeof url !== "string" || !url) return null;

  // Local upload: /uploads/<filename>
  const localMatch = url.match(/\/(?:uploads\/)([^/?#]+)$/);
  if (localMatch) {
    const filename = localMatch[1];
    if (filename && !filename.includes("/")) {
      return { kind: "local", filename };
    }
  }

  // Cloudinary: res.cloudinary.com/.../image/upload/<public_id>
  const cloudMatch = url.match(CLOUDINARY_HOST_RE);
  if (cloudMatch && cloudMatch[1]) {
    let publicId = cloudMatch[1];
    // public_id must be a safe, Cloudinary-generated asset name
    if (/^[A-Za-z0-9_./-]{3,200}$/.test(publicId)) {
      return { kind: "cloudinary", publicId };
    }
  }

  return null;
};

const destroyCloudinaryImage = (publicId) =>
  cloudinary.uploader.destroy(publicId, { resource_type: "image" }, () => {});

// Best-effort removal of an asset referenced by an app-generated URL.
// Never rejects: cleanup failures are logged and must not break requests.
const deleteStoredImage = (url) => {
  try {
    const info = storedImageInfo(url);
    if (!info) return;
    if (info.kind === "local") {
      removeLocalUpload(info.filename);
    } else {
      destroyCloudinaryImage(info.publicId);
    }
  } catch (error) {
    console.error("Image cleanup failed:", error.message);
  }
};

// ------------------------------------------------------------------
// USER-SUPPLIED IMAGE STRING VALIDATION
// ------------------------------------------------------------------
// Used when a client passes an image value in the request BODY (rather
// than uploading a file). The frontend legitimately submits:
//   - base64 image dataURLs                 data:image/png;base64,...
//   - application-generated Cloudinary URLs res.cloudinary.com/<cloud>/...
//   - application-generated local URLs      http(s)://<host>/uploads/<file>
//   - relative local upload paths           /uploads/<file>
//   - frontend-owned default asset paths    ../assets/...
//   - seeded pet/breed imagery              images.unsplash.com
// Everything else (javascript:, file:, arbitrary external hosts, raw
// scripts, non-image data: containers...) is rejected so a client cannot
// store an arbitrary URL in a field the application treats as an uploaded
// image.
//
// The 1 MB JSON body limit in server.js already bounds the whole request;
// MAX_IMAGE_STR_LENGTH additionally rejects pathological single values
// without breaking real base64 photo dataURLs (which the previous 10 000
// char cap incorrectly rejected).

const MAX_IMAGE_STR_LENGTH = 1024 * 1024;

const isBase64ImageDataUrl = (value) =>
  /^data:image\/(?:png|jpe?g|webp);base64,/i.test(value);
const isRelativeLocalUpload = (value) => /^\/uploads\//i.test(value);
const isFrontendAsset = (value) => /^\.\.\/assets\//i.test(value);
const isCloudinaryUrl = (value) =>
  /^https?:\/\/(?:[a-z0-9-]+\.)?cloudinary\.com\//i.test(value);
const isUnsplashUrl = (value) =>
  /^https?:\/\/images\.unsplash\.com\//i.test(value);
const isAbsoluteLocalUpload = (value) =>
  /^https?:\/\/[^/]+\/uploads\//i.test(value);

const isSafeImageValue = (value) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_IMAGE_STR_LENGTH
  ) {
    return false;
  }

  return (
    isBase64ImageDataUrl(value) ||
    isCloudinaryUrl(value) ||
    isUnsplashUrl(value) ||
    isAbsoluteLocalUpload(value) ||
    isRelativeLocalUpload(value) ||
    isFrontendAsset(value)
  );
};

const isSafeImageArray = (value) =>
  Array.isArray(value) && value.every(isSafeImageValue);

// ------------------------------------------------------------------
// STORE A FILE FROM A REQUEST (shared by upload endpoints)
// ------------------------------------------------------------------
// Validates magic bytes, then stores via Cloudinary when configured or via
// the safe local fallback. Returns { url, folder } for Cloudinary or
// { filename } for local storage, or { invalid: true } when the buffer is
// not a real image. Never trusts client filenames, folders or public IDs.

const storeImageFile = async (buffer, folder) => {
  const imageType = detectImageType(buffer);
  if (!imageType) return { invalid: true };

  if (isCloudinaryConfigured()) {
    const result = await uploadImageToCloudinary(buffer, folder);
    return { url: result.url, folder };
  }

  const local = uploadImageToLocal(buffer, imageType);
  return { filename: local.filename };
};

module.exports = {
  UPLOADS_DIR,
  EXT_BY_TYPE,
  MIME_BY_TYPE,
  detectImageType,
  isCloudinaryConfigured,
  uploadImageToCloudinary,
  uploadImageToLocal,
  removeLocalUpload,
  storedImageInfo,
  destroyCloudinaryImage,
  deleteStoredImage,
  storeImageFile,
  isSafeImageValue,
  isSafeImageArray,
  MAX_IMAGE_STR_LENGTH,
};