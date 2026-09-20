// =====================================================
// SHARED REMINDER SERVICE (Phase 7 Reminder Scheduler)
// =====================================================
// Pure, deterministic scheduling helpers plus the CRUD/occurrence primitives
// shared by the Reminder routes and the Appointment producer. Everything here
// is timezone-aware: a reminder's `date` + `time` form a wall-clock that is
// interpreted in the reminder's `timezone` (IANA, default UTC), and every
// scheduled instant stored in `nextRunAt` is a canonical UTC Date.
//
// Design notes (recorded decisions):
//   - Legacy rows without `nextRunAt` keep working: once = their date/time
//     (eligible to fire, overdue semantics); recurring = the FIRST occurrence
//     in the future (historical occurrences are never back-fired — no spam).
//   - Once reminders with a past date/time are still eligible (they are
//     overdue and will fire on the next scheduler pass, once).
//   - Recurrence advances deterministically from the fired occurrence (never
//     from "now"), so long gaps skip past cycles instead of replaying them.
//   - Monthly recurrence clamps the day to the target month's length and keeps
//     that clamped day for subsequent months (Jan 31 -> Feb 28 -> Mar 28).
//   - DST ambiguity (fall-back repeats a wall hour) resolves to the EARLIEST
//     matching instant; gaps (spring-forward) use the Intl mapping. Both are
//     deterministic and documented.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const {
  isValidObjectId,
  REMINDER_TYPES,
  REMINDER_FREQUENCIES,
  REMINDER_PRIORITIES,
} = require("../utils/validation");
const petService = require("./pet.service");
const INTERVAL_MS = {
  daily: DAY_MS,
  weekly: WEEK_MS,
};

// Strict 24-hour HH:mm (matches the `<input type="time">` frontend values).
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const msToIsoString = (value) =>
  value && value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString()
    : "";

/**
 * Returns the wall-clock date parts the stored reminder `date` represents,
 * using UTC components. The app's historical convention stores calendar dates
 * as UTC (new Date("YYYY-MM-DD") and ISO timestamps), so UTC parts recover the
 * intended calendar day independent of the server/host timezone.
 */
const calendarPartsFromDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: 0,
    minute: 0,
  };
};

/**
 * Validates an HH:mm time string. Returns '' when valid, otherwise a message.
 */
const timeError = (time) => {
  if (typeof time !== "string") return "Invalid time.";
  const trimmed = time.trim();
  if (!TIME_RE.test(trimmed)) {
    return "Invalid time. Expected 24-hour HH:mm.";
  }
  return "";
};

const timeToParts = (time) => {
  const [h, m] = String(time)
    .trim()
    .split(":")
    .map((n) => Number(n));
  return { hour: h, minute: m };
};

/**
 * Deterministic IANA timezone offset helper. Returns the UTC offset in ms the
 * zone applies at the given UTC instant.
 */
const tzOffsetMs = (utcMs, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const wallMs = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return wallMs - utcMs;
};

/**
 * Maps a target wall-clock (given in calendar Y/M/D + h/m) to the canonical
 * UTC instant in `timeZone`. Deterministic; DST fall-back ambiguity resolves
 * to the earliest matching instant.
 */
const wallPartsOf = (utcMs, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
};

const zonedToUtc = (year, month, day, hour, minute, timeZone) => {
  const targetWall = Date.UTC(year, month, day, hour, minute);
  // Iterate a few times so DST-offset changes converge (offset steps are
  // 30/60-min increments, so a handful of passes is more than enough).
  let utcGuess = targetWall - tzOffsetMs(targetWall, timeZone);
  for (let i = 0; i < 4; i++) {
    const offset = tzOffsetMs(utcGuess, timeZone);
    const corrected = targetWall - offset;
    if (corrected === utcGuess) break;
    utcGuess = corrected;
  }
  // Deterministic tie-break: when a fall-back DST hour repeats, pick the
  // EARLIEST instant whose wall-clock still matches the requested time.
  const wall = wallPartsOf(utcGuess, timeZone);
  for (let step = 1; step <= 2; step++) {
    const earlierWall = wallPartsOf(utcGuess - step * 60 * 60 * 1000, timeZone);
    if (earlierWall.hour !== wall.hour || earlierWall.minute !== wall.minute) {
      break;
    }
    utcGuess -= step * 60 * 60 * 1000;
  }
  return new Date(utcGuess);
};

/**
 * Date-add helpers operating on calendar parts (day/month arithmetic in the
 * reminder's own calendar — timezone-agnostic, then re-projected via
 * zonedToUtc). Returns { year, month, day } after adding the interval.
 */
const daysInMonth = (year, month) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const addDaysToParts = (year, month, day, days) => {
  const t = new Date(Date.UTC(year, month, day + days));
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth(),
    day: t.getUTCDate(),
  };
};

const addIntervalToParts = (year, month, day, frequency) => {
  if (frequency === "daily") {
    return addDaysToParts(year, month, day, 1);
  }
  if (frequency === "weekly") {
    return addDaysToParts(year, month, day, 7);
  }
  if (frequency === "monthly") {
    let m = month + 1;
    let y = year;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    const clampedDay = Math.min(day, daysInMonth(y, m));
    return { year: y, month: m, day: clampedDay };
  }
  return { year, month, day };
};

/**
 * True when the passed value is a well-formed IANA timezone the runtime can
 * actually compute against.
 */
const isValidTimeZone = (value) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 64 ||
    /\s/.test(value)
  ) {
    return false;
  }
  try {
    // Round-trip is the real capability test: Intl can format for any IANA
    // identifier the runtime knows. (supportedValuesOf('timeZone') would be
    // tempting, but it omits valid aliases like "UTC"/"Etc/UTC", so it cannot
    // gate the DEFAULT timezone.)
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Computes the next UTC occurrence instant for a (date, time, timezone,
 * frequency, repeatInterval, daysOfWeek) combination.
 *
 * once:       the exact date/time instant (past allowed -> overdue, fires once).
 * recurring:  the first occurrence strictly after `now` (never fires the past).
 *
 * Phase 8 repeat rules:
 *   - daily:       every day.
 *   - interval:    every `repeatInterval` days (1..365), counted from the base
 *                  calendar date (so an edit to date only shifts phase, it
 *                  never rescales spacing).
 *   - weekly:      without `daysOfWeek` exactly every 7 days; with non-empty
 *                  `daysOfWeek` the reminder runs on those weekdays (0=Sun..
 *                  6=Sat) — the FIRST qualifying day strictly after `now`.
 *   - monthly:     same calendar day each month, clamped to short months
 *                  (Jan 31 -> Feb 28 -> Mar 28), keeping the clamped day.
 *
 * @returns {Date} canonical UTC instant.
 */
const computeNextRunAt = ({
  date,
  time,
  timezone,
  frequency,
  repeatInterval = 1,
  daysOfWeek = [],
  now = Date.now(),
}) => {
  const parts = calendarPartsFromDate(date);
  const tp = timeToParts(time);
  const tz = timezone || "UTC";
  const frequencySafe = frequency || "once";

  let scheduled = zonedToUtc(
    parts.year,
    parts.month,
    parts.day,
    tp.hour,
    tp.minute,
    tz
  );

  if (frequencySafe === "once") {
    return scheduled;
  }

  const selectedDays = Array.isArray(daysOfWeek) && daysOfWeek.length
    ? [...new Set(daysOfWeek.map((n) => Number(n)))]
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        .sort((a, b) => a - b)
    : [];
  const intervalDays =
    frequencySafe === "interval" ? Math.max(1, Number(repeatInterval) || 1) : 1;

  const stepParts = (y, m, d) => {
    if (frequencySafe === "daily") return addDaysToParts(y, m, d, 1);
    if (frequencySafe === "interval") return addDaysToParts(y, m, d, intervalDays);
    if (frequencySafe === "weekly") return addDaysToParts(y, m, d, selectedDays.length ? 1 : 7);
    // monthly
    let nm = m + 1;
    let ny = y;
    if (nm > 11) {
      nm = 0;
      ny += 1;
    }
    return { year: ny, month: nm, day: Math.min(d, daysInMonth(ny, nm)) };
  };

  // Weekday filter for weekly-with-days schedules. The weekday is derived from
  // the calendar date (UTC parts), never from the instant — a wall-clock time
  // can cross days in UTC while staying the same calendar day in `tz`.
  const dayAllowed = (instantMs) => {
    if (!selectedDays.length) return true;
    const wall = wallPartsOf(instantMs, tz);
    const weekday = new Date(
      Date.UTC(Number(wall.year), Number(wall.month) - 1, Number(wall.day))
    ).getUTCDay();
    return selectedDays.includes(weekday);
  };

  // Recurring: find the first occurrence > now that respects the weekly-day
  // filter. Advance from the BASE calendar date (skipping any historical
  // occurrences) so a long-down backend never replays/bursts past cycles.
  let guard = 0;
  const MAX_ITER = 4000; // far beyond any sane gap (4000 days ~ 11 years)
  let y = parts.year;
  let m = parts.month;
  let d = parts.day;
  while (guard < MAX_ITER) {
    scheduled = zonedToUtc(y, m, d, tp.hour, tp.minute, tz);
    if (scheduled.getTime() > now && dayAllowed(scheduled.getTime())) break;
    const next = stepParts(y, m, d);
    y = next.year;
    m = next.month;
    d = next.day;
    guard += 1;
  }
  if (guard >= MAX_ITER) {
    // Extreme ages (tens of years overdue): bail deterministically to the base
    // date/time rather than looping forever (weekly-with-days steps daily, so
    // its worst case is 7 iterations per week — 4000 covers ~571 weeks).
    scheduled = zonedToUtc(parts.year, parts.month, parts.day, tp.hour, tp.minute, tz);
  }
  return scheduled;
};

/**
 * Returns the next occurrence for a recurring reminder strictly after the
 * given occurrence instant (used by the scheduler after firing).
 */
const advanceOccurrence = (reminder, fromMs, now = Date.now()) =>
  computeNextRunAt({
    date: reminder.date,
    time: reminder.time,
    timezone: reminder.timezone,
    frequency: reminder.frequency,
    repeatInterval: reminder.repeatInterval,
    daysOfWeek: reminder.daysOfWeek,
    now: fromMs !== undefined && fromMs !== null ? fromMs : now,
  });

/**
 * YYYY-MM-DD calendar-day key for a wall-clock timezone (used by the
 * "upcoming"/"today" endpoints, whose sections are calendar-day based).
 */
const zonedDateKey = (utcMs, timeZone) => {
  const wall = wallPartsOf(utcMs, timeZone);
  return `${Number(wall.year)}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
};

const todayKey = (timeZone, now = Date.now()) => zonedDateKey(now, timeZone);

/**
 * Combines date + time + timezone into a short human string for notification
 * messages (the wall-clock the user entered, no timezone conversion).
 */
const scheduledLabel = (date, time) => {
  const iso = msToIsoString(date) || new Date().toISOString();
  return `${iso.slice(0, 10)} at ${String(time)}`;
};

// Human-friendly display label per reminder type (Phase 8). Used by the
// scheduler's notification messages and the frontend type badges.
const REMINDER_TYPE_LABELS = {
  feeding: "Food",
  medicine: "Medicine",
  vaccination: "Vaccination",
  grooming: "Grooming",
  appointment: "Appointment",
  exercise: "Walk",
  droplet: "Water",
  bath: "Bath",
  custom: "Custom",
};

/* =====================================================
   HELPERS FOR PRODUCERS (Appointment auto-reminder)
   ===================================================== */

const APPOINTMENT_TITLE_PREFIX = "Appointment";

const appointmentTitle = (appointmentType) => {
  const t = typeof appointmentType === "string" ? appointmentType : "";
  if (!t) return APPOINTMENT_TITLE_PREFIX;
  return `${APPOINTMENT_TITLE_PREFIX} - ${t.charAt(0).toUpperCase()}${t.slice(1)}`;
};

/**
 * Create or refresh the single appointment reminder for an appointment
 * (precise by source+sourceId — no more fuzzy title+slot matching). Reuses the
 * same next-occurrence math so the reminder targets the appointment's slot.
 */
const upsertAppointmentReminder = async ({ user, appointment }) => {
  const Reminder = require("../models/Reminder");
  const date = appointment.date;
  const time = appointment.time;
  const nextRunAt = computeNextRunAt({
    date,
    time,
    timezone: "UTC",
    frequency: "once",
  });

  return Reminder.findOneAndUpdate(
    { user: user._id ? user._id : user, source: "appointment", sourceId: appointment._id },
    {
      $set: {
        title: appointmentTitle(appointment.type),
        type: "appointment",
        description: appointment.notes || `Scheduled ${appointment.type || "checkup"} appointment.`,
        pet: appointment.pet,
        date,
        time,
        timezone: "UTC",
        frequency: "once",
        isActive: true,
        isCompleted: false,
        nextRunAt,
        lastStatus: "pending",
        lastError: "",
        failedAttempts: 0,
      },
      $unset: { claimedUntil: "" },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
};

/**
 * Reschedule the appointment's own reminder when the appointment slot moves.
 * Does nothing when no reminder exists (defensive; creation happens on booking).
 */
const rescheduleAppointmentReminder = async ({ user, appointment }) => {
  const Reminder = require("../models/Reminder");
  const nextRunAt = computeNextRunAt({
    date: appointment.date,
    time: appointment.time,
    timezone: "UTC",
    frequency: "once",
  });

  const res = await Reminder.findOneAndUpdate(
    { user: user._id ? user._id : user, source: "appointment", sourceId: appointment._id },
    {
      $set: {
        date: appointment.date,
        time: appointment.time,
        title: appointmentTitle(appointment.type),
        nextRunAt,
        lastStatus: "pending",
        lastError: "",
        failedAttempts: 0,
        isActive: true,
        isCompleted: false,
      },
      $unset: { claimedUntil: "" },
    },
    { new: true }
  );

  // Compatibility fallback for legacy appointment reminders created before the
  // source linkage existed: match the old fuzzy slot when no linked reminder
  // was found, updating every matching active row (best effort).
  if (!res) {
    await Reminder.updateMany(
      {
        user: user._id ? user._id : user,
        pet: appointment.pet,
        title: appointmentTitle(appointment.type),
        type: "appointment",
        date: appointment.date,
        time: appointment.time,
        isActive: true,
      },
      { $set: { date: appointment.date, time: appointment.time, nextRunAt } }
    );
  }
  return res;
};

/**
 * Cancel the appointment's own reminder (deactivate) on appointment cancel.
 */
const cancelAppointmentReminder = async ({ user, appointment }) => {
  const Reminder = require("../models/Reminder");
  const res = await Reminder.findOneAndUpdate(
    { user: user._id ? user._id : user, source: "appointment", sourceId: appointment._id },
    { $set: { isActive: false, lastStatus: "skipped", lastError: "" } },
    { new: true }
  );

  if (!res) {
    // Legacy fallback (pre-linkage reminders): deactivate the fuzzy-slot rows.
    await Reminder.updateMany(
      {
        user: user._id ? user._id : user,
        pet: appointment.pet,
        date: appointment.date,
        time: appointment.time,
        type: "appointment",
        isActive: true,
      },
      { $set: { isActive: false, lastStatus: "skipped" } }
    );
  }
  return res;
};

/* =====================================================
   HELPERS FOR PRODUCERS (Pet Diet feeding schedule, Phase 9)
   =====================================================
   Each active meal on a pet's diet profile owns ONE daily "feeding"
   reminder, linked precisely by source "diet" + sourceId = meal._id (same
   one-reminder-per-producer guarantee as appointments). Upserting keeps the
   same reminder aligned when a meal's time/label changes; deactivating turns
   it off when the meal is removed or disabled. Times are interpreted in the
   diet's own timezone (the user's wall-clock), exactly like manual reminders.
 */

const DIET_ANCHOR_RE = /^[0-9a-fA-F]{24}$/;

/**
 * Create or refresh the single daily feeding reminder for one diet meal.
 * Idempotent by (user, source, sourceId) — no duplicates across re-saves.
 * @param {object} args { user, pet, meal, timezone, context? }
 */
const upsertFeedingMealReminder = async ({ user, pet, meal, timezone = "UTC", context = "" }) => {
  const Reminder = require("../models/Reminder");
  const mealTime = typeof meal.time === "string" ? meal.time.trim() : "";
  // Anchor on the current calendar day; recurring math steps forward to the
  // first future occurrence, so the anchor day itself never matters.
  const anchor = new Date();
  const nextRunAt = computeNextRunAt({
    date: anchor,
    time: mealTime,
    timezone,
    frequency: "daily",
  });

  const label = typeof meal.label === "string" && meal.label.trim()
    ? meal.label.trim()
    : "mealtime";
  const title = `Feed ${label}`;
  const description = String(context || "")
    .slice(0, 1000);
  const mealId = meal._id ? meal._id : meal;

  return Reminder.findOneAndUpdate(
    { user: user._id ? user._id : user, source: "diet", sourceId: mealId },
    {
      $set: {
        title,
        type: "feeding",
        description,
        pet,
        date: anchor,
        time: mealTime,
        timezone: isValidTimeZone(timezone) ? timezone : "UTC",
        frequency: "daily",
        priority: "normal",
        notificationEnabled: true,
        isActive: true,
        isCompleted: false,
        nextRunAt,
        lastStatus: "pending",
        lastError: "",
        failedAttempts: 0,
      },
      $unset: { claimedUntil: "" },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
};

/**
 * Deactivate a single meal's feeding reminder (meal removed / disabled).
 * Scoped strictly to (user, source, sourceId) — can never nudge another row.
 */
const deactivateFeedingMealReminder = async ({ user, mealId }) => {
  const Reminder = require("../models/Reminder");
  const id = mealId && mealId._id ? mealId._id : mealId;
  if (!id || !DIET_ANCHOR_RE.test(String(id))) return null;
  return Reminder.findOneAndUpdate(
    { user: user._id ? user._id : user, source: "diet", sourceId: id },
    { $set: { isActive: false, lastStatus: "skipped", lastError: "Meal removed from diet." } },
    { new: true }
  );
};

/**
 * Deactivate every feeding reminder belonging to a set of meal ids (diet
 * profile deletion). Best effort; silently no-ops on an empty list.
 */
const deactivateDietMealReminders = async ({ user, mealIds }) => {
  const Reminder = require("../models/Reminder");
  const ids = Array.isArray(mealIds) ? mealIds.filter((id) => DIET_ANCHOR_RE.test(String(id))) : [];
  if (!ids.length) return 0;
  const res = await Reminder.updateMany(
    { user: user._id ? user._id : user, source: "diet", sourceId: { $in: ids } },
    { $set: { isActive: false, lastStatus: "skipped", lastError: "Diet profile removed." } }
  );
  return res.modifiedCount || 0;
};

/* =====================================================
   OWNER-SCOPED REMINDER OPERATIONS (shared by the reminder routes and the
   Phase 10 AI tool layer)
   =====================================================
   The list/create/update paths below were extracted from reminder.controller.js
   so both entry points enforce identical validation and scheduling rules.
   Ownership always comes from the authenticated caller context.
 */

const REMINDER_FILTERS = ["active", "completed", "inactive", "all"];

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

const weekdaysArray = (value) => (Array.isArray(value) ? value.map(Number) : []);

/**
 * List a user's reminders for a status filter with an effective next-run
 * instant attached (materializes legacy rows deterministically for ordering).
 */
const listReminders = async ({ user, filter = "active", extra = {} }) => {
  const Reminder = require("../models/Reminder");
  const base = { user: user._id || user.id, ...extra };
  if (filter === "completed") {
    Object.assign(base, { isCompleted: true });
  } else if (filter === "inactive") {
    Object.assign(base, { isActive: false });
  } else if (filter !== "all") {
    Object.assign(base, { isActive: true, isCompleted: false });
  }

  const rows = await Reminder.find(base)
    .populate("pet", "name species images")
    .lean();

  const now = Date.now();
  for (const r of rows) {
    r.effectiveNext = r.nextRunAt
      ? new Date(r.nextRunAt).getTime()
      : computeNextRunAt({
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
    if (a.effectiveNext !== b.effectiveNext) return a.effectiveNext - b.effectiveNext;
    return String(a.date).localeCompare(String(b.date));
  });

  return rows;
};

/**
 * Create one owned reminder. Returns { ok, status, body }.
 */
const createReminderForUser = async ({ user, input }) => {
  const Reminder = require("../models/Reminder");
  const { title, type, date, time, pet } = input;

  if (!title || !type || !date || !time) {
    return { ok: false, status: 400, body: { message: "Title, type, date and time are required." } };
  }

  if (typeof title !== "string" || title.trim().length > 200) {
    return { ok: false, status: 400, body: { message: "Invalid title." } };
  }

  if (typeof type !== "string" || !REMINDER_TYPES.includes(type)) {
    return { ok: false, status: 400, body: { message: "Invalid reminder type." } };
  }

  if (!pet) {
    return { ok: false, status: 400, body: { message: "A pet is required." } };
  }
  const petOk = await petService.ownedPetResult({ user, petId: pet });
  if (!petOk.ok) {
    return { ok: false, status: petOk.status, body: { message: petOk.message } };
  }

  const frequency = input.frequency || "once";
  if (!REMINDER_FREQUENCIES.includes(frequency)) {
    return { ok: false, status: 400, body: { message: "Invalid frequency." } };
  }

  const schedErr = validateScheduleConfig(frequency, input.repeatInterval, input.daysOfWeek);
  if (schedErr) {
    return { ok: false, status: 400, body: { message: schedErr } };
  }

  const priority = input.priority === undefined ? "normal" : input.priority;
  if (!REMINDER_PRIORITIES.includes(priority)) {
    return { ok: false, status: 400, body: { message: "Invalid priority." } };
  }

  if (input.notificationEnabled !== undefined && typeof input.notificationEnabled !== "boolean") {
    return { ok: false, status: 400, body: { message: "Invalid notificationEnabled." } };
  }

  const reminderDate = new Date(date);
  if (Number.isNaN(reminderDate.getTime())) {
    return { ok: false, status: 400, body: { message: "Invalid date." } };
  }

  const timeErr = timeError(time);
  if (timeErr) {
    return { ok: false, status: 400, body: { message: timeErr } };
  }

  const timezone = input.timezone === undefined ? "UTC" : input.timezone;
  if (!isValidTimeZone(timezone)) {
    return { ok: false, status: 400, body: { message: "Invalid timezone." } };
  }

  const repeatInterval = frequency === "interval" ? Number(input.repeatInterval) : 1;
  const daysOfWeek = frequency === "weekly" ? weekdaysArray(input.daysOfWeek) : [];

  const reminder = await Reminder.create({
    user: user._id || user.id,
    title: title.trim(),
    type,
    description: typeof input.description === "string" ? input.description.slice(0, 1000) : "",
    date: reminderDate,
    time: time.trim(),
    frequency,
    timezone,
    repeatInterval,
    daysOfWeek,
    priority,
    notificationEnabled: input.notificationEnabled !== false,
    nextRunAt: computeNextRunAt({
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

  return {
    ok: true,
    status: 201,
    body: { message: "Reminder created successfully.", reminder },
  };
};

/**
 * Update one owned reminder. Returns { ok, status, body }.
 */
const updateReminderForUser = async ({ user, reminderId, input }) => {
  const Reminder = require("../models/Reminder");

  if (!isValidObjectId(reminderId)) {
    return { ok: false, status: 400, body: { message: "Invalid reminder ID." } };
  }

  const reminder = await Reminder.findOne({ _id: reminderId, user: user._id || user.id });
  if (!reminder) {
    return { ok: false, status: 404, body: { message: "Reminder not found." } };
  }

  const allowedFields = [
    "title", "type", "description", "date", "time", "timezone", "frequency",
    "repeatInterval", "daysOfWeek", "priority", "notificationEnabled",
    "isActive", "isCompleted", "pet",
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (input[field] !== undefined) updates[field] = input[field];
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, body: { message: "Nothing to update." } };
  }

  if (updates.title !== undefined && (typeof updates.title !== "string" || updates.title.trim().length > 200)) {
    return { ok: false, status: 400, body: { message: "Invalid title." } };
  }
  if (updates.title !== undefined) updates.title = updates.title.trim();

  if (updates.type !== undefined && !REMINDER_TYPES.includes(updates.type)) {
    return { ok: false, status: 400, body: { message: "Invalid reminder type." } };
  }

  if (updates.frequency !== undefined && !REMINDER_FREQUENCIES.includes(updates.frequency)) {
    return { ok: false, status: 400, body: { message: "Invalid frequency." } };
  }

  const schedErr = validateScheduleConfig(
    updates.frequency !== undefined ? updates.frequency : reminder.frequency,
    updates.repeatInterval,
    updates.daysOfWeek
  );
  if (schedErr) {
    return { ok: false, status: 400, body: { message: schedErr } };
  }

  if (updates.daysOfWeek !== undefined) updates.daysOfWeek = weekdaysArray(updates.daysOfWeek);

  if (updates.priority !== undefined && !REMINDER_PRIORITIES.includes(updates.priority)) {
    return { ok: false, status: 400, body: { message: "Invalid priority." } };
  }

  if (updates.notificationEnabled !== undefined && typeof updates.notificationEnabled !== "boolean") {
    return { ok: false, status: 400, body: { message: "Invalid notificationEnabled." } };
  }

  if (updates.description !== undefined && typeof updates.description !== "string") {
    return { ok: false, status: 400, body: { message: "Invalid description." } };
  }
  if (updates.description !== undefined) updates.description = updates.description.slice(0, 1000);

  if (updates.time !== undefined) {
    const tErr = timeError(updates.time);
    if (tErr) {
      return { ok: false, status: 400, body: { message: tErr } };
    }
    updates.time = updates.time.trim();
  }

  if (updates.timezone !== undefined && !isValidTimeZone(updates.timezone)) {
    return { ok: false, status: 400, body: { message: "Invalid timezone." } };
  }

  if (updates.date !== undefined) {
    const d = new Date(updates.date);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, status: 400, body: { message: "Invalid date." } };
    }
    updates.date = d;
  }

  if (updates.isActive !== undefined && typeof updates.isActive !== "boolean") {
    return { ok: false, status: 400, body: { message: "Invalid isActive." } };
  }

  if (updates.isCompleted !== undefined && typeof updates.isCompleted !== "boolean") {
    return { ok: false, status: 400, body: { message: "Invalid isCompleted." } };
  }

  if (updates.pet !== undefined && updates.pet !== null && updates.pet !== "") {
    const ok = await petService.ownedPetResult({ user, petId: updates.pet });
    if (!ok.ok) {
      return { ok: false, status: ok.status, body: { message: ok.message } };
    }
  }

  Object.assign(reminder, updates);

  reminder.repeatInterval = reminder.frequency === "interval" ? Math.max(1, Number(reminder.repeatInterval) || 1) : 1;
  reminder.daysOfWeek = reminder.frequency === "weekly" ? weekdaysArray(reminder.daysOfWeek) : [];

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
      reminder.nextRunAt = computeNextRunAt({
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

  return { ok: true, status: 200, body: { message: "Reminder updated successfully.", reminder } };
};

module.exports = {
  TIME_RE,
  timeError,
  timeToParts,
  calendarPartsFromDate,
  isValidTimeZone,
  tzOffsetMs,
  zonedToUtc,
  computeNextRunAt,
  advanceOccurrence,
  scheduledLabel,
  zonedDateKey,
  todayKey,
  REMINDER_TYPE_LABELS,
  upsertAppointmentReminder,
  rescheduleAppointmentReminder,
  cancelAppointmentReminder,
  appointmentTitle,
  upsertFeedingMealReminder,
  deactivateFeedingMealReminder,
  deactivateDietMealReminders,
  REMINDER_FILTERS,
  validateScheduleConfig,
  listReminders,
  createReminderForUser,
  updateReminderForUser,
};