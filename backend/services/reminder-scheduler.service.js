// =====================================================
// REMINDER SCHEDULER SERVICE (Phase 7)
// =====================================================
// Persistent, restart-safe reminder execution for the API process. Design:
//
//   - SINGLE in-process poller (no separate worker container, no new port, no
//     Redis/RabbitMQ). The existing compose stack runs one backend process; the
//     scheduler shares it and is isolated by module.
//   - PERSISTENT STATE: every schedule decision lives in MongoDB on each
//     Reminder (`nextRunAt`, `claimedUntil`, `lastStatus`, `failedAttempts`,
//     ...). Nothing scheduling-related is held in memory, so a restart never
//     loses a due reminder.
//   - ATOMIC CLAIMS: a pass claims a due reminder with an atomic
//     findOneAndUpdate (lease until `claimedUntil`). Overlapping cycles /
//     processes cannot both process the same reminder (the second one sees the
//     lease). A crashed pass leaves a stale lease that the next tick reclaims.
//   - IDEMPOTENCY: each fired occurrence is sent to the Notification Service
//     with a unique dedupKey (`reminder-fire:<id>:<occurrence-ms>`), so even a
//     re-fire after a crash cannot create a duplicate notification.
//   - BOUNDED WORK: each pass handles at most `batchLimit` eligible reminders
//     and yields between passes; a large backlog drains slowly instead of
//     blocking the API.
//   - MISSED-REMINDER POLICY (documented): overdue reminders fire on the next
//     pass (once). Recurring reminders fire the current occurrence and then
//     advance from THAT occurrence by one interval; a backend that was down
//     across many cycles replays at most one occurrence per pass and never
//     bursts. Legacy recurring reminders with no `nextRunAt` are materialized
//     directly to their FIRST FUTURE occurrence (no historical notifications).
//   - FAILURE POLICY: a failed notification leaves the reminder due, bumps
//     `failedAttempts`, and does NOT advance `nextRunAt` — a failure never
//     counts as a delivery. After `maxAttempts` the reminder is deactivated
//     (isActive:false, lastStatus:"failed") so there is no permanent retry
//     loop. The user can re-activate it from the UI (this resets the counters).
//   - PREFERENCE-OFF / DEDUP POLICY: when the Notification Service reports
//     `success:true` + `skipped:true` (in-app channel or type disabled,
//     duplicate-within-window), that occurrence is CONSUMED — the user opted
//     out of it. The occurrence advances/completes with lastStatus "skipped";
//     it must NOT retry or the reminder would spin forever.
//   - MISSING TARGETS: reminders whose user no longer exists are deactivated
//     (skipped-no-user). Reminders with a pet that is missing or inactive are
//     skipped for that occurrence — once reminders are deactivated, recurring
//     ones advance to the next occurrence (skipped-no-pet).
//   - TIMEZONES: occurrence instants are computed per-reminder from
//     date+time+timezone by reminder.service (canonical UTC). See that file.
//   - REPEAT RULES (Phase 8): "interval" repeats every `repeatInterval` days;
//     "weekly" with a non-empty `daysOfWeek` repeats on those weekdays. Both
//     are honored at materialization, pet-skip advance and normal advance.
//   - NOTIFICATION-OFF (Phase 8): a reminder with `notificationEnabled:false`
//     still runs on schedule, but each occurrence is CONSUMED silently
//     (lastStatus "skipped", never creates a Notification). Routine hygiene
//     chores can be tracked without inbox noise.
//   - NOTIFICATION MESSAGE: built from the pet name + `REMINDER_TYPE_LABELS`
//     (e.g. "Bruno's Vaccination reminder is due.") and carries the reminder's
//     `priority` into the Notification record.
//
// Failure/restart semantics are verified deterministically in the Phase 7
// in-container suite (controlled `now` + monkeypatched delivery).

const Reminder = require("../models/Reminder");
const User = require("../models/User");
const Pet = require("../models/Pet");
const notificationService = require("./notification.service");
const {
  computeNextRunAt,
  scheduledLabel,
  REMINDER_TYPE_LABELS,
} = require("./reminder.service");

// Runtime knobs (env-overridable, all bounded).
const POLL_INTERVAL_MS = Number(process.env.REMINDER_POLL_INTERVAL_MS) || 30 * 1000;
const BATCH_LIMIT = Number(process.env.REMINDER_BATCH_LIMIT) || 100;
const CLAIM_TTL_MS = Number(process.env.REMINDER_CLAIM_TTL_MS) || 2 * 60 * 1000;
const MAX_ATTEMPTS = Number(process.env.REMINDER_MAX_ATTEMPTS) || 3;

const dayChangedLog = { date: "" };
let timer = null;
let running = false;

/**
 * Advance a recurring reminder to its next occurrence (strictly after the
 * fired one), or mark a once-reminder complete. Honors Phase 8 repeat rules.
 */
const advanceOrComplete = (reminder, occurrenceMs) => {
  if (reminder.frequency === "once") {
    return { completed: true, nextRunAt: null };
  }
  return {
    completed: false,
    nextRunAt: computeNextRunAt({
      date: reminder.date,
      time: reminder.time,
      timezone: reminder.timezone,
      frequency: reminder.frequency,
      repeatInterval: reminder.repeatInterval,
      daysOfWeek: reminder.daysOfWeek,
      now: occurrenceMs + 1,
    }),
  };
};

const log = (msg) => console.log(`[Scheduler] ${msg}`);

const msToSlots = (ms) => {
  const d = new Date(ms);
  return `${d.toISOString().slice(0, 19)}Z`;
};

/**
 * A single scheduler pass. Deterministic and testable: `now` may be injected
 * (defaults to Date.now()). Never throws.
 *
 * @returns {Promise<object>} pass summary { scanned, fired, failed, skipped, disabled, materialized }
 */
const processDueReminders = async ({
  now = Date.now(),
  batchLimit = BATCH_LIMIT,
  claimTtlMs = CLAIM_TTL_MS,
  maxAttempts = MAX_ATTEMPTS,
} = {}) => {
  const summary = {
    now: new Date(now).toISOString(),
    materialized: 0,
    scanned: 0,
    fired: 0,
    failed: 0,
    skipped: 0,
    disabled: 0,
  };
  const startedAt = now;

  try {
    // 1) MATERIALIZE legacy rows without a nextRunAt (created pre-Phase 7).
    // once    -> nextRunAt = its date/time (overdue means it will fire).
    // recurring-> nextRUN at the FIRST FUTURE occurrence (never back-fire).
    const legacy = await Reminder.find({
      isActive: true,
      isCompleted: false,
      nextRunAt: { $exists: false },
    })
      .select("_id user pet date time timezone frequency repeatInterval daysOfWeek")
      .limit(batchLimit)
      .lean();

    for (const row of legacy) {
      const nextRunAt = computeNextRunAt({
        date: row.date,
        time: row.time,
        timezone: row.timezone,
        frequency: row.frequency,
        repeatInterval: row.repeatInterval,
        daysOfWeek: row.daysOfWeek,
        now: startedAt,
      });
      await Reminder.updateOne(
        { _id: row._id, isActive: true, isCompleted: false, nextRunAt: { $exists: false } },
        { $set: { nextRunAt } }
      );
      summary.materialized += 1;
    }

    // 2) CLAIM + PROCESS due reminders (lease-gated, so concurrent passes or a
    //    restart mid-pass can never double-process).
    // NOTE: the two field groups MUST be merged through $and — two bare `$or`
    // keys in one object are a JS duplicate-key (last wins) and would silently
    // drop the due-time condition.
    const dueCondition = {
      isActive: true,
      isCompleted: false,
      $and: [
        {
          $or: [
            { nextRunAt: { $lte: now } },
            { nextRunAt: { $exists: false } },
          ],
        },
        {
          $or: [
            { claimedUntil: { $exists: false } },
            { claimedUntil: { $lte: now } },
          ],
        },
      ],
    };

    const candidates = await Reminder.find(dueCondition)
      .sort({ nextRunAt: 1 })
      .limit(batchLimit)
      .lean();

    for (const candidate of candidates) {
      summary.scanned += 1;

      const claimed = await Reminder.findOneAndUpdate(
        {
          _id: candidate._id,
          isActive: true,
          isCompleted: false,
          $and: [
            {
              $or: [
                { nextRunAt: { $lte: now } },
                { nextRunAt: { $exists: false } },
              ],
            },
            {
              $or: [
                { claimedUntil: { $exists: false } },
                { claimedUntil: { $lte: now } },
              ],
            },
          ],
        },
        { $set: { claimedUntil: new Date(startedAt + claimTtlMs) } },
        { new: true }
      );
      if (!claimed) continue; // another pass owns it now
      await processClaim(claimed, { now: startedAt, maxAttempts, summary });
    }
  } catch (error) {
    log(`pass failed: ${error.message}`);
    summary.error = error.message;
  }

  return summary;
};

/**
 * Handle one claimed reminder: validate targets, deliver via the shared
 * Notification Service, advance/complete/deactivate + record state.
 */
const processClaim = async (reminder, { now, maxAttempts, summary }) => {
  const unlock = () => Reminder.updateOne(
    { _id: reminder._id },
    { $unset: { claimedUntil: "" } }
  );

  try {
    // --- Target existence ---
    const user = await User.findById(reminder.user).select("_id").lean();
    if (!user) {
      await Reminder.updateOne(
        { _id: reminder._id },
        { $set: { isActive: false, lastStatus: "skipped-no-user", lastError: "User no longer exists." } }
      );
      summary.skipped += 1;
      return;
    }

    if (reminder.pet) {
      const pet = await Pet.findById(reminder.pet).select("status").lean();
      if (!pet || pet.status === "inactive") {
        if (reminder.frequency === "once") {
          await Reminder.updateOne(
            { _id: reminder._id },
            { $set: { isActive: false, lastStatus: "skipped-no-pet", lastError: "Pet missing or inactive." } }
          );
        } else {
          const nextRunAt = computeNextRunAt({
            date: reminder.date,
            time: reminder.time,
            timezone: reminder.timezone,
            frequency: reminder.frequency,
            repeatInterval: reminder.repeatInterval,
            daysOfWeek: reminder.daysOfWeek,
            now: reminder.nextRunAt ? reminder.nextRunAt.getTime() + 1 : now,
          });
          await Reminder.updateOne(
            { _id: reminder._id },
            {
              $set: { nextRunAt, lastStatus: "skipped-no-pet", lastError: "" },
              $unset: { claimedUntil: "" },
            }
          );
        }
        summary.skipped += 1;
        return;
      }
    }

    // --- Prefer a deterministic once-with-now content string ---
    const petDoc = reminder.pet
      ? await Pet.findById(reminder.pet).select("name").lean()
      : null;
    const petName = petDoc && petDoc.name ? petDoc.name : "";
    const typeLabel = REMINDER_TYPE_LABELS[reminder.type] || reminder.type;
    const label = scheduledLabel(reminder.date, reminder.time);

    const occurrenceMs = reminder.nextRunAt
      ? reminder.nextRunAt.getTime()
      : now;
    const dedupKey = `reminder-fire:${String(reminder._id)}:${occurrenceMs}`;

    // --- Notification-off policy (Phase 8): consume silently, never notify ---
    // The reminder still runs on schedule so routines are trackable, but no
    // Notification record is created. The occurrence advances/completes as if
    // delivered, with lastStatus "skipped".
    if (reminder.notificationEnabled === false) {
      const nextGap = advanceOrComplete(reminder, occurrenceMs);
      await Reminder.updateOne(
        { _id: reminder._id },
        {
          $set: {
            lastFiredAt: new Date(now),
            lastStatus: "skipped",
            lastError: "Notifications disabled.",
            failedAttempts: 0,
            ...(nextGap.completed
              ? { isCompleted: true, nextRunAt: null }
              : { nextRunAt: nextGap.nextRunAt }),
          },
          $unset: { claimedUntil: "" },
        }
      );
      summary.skipped += 1;
      return;
    }

    // --- Deliver via the shared Phase 5 service (no push code here) ---
    //
    // IMPORTANT: `success:true` does NOT mean delivered. The Phase 5 contract
    // returns `{ success:true, skipped:true, reason }` when the user's
    // preferences suppressed the in-app record (channel off, type off) or when
    // the event was de-duplicated. Those are intentional, non-retryable
    // outcomes: the occurrence is CONSUMED (advance / complete), because a
    // preference-off reminder must not retry forever. Only `success:false`
    // means the notification genuinely failed and must be retried.
    const result = await notificationService.createNotification({
      user: reminder.user,
      type: "reminder",
      category: "reminder",
      title: reminder.title.slice(0, 200),
      message:
        `${petName ? `${petName}'s ` : ""}${typeLabel} reminder is due` +
        ` (${label}).` +
        (reminder.description
          ? ` ${String(reminder.description).slice(0, 200)}`
          : ""),
      priority: ["low", "normal", "high"].includes(reminder.priority)
        ? reminder.priority
        : "normal",
      referenceType: "reminder",
      referenceId: reminder._id,
      metadata: {
        reminderId: String(reminder._id),
        reminderType: reminder.type,
        reminderTypeLabel: typeLabel,
        priority: ["low", "normal", "high"].includes(reminder.priority)
          ? reminder.priority
          : "normal",
        frequency: reminder.frequency,
        scheduledAt: msToSlots(occurrenceMs),
        pet: petName,
      },
      dedupKey,
      dedupWindowMs: 7 * 24 * 60 * 60 * 1000,
    });

    const delivered = result && result.success === true && !result.skipped;
    const suppressed = result && result.success === true && result.skipped === true;

    if (delivered || suppressed) {
      // Occurrence handled: advance recurring ones from the fired occurrence
      // by exactly one interval (missed cycles drain one per pass, never a
      // burst); complete once-reminders. Delivered → "fired"; preference-off
      // /de-duplicated → "skipped" (still consumes the occurrence).
      const nextGap = advanceOrComplete(reminder, occurrenceMs);
      const completed = nextGap.completed;
      const nextRunAt = nextGap.nextRunAt;

      await Reminder.updateOne(
        { _id: reminder._id },
        {
          $set: {
            lastFiredAt: new Date(now),
            ...(result.notification
              ? { lastNotificationId: result.notification._id }
              : {}),
            lastStatus: delivered ? "fired" : "skipped",
            lastError: delivered ? "" : `Suppressed: ${result.reason}`,
            failedAttempts: 0,
            ...(completed
              ? { isCompleted: true, nextRunAt: null }
              : { nextRunAt }),
          },
          $unset: { claimedUntil: "" },
        }
      );
      summary.fired += 1;
      if (!delivered) summary.skipped += 1;
    } else {
      // Notification did NOT get delivered — never mark as success.
      const reason =
        (result && result.reason) || "notification-create-failed";
      const attempts = (reminder.failedAttempts || 0) + 1;
      if (attempts >= maxAttempts) {
        await Reminder.updateOne(
          { _id: reminder._id },
          {
            $set: {
              isActive: false,
              lastStatus: "failed",
              lastError: `Failed after ${attempts} attempt(s): ${reason}`,
              failedAttempts: attempts,
            },
            $unset: { claimedUntil: "" },
          }
        );
        summary.disabled += 1;
      } else {
        await Reminder.updateOne(
          { _id: reminder._id },
          {
            $set: {
              lastStatus: "failed",
              lastError: reason,
              failedAttempts: attempts,
              // keep nextRunAt as the due occurrence -> retried next pass
            },
            $unset: { claimedUntil: "" },
          }
        );
        summary.failed += 1;
      }
    }
  } catch (error) {
    await unlock();
    summary.failed += 1;
    summary.lastError = error.message;
    log(`reminder ${reminder._id} errored: ${error.message}`);
    try {
      await Reminder.updateOne(
        { _id: reminder._id },
        {
          $set: {
            lastStatus: "failed",
            lastError: `Unhandled: ${error.message}`.slice(0, 500),
            failedAttempts: (reminder.failedAttempts || 0) + 1,
          },
        }
      );
    } catch (e) {
      /* best effort */
    }
  }
};

/**
 * Start the poller. Idempotent (second start is a no-op while running).
 */
const start = () => {
  if (running) {
    return log("already running (no-op)");
  }
  running = true;
  log(
    `started (interval ${POLL_INTERVAL_MS}ms, batch ${BATCH_LIMIT}, claim ${CLAIM_TTL_MS}ms, max-attempts ${MAX_ATTEMPTS})`
  );

  const tick = async () => {
    if (!running) return;
    try {
      const summary = await processDueReminders();
      const stamp = msToSlots(Date.now());
      let dayMark = stamp.slice(0, 10);
      if (dayMark !== dayChangedLog.date) {
        dayChangedLog.date = dayMark;
        log(`run ${stamp} -> ${summary.scanned} scanned, ${summary.fired} fired, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.disabled} disabled, ${summary.materialized} materialized`);
      }
    } catch (error) {
      log(`tick error: ${error.message}`);
    }
  };

  // Run immediately on start (boot recovery), then poll.
  tick();
  timer = setInterval(tick, POLL_INTERVAL_MS);
  if (timer.unref) timer.unref();
};

/**
 * Graceful shutdown (clears the poller).
 */
const stop = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
  log("stopped");
};

module.exports = {
  processDueReminders,
  start,
  stop,
  POLL_INTERVAL_MS,
  BATCH_LIMIT,
  CLAIM_TTL_MS,
  MAX_ATTEMPTS,
};