// =========================================================
// The one and only PetGPT AI adapter: generic OpenAI-compatible.
// ---------------------------------------------------------
// Standard chat-completions contract:
//   POST {baseUrl}/chat/completions
//   Authorization: Bearer {apiKey}
// It works with anything that speaks this dialect — a hosted
// provider, a gateway, a proxy, a self-hosted server. No vendor
// SDK, no vendor name, no rotation: the deployment supplies
// PETGPT_OPENAI_BASE_URL / PETGPT_OPENAI_API_KEY /
// PETGPT_OPENAI_MODEL and nothing else is configurable.
//
// Credentials are read from AI_CONFIG.openai here and nowhere
// else. They are never logged, echoed in an error, or returned
// to a client.
// =========================================================

const { AI_CONFIG } = require("../config/ai");
const {
  AI_ERROR_CODES,
  AiProviderError,
  fetchWithTimeout,
  parseJson,
  userPetsText,
} = require("./provider");

// Non-secret observability label stored on generation jobs. Identifies
// the contract, never the vendor behind the endpoint and never a key.
const label = "openai-compatible";

const capabilities = { chat: true, toolCalling: true };

// Read the application-level configuration, failing closed with a
// normalized CONFIG error when it is incomplete. Names the variables,
// never their values.
function requireConfig() {
  const { baseUrl, apiKey, model } = AI_CONFIG.openai;
  const missing = [
    !baseUrl && "PETGPT_OPENAI_BASE_URL",
    !apiKey && "PETGPT_OPENAI_API_KEY",
    !model && "PETGPT_OPENAI_MODEL",
  ].filter(Boolean);
  if (missing.length) {
    throw new AiProviderError(
      AI_ERROR_CODES.CONFIG,
      `PetGPT is not configured: missing ${missing.join(", ")}`
    );
  }
  return { baseUrl, apiKey, model };
}

// One chat-completions round trip. Returns the parsed assistant turn:
//   { text, toolCalls: [{ id, name, arguments }], latencyMs }
// `toolCalls` is empty when the model replied with text only.
async function complete({ messages, tools, timeoutMs }) {
  const { baseUrl, apiKey, model } = requireConfig();
  // The adapter appends /chat/completions, so the configured base URL is
  // the chat-completions root. A trailing slash is the common hand-typed
  // mistake and would silently produce "//chat/completions".
  const root = String(baseUrl).replace(/\/+$/, "");
  const withTools = !!(tools && tools.length);

  const startedAt = Date.now();
  const response = await fetchWithTimeout(
    `${root}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: withTools ? tools : undefined,
        tool_choice: withTools ? "auto" : undefined,
        stream: false,
      }),
    },
    timeoutMs || AI_CONFIG.timeoutMs
  );

  if (!response.ok) {
    throw new AiProviderError(AI_ERROR_CODES.HTTP, `OpenAI-compatible HTTP ${response.status}`, {
      status: response.status,
    });
  }

  const data = await parseJson(response);
  const message = data && data.choices && data.choices[0] && data.choices[0].message;
  const content = message && message.content;
  const text = typeof content === "string" ? content.trim() : "";

  const toolCalls = [];
  if (message && Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) {
      if (!call || !call.function || !call.function.name) {
        throw new AiProviderError(AI_ERROR_CODES.MALFORMED, "Malformed tool call: missing function name");
      }
      let args;
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch (error) {
        throw new AiProviderError(AI_ERROR_CODES.MALFORMED, "Tool call arguments were not valid JSON");
      }
      toolCalls.push({ id: call.id, name: call.function.name, arguments: args });
    }
  }

  if (!text && !toolCalls.length) {
    throw new AiProviderError(AI_ERROR_CODES.MALFORMED, "Endpoint returned no assistant text and no tool calls");
  }

  return { text: text || null, toolCalls, latencyMs: Date.now() - startedAt };
}

// Single-turn chat. `history` is prior user/assistant turns, oldest-first,
// already capped by the caller.
async function generate({ system, question, petContext, history = [] }) {
  const result = await complete({
    messages: [
      { role: "system", content: system },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userPetsText(petContext) + "User asks: " + question },
    ],
  });
  if (!result.text) {
    throw new AiProviderError(AI_ERROR_CODES.MALFORMED, "Endpoint returned no assistant text");
  }
  return { text: result.text, latencyMs: result.latencyMs };
}

// Bounded tool-calling rounds. The caller (ai/tool-calling.js) owns the
// loop, the iteration cap and tool execution; this only speaks the wire
// dialect and hands back normalized { id, name, arguments } calls.
async function generateWithTools({ messages, tools }) {
  return complete({ messages, tools });
}

module.exports = { name: label, label, capabilities, generate, generateWithTools, requireConfig };
