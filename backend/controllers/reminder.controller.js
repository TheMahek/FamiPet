const Reminder = require("../models/Reminder");
const Pet = require("../models/Pet");
const reminderService = require("../services/reminder.service");
const {
  isValidObjectId,
  REMINDER_TYPES,
  REMINDER_FREQUENCIES,
} = require("../utils/validation");

const computeNext = (input) =>
  reminderService.computeNextRunAt(input);

exports.getReminders = async (req, res) => {
  try {
    const reminders = await Reminder.find({
      user: req.user._id,
      isActive: true,
    })
      .populate("pet", "name species images")
      .sort({ date: 1, time: 1 });

    res.json({ success: true, count: reminders.length, reminders });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Validate a pet reference when the client supplies one. Returns true when ok,
// otherwise sends an error response and returns false.
const validateOwnedPet = async (req, res, petId) => {
  if (!isValidObjectId(petId)) {
    res.status(400).json({ success: false, message: "Invalid pet ID." });
    return false;
  }

  const petExists = await Pet.findOne({ _id: petId, owner: req.user._id });
  if (!petExists) {
    res.status(404).json({ success: false, message: "Pet not found or not owned by you." });
    return false;
  }

  return true;
};

exports.createReminder = async (req, res) => {
  try {
    const { title, type, date, time, pet } = req.body;

    if (!title || !type || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "Title, type, date and time are required.",
      });
    }

    if (typeof title !== "string" || title.trim().length > 200) {
      return res.status(400).json({ success: false, message: "Invalid title." });
    }

    if (typeof type !== "string" || !REMINDER_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid reminder type." });
    }

    if (req.body.frequency !== undefined && req.body.frequency !== null && req.body.frequency !== "") {
      if (!REMINDER_FREQUENCIES.includes(req.body.frequency)) {
        return res.status(400).json({ success: false, message: "Invalid frequency." });
      }
    }

    const reminderDate = new Date(date);
    if (Number.isNaN(reminderDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date." });
    }

    const timeErr = reminderService.timeError(time);
    if (timeErr) {
      return res.status(400).json({ success: false, message: timeErr });
    }

    const timezone = req.body.timezone === undefined ? "UTC" : req.body.timezone;
    if (!reminderService.isValidTimeZone(timezone)) {
      return res.status(400).json({ success: false, message: "Invalid timezone." });
    }

    if (pet) {
      const ok = await validateOwnedPet(req, res, pet);
      if (!ok) return;
    }

    const frequency = req.body.frequency || "once";

    const reminder = await Reminder.create({
      user: req.user._id,
      title: title.trim(),
      type,
      description: typeof req.body.description === "string" ? req.body.description.slice(0, 1000) : "",
      date: reminderDate,
      time: time.trim(),
      frequency,
      timezone,
      nextRunAt: computeNext({
        date: reminderDate,
        time,
        timezone,
        frequency,
      }),
      source: "manual",
      pet: pet || undefined,
    });

    res.status(201).json({
      success: true,
      message: "Reminder created successfully.",
      reminder,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.updateReminder = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reminder ID." });
    }

    const reminder = await Reminder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({ success: false, message: "Reminder not found." });
    }

    // Allowlist of editable fields. user is protected; pet may be updated but
    // only to another pet owned by the authenticated user.
    const allowedFields = [
      "title",
      "type",
      "description",
      "date",
      "time",
      "timezone",
      "frequency",
      "isActive",
      "isCompleted",
      "pet",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update." });
    }

    if (updates.title !== undefined && (typeof updates.title !== "string" || updates.title.trim().length > 200)) {
      return res.status(400).json({ success: false, message: "Invalid title." });
    }
    if (updates.title !== undefined) updates.title = updates.title.trim();

    if (updates.type !== undefined && !REMINDER_TYPES.includes(updates.type)) {
      return res.status(400).json({ success: false, message: "Invalid reminder type." });
    }

    if (updates.frequency !== undefined && !REMINDER_FREQUENCIES.includes(updates.frequency)) {
      return res.status(400).json({ success: false, message: "Invalid frequency." });
    }

    if (updates.description !== undefined && typeof updates.description !== "string") {
      return res.status(400).json({ success: false, message: "Invalid description." });
    }
    if (updates.description !== undefined) updates.description = updates.description.slice(0, 1000);

    if (updates.time !== undefined) {
      const timeErr = reminderService.timeError(updates.time);
      if (timeErr) {
        return res.status(400).json({ success: false, message: timeErr });
      }
      updates.time = updates.time.trim();
    }

    if (updates.timezone !== undefined) {
      if (!reminderService.isValidTimeZone(updates.timezone)) {
        return res.status(400).json({ success: false, message: "Invalid timezone." });
      }
    }

    if (updates.date !== undefined) {
      const d = new Date(updates.date);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid date." });
      }
      updates.date = d;
    }

    if (updates.isActive !== undefined && typeof updates.isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "Invalid isActive." });
    }

    if (updates.isCompleted !== undefined && typeof updates.isCompleted !== "boolean") {
      return res.status(400).json({ success: false, message: "Invalid isCompleted." });
    }

    if (updates.pet !== undefined && updates.pet !== null && updates.pet !== "") {
      const ok = await validateOwnedPet(req, res, updates.pet);
      if (!ok) return;
    }

    Object.assign(reminder, updates);

    // Recompute the canonical next-run instant whenever the schedule or the
    // activation state changed. Reschedule from the reminder's Wall-clock
    // (date/time/timezone), so editing one field keeps the others.
    const scheduleChanged = ["date", "time", "timezone", "frequency"].some(
      (f) => updates[f] !== undefined
    );
    if (scheduleChanged || updates.isActive === true || updates.isCompleted === true) {
      reminder.failedAttempts = 0;
      reminder.lastStatus = "pending";
      reminder.lastError = "";
      if (reminder.isCompleted) {
        reminder.nextRunAt = null;
      } else {
        reminder.nextRunAt = computeNext({
          date: reminder.date,
          time: reminder.time,
          timezone: reminder.timezone,
          frequency: reminder.frequency,
        });
      }
    }

    await reminder.save();

    res.json({
      success: true,
      message: "Reminder updated successfully.",
      reminder,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.completeReminder = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reminder ID." });
    }

    const reminder = await Reminder.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        isCompleted: true,
        nextRunAt: null,
        lastStatus: "fired",
        lastError: "",
        failedAttempts: 0,
      },
      { new: true, runValidators: true }
    );

    if (!reminder) {
      return res.status(404).json({ success: false, message: "Reminder not found." });
    }

    res.json({
      success: true,
      message: "Reminder completed.",
      reminder,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteReminder = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reminder ID." });
    }

    const reminder = await Reminder.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({ success: false, message: "Reminder not found." });
    }

    res.json({ success: true, message: "Reminder deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};