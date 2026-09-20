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

const addIntervalToParts = (year, month, day, frequency) => {
  if (frequency === "daily") {
    const t = new Date(Date.UTC(year, month, day + 1));
    return {
      year: t.getUTCFullYear(),
      month: t.getUTCMonth(),
      day: t.getUTCDate(),
    };
  }
  if (frequency === "weekly") {
    const t = new Date(Date.UTC(year, month, day + 7));
    return {
      year: t.getUTCFullYear(),
      month: t.getUTCMonth(),
      day: t.getUTCDate(),
    };
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
 * frequency) combination.
 *
 * once:       the exact date/time instant (past allowed -> overdue, fires once).
 * recurring:  the first occurrence strictly after `now` (never fires the past).
 *
 * @returns {Date} canonical UTC instant.
 */
const computeNextRunAt = ({ date, time, timezone, frequency, now = Date.now() }) => {
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

  // Recurring: find the first occurrence > now. Advance from the BASE
  // date/time by whole intervals (skipping any historical occurrences) so a
  // long-down backend never replays/bursts past cycles.
  let guard = 0;
  const MAX_ITER = 4000; // far beyond any sane gap (4000 days ~ 11 years)
  let baseY = parts.year;
  let baseM = parts.month;
  let baseD = parts.day;
  while (scheduled.getTime() <= now && guard < MAX_ITER) {
    const next = addIntervalToParts(baseY, baseM, baseD, frequencySafe);
    baseY = next.year;
    baseM = next.month;
    baseD = next.day;
    scheduled = zonedToUtc(baseY, baseM, baseD, tp.hour, tp.minute, tz);
    guard += 1;
  }
  if (guard >= MAX_ITER) {
    // Extreme ages (tens of years overdue): bail deterministically to the base
    // date/time rather than looping forever.
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
    now,
  });

/**
 * Combines date + time + timezone into a short human string for notification
 * messages (the wall-clock the user entered, no timezone conversion).
 */
const scheduledLabel = (date, time) => {
  const iso = msToIsoString(date) || new Date().toISOString();
  return `${iso.slice(0, 10)} at ${String(time)}`;
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
  upsertAppointmentReminder,
  rescheduleAppointmentReminder,
  cancelAppointmentReminder,
  appointmentTitle,
};