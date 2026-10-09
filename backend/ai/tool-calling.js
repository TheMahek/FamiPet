// =========================================================
// PetGPT bounded tool-calling loop
// ---------------------------------------------------------
// The ONE place that drives a tool-calling round-trip against the
// single OpenAI-compatible adapter (./openai.js):
//
//   1. Check the registry has at least one tool.
//   2. Call adapter.generateWithTools with a caller-assembled
//      message array plus the registered tool declarations.
//   3. For each returned tool call: validate args against the tool
//      schema, run the tool's authorize() ownership gate, then —
//      for mutations only — the confirmation gate, then execute() —
//      backend code only.
//   4. Append the model-safe assistant turn + tool results to the
//      message array as a new round and loop, bounded by
//      AI_CONFIG.tools.maxIterations.
//   5. On exhaustion or an endpoint error, STOP safely: return the
//      last real model text, never a fabricated final answer.
//
// Policy: the model can never invent tools, never touch another
// user's data, never decide the execution path, and never loop
// forever. Ownership is re-checked inside every tool by
// pet-context.requireOwnedPet — argument validation and
// authorization are NOT delegated to the prompt.
//
// The caller (the durable generation worker) supplies `messages`
// (system + history + current turn) and trusts this loop with the
// endpoint/tool side only; HTTP requests and tool execution happen
// here, inside the durable worker lifecycle, never in a controller.
// =========================================================

const { AI_CONFIG } = require("../config/ai");
const { logEvent } = require("./logging");
const {
  listToolDeclarations,
  executeTool,
} = require("./tools/registry");

const MAX_ITERATIONS = () => AI_CONFIG.tools.maxIterations;

// Cap on persisted tool-call metadata per assistant message. The loop
// may execute more calls in theory, but only this many are recorded —
// the log stays bounded (rounds x calls, truncated defensively).
const TOOL_CALLS_METADATA_MAX = 20;

// Tool metadata kept for history/debugging. Bounded: name + validated
// model-supplied arguments + success flag. Never stores API keys, auth
// headers, raw payloads, or raw results. `confirmationRequired` marks a
// call the backend refused to execute pending the user's confirmation,
// and `replayed` marks one whose result came from a recorded receipt, so
// an audit can tell a real write from an asked-for or replayed one.
function toolLogEntry(call, outcome) {
  const entry = { name: call.name, ok: outcome && outcome.ok };
  if (!(outcome && outcome.ok)) entry.error = outcome && outcome.error ? outcome.error : null;
  if (outcome && outcome.confirmationRequired) entry.confirmationRequired = true;
  if (outcome && outcome.replayed) entry.replayed = true;
  if (call.arguments && typeof call.arguments === "object" && Object.keys(call.arguments).length) {
    entry.arguments = call.arguments;
  }
  return entry;
}

// Run one bounded tool-calling exchange. Returns:
//   { ok: true, text, toolLog }                                  — clean final answer
//   { ok: false, reason: "max_iterations", text, toolLog }       — cap hit (text may
//                                                                 be the last real
//                                                                 model text or null)
//   { ok: false, reason: "error", text }                         — provider failed mid-loop
//   { ok: false, reason: "no_tools" }                            — no declarations registered
// The caller compensates by persisting a safe outcome — never by
// fabricating a success the model did not confirm.
//
// options.jobId: the caller passes the durable GenerationJob
// id so mutation tools can key their idempotency ledger — a retried job
// replays its recorded mutation results instead of executing twice.
// options.conversation + options.confirmed: the conversation a mutation
// request belongs to, and the caller's verdict on the PERSISTED USER
// TURN (backend/ai/confirmation.js). The registry refuses every mutation
// until a later user turn explicitly confirms it. Note the verdict is
// per user turn, not per tool call: re-issuing the same tool call later
// in THIS loop still cannot execute, because the user has not confirmed
// anything yet.
async function runToolCallingLoop({ adapter, messages, userId, options = {} }) {
  if (!adapter || typeof adapter.generateWithTools !== "function") {
    return { ok: false, reason: "no_tools" };
  }

  const declarations = listToolDeclarations();
  if (!declarations.length) {
    return { ok: false, reason: "no_tools" };
  }
  const { jobId, conversation, confirmed } = options;

  const toolLog = [];
  let lastText = null;

  for (let i = 0; i < MAX_ITERATIONS(); i++) {
    let response;
    try {
      response = await adapter.generateWithTools({ messages, tools: declarations });
    } catch (error) {
      const code = error && error.code ? error.code : "unknown";
      console.error(`PetGPT: tool round ${i + 1} failed (${code}): ${error && error.message ? error.message : "unknown"}`);
      return { ok: false, reason: "error", text: lastText };
    }
    if (!response) {
      return { ok: false, reason: "error", text: lastText };
    }

    if (response.toolCalls && response.toolCalls.length) {
      // Model requested tools. Every call is validated + ownership-checked
      // + executed by backend code. Unknown/malformed names fail safely
      // as tool results the model must report verbatim.
      messages.push({
        role: "assistant",
        content: typeof response.text === "string" ? response.text : null,
        tool_calls: response.toolCalls.map((c) => ({
          id: c.id || null,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments || {}) },
        })),
      });

      for (const call of response.toolCalls) {
        const outcome = await executeTool(call.name, call.arguments, userId, {
          jobId,
          conversation,
          confirmed,
        });
        if (toolLog.length < TOOL_CALLS_METADATA_MAX) {
          toolLog.push(toolLogEntry(call, outcome));
        }
        logEvent("info", "petgpt.tool.executed", {
          userId: String(userId),
          tool: call.name,
          ok: outcome.ok,
          replayed: !!(outcome && outcome.replayed),
          confirmationRequired: !!(outcome && outcome.confirmationRequired),
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id || null,
          content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }),
        });
      }

      lastText = typeof response.text === "string" ? response.text || lastText : lastText;
      continue;
    }

    // No tool call this round: real content — done.
    return { ok: true, text: response.text || lastText || null, toolLog };
  }

  // Bounded loop exhausted after real tool work. Safe stop: no
  // fabricated final answer. The last real model text is the best
  // result we have and is surfaced verbatim (never invented).
  return { ok: false, reason: "max_iterations", text: lastText, toolLog };
}

module.exports = {
  runToolCallingLoop,
  TOOL_CALLS_METADATA_MAX,
  toolLogEntry,
};
