const express = require("express");

const router = express.Router();

const {
  askPetGPT,
  getPetAdvice,
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

// Approve a proposed mutation (exactly-once execution)
router.post("/tools/confirm", protect, confirmTool);

// Invalidate a pending proposal
router.post("/tools/cancel", protect, cancelTool);

module.exports = router;