// =========================================================
// PetGPT tool registry (Phase 5)
// ---------------------------------------------------------
// The only way the model can touch FamiPet data. Every tool is explicitly
// registered here with a stable name, description, input schema, an
// execution function, its read-only/mutating flag and authorization. The
// model can never discover or invent tools; it may only call registered
// names with schema-valid arguments, and every execution re-validates
// ownership against the authenticated user.
//
// Tool execution NEVER executes arbitrary backend code — each tool's
// execute() is a closed implementation that calls existing FamiPet
// service/data logic. No arbitrary controller/service methods are exposed.
// =========================================================

const crypto = require("crypto");
const { validateArgs } = require("./schema");
const MutationEffect = require("../../models/MutationEffect");
const MutationRequest = require("../../models/MutationRequest");
const { logEvent } = require("../logging");

const TOOL_ERRORS = Object.freeze({
  NOT_FOUND: "tool_not_found",
  ARGS: "invalid_arguments",
  FORBIDDEN: "forbidden",
  EXECUTION: "execution_error",
});

class ToolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

const tools = new Map();

// tool: { name, description, schema, readOnly /* REQUIRED boolean */,
//         authorize?({args,userId})->null|args,
//         describe?(args)->string, execute({args,userId}) -> Promise<result>, }
function registerTool(tool) {
  if (!tool || !tool.name || !tool.execute) {
    throw new ToolError(TOOL_ERRORS.EXECUTION, "Tool requires name and execute().");
  }
  // readOnly is EXPLICIT or the tool does not exist. There is no safe
  // default to invent here: defaulting an omitted value to `true` is
  // fail-OPEN, because executeTool only consults the confirmation gate
  // for a non-read-only tool — so a mutating tool that simply forgot the
  // flag would skip the gate and write on the very first turn. Requiring
  // the declaration turns that silent bypass into a startup failure
  // naming the tool, which is the only outcome that is safe.
  //
  // Strictly a boolean: a truthy 1 or the string "false" is a mistake, not
  // a declaration, and is refused for the same reason an omission is.
  if (typeof tool.readOnly !== "boolean") {
    throw new ToolError(
      TOOL_ERRORS.EXECUTION,
      `Tool "${tool.name}" must declare readOnly explicitly. ` +
        `Use readOnly: false for a tool that writes (it then passes through the confirmation gate) ` +
        `or readOnly: true for a tool that cannot write.`
    );
  }
  if (tools.has(tool.name)) {
    throw new ToolError(TOOL_ERRORS.EXECUTION, `Tool "${tool.name}" is already registered.`);
  }
  tools.set(tool.name, {
    name: tool.name,
    description: tool.description || "",
    schema: tool.schema || { type: "object", properties: {}, required: [] },
    readOnly: tool.readOnly,
    authorize: tool.authorize || null,
    describe: tool.describe || null,
    execute: tool.execute,
  });
}

function getTool(name) {
  return tools.get(name);
}

// Provider-facing declarations (OpenAI function-calling shape).
function listToolDeclarations() {
  return Array.from(tools.values()).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    },
  }));
}

function listToolNames() {
  return Array.from(tools.keys());
}

// Determinstic stringification for idempotency keys: object keys are
// sorted so {a:1,b:2} and {b:2,a:1} share a key.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

// Server-derived mutation idempotency key: sha256(jobId:tool:normalizedArgs).
// The durable GenerationJob id makes a retried/re-enqueued job replay its
// recorded result instead of executing the mutation twice, while still
// allowing the same tool with different arguments (or a different job) to
// run as a separate, legitimate action. The key is never client/model-supplied.
function mutationKey(jobId, toolName, args) {
  return crypto
    .createHash("sha256")
    .update(`${jobId}:${toolName}:${stableStringify(args)}`)
    .digest("hex");
}

// Server-derived confirmation key: sha256(tool:normalizedArgs). NOT
// job-scoped on purpose — a confirmation arrives on a LATER turn, which
// is a different GenerationJob, and the request must still be recognized
// as the same one the user was shown.
function requestKey(toolName, args) {
  return crypto
    .createHash("sha256")
    .update(`${toolName}:${stableStringify(args)}`)
    .digest("hex");
}

// How long a preview stays confirmable. Mongo's TTL index expires the
// document itself (see models/MutationRequest.js), so an unconfirmed
// request cannot be approved days later and needs no sweeper.
const PENDING_TTL_MS = 15 * 60 * 1000;

// The result the model receives instead of a write. It is a SUCCESSFUL
// tool call (ok: true) because the tool did its job — it refused to
// mutate and asked for consent — so the model relays the request instead
// of reporting a failure. `confirmationRequired` makes "nothing was
// changed" unmistakable, and the model is told to say exactly that.
const CONFIRMATION_NOTE =
  "Nothing was changed. Ask the user to confirm this exact action in plain words, and only call this tool again on a later user turn that explicitly confirms it.";

// Bounded so an oversized model-supplied string can never be persisted or
// echoed back as a "summary" (schema validation is types-only).
function confirmationRequired(name, describe, args) {
  let action = typeof describe === "function" ? describe(args) : name;
  if (typeof action !== "string" || !action) action = name;
  return {
    confirmationRequired: true,
    tool: name,
    action: action.slice(0, 200),
    message: CONFIRMATION_NOTE,
  };
}

// Ask-before-mutating, ENFORCED HERE rather than trusted from the prompt.
// Runs after the ownership gate and before the idempotency ledger and the
// write, so authorization is never traded away for confirmation handling.
//
// `context.confirmed` is the caller's verdict on the PERSISTED USER TURN
// (backend/ai/confirmation.js), which the model cannot author. Because the
// verdict is per user turn and not per tool call, retrying the tool inside
// the same turn (the tool-calling loop is allowed to iterate) can never
// execute anything.
//
// Everything short of a confirming user turn returns a confirmation-
// required result and writes nothing:
//   - no conversation scope        -> cannot bind consent, fail closed
//   - no confirming user turn      -> record the preview, ask
//   - confirmed, already executed  -> replay the recorded result
//   - confirmed, nothing pending   -> unapproved action, fail closed
async function gateMutation({ name, describe, args, userId, context }) {
  const preview = () => confirmationRequired(name, describe, args);
  if (!context.conversation) {
    logEvent("warn", "petgpt.tool.unconfirmed", { userId: String(userId), tool: name, reason: "no_conversation" });
    return { execute: false, result: preview() };
  }

  const scope = { owner: userId, conversation: context.conversation, tool: name, requestKey: requestKey(name, args) };
  const existing = await MutationRequest.findOne(scope).lean();

  if (context.confirmed === true) {
    if (existing && existing.status === "executed") {
      // The user confirmed twice. The write already happened once, so the
      // recorded result is replayed instead of written again.
      logEvent("info", "petgpt.tool.confirmation_replayed", { userId: String(userId), tool: name });
      return { execute: false, replayed: true, result: { ...existing.result, replayed: true } };
    }
    if (!existing) {
      // An explicit "yes" with nothing previewed in this conversation: the
      // user never saw this action, so it is not approved. Ask first.
      logEvent("warn", "petgpt.tool.unconfirmed", { userId: String(userId), tool: name, reason: "no_pending_request" });
      return { execute: false, result: preview() };
    }
    return { execute: true, record: scope };
  }

  if (existing && existing.status === "executed") {
    // Already applied in this conversation: never write twice, and never ask
    // the user to confirm an action that has already happened.
    return { execute: false, replayed: true, result: { ...existing.result, alreadyApplied: true } };
  }

  // Record the preview so the confirming turn can match it. $setOnInsert
  // keeps a repeated request in the same turn idempotent.
  try {
    await MutationRequest.updateOne(
      scope,
      { $setOnInsert: { ...scope, args, status: "pending", expiresAt: new Date(Date.now() + PENDING_TTL_MS) } },
      { upsert: true }
    );
  } catch (error) {
    // A duplicate-key race means a concurrent identical preview already
    // stored it, which is exactly the state we wanted. Never fail the call.
    if (!error || error.code !== 11000) throw error;
  }
  logEvent("info", "petgpt.tool.confirmation_required", { userId: String(userId), tool: name });
  return { execute: false, result: preview() };
}

// Mark a confirmed request executed, storing the verified result so a
// repeated confirmation replays it. No-op for read-only tools.
async function settleMutation(gate, result) {
  if (!gate || !gate.record) return;
  await MutationRequest.updateOne(gate.record, { $set: { status: "executed", result } });
}

// Executes a registered tool against the authenticated userId. Returns
// { ok: true, result } on success, or { ok: false, error } for
// not-found / invalid-args / authorization / execution failures. Error
// strings are model-safe and never leak another user's data or internals.
//
// Order is fixed and security-relevant: schema validation, then the
// ownership gate, then — for mutations only — the confirmation gate, then
// the idempotency ledger, then the write. Ownership is checked before
// confirmation so a foreign pet is refused outright rather than turned
// into a confirmation prompt.
//
// context.confirmed / context.conversation (Phase 6 hardening): the
// caller's verdict on the persisted user turn and the conversation the
// request belongs to. A mutation without both is never executed.
//
// context.jobId: the durable GenerationJob id, which keys the
// MutationEffect ledger — a retried job replays its recorded result
// instead of executing twice. Success is only recorded after the mutation
// actually succeeded, so a failed mutation can still be retried.
async function executeTool(name, args, userId, context = {}) {
  const tool = tools.get(name);
  if (!tool) return { ok: false, error: "The requested tool is not available." };

  const validation = validateArgs(tool.schema, args);
  if (validation.error) return { ok: false, error: validation.error };

  try {
    let scopedArgs = args;
    if (tool.authorize) scopedArgs = await tool.authorize({ args, userId });
    // authorize may return null to signal denial.
    if (scopedArgs === null) {
      return { ok: false, error: "The requested operation is not allowed." };
    }

    let gate = null;
    if (!tool.readOnly) {
      gate = await gateMutation({ name, describe: tool.describe, args: scopedArgs, userId, context });
      if (!gate.execute) {
        return {
          ok: true,
          result: gate.result,
          replayed: !!gate.replayed,
          confirmationRequired: !!gate.result.confirmationRequired,
        };
      }
    }

    if (!tool.readOnly && context.jobId) {
      const key = mutationKey(context.jobId, name, scopedArgs);
      const prior = await MutationEffect.findOne({ owner: userId, key }).lean();
      if (prior) {
        logEvent("info", "petgpt.tool.replayed", { userId: String(userId), tool: name });
        // The original execution really succeeded; replaying its recorded
        // result is truthful, not fabricated.
        await settleMutation(gate, prior.result);
        return { ok: true, result: prior.result, replayed: true };
      }
      const result = await tool.execute({ args: scopedArgs, userId });
      // Record only after the backend write verified — a failed mutation
      // leaves no ledger row so a retry is still allowed.
      await MutationEffect.create({ owner: userId, job: context.jobId, tool: name, key, result });
      await settleMutation(gate, result);
      return { ok: true, result };
    }
    const result = await tool.execute({ args: scopedArgs, userId });
    await settleMutation(gate, result);
    return { ok: true, result };
  } catch (error) {
    if (error instanceof ToolError) {
      return { ok: false, error: error.message };
    }
    console.error(`PetGPT: tool "${name}" execution failed:`, error.message);
    return { ok: false, error: "The operation failed. Its result is unknown." };
  }
}

module.exports = {
  TOOL_ERRORS,
  ToolError,
  registerTool,
  getTool,
  listToolDeclarations,
  listToolNames,
  executeTool,
};