// =========================================================
// PetGPT explicit-confirmation detection
// ---------------------------------------------------------
// The single place that decides whether a USER TURN counts as an
// explicit confirmation of a previously previewed mutation.
//
// Why it exists: the ask-before-mutating policy is enforced on the
// BACKEND (see the gate in backend/ai/tools/registry.js), and the gate
// needs one trustworthy input. The model's own tool arguments are not
// trustworthy — a model that is told "only call this after the user
// confirms" can simply claim the user confirmed. The persisted user
// message is the only party that can carry consent, so that is what
// this reads.
//
// Deliberately a conservative WHITELIST, not a classifier:
//   - the whole (normalized) message must BE an affirmative;
//   - a question is never consent ("ok?" is not approval);
//   - a long/compound message is ambiguous, so it is NOT consent.
// Anything unrecognised means "not confirmed", which makes the gate
// fail closed. A user who is asked twice is a minor annoyance; a
// mutation nobody approved is not recoverable.
//
// ponytail: fixed phrase list. Ceiling: per-language intents or an
// LLM classifier if confirmations are ever phrased more freely.

// Punctuation is stripped before matching so "Yes." / "yes!" / "YES" all
// normalize to the same token.
const PUNCTUATION = /[.!?,;:"'`*_~()[\]{}\\-]+/g;
const MAX_CHARS = 40;

const AFFIRMATIVES = new Set([
  "y",
  "yes",
  "yes please",
  "yeah",
  "yep",
  "yup",
  "please",
  "ok",
  "okay",
  "k",
  "kk",
  "sure",
  "fine",
  "alright",
  "all right",
  "right",
  "confirm",
  "confirmed",
  "confirm it",
  "confirm please",
  "please confirm",
  "do it",
  "do it please",
  "please do",
  "go ahead",
  "go ahead please",
  "please go ahead",
  "go on",
  "proceed",
  "please proceed",
  "sounds good",
  "that works",
  "that works thanks",
  "thanks",
  "correct",
  "exactly",
  "affirmative",
  "approved",
]);

// true ONLY for an explicit, unambiguous affirmative.
function isExplicitConfirmation(text) {
  const raw = text === null || text === undefined ? "" : String(text).trim();
  if (!raw) return false;
  // "Can I create the reminder?" / "ok?" is a question, not consent.
  if (raw.includes("?")) return false;
  const norm = raw.toLowerCase().replace(PUNCTUATION, " ").replace(/\s+/g, " ").trim();
  if (!norm || norm.length > MAX_CHARS) return false;
  return AFFIRMATIVES.has(norm);
}

module.exports = { isExplicitConfirmation, AFFIRMATIVES, MAX_CHARS };
