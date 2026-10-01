const express = require("express");
const router = express.Router();

const {
  getAllBreeds,
  getBreedById,
  createBreed,
  updateBreed,
  deleteBreed,
  getBreedAiStatus,
  analyzeBreedImage,
} = require("../controllers/breed.controller");

const { protect, adminOnly } = require("../middleware/auth");
const rateLimiter = require("../middleware/rateLimiter");
const { uploadTransientImage } = require("../middleware/upload");


// Public Routes


// Get all breeds
router.get("/", getAllBreeds);

// Whether breed identification is available on this deployment.
// Authenticated (it sits inside the app shell) and deliberately free
// of any URL, host or provider detail.
router.get("/ai/status", protect, getBreedAiStatus);

// Get breed by ID
router.get("/:id", getBreedById);

// Protected User Routes

// Identify a breed from a photo.
//
// Authenticated like every other personal-data endpoint, and
// rate limited harder than a normal read: each call costs a model
// inference and possibly an AI generation, so it is metered per IP
// rather than being free.
const breedAiLimiter = rateLimiter({ windowMs: 60 * 1000, max: 10 });

router.post(
  "/analyze",
  protect,
  breedAiLimiter,
  uploadTransientImage.single("image"),
  analyzeBreedImage
);

// Admin Routes

// Create new breed
router.post("/", protect, adminOnly, createBreed);

// Update breed
router.put("/:id", protect, adminOnly, updateBreed);

// Delete breed
router.delete("/:id", protect, adminOnly, deleteBreed);

module.exports = router;