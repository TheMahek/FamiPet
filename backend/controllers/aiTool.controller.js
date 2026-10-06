// =====================================================
// AI TOOL HTTP CONTROLLER (Phase 10 AI Tool Layer)
// =====================================================
// Thin HTTP mapper over the tool layer. Every handler is `protect`-gated so
// `req.user` is the single, trusted ownership source. The tool layer validates
// arguments, authorizes resources, mints/consumes confirmation tokens and
// audits every call — nothing here reaches models directly.
//
// Endpoints:
//   POST /api/ai/tool          { tool, args } -> read executes / mutation proposes
//   POST /api/ai/tools/confirm { token }      -> execute an approved mutation
//   POST /api/ai/tools/cancel  { token }      -> invalidate a pending proposal
// =====================================================

const crypto = require("crypto");
const toolLayer = require("../services/toolLayer");

const newRequestId = () => crypto.randomBytes(8).toString("hex");

const sendToolResult = (res, result) => {
  if (!result || result.ok !== true) {
    const status = result && result.statusCode ? result.statusCode : 400;
    return res
      .status(status)
      .json({
        success: false,
        errorCategory: result ? result.errorCategory : "execution",
        message: result && result.message ? result.message : "Something went wrong.",
      });
  }

  if (result.requiresConfirmation) {
    return res.json({
      success: true,
      requiresConfirmation: true,
      tool: result.tool,
      kind: result.kind,
      action: result.action,
      preview: result.preview,
      confirmation: result.confirmation,
    });
  }

  return res.json({
    success: true,
    tool: result.tool,
    kind: result.kind,
    data: result.data,
  });
};

/** POST /api/ai/tool — direct probe of the tool layer (proposal mode). */
exports.runTool = async (req, res) => {
  const { tool, args } = req.body || {};
  const requestId = newRequestId();
  const result = await toolLayer.runTool({
    user: req.user,
    requestId,
    tool,
    args,
    callBudget: { used: 0, max: 1 },
  });
  return sendToolResult(res, result);
};

/** POST /api/ai/tools/confirm — execute an approved mutation once. */
exports.confirmTool = async (req, res) => {
  const token = req.body && req.body.token;
  const result = await toolLayer.confirmTool({ user: req.user, requestId: newRequestId(), token });
  if (!result || result.ok !== true) {
    const status = result && result.statusCode ? result.statusCode : 400;
    return res.status(status).json({
      success: false,
      errorCategory: result ? result.errorCategory : "execution",
      message: result && result.message ? result.message : "Something went wrong.",
    });
  }
  return res.json({
    success: true,
    message: result.data ? result.data.message : "Action completed.",
    tool: result.tool,
    action: result.action,
    data: result.data || {},
  });
};

/** POST /api/ai/tools/cancel — invalidate a pending proposal. */
exports.cancelTool = async (req, res) => {
  const token = req.body && req.body.token;
  const result = await toolLayer.cancelTool({ user: req.user, requestId: newRequestId(), token });
  if (!result || result.ok !== true) {
    const status = result && result.statusCode ? result.statusCode : 400;
    return res.status(status).json({
      success: false,
      errorCategory: result ? result.errorCategory : "execution",
      message: result && result.message ? result.message : "Something went wrong.",
    });
  }
  return res.json({ success: true, message: result.message || "Action cancelled." });
};