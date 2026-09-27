// =========================================================
// PetGPT AI layer — shared contract + helpers
// ---------------------------------------------------------
// There is exactly ONE adapter, in ./openai.js, and it speaks
// the generic OpenAI-compatible chat-completions contract
// (POST {baseUrl}/chat/completions, Authorization: Bearer).
// No provider registry, no rotation, no fallback chain: the
// endpoint is whatever the deployment puts in
// PETGPT_OPENAI_BASE_URL / _API_KEY / _MODEL.
//
// That adapter exposes:
//   generate({ system, question, petContext, history? })
//     -> Promise<{ text, latencyMs }>
//   generateWithTools({ messages, tools })
//     -> Promise<{ text, toolCalls: [{ id, name, arguments }], latencyMs }>
// `history?` is Array<{ role: "user"|"assistant", content }> of prior
// messages, oldest-first, already capped by the caller
// (AI_CONFIG.maxHistoryMessages).
//
// Both throw AiProviderError(code, message) on failure. Normalized
// error codes let callers distinguish:
//   config / timeout / http / malformed / unknown
// This file is vendor-agnostic: no vendor names, no SDKs, no keys.
// =========================================================

const AI_ERROR_CODES = Object.freeze({
  CONFIG: "config",
  TIMEOUT: "timeout",
  HTTP: "http",
  MALFORMED: "malformed",
  UNKNOWN: "unknown",
});

class AiProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.status = options.status || undefined;
  }
}

// Shared HTTP helpers ---------------------------------------------------

// Abort-safe fetch. Maps transport failures to normalized errors:
// AbortController timeout -> TIMEOUT, network errors -> UNKNOWN.
// The OS-level cause (ECONNREFUSED / ENOTFOUND / EAI_AGAIN / ...) is
// carried in the message so a misconfigured or unreachable endpoint is
// diagnosable from the log. Only that code is included - never the URL,
// headers, or body, which can carry credentials.
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new AiProviderError(AI_ERROR_CODES.TIMEOUT, `Provider request timed out after ${timeoutMs}ms.`);
    }
    const cause = error && error.cause && error.cause.code ? error.cause.code : null;
    throw new AiProviderError(
      AI_ERROR_CODES.UNKNOWN,
      cause ? `Provider network failure (${cause}).` : "Provider network failure."
    );
  } finally {
    clearTimeout(timer);
  }
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch (error) {
    throw new AiProviderError(AI_ERROR_CODES.MALFORMED, "Provider returned a non-JSON response.");
  }
}

// Shared prompt assembly: the user's own pets context (ownership is
// enforced by the controller before this is built).
//
// Each pet carries its id because every per-pet tool takes `petId`, not a
// name. Without the id here the model has no way to fill that argument
// except by guessing, and a guessed petId is rejected by the tool's
// ownership check — so a request like "remind me to walk Rex" fails on
// the name even though the pet is right there in the prompt. The id is
// the user's own pet id, already returned to this same caller by the
// get_my_pets tool, so nothing new is exposed.
function userPetsText(petContext) {
  return petContext && petContext.length
    ? "The user's pets: " +
      petContext
        .map((p) => `${p.name} (${p.species}${p.breed ? ", " + p.breed : ""}, petId: ${p.id})`)
        .join("; ") +
      ". Pass the petId exactly as given when a tool asks for it. "
    : "";
}

// The server's own clock, in one line, prefixed to every user turn.
//
// Without it the model cannot resolve a relative date: asked to set a
// reminder "tomorrow at 08:00" it has no way to know what tomorrow is,
// so it stalls and asks the user for a YYYY-MM-DD literal. The backend
// is the only party that knows the real current date, so it supplies it
// rather than making the user do the arithmetic.
//
// The timezone is stated explicitly because reminder/appointment times
// are stored as naive local "YYYY-MM-DD" + "HH:MM" strings with no offset
// (see models/Reminder.js), so the model's notion of "today" must be the
// same one those strings are written in.
function currentTimeText(now = new Date()) {
  const date = now.toLocaleDateString("en-CA"); // YYYY-MM-DD
  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let offset = "UTC";
  try {
    offset = now.toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ")[2] || "UTC";
  } catch (error) {
    /* keep UTC */
  }
  return `Today is ${date} and the current server time is ${time} (${offset}). `;
}

function currentUserTurnPrefix(petContext) {
  return currentTimeText() + userPetsText(petContext);
}

module.exports = {
  AI_ERROR_CODES,
  AiProviderError,
  fetchWithTimeout,
  parseJson,
  userPetsText,
  currentTimeText,
  currentUserTurnPrefix,
};
