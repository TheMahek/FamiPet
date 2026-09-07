const express = require("express");
const router = express.Router();

const {
  getAllAdoptions,
  getMyAdoptions,
  createAdoption,
  updateAdoptionStatus,
  deleteAdoption,
} = require("../controllers/adoption.controller");

const { protect, adminOnly } = require("../middleware/auth");

// Admin: Get all adoption requests
router.get("/", protect, adminOnly, getAllAdoptions);

// User: Get own adoption requests
router.get("/my", protect, getMyAdoptions);

// User: Create adoption request
router.post("/", protect, createAdoption);

// Admin: Approve / Reject adoption
router.put("/:id", protect, adminOnly, updateAdoptionStatus);

// Admin: Delete adoption request
router.delete("/:id", protect, adminOnly, deleteAdoption);

module.exports = router;