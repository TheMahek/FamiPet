const mongoose = require("mongoose");

// =========================================================
// PetGPT mutation confirmation requests (Phase 6 hardening)
// ---------------------------------------------------------
// The backend's own record of the ask-before-mutating policy. A
// mutating tool call is NOT executed on the turn that first asks for
// it: the call is recorded here as `pending` and the model is told to
// ask the user to confirm. Only a LATER user turn that is itself an
// explicit confirmation may execute it.
//
// The confirmation decision is derived from the PERSISTED USER MESSAGE
// (see backend/ai/confirmation.js), never from model output, so the
// model cannot talk its way past the gate by asserting that the user
// agreed. A confirmed turn with no matching pending request fails
// closed.
//
// Keyed server-side by (owner, conversation, tool, requestKey) where
// requestKey = sha256(tool:normalizedArgs) — see
// backend/ai/confirmation.js. The key is never client/model-supplied.
// Binding the key to the exact arguments is what stops a bare "yes"
// from authorizing a DIFFERENT action than the one that was previewed.
//
// `status: "executed"` doubles as the cross-turn idempotency receipt:
// repeating a confirmation replays the recorded result instead of
// writing a second time, which the per-job MutationEffect ledger
// (keyed by job id) cannot cover because each turn is a new job.
//
// Security: stores no secrets and no business records — `args` is the
// already-validated, bounded model argument set and `result` is the
// tool's normalized result. Both are owner-scoped on every lookup.
// =========================================================

const mutationRequestSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The conversation the request was raised in. Scope is per
    // conversation: a confirmation in chat B can never approve a
    // mutation previewed in chat A.
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    tool: {
      type: String,
      required: true,
    },

    // sha256(tool:normalizedArgs) — server-derived.
    requestKey: {
      type: String,
      required: true,
    },

    // The validated, bounded arguments the user was asked to confirm.
    args: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // pending  -> previewed, waiting for a confirming user turn
    // executed -> the user confirmed and the write really happened
    status: {
      type: String,
      enum: ["pending", "executed"],
      required: true,
      default: "pending",
    },

    // The verified result, stored only once execution succeeded so a
    // repeated confirmation replays it verbatim instead of re-writing.
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Mongo's own TTL index: an unconfirmed preview expires on its own
    // instead of accumulating, so a stale "yes" weeks later can never
    // approve anything.
    expiresAt: {
      type: mongoose.SchemaTypes.Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// One request per (owner, conversation, tool, arguments).
mutationRequestSchema.index({ owner: 1, conversation: 1, tool: 1, requestKey: 1 }, { unique: true });
// Native TTL cleanup — no scheduled job, no sweeper.
mutationRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("MutationRequest", mutationRequestSchema);
