// =====================================================================
// FAMIPET — Phase 9 (Diet & Nutrition) scheduler-integration check
// Verifies the full producer loop for a diet's feeding schedule:
//
//   PetDiet meal time
//     -> reminderService.upsertFeedingMealReminder()
//        -> Reminder (type "feeding", source "diet", sourceId meal._id,
//           frequency "daily")      [the exact path the diet controller uses]
//     -> reminderScheduler.processDueReminders(due occurrence)
//        -> Notification service -> in-app Notification (Phase 5/8 style)
//     -> occurrence consumed/advanced (fired), then advanced to next day
//
// Second scenario: user-level preference (channels.inApp=false) suppresses
// the notification but the feeding occurrence is still consumed (skipped),
// never retried — same contract the reminder scheduler documents.
//
// Run:  MSYS_NO_PATHCONV=1 docker run --rm --network fami-pet_famipet-backend-net
//       -v "$(pwd -W)/compose/scripts:/suite:ro" -w /app --entrypoint node
//       famipet-backend:production /suite/phase9-diet-scheduler.cjs
// Exit 0 => pass, 1 => fail.
// =====================================================================

const mongoose = require("/app/node_modules/mongoose");
const UserModel = require("/app/models/User");
const Pet = require("/app/models/Pet");
const Reminder = require("/app/models/Reminder");
const PetDiet = require("/app/models/PetDiet");
const Notification = require("/app/models/Notification");
const NotificationPreference = require("/app/models/NotificationPreference");
const reminderService = require("/app/services/reminder.service");
const scheduler = require("/app/services/reminder-scheduler.service");

let passed = 0;
let failed = 0;
const ok = (c, m) => {
  if (c) { passed += 1; console.log(`  PASS ${m}`); }
  else { failed += 1; console.log(`  FAIL ${m}`); }
};

const pad = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

const DUE_MS = 60 * 60 * 1000;

(async () => {
  await mongoose.connect("mongodb://mongodb:27017/petDB", { serverSelectionTimeoutMS: 15000 });
  const tag = `p9svc-${Date.now()}`;

  const userDoc = await UserModel.create({
    name: "Svc", email: `${tag}@famipet.test`, password: "Password123!", isVerified: true,
  });
  const pet = await Pet.create({
    name: "Ziggy", species: "dog", gender: "male", age: 2,
    breed: new mongoose.Types.ObjectId(),
    owner: userDoc._id, status: "available",
  });
  console.log(`fixtures user=${userDoc._id} pet=${pet._id}`);

  try {
    // ---- 1) profile + feeding reminders (controller's exact producer call) ---
    console.log("-- A producer path --");
    const diet = await PetDiet.create({
      user: userDoc._id, pet: pet._id, foodType: "dry", brand: "Acme",
      dailyPortionGrams: 200,
      meals: [{ label: "Breakfast", time: "08:00", portionGrams: 100 }],
    });
    const meal = diet.meals[0];

    const rem1 = await reminderService.upsertFeedingMealReminder({
      user: userDoc._id, pet: pet._id, meal, timezone: "UTC", context: "Acme 200 g/day",
    });
    ok(!!rem1, "feeding reminder created via shared producer helper");
    ok(rem1.type === "feeding" && rem1.source === "diet" && String(rem1.sourceId) === String(meal._id),
      "reminder linked source=diet + sourceId=meal._id");
    ok(rem1.frequency === "daily" && rem1.isActive === true && rem1.notificationEnabled === true,
      "reminder daily + active + notifications on");
    ok(rem1.timezone === "UTC" && rem1.time === "08:00" && /Feed Breakfast/.test(rem1.title),
      "reminder carries meal time/timezone/title");
    ok(rem1.nextRunAt && !Number.isNaN(new Date(rem1.nextRunAt).getTime()) &&
      new Date(rem1.nextRunAt).getTime() > Date.now(),
      "reminder scheduled at first future occurrence");

    // Upserting again with the same meal must NOT duplicate the row.
    const rem1b = await reminderService.upsertFeedingMealReminder({
      user: userDoc._id, pet: pet._id, meal, timezone: "UTC",
    });
    ok(String(rem1b._id) === String(rem1._id), "re-upsert keeps the same reminder (no duplicate)");

    // ---- 2) make the occurrence due and let the scheduler fire it ----------
    console.log("-- B scheduler fires feeding reminder -> notification --");
    const past = new Date(Date.now() - DUE_MS);
    const pastTime = hhmm(past);
    await Reminder.updateOne(
      { _id: rem1._id },
      { $set: { time: pastTime, nextRunAt: past } }
    );

    const totalBefore = await Notification.countDocuments({ user: userDoc._id });
    const summary = await scheduler.processDueReminders({ now: Date.now(), batchLimit: 20 });
    console.log("summary", JSON.stringify(summary));

    const notifs = await Notification.find({ user: userDoc._id }).lean();
    ok(notifs.length === totalBefore + 1, `exactly one notification fired (${notifs.length - totalBefore})`);
    const notif = notifs[0];
    ok(notif.type === "reminder" && notif.category === "reminder", "notification type/category reminder");
    ok(String(notif.referenceId) === String(rem1._id), "notification references the reminder");
    ok(notif.metadata && notif.metadata.reminderType === "feeding", "notification metadata.reminderType=feeding");
    ok(/Food reminder is due/.test(notif.message), `message uses Food label (got "${notif.message}")`);
    ok(notif.message.indexOf("Ziggy") !== -1, "message includes pet name");
    ok(/diet-created|Feed Breakfast/.test(notif.title), "title from reminder");

    const rem1After = await Reminder.findById(rem1._id).lean();
    ok(rem1After.lastStatus === "fired", "reminder lastStatus fired");
    ok(rem1After.isActive === true && rem1After.isCompleted === false, "daily reminder stays active");
    ok(rem1After.nextRunAt && new Date(rem1After.nextRunAt).getTime() > past.getTime(),
      "reminder advanced to next daily occurrence");

    // ---- 3) preference-off: feeding reminder consumed silently -------------
    console.log("-- C preference-off consumes silently --");
    await NotificationPreference.create({
      user: userDoc._id, channels: { inApp: false, email: false, push: false },
    });
    await PetDiet.updateOne(
      { _id: diet._id },
      { $push: { meals: { label: "Dinner", time: "18:00", portionGrams: 100 } } }
    );
    const diet2 = await PetDiet.findById(diet._id).lean();
    const meal2 = diet2.meals[1];

    const rem2 = await reminderService.upsertFeedingMealReminder({
      user: userDoc._id, pet: pet._id, meal: meal2, timezone: "UTC",
    });
    await Reminder.updateOne(
      { _id: rem2._id },
      { $set: { time: pastTime, nextRunAt: new Date(Date.now() - 1 * 60 * 1000) } }
    );

    const nBefore = await Notification.countDocuments({ user: userDoc._id, _id: { $ne: notif._id } });
    await scheduler.processDueReminders({ now: Date.now(), batchLimit: 20 });

    const nAfter = await Notification.countDocuments({ user: userDoc._id, _id: { $ne: notif._id } });
    ok(nAfter === nBefore, "in-app channel off -> no new notification");
    const rem2After = await Reminder.findById(rem2._id).lean();
    ok(rem2After.lastStatus === "skipped", "feeding occurrence consumed silently (skipped)");
    ok(rem2After.nextRunAt && new Date(rem2After.nextRunAt).getTime() > Date.now() - 1 * 60 * 1000,
      "suppressed occurrence still advances to next day (no retry loop)");
  } finally {
    await Reminder.deleteMany({ user: userDoc._id });
    await Notification.deleteMany({ user: userDoc._id });
    await NotificationPreference.deleteMany({ user: userDoc._id });
    await PetDiet.deleteMany({ user: userDoc._id });
    await Pet.deleteMany({ _id: pet._id });
    await UserModel.deleteMany({ _id: userDoc._id });
  }

  await mongoose.disconnect();
  console.log(`== RESULT: ${passed} passed, ${failed} failed ==`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log("crash", e);
  process.exit(2);
});