const express = require("express");
const router = express.Router();

const {
  getAllBreeds,
  getBreedById,
  createBreed,
  updateBreed,
  deleteBreed,
} = require("../controllers/breed.controller");

const { protect, adminOnly } = require("../middleware/auth");


// Public Routes


// Get all breeds
router.get("/", getAllBreeds);

// Get breed by ID
router.get("/:id", getBreedById);

// Admin Routes

// Create new breed
router.post("/", protect, adminOnly, createBreed);

// Update breed
router.put("/:id", protect, adminOnly, updateBreed);

// Delete breed
router.delete("/:id", protect, adminOnly, deleteBreed);

module.exports = router;