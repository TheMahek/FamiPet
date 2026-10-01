// =========================================================
// AI Breed Intelligence — configuration
// ---------------------------------------------------------
// The seam between the breed routes/controller and the two
// upstream services it orchestrates:
//
//   1. the OPTIONAL Python ML service (MobileNetV2/ImageNet),
//      addressed by PET_BREED_AI_URL
//   2. the EXISTING OpenAI-compatible provider used for breed
//      enrichment, configured by the PetGPT_* variables in
//      config/ai.js (there is no second provider implementation)
//
// Everything is optional. With nothing configured the breed pages,
// the pet form and every existing endpoint behave exactly as
// before; POST /api/breeds/analyze answers 503 and says why.
// =========================================================

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Accepts only an absolute http(s) URL with a host.
//
// This is the SSRF boundary for the whole feature, and it is
// deliberately narrow: the value comes from the DEPLOYMENT
// environment and is never read from a request, a user profile
// or a database row, so no client can ever point the backend at
// an address it chooses. A private/loopback host is ALLOWED on
// purpose — in Compose the ML service is reachable only as
// `http://ai:8000` on the private network, and in local
// development it is `http://127.0.0.1:8000`.
function normalizeServiceUrl(raw) {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  if (!parsed.hostname) return "";
  return value;
}

const BREED_AI_URL = normalizeServiceUrl(process.env.PET_BREED_AI_URL);

const BREED_AI_CONFIG = Object.freeze({
  // Base URL of the ML service, no trailing slash. Empty means the
  // service is disabled and the feature reports itself off.
  url: BREED_AI_URL,

  // True only when a usable URL was configured. Never a client
  // input, never per-user.
  enabled: BREED_AI_URL !== "",

  // Milliseconds allowed for one /predict round trip. The ML service
  // bounds its own inference separately; this is the caller side of
  // the same wall so a hung service cannot hold a request open.
  timeoutMs: num(process.env.PET_BREED_AI_TIMEOUT_MS, 20000),

  // Upload ceiling, checked BEFORE the request leaves this process so
  // an oversized file is rejected without spending a round trip. Kept
  // in step with AI_MAX_UPLOAD_BYTES on the Python side.
  maxUploadBytes: num(process.env.PET_BREED_MAX_UPLOAD_BYTES, 8 * 1024 * 1024),

  // Candidates the ML service should return. Only the mapped ones are
  // considered; the rest are echoed to the client for transparency.
  topK: num(process.env.PET_BREED_AI_TOP_K, 5),

  // Confidence floor for acting on a prediction.
  //
  //   minConfidence          a label that names an actual breed
  //   minConfidenceGeneric   a label that only names a species or coat
  //                          pattern ("tabby", "goldfish") — held to a
  //                          higher bar, and the Breed it creates stays
  //                          `unverified`
  //
  // ImageNet is a 1000-way softmax over generic nouns, so "dog" or
  // "tabby" is frequently the correct answer for a photo that is in
  // fact perfectly identifiable. The second bar is what stops that
  // from quietly creating a breed record on a weak guess.
  minConfidence: Number(process.env.PET_BREED_MIN_CONFIDENCE) || 0.35,
  minConfidenceGeneric: Number(process.env.PET_BREED_MIN_CONFIDENCE_GENERIC) || 0.55,

  // Whether a mapped-but-missing breed may be created by asking the
  // AI provider to write it. Turning this off makes /analyze
  // read-only: an unknown breed is reported as `unsupported` and
  // nothing is written.
  enrichEnabled: String(process.env.PET_BREED_AI_ENRICH || "true") !== "false",

  // Accepted upload types. Matches the Python service's ALLOWED_FORMATS.
  // The check is on the sniffed content type, never on the extension
  // or the client-declared filename.
  allowedMimeTypes: Object.freeze([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/gif",
  ]),
});

// Status shown to the client. Deliberately reveals no URL, no
// provider key and no host detail — only whether each dependency is
// configured, so the UI can say "AI unavailable" without leaking
// deployment topology.
function breedAiStatus() {
  return {
    enabled: BREED_AI_CONFIG.enabled,
    enrichEnabled: BREED_AI_CONFIG.enrichEnabled,
    minConfidence: BREED_AI_CONFIG.minConfidence,
    minConfidenceGeneric: BREED_AI_CONFIG.minConfidenceGeneric,
    maxUploadBytes: BREED_AI_CONFIG.maxUploadBytes,
  };
}

module.exports = { BREED_AI_CONFIG, normalizeServiceUrl, breedAiStatus };
