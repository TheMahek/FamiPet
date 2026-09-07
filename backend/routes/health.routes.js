const express = require("express");
const router = express.Router();
const {
  getHealthRecords,
  getHealthRecordById,
  createHealthRecord,
  updateHealthRecord,
  deleteHealthRecord,
} = require("../controllers/health.controller");
const { protect } = require("../middleware/auth");

router.get("/", protect, getHealthRecords);
router.get("/:id", protect, getHealthRecordById);
router.post("/", protect, createHealthRecord);
router.put("/:id", protect, updateHealthRecord);
router.delete("/:id", protect, deleteHealthRecord);

module.exports = router;
