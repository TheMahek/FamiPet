const express = require("express");

const router = express.Router();

const {
  askPetGPT,
  getPetAdvice,
} = require("../controllers/ai.controller");

const { protect } = require("../middleware/auth");

// Ask PetGPT
router.post("/ask", protect, askPetGPT);

// Get advice for a pet
router.post("/advice", protect, getPetAdvice);

module.exports = router;