const mongoose = require("mongoose");

// =====================================================
// AI TOOL CONFIRMATION (Phase 10 AI Tool Layer)
// =====================================================
// Server-issued, single-use confirmation proposals for AI mutation tools.
// Flow: the model emits a mutation tool call -> the tool layer creates a
// proposal row here with a random token (stored as SHA-256 hash only) and a
// SANITIZED snapshot of the tool arguments. The raw token is handed to the
// client exactly once; when the user confirms, the backend looks the row up
// by hash, atomically flips it pending -> consumed (=> exactly-once), then
// re-validates arguments + re-verifies ownership and executes through the
// tool layer. Cancelling flips pending -> cancelled; expired rows are removed
// by the TTL index. The token itself is never stored, so a DB leak does not
// expose usable tokens; the raw token is never trusted for anything except
// looking up a proposal that belongs to the requesting user.

const toolConfirmationSchema = new mongoose.Schema(
  {
    // SHA-256 hex digest of the raw bearer token (never the raw token).
    tokenHash: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tool: { type: String, required: true },
    // Sanitized, validated snapshot of the tool arguments (allowlisted keys
    // only). This is what re-executes on confirm — never client-supplied.
    args: { type: Object, default: {} },
    // Stable fingerprint of the sanitized args (sha256 of canonical JSON),
    // used to reuse one pending proposal for identical proposed actions.
    fingerprint: { type: String, default: "" },
    kind: { type: String, enum: ["read", "mutation"], default: "mutation" },
    status: {
      type: String,
      enum: ["pending", "consumed", "cancelled"],
      default: "pending",
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Auto-purge expired proposals (TTL on expiresAt).
toolConfirmationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Reuse/single-use lookups.
toolConfirmationSchema.index({ user: 1, tool: 1, fingerprint: 1, status: 1 });

module.exports = mongoose.model("ToolConfirmation", toolConfirmationSchema);
module.exports.CONFIRM_TTL_MS = 10 * 60 * 1000;