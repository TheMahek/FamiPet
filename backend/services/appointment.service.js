// =========================================================
// Appointment creation workflow (single source of truth)
// ---------------------------------------------------------
// Extracted from controllers/appointment.controller.js so that the
// HTTP route and the PetGPT `create_appointment` tool run the SAME
// rules. Booking is not a place for two implementations: the
// double-booking guard, the owner check, the notification and the
// auto-created reminder are the product's actual behaviour, and a
// second copy of them would drift.
//
// Every rule below is the pre-existing controller behaviour, unchanged:
//   * pet must exist AND be owned by the authenticated user
//   * veterinarian must exist AND be active
//   * date must parse and must not be in the past
//   * the same veterinarian cannot be double-booked for the same
//     date+time while the booking is pending or confirmed
//   * a notification is created for the owner (best effort — a
//     notification failure never fails the booking)
//   * an appointment reminder is auto-created (skipped when an
//     identical active one already exists)
//
// Errors carry an HTTP `status` so the controller can preserve its
// existing response contract unchanged; the PetGPT tool maps the same
// error to a model-safe refusal.
// =========================================================

const Appointment = require("../models/Appointment");
const Pet = require("../models/Pet");
const Veterinarian = require("../models/Veterinarian");
const Reminder = require("../models/Reminder");
const { createNotification } = require("./notification.service");
const logger = require("../utils/logger");

class AppointmentError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AppointmentError";
    this.status = status;
  }
}

const APPOINTMENT_TYPES = ["checkup", "vaccination", "surgery", "emergency", "grooming", "consultation"];

function isValidObjectId(value) {
  return /^[0-9a-fA-F]{24}$/.test(String(value || ""));
}

async function createAppointmentForUser({ userId, pet, veterinarian, date, time, type, symptoms, notes }) {
  if (!userId) {
    throw new AppointmentError(401, "Authentication is required.");
  }
  if (!pet || !veterinarian || !date || !time) {
    throw new AppointmentError(400, "Pet, veterinarian, date and time are required.");
  }
  if (!isValidObjectId(pet) || !isValidObjectId(veterinarian)) {
    throw new AppointmentError(400, "Invalid pet or veterinarian ID.");
  }
  if (type && !APPOINTMENT_TYPES.includes(type)) {
    throw new AppointmentError(400, `Appointment type must be one of: ${APPOINTMENT_TYPES.join(", ")}.`);
  }

  const [petExists, veterinarianExists] = await Promise.all([
    Pet.findOne({ _id: pet, owner: userId }),
    Veterinarian.findOne({ _id: veterinarian, isActive: true }),
  ]);

  if (!petExists) {
    throw new AppointmentError(404, "Pet not found or not owned by you.");
  }
  if (!veterinarianExists) {
    throw new AppointmentError(404, "Active veterinarian not found.");
  }

  const appointmentDate = new Date(date);
  if (Number.isNaN(appointmentDate.getTime())) {
    throw new AppointmentError(400, "Invalid appointment date.");
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (appointmentDate < startOfToday) {
    throw new AppointmentError(400, "Appointment date cannot be in the past.");
  }

  const existing = await Appointment.findOne({
    veterinarian,
    date: appointmentDate,
    time,
    status: { $in: ["pending", "confirmed"] },
  });
  if (existing) {
    throw new AppointmentError(400, "This veterinarian is already booked at this time.");
  }

  const appointment = await Appointment.create({
    user: userId,
    pet,
    veterinarian,
    date: appointmentDate,
    time,
    type: type || "checkup",
    symptoms: symptoms || "",
    notes: notes || "",
  });

  // The appointment is already persisted at this point, so a
  // notification failure must NOT fail the booking: the user would
  // lose a real appointment because an inbox row could not be
  // written. Failure is logged; the notification write is the only
  // thing that can throw here, and push delivery inside it cannot.
  try {
    await createNotification({
      user: userId,
      title: "Appointment Booked",
      message: `Your appointment is booked for ${appointmentDate.toDateString()} at ${time}.`,
      type: "appointment",
      url: "/app/appointments",
    });
  } catch (notifyError) {
    logger.error(`Appointment notification error: ${notifyError.message}`);
  }

  // Auto-create the appointment reminder (pre-existing behaviour). The
  // title is exactly what the controller produced before this extraction:
  // "Appointment" when no type was given, otherwise "Appointment - <Type>".
  const reminderTitle = type
    ? `Appointment - ${String(type).charAt(0).toUpperCase()}${String(type).slice(1)}`
    : "Appointment";
  const existingReminder = await Reminder.findOne({
    user: userId,
    pet,
    title: reminderTitle,
    date: appointmentDate,
    time,
    type: "appointment",
    isActive: true,
  });
  if (!existingReminder) {
    await Reminder.create({
      user: userId,
      pet,
      title: reminderTitle,
      type: "appointment",
      description: notes || `Scheduled ${type || "checkup"} appointment.`,
      date: appointmentDate,
      time,
      frequency: "once",
      isActive: true,
      isCompleted: false,
    });
  }

  return { appointment, reminderTitle };
}

module.exports = {
  AppointmentError,
  APPOINTMENT_TYPES,
  createAppointmentForUser,
};
