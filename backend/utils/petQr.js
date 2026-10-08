// =========================================================
// Digital Pet ID QR payload
// ---------------------------------------------------------
// The QR encodes a STABLE, human-facing destination URL
// (public Pet Details page) instead of a raw JSON blob, so a
// camera scan opens readable pet info rather than `[object
// Object]`.
//
// The base origin reuses the deployment's CLIENT_URL — the same
// configurable source the emailed verify/reset links use (root
// .env -> docker-compose -> backend container). No development
// localhost URI is ever baked into a QR; whatever base is set at
// deploy time is the base the QR points at.
// =========================================================

const GENERIC_FALLBACK_BASE = "http://localhost:8080";

// CLIENT_URL may be a comma-separated CORS allow-list; a single QR
// destination needs exactly one origin, so take the first entry.
function petQrBaseUrl() {
  return String(process.env.CLIENT_URL || GENERIC_FALLBACK_BASE)
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");
}

// The payload string encoded into the QR image.
function petQrPayloadUrl(petUid) {
  return `${petQrBaseUrl()}/pet/${encodeURIComponent(petUid)}`;
}

module.exports = { petQrBaseUrl, petQrPayloadUrl };