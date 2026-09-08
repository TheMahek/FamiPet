const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Pet = require("../models/Pet");
const Veterinarian = require("../models/Veterinarian");
const Notification = require("../models/Notification");
const Reminder = require("../models/Reminder");

// =========================================================
// Create (or refresh) an automatic reminder for a stored
// appointment. Deduped on user+pet+date+time so repeated
// booking calls never create duplicate reminders.
// =========================================================
async function syncAppointmentReminder({
  userId,
  petId,
  petName,
  vet,
  date,
  time,
  type,
}) {
  const match = {
    user: userId,
    pet: petId,
    type: "appointment",
    date: new Date(date),
    time,
  };

  const existing = await Reminder.findOne(match);

  if (existing) {
    existing.isActive = true;
    existing.isCompleted = false;
    existing.title = `Appointment${type ? ` ${type}` : ""} for ${petName || "pet"}`;
    await existing.save();
    return existing;
  }

  return Reminder.create({
    user: userId,
    pet: petId,
    title: `Appointment${type ? ` ${type}` : ""} for ${petName || "pet"}`,
    type: "appointment",
    description: vet
      ? `Scheduled with ${vet.name}${vet.clinic ? ` at ${vet.clinic}` : ""}.`
      : "Automatic reminder for your scheduled appointment.",
    date: new Date(date),
    time,
    frequency: "once",
    isActive: true,
    isCompleted: false,
  });
}

exports.getAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ user: req.user._id })
      .populate("pet", "name species images")
      .populate("veterinarian", "name clinic specialization phone")
      .sort({ date: 1, time: 1 });

    res.json({ success: true, count: appointments.length, appointments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createAppointment = async (req, res) => {
  try {
    const { pet, veterinarian, date, time, type, symptoms, notes } = req.body;

    if (!pet || !veterinarian || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "Pet, veterinarian, date and time are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(pet) ||
        !mongoose.Types.ObjectId.isValid(veterinarian)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pet or veterinarian ID.",
      });
    }

    const [petExists, veterinarianExists] = await Promise.all([
      Pet.findOne({ _id: pet, owner: req.user._id }),
      Veterinarian.findOne({ _id: veterinarian, isActive: true }),
    ]);

    if (!petExists) {
      return res.status(404).json({
        success: false,
        message: "Pet not found or not owned by you.",
      });
    }

    if (!veterinarianExists) {
      return res.status(404).json({
        success: false,
        message: "Active veterinarian not found.",
      });
    }

    const appointmentDate = new Date(date);
    if (Number.isNaN(appointmentDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid appointment date." });
    }

    const existing = await Appointment.findOne({
      veterinarian,
      date: appointmentDate,
      time,
      status: { $in: ["pending", "confirmed"] },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "This veterinarian is already booked at this time.",
      });
    }

    const appointment = await Appointment.create({
      user: req.user._id,
      pet,
      veterinarian,
      date: appointmentDate,
      time,
      type: type || "checkup",
      symptoms: symptoms || "",
      notes: notes || "",
    });

    await Notification.create({
      user: req.user._id,
      title: "Appointment Booked",
      message: `Your appointment is booked for ${appointmentDate.toDateString()} at ${time}.`,
      type: "appointment",
    });

    // Automatically create a linked reminder (no manual reminder needed).
    await syncAppointmentReminder({
      userId: req.user._id,
      petId: pet,
      petName: petExists ? petExists.name : undefined,
      vet: veterinarianExists,
      date: appointmentDate,
      time,
      type: appointment.type,
    });

    res.status(201).json({
      success: true,
      message: "Appointment booked successfully.",
      appointment,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const allowed = ["date", "time", "type", "symptoms", "notes"];
    const oldDate = appointment.date;
    const oldTime = appointment.time;
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) appointment[field] = req.body[field];
    });

    await appointment.save();

    // Keep the automatic reminder in sync with the new schedule.
    const newDate = appointment.date;
    const newTime = appointment.time;
    if (
      String(newDate) !== String(oldDate) ||
      newTime !== oldTime
    ) {
      // Deactivate the reminder for the old slot (if any).
      await Reminder.updateMany(
        {
          user: req.user._id,
          pet: appointment.pet,
          type: "appointment",
          date: oldDate,
          time: oldTime,
        },
        { isActive: false }
      );

      // Create/refresh the reminder for the new slot.
      await syncAppointmentReminder({
        userId: req.user._id,
        petId: appointment.pet,
        petName: undefined,
        vet: undefined,
        date: newDate,
        time: newTime,
        type: appointment.type,
      });
    }

    res.json({
      success: true,
      message: "Appointment updated successfully.",
      appointment,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    appointment.status = "cancelled";
    await appointment.save();

    // Deactivate any automatic reminder linked to this appointment.
    await Reminder.updateMany(
      {
        user: req.user._id,
        pet: appointment.pet,
        type: "appointment",
      },
      { isActive: false }
    );

    res.json({
      success: true,
      message: "Appointment cancelled successfully.",
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
