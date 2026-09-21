// =====================================================
// APPOINTMENT SERVICE (Phase 10 AI Tool Layer)
// =====================================================
// Owner-scoped appointment reads extracted from appointment.controller.js so
// the AI tool layer can report the user's existing bookings. Read-only here:
// booking/cancel flows stay behind their own confirmed routes.

const Appointment = require("../models/Appointment");

/**
 * List the caller's own appointments, soonest first.
 */
const listAppointments = async ({ user }) => {
  const appointments = await Appointment.find({ user: user._id || user.id })
    .populate("pet", "name species images")
    .populate("veterinarian", "name clinic specialization phone")
    .sort({ date: 1, time: 1 })
    .lean();

  return { ok: true, status: 200, data: { count: appointments.length, appointments } };
};

module.exports = { listAppointments };