// =====================================================================
// FAMIPET — Phase 8 (Pet Care Reminder System) API suite
// Product behaviors under test (per task):
//   - reminder categories: food, walk, water, medicine, grooming, bath,
//     vet checkup, vaccination, dental, nail trimming, playtime, pet area
//     cleaning, custom
//   - pet-specific reminders (a pet is REQUIRED on create)
//   - repeat options: once, daily, every X days, weekly, monthly (+ custom)
//   - priority: low / normal / high
//   - notification on/off (silent consume)
//   - pending / completed / inactive sections + restore
//   - today / upcoming / per-pet listing; dashboard GET /reminders
//     backward compatibility (default = active only)
// Run:  docker cp compose/scripts/phase8-reminders-api.mjs famipet-backend:/tmp/phase8.mjs
//       docker exec -w /app famipet-backend node /tmp/phase8.mjs
// Exit 0 => pass, 1 => fail. (Transient fixture users are purged on exit.)
// =====================================================================

const BASE = process.env.API_BASE || "http://localhost:5000/api";

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

let passed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    passed += 1;
    console.log(`  PASS ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

async function j(method, path, { body, token, expect } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }
  if (expect !== undefined && res.status !== expect) {
    failures.push(`HTTP ${expect} for ${method} ${path} (got ${res.status})`);
    console.log(`  FAIL ${method} ${path} -> ${res.status} body=${JSON.stringify(data).slice(0, 200)}`);
  }
  return { status: res.status, data };
}

const Run = `p8-${Date.now()}`;
const emails = [];
let db = null;
let mongoose = null;

async function makeUser(tag) {
  const email = `${Run}-${tag}@famipet.test`;
  emails.push(email);
  await j("POST", "/auth/register", {
    body: { name: `Phase8 ${tag}`, email, password: "Password123!" },
    expect: 201,
  });
  // Registration marks accounts unverified; mark verified directly so login
  // issues a token (auth requires verification in production).
  await db.collection("users").updateOne({ email }, { $set: { isVerified: true } });
  const l = await j("POST", "/auth/login", { body: { email, password: "Password123!" }, expect: 200 });
  const token = l.data.token;
  const uid = l.data.user && l.data.user._id;
  ok(!!token, `token for user ${tag}`);
  return { email, token, uid };
}

function isoOfUTC(y, mo, d, h, mi) {
  return new Date(Date.UTC(y, mo, d, h || 0, mi || 0)).toISOString();
}

function weekdayISO(targetMs) {
  const d = new Date(targetMs);
  return d.getUTCDay();
}

async function main() {
  console.log(`== Phase 8 Reminders suite (run ${Run}) ==`);

  // Mongo handle for verification + cleanup (mongoose ships in the backend image).
  mongoose = require("/app/node_modules/mongoose");
  await mongoose.connect("mongodb://mongodb:27017/petDB", { serverSelectionTimeoutMS: 15000 });
  db = mongoose.connection.db;

  // ---- A. fixtures ---------------------------------------------------
  console.log("-- A fixtures --");
  const A = await makeUser("a");
  const B = await makeUser("b");

  const petAres = await j("POST", "/pets", {
    token: A.token,
    body: { breed: "Beagle", name: "Bruno", species: "dog", gender: "male", age: 3 },
    expect: 201,
  });
  const petA = petAres.data.pet ? petAres.data.pet._id : petAres.data._id;
  ok(!!petA, "petA created (Bruno)");

  const petBres = await j("POST", "/pets", {
    token: B.token,
    body: { breed: "Persian", name: "Bella", species: "cat", gender: "female", age: 2 },
    expect: 201,
  });
  const petB = petBres.data.pet ? petBres.data.pet._id : petBres.data._id;
  ok(!!petB, "petB created (Bella, owner B)");

  // ---- B. create validation ------------------------------------------
  console.log("-- B create validation --");
  const base = new Date(Date.now() + 7 * DAY_MS);
  const baseY = base.getUTCFullYear();
  const baseM = base.getUTCMonth();
  const baseD = base.getUTCDate();
  const baseISO = isoOfUTC(baseY, baseM, baseD, 9, 15);

  const mk = (extra) => ({ title: "Test reminder", type: "feeding", date: base, time: "09:15", pet: petA, ...extra });

  const noPet = await j("POST", "/reminders", { token: A.token, body: mk({ pet: undefined }) });
  ok(noPet.status === 400 && /pet is required/i.test(noPet.data.message || ""), "create without pet -> 400 'A pet is required'");

  const notOwned = await j("POST", "/reminders", { token: A.token, body: mk({ pet: petB }) });
  ok(notOwned.status === 404 && /not owned/i.test(notOwned.data.message || ""), "create with other user's pet -> 404");

  const badType = await j("POST", "/reminders", { token: A.token, body: mk({ type: "hammock" }) });
  ok(badType.status === 400 && /reminder type/i.test(badType.data.message || ""), "invalid type -> 400");

  const badFreq = await j("POST", "/reminders", { token: A.token, body: mk({ frequency: "hourly" }) });
  ok(badFreq.status === 400 && /frequency/i.test(badFreq.data.message || ""), "invalid frequency -> 400");

  const intMissing = await j("POST", "/reminders", { token: A.token, body: mk({ frequency: "interval" }) });
  ok(intMissing.status === 400 && /repeatInterval/i.test(intMissing.data.message || ""), "interval without repeatInterval -> 400");

  const intZero = await j("POST", "/reminders", { token: A.token, body: mk({ frequency: "interval", repeatInterval: 0 }) });
  ok(intZero.status === 400 && /repeatInterval/i.test(intZero.data.message || ""), "repeatInterval 0 -> 400");

  const intBig = await j("POST", "/reminders", { token: A.token, body: mk({ frequency: "interval", repeatInterval: 366 }) });
  ok(intBig.status === 400, "repeatInterval 366 -> 400");

  const badPriority = await j("POST", "/reminders", { token: A.token, body: mk({ priority: "urgent" }) });
  ok(badPriority.status === 400 && /priority/i.test(badPriority.data.message || ""), "invalid priority -> 400");

  const badNotif = await j("POST", "/reminders", { token: A.token, body: mk({ notificationEnabled: "yes" }) });
  ok(badNotif.status === 400 && /notificationEnabled/i.test(badNotif.data.message || ""), "non-boolean notificationEnabled -> 400");

  const badDays = await j("POST", "/reminders", { token: A.token, body: mk({ frequency: "weekly", daysOfWeek: [9] }) });
  ok(badDays.status === 400 && /daysOfWeek/i.test(badDays.data.message || ""), "daysOfWeek [9] -> 400");

  const dupDays = await j("POST", "/reminders", { token: A.token, body: mk({ frequency: "weekly", daysOfWeek: [1, 1] }) });
  ok(dupDays.status === 400 && /daysOfWeek/i.test(dupDays.data.message || ""), "duplicate daysOfWeek -> 400");

  // ---- C. repeat rules -------------------------------------------------
  console.log("-- C repeat rules --");
  let r;
  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: mk({ title: "Every 10 days", frequency: "interval", repeatInterval: 10 }),
  });
  ok(r.data.reminder && r.data.reminder._id, "interval/10 created");
  ok(r.data.reminder.nextRunAt === baseISO, `interval/10 nextRunAt == base (${baseISO})`);
  const idInterval10 = r.data.reminder._id;

  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: mk({ title: "Every 3 days", frequency: "interval", repeatInterval: 3 }),
  });
  // "every 3 days" anchors on the base date itself, so the first future
  // occurrence from a future base is the base date (the interval is the step).
  ok(r.data.reminder.nextRunAt === baseISO, "interval/3 nextRunAt == base (step anchored on base)");

  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: mk({ title: "Mon/Wed", frequency: "weekly", daysOfWeek: [1, 3] }),
  });
  let expDay = null;
  for (let i = 0; i < 7; i++) {
    const cand = new Date(Date.UTC(baseY, baseM, baseD + i));
    if ([1, 3].includes(cand.getUTCDay())) { expDay = cand; break; }
  }
  const expMonWed = isoOfUTC(expDay.getUTCFullYear(), expDay.getUTCMonth(), expDay.getUTCDate(), 9, 15);
  ok(r.data.reminder.nextRunAt === expMonWed, `weekly [1,3] nextRunAt == ${expMonWed}`);
  const idWeeklyDays = r.data.reminder._id;

  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: mk({ title: "Pure weekly", frequency: "weekly" }),
  });
  ok(r.data.reminder.nextRunAt === baseISO, "weekly (no days) nextRunAt == base");

  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: mk({ title: "Daily", frequency: "daily" }),
  });
  ok(r.data.reminder.nextRunAt === baseISO, "daily nextRunAt == base");

  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: mk({ title: "Monthly", frequency: "monthly" }),
  });
  ok(r.data.reminder.nextRunAt === baseISO, "monthly nextRunAt == base");

  // once future (upcoming section)
  const onceFuture = new Date(Date.now() + 3 * DAY_MS);
  const onceFutureISO = isoOfUTC(onceFuture.getUTCFullYear(), onceFuture.getUTCMonth(), onceFuture.getUTCDate(), 9, 15);
  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: mk({ title: "Future once", frequency: "once", date: onceFuture }),
  });
  ok(r.data.reminder.nextRunAt === onceFutureISO, "once future nextRunAt == date");
  const idOnceFuture = r.data.reminder._id;

  // once today 23:58 (today section; guaranteed not-due because 23:58 > now unless it IS 23:58)
  const nowObj = new Date();
  const today = new Date(Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth(), nowObj.getUTCDate()));
  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: mk({ title: "Today late", frequency: "once", date: today, time: "23:58" }),
  });
  ok(r.data.reminder ? true : false, "once today 23:58 created");
  const idTodayLate = r.data.reminder._id;

  // phase-8 type + prefs echo
  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: mk({ title: "High priority feeding", type: "feeding", priority: "high", notificationEnabled: false }),
  });
  ok(r.data.reminder.priority === "high", "priority high echoed");
  ok(r.data.reminder.notificationEnabled === false, "notificationEnabled false echoed");
  ok(r.data.reminder.frequency === "once" && r.data.reminder.repeatInterval === 1, "repeatInterval defaults 1");
  ok(Array.isArray(r.data.reminder.daysOfWeek) && r.data.reminder.daysOfWeek.length === 0, "daysOfWeek defaults []");

  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: { title: "Bath time", type: "bath", date: base, time: "18:00", pet: petA, priority: "low" },
  });
  ok(r.status === 201 && r.data.reminder.type === "bath", "type 'bath' accepted");

  // dashboard backward-compat: default GET returns ONLY active + not completed
  r = await j("GET", "/reminders", { token: A.token, expect: 200 });
  ok(Array.isArray(r.data.reminders), "GET /reminders shape { reminders }");
  ok(r.data.reminders.length > 0, "default GET returns active reminders");
  ok(r.data.reminders.every((m) => m.isActive === true && m.isCompleted === false), "default GET: all active (backward compat)");
  const activeIds = new Set(r.data.reminders.map((m) => String(m._id)));

  // ---- D. pet-scoped + authz -------------------------------------------
  console.log("-- D pet scope --");
  let rr = await j("GET", `/reminders/pet/${petA}`, { token: A.token, expect: 200 });
  ok(rr.data.reminders.length > 0 && rr.data.reminders.every((m) => String(m.pet._id || m.pet) === String(petA)), "GET /pet/:petA returns only Bruno's reminders");
  rr = await j("GET", `/reminders/pet/${petB}`, { token: A.token, expect: 404 });
  ok(rr.status === 404, "GET /pet/:petB (other user's pet) -> 404");
  rr = await j("GET", "/reminders", { token: B.token, expect: 200 });
  ok(rr.data.count === 0 && rr.data.reminders.length === 0, "other user sees no reminders (isolation)");

  // ---- E. today / upcoming ----------------------------------------------
  console.log("-- E today/upcoming --");
  rr = await j("GET", "/reminders/upcoming", { token: A.token, expect: 200 });
  const upIds = new Set(rr.data.reminders.map((m) => String(m._id)));
  ok(upIds.has(String(idInterval10)), "upcoming includes interval/10");
  ok(upIds.has(String(idWeeklyDays)), "upcoming includes weekly [1,3]");
  ok(upIds.has(String(idOnceFuture)), "upcoming includes future once");

  rr = await j("GET", "/reminders/today", { token: A.token, expect: 200 });
  const todayIds = new Set(rr.data.reminders.map((m) => String(m._id)));
  ok(todayIds.has(String(idTodayLate)), "today includes 23:58 today");
  ok(!todayIds.has(String(idOnceFuture)), "today excludes future once");

  // ---- F. lifecycle ------------------------------------------------------
  console.log("-- F lifecycle --");
  r = await j("PUT", `/reminders/${idInterval10}/complete`, { token: A.token, expect: 200 });
  // Completing the BASE occurrence advances by one interval → base + 10 days.
  const next10 = isoOfUTC(baseY, baseM, baseD + 10, 9, 15);
  ok(r.data.reminder && r.data.reminder.isCompleted === false, "complete recurring: does NOT complete series");
  ok(r.data.reminder.frequency === "interval", "complete recurring: frequency preserved");
  ok(r.data.reminder.nextRunAt === next10, `interval/10 advances +10d (${next10})`);

  r = await j("PUT", `/reminders/${idOnceFuture}/complete`, { token: A.token, expect: 200 });
  ok(r.data.reminder.isCompleted === true && r.data.reminder.nextRunAt === null, "complete once: isCompleted + nextRunAt null");

  rr = await j("GET", "/reminders?filter=completed", { token: A.token, expect: 200 });
  ok(rr.data.reminders.some((m) => String(m._id) === String(idOnceFuture)), "filter=completed includes completed once");

  rr = await j("GET", "/reminders", { token: A.token, expect: 200 });
  ok(!new Set(rr.data.reminders.map((m) => String(m._id))).has(String(idOnceFuture)), "default GET excludes completed");

  r = await j("PUT", `/reminders/${idInterval10}/deactivate`, { token: A.token, expect: 200 });
  ok(r.data.reminder.isActive === false, "deactivate sets isActive false");

  rr = await j("GET", "/reminders?filter=inactive", { token: A.token, expect: 200 });
  ok(rr.data.reminders.some((m) => String(m._id) === String(idInterval10)), "filter=inactive includes deactivated");

  rr = await j("GET", "/reminders", { token: A.token, expect: 200 });
  ok(!new Set(rr.data.reminders.map((m) => String(m._id))).has(String(idInterval10)), "default GET excludes inactive");

  r = await j("PUT", `/reminders/${idInterval10}/activate`, { token: A.token, expect: 200 });
  ok(r.data.reminder.isActive === true, "activate restores isActive true");
  ok(r.data.reminder.nextRunAt && new Date(r.data.reminder.nextRunAt).getTime() > Date.now(), "activate recomputes future nextRunAt");

  rr = await j("GET", "/reminders", { token: A.token, expect: 200 });
  ok(new Set(rr.data.reminders.map((m) => String(m._id))).has(String(idInterval10)), "default GET includes reactivated");

  r = await j("DELETE", `/reminders/${idOnceFuture}`, { token: A.token, expect: 200 });
  rr = await j("GET", "/reminders?filter=all", { token: A.token, expect: 200 });
  ok(!new Set(rr.data.reminders.map((m) => String(m._id))).has(String(idOnceFuture)), "deleted reminder gone from filter=all");

  // ---- G. notification-off silent consume (end-to-end, LAST) --------------
  console.log("-- G notification-off silent consume --");
  const overdue = new Date(Date.now() - 5 * 60 * 1000);
  r = await j("POST", "/reminders", {
    token: A.token,
    expect: 201,
    body: mk({ title: "Silent hygiene", frequency: "once", date: overdue, time: hhmm(overdue), notificationEnabled: false }),
  });
  const idSilent = r.data.reminder._id;
  ok(!!idSilent, "silent reminder created (already due)");

  // Poll up to ~80s for the scheduler's next pass to consume it (30s interval
  // + slack instead of a fixed sleep, so timing races can't flake the suite).
  const oid = new (require("/app/node_modules/mongoose").Types.ObjectId)(idSilent);
  let silent = null;
  let rawDb = null;
  let lastPollLen = -1;
  for (let i = 0; i < 8; i++) {
    await new Promise((res) => setTimeout(res, 10000));
    const poll = await j("GET", "/reminders?filter=all", { token: A.token });
    rawDb = await db.collection("reminders").findOne({ _id: oid });
    lastPollLen = (poll.data.reminders || []).length;
    const inApi = (poll.data.reminders || []).some((m) => String(m._id) === String(idSilent));
    console.log(`  t+${(i + 1) * 10}s pollLen=${lastPollLen} inApi=${inApi} dbStatus=${rawDb ? rawDb.lastStatus : "MISSING"} dbComplete=${rawDb ? rawDb.isCompleted : "-"} dbErr=${rawDb ? JSON.stringify((rawDb.lastError || "").slice(0, 60)) : "-"}`);
    silent = (poll.data.reminders || []).find((m) => String(m._id) === String(idSilent));
    if (silent && silent.isCompleted === true) break;
  }
  ok(silent && silent.isCompleted === true, "notification-off once reminder consumed (completed)");
  ok(silent && silent.lastStatus === "skipped", "notification-off lastStatus == skipped");
  ok(silent && /Notifications disabled/.test(silent.lastError || ""), "notification-off lastError explains silent consume");
  ok(silent && !!silent.lastFiredAt, "notification-off records lastFiredAt");

  const notif = await j("GET", "/notifications", { token: A.token, expect: 200 });
  const notes = (notif.data.notifications || []).filter(
    (n) => n.metadata && String(n.metadata.reminderId || "") === String(idSilent)
  );
  ok(notes.length === 0, "notification-off creates ZERO notifications");

  // ---- cleanup test users -------------------------------------------------
  const uids = [A.uid, B.uid].filter(Boolean);
  try {
    await db.collection("reminders").deleteMany({ user: { $in: uids } });
    await db.collection("pets").deleteMany({ owner: { $in: uids } });
    const res = await db.collection("users").deleteMany({ email: { $in: emails } });
    console.log(`cleanup removed ${res.deletedCount} fixture user(s)`);
    await mongoose.disconnect();
  } catch (e) {
    console.log(`cleanup skipped: ${e.message}`);
  }

  console.log(`== RESULT: ${passed} passed, ${failures.length} failed ==`);
  if (failures.length) {
    console.log("failed: " + failures.join(" | "));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.log("suite crashed:", e.message);
  process.exit(2);
});