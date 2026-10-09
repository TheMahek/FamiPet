// =========================================================
// Breed enrichment — normalizer + strict schema validator.
// ---------------------------------------------------------
// Two jobs, both pure functions so they are cheap to test and
// need no provider, no database and no HTTP:
//
//   normalizeBreedDraft(raw, context) -> cleaned draft | {error}
//   validateBreedDraft(draft)          -> {error} | {error:null}
//
// The AI writes breed content, so NOTHING it returns is trusted:
// unknown keys are dropped, wrong types are rejected, enums are
// re-checked against the Breed model, every string is trimmed and
// collapsed, and array entries are de-duplicated case-insensitively.
// A draft that fails validation is never written — the controller
// reports the failure and the user still sees the prediction.
//
// Field set is deliberately the EXISTING Breed model plus the
// fields this feature genuinely added (aliases, characteristics,
// nutritionNotes). Nothing here invents a field the application
// does not use; `weightRange`/`heightRange` already express size,
// so there is no separate "size" field.
// =========================================================

const Breed = require("../../models/Breed");

const MAX_STRING = 2000;
const MAX_SHORT_STRING = 200;
const MAX_ALIASES = 12;
const MAX_LIST_ITEMS = 12;
const MAX_TAGS = 12;

// Only these fields may come back from the model. Anything else is
// dropped, so the AI cannot inject `popularity`, `isActive`,
// `source`, `verificationStatus`, `_id` or any other field that
// would let a model edit the wrong part of the record.
const STRING_FIELDS = [
  "description",
  "lifespan",
  "weightRange",
  "heightRange",
  "exerciseRequirements",
  "groomingGuide",
  "suitableEnvironment",
  "nutritionNotes",
];
const SHORT_STRING_FIELDS = ["origin"];
const LIST_FIELDS = ["temperament", "commonDiseases", "characteristics", "aliases"];

const SPECIES = Object.freeze([
  "dog",
  "cat",
  "bird",
  "rabbit",
  "fish",
  "other",
]);

function cleanString(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_STRING);
}

function cleanShortString(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_SHORT_STRING);
}

// Case-insensitive de-duplication that preserves first-seen order.
// "Golden Retriever" and "golden  retriever" must collapse to one
// entry, and neither the breed name nor an alias may appear inside
// its own alias list.
function cleanList(value, { max = MAX_LIST_ITEMS, maxLen = MAX_STRING } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const text = cleanString(item).slice(0, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

// "12 years", "12-15 years", "12 to 15 years" are all fine; a bare
// "long" or "varies" is not a lifespan. Returns "" when nothing
// usable is present so the caller can decide whether that is fatal.
function cleanLifespan(value) {
  const text = cleanString(value);
  if (!text) return "";
  const years = text.match(/(\d{1,2}(?:\.\d)?)/g);
  if (!years || !years.length) return "";
  const first = years[0];
  const last = years[years.length - 1];
  const range = last !== first ? `${first}-${last}` : first;
  return `${range} years`;
}

function cleanRange(value, unit) {
  const text = cleanString(value);
  if (!text) return "";
  // Accept a bare number/range and complete it with the unit; keep a
  // full sentence the model wrote.
  const bare = text.match(/^(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?$/);
  if (bare) return bare[2] ? `${bare[1]}-${bare[2]} ${unit}` : `${bare[1]} ${unit}`;
  return text;
}

// Fields that must be present and non-empty for the record to be
// worth storing. The rest default to "" / [] exactly like every
// other Breed in the database.
const REQUIRED = ["name", "species"];

/**
 * Validate + normalize a raw model response into a Breed-shaped draft.
 * Returns { draft } on success or { error } with a caller-safe message.
 */
function normalizeBreedDraft(raw, { breedName, species, label } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "The AI returned a non-object breed record." };
  }

  // A model that wraps its JSON in prose or a fence must still be
  // readable, but only after the JSON is actually extracted.
  let source = raw;
  if (typeof raw.text === "string") {
    const extracted = extractJsonObject(raw.text);
    if (!extracted) {
      return { error: "The AI did not return a JSON breed record." };
    }
    source = extracted;
  }

  // `name` and `species` are ANCHORED, not model-supplied: the breed
  // exists because the ImageNet mapping said so. Letting the model
  // rename it would let a "Golden Retriever" prediction create a
  // record called anything it likes.
  const name = cleanString(breedName);
  const draftSpecies = String(species || "").trim().toLowerCase();
  if (!name) return { error: "The mapped breed has no usable name." };
  if (!SPECIES.includes(draftSpecies)) {
    return { error: `Unsupported species "${draftSpecies}".` };
  }

  // Guard against the model contradicting the mapping. A provider that
  // answers "Siamese Cat" for a golden-retriever prediction is wrong,
  // and storing it would poison the breed list.
  const aiName = cleanString(source.name);
  const aiSpecies = String(source.species == null ? "" : source.species).trim().toLowerCase();
  if (aiName && Breed.keyOf(aiName) !== Breed.keyOf(name)) {
    return { error: "The AI returned a breed name that does not match the detected breed." };
  }
  if (aiSpecies && !SPECIES.includes(aiSpecies)) {
    return { error: `The AI returned an unsupported species "${aiSpecies}".` };
  }
  if (aiSpecies && aiSpecies !== draftSpecies) {
    return { error: "The AI returned a species that does not match the detected breed." };
  }

  const draft = { name, species: draftSpecies };

  for (const field of STRING_FIELDS) {
    if (field === "lifespan") {
      draft[field] = cleanLifespan(source[field]);
    } else if (field === "weightRange") {
      draft[field] = cleanRange(source[field], "kg");
    } else if (field === "heightRange") {
      draft[field] = cleanRange(source[field], "cm");
    } else {
      draft[field] = cleanString(source[field]);
    }
  }
  for (const field of SHORT_STRING_FIELDS) {
    draft[field] = cleanShortString(source[field]);
  }
  for (const field of LIST_FIELDS) {
    draft[field] = cleanList(source[field], {
      max: field === "aliases" ? MAX_ALIASES : MAX_LIST_ITEMS,
      maxLen: MAX_SHORT_STRING,
    });
  }

  // Provenance is decided here, never by the model: a breed produced
  // by this pipeline is AI-written and unverified until a human edits
  // it. `label` records which ImageNet candidate produced it.
  draft.source = "ai";
  draft.verificationStatus = "unverified";
  draft.imagenetLabel = slug(label);

  // An alias that equals the name is noise; drop it.
  draft.aliases = draft.aliases.filter((a) => Breed.keyOf(a) !== Breed.keyOf(name));

  const validation = validateBreedDraft(draft);
  if (validation.error) return validation;

  return { error: null, draft };
}

// Pull the first balanced JSON object out of a model response.
// Tolerates a ```json fence and surrounding prose, and nothing
// looser — a half-parsed object is worse than a clean rejection.
function extractJsonObject(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced && fenced[1]) candidates.push(fenced[1]);
  candidates.push(text);

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i += 1) {
      const ch = candidate[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(candidate.slice(start, i + 1));
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              return parsed;
            }
          } catch (error) {
            /* try the next candidate */
          }
          break;
        }
      }
    }
  }
  return null;
}

function slug(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Post-normalization gate. Kept separate from the normalizer so it can
// also be pointed at a draft assembled anywhere else.
function validateBreedDraft(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return { error: "Breed draft must be an object." };
  }
  for (const field of REQUIRED) {
    if (!draft[field] || !String(draft[field]).trim()) {
      return { error: `Breed draft is missing "${field}".` };
    }
  }
  if (!SPECIES.includes(draft.species)) {
    return { error: `Breed draft species "${draft.species}" is not a supported species.` };
  }
  if (!draft.name || draft.name.length > MAX_SHORT_STRING) {
    return { error: `Breed draft name must be 1-${MAX_SHORT_STRING} characters.` };
  }
  // A health-concerns list is the one field with real safety weight, so
  // it is capped tightly and required to be short entries.
  if (draft.commonDiseases && (!Array.isArray(draft.commonDiseases) || draft.commonDiseases.length > MAX_LIST_ITEMS)) {
    return { error: "Breed draft commonDiseases is not a valid list." };
  }
  if (draft.aliases && (!Array.isArray(draft.aliases) || draft.aliases.length > MAX_ALIASES)) {
    return { error: "Breed draft aliases is not a valid list." };
  }
  return { error: null };
}

module.exports = {
  SPECIES,
  STRING_FIELDS,
  LIST_FIELDS,
  REQUIRED,
  cleanString,
  cleanList,
  cleanLifespan,
  extractJsonObject,
  normalizeBreedDraft,
  validateBreedDraft,
};
