// Deterministic in-process check of the notification-off + interval advance
// scheduler paths (Phase 8) against mongodb, mirroring the Phase 7 suite style.
const mongoose = require("/app/node_modules/mongoose");
const Reminder = require("/app/models/Reminder");
const scheduler = require("/app/services/reminder-scheduler.service");
const notificationService = require("/app/services/notification.service");

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log("FAIL", m); } };

(async () => {
  await mongoose.connect("mongodb://mongodb:27017/petDB", { serverSelectionTimeoutMS: 15000 });
  const tag = `p8svc-${Date.now()}`;
  const user = await mongoose.connection.collection("users").insertOne({
    name: "Svc", email: `${tag}@famipet.test`, password: "x", isVerified: true, createdAt: new Date(), updatedAt: new Date(),
  });
  const pet = await mongoose.connection.collection("pets").insertOne({
    name: "Ziggy", species: "dog", breed: new mongoose.Types.ObjectId(), owner: user.insertedId, status: "available", createdAt: new Date(), updatedAt: new Date(),
  });
  console.log(`fixtures user=${user.insertedId} pet=${pet.insertedId}`);

  // The scheduler's silent-consume branch must NOT touch the notification
  // service. Make it scream if called so a silent path stepping into the
  // notify path fails loudly.
  let notifyCalls = 0;
  notificationService.createNotification = async () => { notifyCalls++; throw new Error("must not notify"); };

  // 1) notificationEnabled:false, once, due in the past -> consumed silently.
  const base = new Date(Date.now() - 3600e3);
  const wall = new Date(base);
  const time = `${String(wall.getUTCHours()).padStart(2, "0")}:${String(wall.getUTCMinutes()).padStart(2, "0")}`;
  const silentRem = await Reminder.create({
    user: user.insertedId, pet: pet.insertedId, title: "Silent", type: "feeding",
    date: base, time, timezone: "UTC", frequency: "once", notificationEnabled: false,
    nextRunAt: base, source: "manual", isActive: true, isCompleted: false,
  });

// 2) interval/3 whose LAST occurrence (nextRunAt) matches its wall-clock and
  //    sits 2 days in the past -> advancing fires the next +3d occurrence.
  const nowD = new Date();
  const occ = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate() - 2, 8, 20));
  const intRem = await Reminder.create({
    user: user.insertedId, pet: pet.insertedId, title: "Every 3", type: "bath",
    date: occ, time: "08:20", timezone: "UTC", frequency: "interval", repeatInterval: 3,
    notificationEnabled: false, nextRunAt: occ, source: "manual", isActive: true, isCompleted: false,
  });

  const summary = await scheduler.processDueReminders({ now: Date.now(), batchLimit: 20 });
  console.log("summary", JSON.stringify(summary));

  const sAfter = await Reminder.findById(silentRem._id).lean();
  ok(sAfter.isCompleted === true, "silent once -> isCompleted true");
  ok(sAfter.lastStatus === "skipped", "silent once -> lastStatus skipped");
  ok(/Notifications disabled/.test(sAfter.lastError || ""), "silent once -> lastError explains");
  ok(!!sAfter.lastFiredAt, "silent once -> lastFiredAt set");
  ok(notifyCalls === 0, "notification service never called");

  const iAfter = await Reminder.findById(intRem._id).lean();
  const expected = occ.getTime() + 3 * 86400e3;
  ok(Math.abs(new Date(iAfter.nextRunAt).getTime() - expected) < 2000, `interval/3 advanced +3d (${iAfter.nextRunAt})`);

  // cleanup
  await Reminder.deleteMany({ _id: { $in: [silentRem._id, intRem._id] } });
  await mongoose.connection.collection("pets").deleteOne({ _id: pet.insertedId });
  await mongoose.connection.collection("users").deleteOne({ _id: user.insertedId });
  await mongoose.disconnect();
  console.log(`== RESULT: ${passed} passed, ${failed} failed ==`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("crash", e); process.exit(2); });