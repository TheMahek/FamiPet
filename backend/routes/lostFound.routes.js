const express = require("express");

const router = express.Router();

const lostFoundController = require("../controllers/lostFound.controller");
const { protect } = require("../middleware/auth");
const upload = require("../middleware/upload");

// =====================================================
// PUBLIC ROUTES
// =====================================================

// Get all Lost & Found reports
// GET /api/lost-found
router.get("/", lostFoundController.getAllReports);

// Get single report
// GET /api/lost-found/:id
router.get("/:id", lostFoundController.getReportById);

// =====================================================
// PROTECTED ROUTES
// =====================================================

// Create Lost / Found report
// POST /api/lost-found
router.post("/", protect, upload.single("image"), lostFoundController.createReport);

// Update own report
// PUT /api/lost-found/:id
router.put("/:id", protect, upload.single("image"), lostFoundController.updateReport);

// Delete own report or admin report
// DELETE /api/lost-found/:id
router.delete("/:id", protect, lostFoundController.deleteReport);

module.exports = router;