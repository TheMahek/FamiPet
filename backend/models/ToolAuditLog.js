const mongoose = require("mongoose");

// =====================================================
// AI TOOL EXECUTION AUDIT LOG (Phase 10 AI Tool Layer)
// =====================================================
// Minimal, safe audit trail for every AI tool execution. Records WHO ran
// WHICH tool, whether it read or mutated, and whether it succeeded — plus a
// safe resource identifier (never full payloads, passwords, tokens, push
// subscription secrets, or AI credentials). Old rows expire via the TTL
// index so the collection cannot grow without bound.

const toolAuditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    requestId: { type: String, default: "" },
    tool: { type: String, required: true },
    kind: { type: String, enum: ["read", "mutation"], required: true },
    ok: { type: Boolean, required: true },
    errorCategory: {
      type: String,
      enum: [
        "validation",
        "auth",
        "authorization",
        "not_found",
        "confirmation_required",
        "confirmation_invalid",
        "tool_unavailable",
        "execution",
      ],
    },
    // Safe resource identifier (e.g. pet id) when the tool resolved one.
    resourceId: { type: String, default: "" },
  },
  { timestamps: true }
);

toolAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model("ToolAuditLog", toolAuditLogSchema);