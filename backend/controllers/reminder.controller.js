const Reminder = require("../models/Reminder");
const Pet = require("../models/Pet");
const reminderService = require("../services/reminder.service");
const {
  isValidObjectId,
  REMINDER_TYPES,
  REMINDER_FREQUENCIES,
  REMINDER_PRIORITIES,
} = require("../utils/validation");

const computeNext = (input) =>
  reminderService.computeNextRunAt(input);

// Sort/list filter values for GET /reminders (Phase 8). Defaults to "active"
// so existing callers (dashboard) keep receiving the same shape.
const FILTERS = ["active", "completed", "inactive", "all"];

/**
 * Validates the Phase 8 schedule extras. Returns an error message string or
 * null when valid.
 */
const validateScheduleConfig = (frequency, repeatInterval, daysOfWeek) => {
  if (frequency === "interval") {
    const n = Number(repeatInterval);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      return "repeatInterval must be an integer between 1 and 365.";
    }
  }
  if (daysOfWeek !== undefined && daysOfWeek !== null && daysOfWeek !== "") {
    if (!Array.isArray(daysOfWeek)) return "daysOfWeek must be an array.";
    const nums = daysOfWeek.map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) {
      return "daysOfWeek values must be integers 0 (Sunday) to 6 (Saturday).";
    }
    if (nums.length > 7 || new Set(nums).size !== nums.length) {
      return "daysOfWeek must contain at most 7 distinct weekday numbers.";
    }
  }
  return null;
};

const weekdaysArray = (value) =>
  Array.isArray(value) ? value.map(Number) : [];

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

/**
 * List a user's reminders for a status filter with an effective next-run
 * instant attached (materializes legacy rows deterministically for ordering).
 */
const listByStatus = async (user, filter, extra = {}) => {
  const base = { user: user._id, ...extra };
  if (filter === "completed") {
    Object.assign(base, { isCompleted: true });
  } else if (filter === "inactive") {
    Object.assign(base, { isActive: false });
  } else if (filter !== "all") {
    // default (and "active"): the live dashboard contract
    Object.assign(base, { isActive: true, isCompleted: false });
  }

  const rows = await Reminder.find(base)
    .populate("pet", "name species images")
    .lean();

  const now = Date.now();
  for (const r of rows) {
    r.effectiveNext = r.nextRunAt
      ? new Date(r.nextRunAt).getTime()
      : computeNext({
          date: r.date,
          time: r.time,
          timezone: r.timezone,
          frequency: r.frequency,
          repeatInterval: r.repeatInterval,
          daysOfWeek: r.daysOfWeek,
          now,
        }).getTime();
  }

  rows.sort((a, b) => {
    if (a.effectiveNext !== b.effectiveNext) {
      return a.effectiveNext - b.effectiveNext;
    }
    return String(a.date).localeCompare(String(b.date));
  });

  return rows;
};

exports.getReminders = async (req, res) => {
  try {
    const filter = FILTERS.includes(req.query.filter) ? req.query.filter : "active";
    const reminders = await listByStatus(req.user, filter);
    res.json({ success: true, count: reminders.length, reminders });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * GET /reminders/upcoming — active reminders whose next run lands on or after
 * today (calendar day in the reminder's own timezone), sorted by soonest.
 */
exports.getUpcomingReminders = async (req, res) => {
  try {
    const tz = req.query.timezone && reminderService.isValidTimeZone(req.query.timezone)
      ? req.query.timezone
      : "UTC";
    const today = reminderService.todayKey(tz);

    const reminders = (await listByStatus(req.user, "active")).filter(
      (r) =>
        reminderService.zonedDateKey(r.effectiveNext, r.timezone || "UTC") >= today
    );

    res.json({ success: true, count: reminders.length, reminders });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * GET /reminders/today — active reminders whose next run lands on the current
 * calendar day (in the reminder's timezone), plus overdue pending ones so the
 * "today" inbox includes work left undone.
 */
exports.getTodayReminders = async (req, res) => {
  try {
    const tz = req.query.timezone && reminderService.isValidTimeZone(req.query.timezone)
      ? req.query.timezone
      : "UTC";
    const today = reminderService.todayKey(tz);

    const reminders = (await listByStatus(req.user, "active")).filter(
      (r) => {
        const key = reminderService.zonedDateKey(r.effectiveNext, r.timezone || "UTC");
        return key === today || key < today;
      }
    );

    res.json({ success: true, count: reminders.length, reminders });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * GET /reminders/pet/:petId — active reminders for one owned pet.
 */
exports.getPetReminders = async (req, res) => {
  try {
    const ok = await validateOwnedPet(req, res, req.params.petId);
    if (!ok) return;

    const reminders = await listByStatus(req.user, "active", { pet: req.params.petId });
    res.json({ success: true, count: reminders.length, reminders });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
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

    // Phase 8: every reminder must be attached to one of the user's pets.
    if (!pet) {
      return res.status(400).json({ success: false, message: "A pet is required." });
    }
    const petOk = await validateOwnedPet(req, res, pet);
    if (!petOk) return;

    const frequency = req.body.frequency || "once";
    if (!REMINDER_FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ success: false, message: "Invalid frequency." });
    }

    const schedErr = validateScheduleConfig(
      frequency,
      req.body.repeatInterval,
      req.body.daysOfWeek
    );
    if (schedErr) {
      return res.status(400).json({ success: false, message: schedErr });
    }

    const priority = req.body.priority === undefined ? "normal" : req.body.priority;
    if (!REMINDER_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, message: "Invalid priority." });
    }

    if (
      req.body.notificationEnabled !== undefined &&
      typeof req.body.notificationEnabled !== "boolean"
    ) {
      return res.status(400).json({ success: false, message: "Invalid notificationEnabled." });
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

    const repeatInterval = frequency === "interval" ? Number(req.body.repeatInterval) : 1;
    const daysOfWeek = frequency === "weekly" ? weekdaysArray(req.body.daysOfWeek) : [];

    const reminder = await Reminder.create({
      user: req.user._id,
      title: title.trim(),
      type,
      description: typeof req.body.description === "string" ? req.body.description.slice(0, 1000) : "",
      date: reminderDate,
      time: time.trim(),
      frequency,
      timezone,
      repeatInterval,
      daysOfWeek,
      priority,
      notificationEnabled: req.body.notificationEnabled !== false,
      nextRunAt: computeNext({
        date: reminderDate,
        time,
        timezone,
        frequency,
        repeatInterval,
        daysOfWeek,
      }),
      source: "manual",
      pet,
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
      "repeatInterval",
      "daysOfWeek",
      "priority",
      "notificationEnabled",
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

    const schedErr = validateScheduleConfig(
      updates.frequency !== undefined ? updates.frequency : reminder.frequency,
      updates.repeatInterval,
      updates.daysOfWeek
    );
    if (schedErr) {
      return res.status(400).json({ success: false, message: schedErr });
    }

    if (updates.daysOfWeek !== undefined) {
      updates.daysOfWeek = weekdaysArray(updates.daysOfWeek);
    }

    if (updates.priority !== undefined && !REMINDER_PRIORITIES.includes(updates.priority)) {
      return res.status(400).json({ success: false, message: "Invalid priority." });
    }

    if (updates.notificationEnabled !== undefined && typeof updates.notificationEnabled !== "boolean") {
      return res.status(400).json({ success: false, message: "Invalid notificationEnabled." });
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

    // Normalize schedule extras against the active frequency so stored rows
    // never carry stale weekly-day/interval values.
    reminder.repeatInterval = reminder.frequency === "interval" ? Math.max(1, Number(reminder.repeatInterval) || 1) : 1;
    reminder.daysOfWeek = reminder.frequency === "weekly" ? weekdaysArray(reminder.daysOfWeek) : [];

    // Recompute the canonical next-run instant whenever the schedule or the
    // activation state changed. Reschedule from the reminder's Wall-clock
    // (date/time/timezone), so editing one field keeps the others.
    const scheduleChanged = ["date", "time", "timezone", "frequency", "repeatInterval", "daysOfWeek"].some(
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
          repeatInterval: reminder.repeatInterval,
          daysOfWeek: reminder.daysOfWeek,
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

    const reminder = await Reminder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({ success: false, message: "Reminder not found." });
    }

    if (reminder.frequency !== "once" && reminder.isCompleted !== true) {
      // Phase 8 recurring reminders: "complete" checks today's occurrence off
      // and advances to the next one (never fully completes the series).
      const nextRunAt = computeNext({
        date: reminder.date,
        time: reminder.time,
        timezone: reminder.timezone,
        frequency: reminder.frequency,
        repeatInterval: reminder.repeatInterval,
        daysOfWeek: reminder.daysOfWeek,
        now: reminder.nextRunAt ? reminder.nextRunAt.getTime() + 1 : Date.now(),
      });
      reminder.lastFiredAt = new Date();
      reminder.lastStatus = "fired";
      reminder.lastError = "";
      reminder.failedAttempts = 0;
      reminder.nextRunAt = nextRunAt;
      await reminder.save();
      return res.json({
        success: true,
        message: "Reminder completed.",
        reminder,
      });
    }

    // Once reminder (or already-completed recurring): finish it.
    const completedDoc = await Reminder.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        isCompleted: true,
        isActive: true,
        nextRunAt: null,
        lastFiredAt: new Date(),
        lastStatus: "fired",
        lastError: "",
        failedAttempts: 0,
      },
      { new: true, runValidators: true }
    );
    if (!completedDoc) {
      return res.status(404).json({ success: false, message: "Reminder not found." });
    }
    res.json({
      success: true,
      message: "Reminder completed.",
      reminder: completedDoc,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.activateReminder = async (req, res) => {
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

    reminder.isActive = true;
    reminder.isCompleted = false;
    reminder.failedAttempts = 0;
    reminder.lastStatus = "pending";
    reminder.lastError = "";
    reminder.nextRunAt = computeNext({
      date: reminder.date,
      time: reminder.time,
      timezone: reminder.timezone,
      frequency: reminder.frequency,
      repeatInterval: reminder.repeatInterval,
      daysOfWeek: reminder.daysOfWeek,
    });
    await reminder.save();

    res.json({
      success: true,
      message: "Reminder activated.",
      reminder,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deactivateReminder = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reminder ID." });
    }

    const reminder = await Reminder.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        isActive: false,
        lastStatus: "skipped",
        lastError: "Deactivated by user.",
      },
      { new: true, runValidators: true }
    );

    if (!reminder) {
      return res.status(404).json({ success: false, message: "Reminder not found." });
    }

    res.json({
      success: true,
      message: "Reminder deactivated.",
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