// =========================================================
// AI breed orchestration.
// ---------------------------------------------------------
// One entry point, `analyzeBreedImage`, does the whole pipeline
// for POST /api/breeds/analyze:
//
//    1. reject an unsupported / oversized upload locally
//    2. call the Python ML service (MobileNetV2/ImageNet) for
//       candidate labels            [no breed or DB logic there]
//    3. map each label through the controlled table in
//       ./imagenet-map.js            [unsupported -> not a breed]
//    4. apply the confidence floor (stricter for species-level
//       labels than for real breeds)
//    5. look for an existing Breed by name OR alias
//    6. found      -> `matched`   (nothing is written)
//    7. not found  -> ask the EXISTING OpenAI-compatible provider
//       to write the record, validate + normalize it
//       (./schema.js) -> `created`
//    8. still nothing usable -> `unsupported`
//
// Boundaries:
//   * The Python service never sees the database. Neither does the
//     model. This file is the only place that writes a Breed.
//   * A prediction NEVER silently modifies a pet: nothing here
//     touches the Pet collection at all.
//   * Every failure path has a named reason the UI can show.
// =========================================================

const Breed = require("../../models/Breed");
const logger = require("../../utils/logger");
const { BREED_AI_CONFIG } = require("../../config/breed-ai");
const adapter = require("../openai");
const { AI_ERROR_CODES, fetchWithTimeout } = require("../provider");
const { mapImageNetLabel, slugify } = require("./imagenet-map");
const { extractJsonObject, normalizeBreedDraft } = require("./schema");

// Why an analyze call ended the way it did. Every value is safe to
// return to the client and says nothing about deployment internals.
const REASON = Object.freeze({
  ML_NOT_CONFIGURED: "ml_not_configured",
  ML_UNAVAILABLE: "ml_unavailable",
  ML_BAD_RESPONSE: "ml_bad_response",
  UNSUPPORTED_ANIMAL: "unsupported_animal",
  LOW_CONFIDENCE: "low_confidence",
  ENRICH_DISABLED: "enrich_disabled",
  ENRICH_UNAVAILABLE: "enrich_unavailable",
  ENRICH_REJECTED: "enrich_rejected",
  CREATED: "created",
  MATCHED: "matched",
});

// -----------------------------------------------------------------
// Upload validation
// -----------------------------------------------------------------

function validateUpload(file) {
  if (!file || !file.buffer || !file.buffer.length) {
    return { error: "An image file is required." };
  }
  if (file.buffer.length > BREED_AI_CONFIG.maxUploadBytes) {
    return {
      error:
        `Image is too large. Maximum size is ` +
        `${Math.round(BREED_AI_CONFIG.maxUploadBytes / (1024 * 1024))}MB.`,
    };
  }
  // Trust the sniffed type, not the extension and not the filename:
  // a .jpg that is really a script must never reach the ML service.
  const sniffed = sniffImageType(file.buffer);
  if (!sniffed) {
    return { error: "Unsupported file type. Use JPEG, PNG, WEBP, BMP or GIF." };
  }
  if (!BREED_AI_CONFIG.allowedMimeTypes.includes(sniffed)) {
    return { error: "Unsupported file type. Use JPEG, PNG, WEBP, BMP or GIF." };
  }
  return { error: null, mimeType: sniffed };
}

// Magic-number sniffing. Small enough to keep the backend free of an
// image library for a trust decision, and exact for the five formats
// the ML service accepts. Anything unrecognised is rejected, so an
// unknown format can never be forwarded and decoded downstream.
function sniffImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.slice(0, 2).toString("ascii") === "BM") return "image/bmp";
  if (
    buffer.slice(0, 3).toString("ascii") === "GIF" &&
    buffer.slice(3, 6).toString("ascii") === "89a"
  ) {
    return "image/gif";
  }
  return null;
}

// -----------------------------------------------------------------
// Step 2 — call the ML service
// -----------------------------------------------------------------

// The image is sent as multipart from an in-memory buffer. It is
// never written to disk on this side either, and `filename` is a
// fixed constant so a hostile upload name can never influence a
// path, a header or a log line.
async function runInference(file, mimeType) {
  if (!BREED_AI_CONFIG.enabled) {
    return { error: REASON.ML_NOT_CONFIGURED };
  }

  const form = new FormData();
  form.append("image", new Blob([file.buffer], { type: mimeType }), "upload");

  let response;
  try {
    response = await fetchWithTimeout(
      `${BREED_AI_CONFIG.url}/predict`,
      { method: "POST", body: form },
      BREED_AI_CONFIG.timeoutMs
    );
  } catch (error) {
    // Timeout vs network: both mean "the service is not answering",
    // and neither reason is shown to the client beyond the code.
    logger.warn(
      `Breed AI: inference unreachable (${
        error && error.code === AI_ERROR_CODES.TIMEOUT ? "timeout" : "network"
      }).`
    );
    return { error: REASON.ML_UNAVAILABLE };
  }

  if (!response.ok) {
    logger.warn(`Breed AI: inference service answered HTTP ${response.status}.`);
    return { error: REASON.ML_UNAVAILABLE };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    logger.warn("Breed AI: inference service returned a non-JSON body.");
    return { error: REASON.ML_BAD_RESPONSE };
  }

  const predictions = Array.isArray(payload && payload.predictions) ? payload.predictions : null;
  if (!predictions) {
    logger.warn("Breed AI: inference response had no predictions array.");
    return { error: REASON.ML_BAD_RESPONSE };
  }

  return { predictions };
}

// -----------------------------------------------------------------
// Steps 3-4 — map labels and apply the confidence floor
// -----------------------------------------------------------------

// Returns { candidates, unsupported } where `candidates` is ordered by
// descending confidence and has already passed its confidence bar.
//
// This is the rule that stops an arbitrary ImageNet prediction from
// ever becoming a breed: a label absent from imagenet-map.js produces
// no candidate at all, and a mapped label below its bar produces none
// either.
function buildCandidates(predictions) {
  const candidates = [];
  const unsupported = [];

  for (const prediction of predictions) {
    if (!prediction || typeof prediction !== "object") continue;
    const label = typeof prediction.label === "string" ? prediction.label : "";
    const confidence = Number(prediction.confidence);
    if (!label || !Number.isFinite(confidence) || confidence <= 0) continue;

    const base = {
      label: slugify(label),
      displayName:
        typeof prediction.displayName === "string" && prediction.displayName
          ? prediction.displayName
          : label,
      confidence: Math.min(1, confidence),
    };

    const mapped = mapImageNetLabel(label);
    if (!mapped) {
      unsupported.push(base);
      continue;
    }

    const threshold = mapped.breedSpecific
      ? BREED_AI_CONFIG.minConfidence
      : BREED_AI_CONFIG.minConfidenceGeneric;
    if (base.confidence < threshold) continue;

    candidates.push({ ...base, ...mapped });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return { candidates, unsupported };
}

// -----------------------------------------------------------------
// Step 5 — look for an existing Breed
// -----------------------------------------------------------------

// Alias-aware, case/whitespace-insensitive lookup. Two records named
// "Golden Retriever" and "golden retriever" are the same breed and
// must resolve to one document; an existing record also wins when the
// incoming name matches one of its aliases, which is how a second
// ImageNet spelling gets folded into the record already there.
//
// Both columns hold the SAME normalized key written by the model hook,
// so the query matches "Golden Retriever", "golden   retriever" and
// "Golden Retriever Dog" identically.
//
// ponytail: one $or over two derived columns. A separate alias index
// only pays off once the collection is large enough for the scan to
// matter.
async function findExistingBreed({ breedName, aliases }) {
  const keys = [Breed.keyOf(breedName)];
  for (const alias of aliases || []) {
    const key = Breed.keyOf(alias);
    if (key && !keys.includes(key)) keys.push(key);
  }
  if (!keys.length) return null;

  return Breed.findOne({
    isActive: true,
    $or: [{ normalizedName: { $in: keys } }, { normalizedAliases: { $in: keys } }],
  }).exec();
}

// -----------------------------------------------------------------
// Step 7 — ask the existing provider to write the record
// -----------------------------------------------------------------

const ENRICH_SYSTEM_PROMPT = [
  "You write reference data about pet breeds for the FamiPet app.",
  "",
  "You will be given ONE breed name and its species, already decided by the app.",
  "",
  "Return STRUCTURED DATA ONLY: a single JSON object, no prose, no markdown fence, no commentary.",
  "",
  "The object must contain exactly these keys:",
  '  "name": the breed name exactly as given, do not reword it',
  '  "species": the species exactly as given',
  '  "origin": place or region the breed comes from, or ""',
  '  "lifespan": typical lifespan, e.g. "10-12 years"',
  '  "weightRange": typical adult weight, e.g. "25-34 kg"',
  '  "heightRange": typical adult height, e.g. "51-61 cm"',
  '  "temperament": array of 3-6 short single words or short phrases',
  '  "exerciseRequirements": 1-2 sentences about daily exercise',
  '  "groomingGuide": 1-2 sentences about coat and grooming',
  '  "commonDiseases": array of at most 6 well-known health concerns of the breed, short phrases',
  '  "suitableEnvironment": 1-2 sentences about the home or setting it suits',
  '  "characteristics": array of up to 6 short distinguishing traits (coat, build, markings)',
  '  "nutritionNotes": 1-2 sentences about feeding this breed',
  '  "aliases": array of at most 6 other names this breed is known by',
  "",
  "Rules:",
  "- Every array entry must be a short string. No numbers, no objects, no nulls.",
  "- Use only these species values if you must restate species: dog, cat, bird, rabbit, fish, other.",
  "- Do not add any other key. Do not include popularity, isActive, source, verificationStatus, id or timestamps.",
  "- Never include a specific diagnosis, prognosis or medical advice. commonDiseases is a list of breeds' well-known predispositions, not a diagnosis for any individual animal.",
  "- If you are not confident about a field, return an empty string or an empty array. Never invent a fact to fill a field.",
].join("\n");

async function enrichBreed(candidate) {
  let text;
  try {
    const result = await adapter.generate({
      system: ENRICH_SYSTEM_PROMPT,
      question:
        `Write the FamiPet breed record for "${candidate.breedName}" (species: ${candidate.species}). ` +
        `Return the JSON object only.`,
    });
    text = result && result.text;
  } catch (error) {
    const code = error && error.code ? error.code : AI_ERROR_CODES.UNKNOWN;
    logger.warn(`Breed AI: enrichment provider failed (${code}).`);
    return { error: REASON.ENRICH_UNAVAILABLE };
  }

  if (!text) {
    return { error: REASON.ENRICH_UNAVAILABLE };
  }

  // The provider returns text; parsing + validation happen in schema.js
  // and a rejected draft is never written.
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // Retry once through the tolerant extractor, which handles a fenced
    // or prose-wrapped object.
    parsed = extractJsonObject(text);
  }
  if (!parsed) {
    logger.warn("Breed AI: enrichment response was not JSON.");
    return { error: REASON.ENRICH_REJECTED };
  }

  const normalized = normalizeBreedDraft(parsed, {
    breedName: candidate.breedName,
    species: candidate.species,
    label: candidate.label,
  });
  if (normalized.error) {
    logger.warn(`Breed AI: enrichment draft rejected (${normalized.error}).`);
    return { error: REASON.ENRICH_REJECTED };
  }
  return { draft: normalized.draft };
}

// -----------------------------------------------------------------
// Step 9 — persist, closing the duplicate race
// -----------------------------------------------------------------

async function createBreed(draft) {
  const payload = {
    name: draft.name,
    species: draft.species,
    aliases: draft.aliases,
    origin: draft.origin,
    lifespan: draft.lifespan,
    weightRange: draft.weightRange,
    heightRange: draft.heightRange,
    temperament: draft.temperament,
    exerciseRequirements: draft.exerciseRequirements,
    groomingGuide: draft.groomingGuide,
    commonDiseases: draft.commonDiseases,
    suitableEnvironment: draft.suitableEnvironment,
    characteristics: draft.characteristics,
    nutritionNotes: draft.nutritionNotes,
    description: draft.description,
    source: "ai",
    verificationStatus: "unverified",
    imagenetLabel: draft.imagenetLabel || "",
  };

  try {
    return await Breed.create(payload);
  } catch (error) {
    // Two requests for the same missing breed can both pass the
    // pre-check. The unique normalizedName index is what actually
    // makes the second one fail, so re-read the winner and return it
    // instead of reporting a failure the user did nothing to cause.
    if (error && error.code === 11000) {
      logger.info("Breed AI: duplicate breed create resolved to the existing record.");
      const existing = await findExistingBreed({
        breedName: draft.name,
        aliases: draft.aliases,
      });
      if (existing) return { breed: existing, created: false };
    }
    throw error;
  }
}

// -----------------------------------------------------------------
// Public entry point
// -----------------------------------------------------------------

/**
 * @param {{ buffer: Buffer, mimetype?: string }} file  validated by the route
 * @returns {Promise<object>} a response body with a `status` of
 *   "matched" | "created" | "unsupported"
 */
async function analyzeBreedImage(file) {
  const validation = validateUpload(file);
  if (validation.error) {
    const err = new Error(validation.error);
    err.status = 400;
    throw err;
  }

  if (!BREED_AI_CONFIG.enabled) {
    return {
      status: "unsupported",
      reason: REASON.ML_NOT_CONFIGURED,
      message: "Breed identification is not enabled on this deployment.",
      predictions: [],
    };
  }

  const inference = await runInference(file, validation.mimeType);
  if (inference.error) {
    return {
      status: "unsupported",
      reason: inference.error,
      message:
        inference.error === REASON.ML_NOT_CONFIGURED
          ? "Breed identification is not enabled on this deployment."
          : "Breed identification is temporarily unavailable. Please try again.",
      predictions: [],
    };
  }

  // The UI shows these even when they lead nowhere, so an unsupported
  // result is explainable instead of a bare failure.
  const predictions = inference.predictions.map((p) => ({
    label: slugify(p && p.label),
    displayName:
      p && typeof p.displayName === "string" && p.displayName
        ? p.displayName
        : String((p && p.label) || ""),
    confidence: Number(p && p.confidence) || 0,
  }));

  const { candidates, unsupported } = buildCandidates(inference.predictions);

  if (!candidates.length) {
    return {
      status: "unsupported",
      reason: unsupported.length ? REASON.UNSUPPORTED_ANIMAL : REASON.LOW_CONFIDENCE,
      message: unsupported.length
        ? "No supported breed was found in this image."
        : "The image was recognised with low confidence. Try a clearer photo of a single animal.",
      predictions,
    };
  }

  const candidate = candidates[0];

  // --- 5/6: an existing Breed always wins, whatever the model says ---
  const existing = await findExistingBreed({ breedName: candidate.breedName });
  if (existing) {
    return {
      status: "matched",
      reason: REASON.MATCHED,
      prediction: candidate,
      alternatives: candidates.slice(1, 4),
      breed: existing.toObject(),
      predictions,
    };
  }

  // --- 7/8: ask the existing provider to write a record ------------
  if (!BREED_AI_CONFIG.enrichEnabled) {
    return {
      status: "unsupported",
      reason: REASON.ENRICH_DISABLED,
      message: "This breed is not in FamiPet yet.",
      prediction: candidate,
      predictions,
    };
  }

  const enriched = await enrichBreed(candidate);
  if (enriched.error) {
    return {
      status: "unsupported",
      reason: enriched.error,
      message:
        enriched.error === REASON.ENRICH_UNAVAILABLE
          ? "This breed is not in FamiPet yet and breed information could not be generated."
          : "This breed is not in FamiPet yet.",
      prediction: candidate,
      predictions,
    };
  }

  // Re-check after enrichment: the AI is allowed to add aliases, and
  // one of them may name a breed that already exists.
  const raced = await findExistingBreed({
    breedName: enriched.draft.name,
    aliases: enriched.draft.aliases,
  });
  if (raced) {
    return {
      status: "matched",
      reason: REASON.MATCHED,
      prediction: candidate,
      alternatives: candidates.slice(1, 4),
      breed: raced.toObject(),
      predictions,
    };
  }

  // --- 9/10: persist ---------------------------------------------
  const created = await createBreed(enriched.draft);
  const breedDoc = created.breed || created;
  const isNew = created.created !== false;

  return {
    status: isNew ? "created" : "matched",
    reason: isNew ? REASON.CREATED : REASON.MATCHED,
    prediction: candidate,
    alternatives: candidates.slice(1, 4),
    breed: breedDoc.toObject ? breedDoc.toObject() : breedDoc,
    predictions,
  };
}

module.exports = {
  analyzeBreedImage,
  buildCandidates,
  findExistingBreed,
  sniffImageType,
  validateUpload,
  REASON,
};
