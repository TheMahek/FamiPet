const express = require("express");
const router = express.Router();

const {
  getAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
} = require("../controllers/appointment.controller");

const { protect } = require("../middleware/auth");

// Get logged-in user's appointments
router.get("/", protect, getAppointments);

// Book appointment
router.post("/", protect, createAppointment);

// Update appointment
router.put("/:id", protect, updateAppointment);

// Cancel appointment
router.delete("/:id", protect, deleteAppointment);

module.exports = router;