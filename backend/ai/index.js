// =========================================================
// PetGPT AI service — entry point.
// ---------------------------------------------------------
// FamiPet depends on exactly ONE thing: the generic OpenAI-compatible
// chat-completions contract, served by ./openai.js. There is no
// provider registry, no provider selection, no rotation, no fallback
// chain and no per-user provider configuration.
//
//   success  -> returns assistant text (truthy)
//   failure  -> logs the normalized code, returns null
//               (the controller then falls back to static answers)
//
// The endpoint, key and model come from the environment
// (PETGPT_OPENAI_BASE_URL / _API_KEY / _MODEL) and are never logged,
// echoed in an error, or returned to a client.
//
// Requiring this file also registers the read-only and mutation tools
// (backend/ai/tools/) exactly once, so the tool-calling loop always has
// declarations. The durable worker, the controllers and the tests
// therefore share one registry instance.
const adapter = require("./openai");
const { buildSystemPrompt } = require("../config/ai");
const { AI_ERROR_CODES } = require("./provider");

require("./tools");

async function generatePetGPTResponse(question, petContext, history = []) {
  const startedAt = Date.now();
  try {
    const result = await adapter.generate({
      system: buildSystemPrompt(),
      question,
      petContext,
      history,
    });
    const latency = typeof result.latencyMs === "number" ? result.latencyMs : Date.now() - startedAt;
    console.log(`PetGPT: ${adapter.label} ok after ${latency}ms (${result.text.length} chars).`);
    return result.text;
  } catch (error) {
    const code = error && error.code ? error.code : AI_ERROR_CODES.UNKNOWN;
    const message = error && error.message ? error.message : "unknown error";
    console.error(`PetGPT: ${adapter.label} failed (${code}) after ${Date.now() - startedAt}ms; using fallback: ${message}`);
    return null;
  }
}

module.exports = { adapter, generatePetGPTResponse, AI_ERROR_CODES };
