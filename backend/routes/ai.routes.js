const express = require("express");

const router = express.Router();

const {
  askPetGPT,
  getPetAdvice,
  getRecommendations,
} = require("../controllers/ai.controller");

const {
  runTool,
  confirmTool,
  cancelTool,
} = require("../controllers/aiTool.controller");

const { protect } = require("../middleware/auth");

// Ask PetGPT
router.post("/ask", protect, askPetGPT);

// Get advice for a pet
router.post("/advice", protect, getPetAdvice);

// Phase 10 AI tool layer — reads execute / mutations propose confirmation
router.post("/tool", protect, runTool);

// Phase 11 — informational suggestions built from real data (no medal advice,
// read-only; items may carry a suggestedAction to Accept below)
router.get("/recommendations", protect, getRecommendations);

// Phase 11 — "accept a suggestion": accepts { intent?, tool, args } after the
// user's on-screen confirm, mints a Phase 10 proposal exactly like /ai/tool
// (runs through the same allowlist validation, ownership check and audit).
router.post("/action", protect, runTool);

// Approve a proposed mutation (exactly-once execution)
router.post("/tools/confirm", protect, confirmTool);

// Invalidate a pending proposal
router.post("/tools/cancel", protect, cancelTool);

module.exports = router;