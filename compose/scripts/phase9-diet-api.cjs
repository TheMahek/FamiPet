// =====================================================================
// FAMIPET — Phase 9 (Diet & Nutrition) API suite
// Product behaviors under test (per task):
//   - pet-specific diet profiles (one per pet; not global data)
//   - owner-scoped CRUD: anonymous 401, cross-user 404, per-pet isolation
//   - input validation: enum food types, portion bounds, meal time format,
//     meal-count cap, allergies shape, timezone sanity, activity enum
//   - meal schedule -> daily "feeding" reminders (source "diet" + sourceId)
//     created when meal times are set, updated in place on time edits,
//     deactivated when meals are removed or the profile is deleted
//   - informational guidance: deterministic, completion reflects filled
//     fields, disclaimer always present, no invented numbers
//   - conservative notifications: single "diet profile created" event on
//     first creation only; routine edits silent; deleted silently;
//     preference gate (types.pet=false) suppresses the in-app record
// Run:  MSYS_NO_PATHCONV=1 docker run --rm --network fami-pet_famipet-backend-net
//       -v "$(pwd -W)/compose/scripts:/suite:ro" -w /app --entrypoint node
//       -e API_BASE=http://backend:5000/api famipet-backend:production
//       /suite/phase9-diet-api.cjs
// Exit 0 => pass, 1 => fail. (Transient fixture users are purged on exit.)
// =====================================================================

const BASE = process.env.API_BASE || "http://localhost:5000/api";

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

const Run = `p9-${Date.now()}`;
const emails = [];
let db = null;
let mongoose = null;
let Reminder = null;
let PetDietModel = null;
let NotificationModel = null;

async function makeUser(tag) {
  const email = `${Run}-${tag}@famipet.test`;
  emails.push(email);
  await j("POST", "/auth/register", {
    body: { name: `Phase9 ${tag}`, email, password: "Password123!" },
    expect: 201,
  });
  // Registration marks accounts unverified; mark verified directly so login
  // issues a token (auth requires verification in production).
  await db.collection("users").updateOne({ email }, { $set: { isVerified: true } });
  const l = await j("POST", "/auth/login", { body: { email, password: "Password123!" }, expect: 200 });
  const token = l.data.token;
  const uid = l.data.user && (l.data.user._id || l.data.user.id);
  ok(!!token, `token for user ${tag}`);
  return { email, token, uid };
}

async function makePet(token, overrides) {
  const body = Object.assign(
    { breed: "Beagle", name: "Bruno", species: "dog", gender: "male", age: 3, weight: 22 },
    overrides || {}
  );
  const res = await j("POST", "/pets", { token, body, expect: 201 });
  const pet = res.data.pet ? res.data.pet : res.data;
  ok(!!pet && !!pet._id, `pet created (${body.name})`);
  return pet;
}

async function createDiet(token, petId, body) {
  return j("PUT", `/diet/${petId}`, { token, body });
}

// Any leftover rows from a previously interrupted run are purged first (the
// run tag changes every execution, so this only touches Phase 9 fixtures).
async function purgePriorRunFixtures() {
  const prior = await db
    .collection("users")
    .find({ email: /^p9-.*@famipet\.test$/ })
    .toArray();
  const uids = prior.map((u) => u._id);
  if (!uids.length) return;
  await db.collection("users").deleteMany({ _id: { $in: uids } });
  await db.collection("pets").deleteMany({ owner: { $in: uids } });
  await db.collection("petdiets").deleteMany({ user: { $in: uids } });
  await db.collection("reminders").deleteMany({ user: { $in: uids } });
  await db.collection("notifications").deleteMany({ user: { $in: uids } });
  await db.collection("notificationpreferences").deleteMany({ user: { $in: uids } });
  console.log(`-- purged ${uids.length} prior Phase 9 fixture user(s) --`);
}

async function main() {
  console.log(`== Phase 9 Diet & Nutrition suite (run ${Run}) ==`);

  // Mongo handle for verification + cleanup (mongoose ships in the backend image).
  mongoose = require("/app/node_modules/mongoose");
  Reminder = require("/app/models/Reminder");
  PetDietModel = require("/app/models/PetDiet");
  NotificationModel = require("/app/models/Notification");
  await mongoose.connect("mongodb://mongodb:27017/petDB", { serverSelectionTimeoutMS: 15000 });
  db = mongoose.connection.db;

  await purgePriorRunFixtures();

  // ---- A. fixtures ---------------------------------------------------
  console.log("-- A fixtures --");
  const A = await makeUser("a");
  const B = await makeUser("b");
  const petA = await makePet(A.token, { name: "Bruno" });
  const petB = await makePet(B.token, { name: "Bella", species: "cat", breed: "Persian", weight: 0 });

  const mealsBase = [
    { label: "Breakfast", time: "08:00", portionGrams: 150 },
    { label: "Dinner", time: "18:30", portionGrams: 150 },
  ];

  // ---- B. auth + ownership guards ------------------------------------
  console.log("-- B auth/ownership --");
  let r = await j("GET", "/diet");
  ok(r.status === 401, "GET /diet anonymous -> 401");

  r = await j("GET", `/diet/${petA._id}`, { token: A.token, expect: 200 });
  ok(r.data.diet === null, "GET /diet/:pet first time -> diet null");
  ok(r.data.guidance && r.data.guidance.completion === 0, "empty guidance completion 0");
  ok(/informational/.test(r.data.guidance && r.data.guidance.disclaimer || ""), "guidance disclaimer present+informational");

  r = await j("GET", `/diet/${petA._id}`, { token: B.token, expect: 404 });
  r = await j("DELETE", `/diet/${petA._id}`, { token: B.token, expect: 404 });

  // ---- C. create validation 400s -------------------------------------
  console.log("-- C validation --");
  r = await createDiet(A.token, petA._id, { foodType: "kibble", meals: mealsBase });
  ok(r.status === 400, "invalid foodType -> 400");

  r = await createDiet(A.token, petA._id, { dailyPortionGrams: 0, meals: mealsBase });
  ok(r.status === 400, "dailyPortionGrams 0 -> 400");
  r = await createDiet(A.token, petA._id, { dailyPortionGrams: 25000, meals: mealsBase });
  ok(r.status === 400, "dailyPortionGrams >20000 -> 400");
  r = await createDiet(A.token, petA._id, { dailyPortionGrams: 300.5, meals: mealsBase });
  ok(r.status === 400, "dailyPortionGrams non-integer -> 400");

  r = await createDiet(A.token, petA._id, { meals: [{ label: "Bad", time: "25:99" }] });
  ok(r.status === 400, "meal bad time -> 400");
  r = await createDiet(A.token, petA._id, { meals: "nope" });
  ok(r.status === 400, "meals not array -> 400");
  r = await createDiet(A.token, petA._id, {
    meals: Array.from({ length: 9 }, (_, i) => ({ label: "M" + i, time: "08:00" })),
  });
  ok(r.status === 400, "9 meal times -> 400");
  r = await createDiet(A.token, petA._id, { meals: [{ label: "M", time: "08:00", portionGrams: -3 }] });
  ok(r.status === 400, "negative meal portion -> 400");
  r = await createDiet(A.token, petA._id, { meals: [{ label: "M", time: "08:00", portionGrams: 12.7 }] });
  ok(r.status === 400, "non-integer meal portion -> 400");

  r = await createDiet(A.token, petA._id, { allergies: "chicken" });
  ok(r.status === 400, "allergies not array -> 400");
  r = await createDiet(A.token, petA._id, { timezone: "Mars/Phobos" });
  ok(r.status === 400, "invalid timezone -> 400");
  r = await createDiet(A.token, petA._id, { activityLevel: "extreme", meals: mealsBase });
  ok(r.status === 400, "invalid activityLevel -> 400");

  // ---- D. create -----------------------------------------------------
  console.log("-- D create --");
  r = await createDiet(A.token, petA._id, {
    foodType: "dry",
    brand: "Acme Kibble",
    dailyPortionGrams: 300,
    activityLevel: "moderate",
    timezone: "UTC",
    allergies: ["chicken"],
    treatPolicy: "One small treat daily",
    notes: "Loves kibble",
    meals: mealsBase,
  });
  ok(r.status === 200 && r.data.created === true, "diet profile created (PUT)");
  ok(r.data.diet && r.data.diet.foodType === "dry", "diet persisted foodType");
  ok(r.data.diet && r.data.diet.meals && r.data.diet.meals.length === 2, "diet persisted 2 meals");

  const dietA = r.data.diet;
  const mealIds = dietA.meals.map((m) => String(m._id));

  r = await j("GET", "/diet", { token: A.token, expect: 200 });
  ok(r.data.count === 1, "GET /diet lists A's single diet");
  ok(r.data.diets[0].pet && r.data.diets[0].pet._id === petA._id, "diet attached to pet A");
  ok(r.data.diets[0].guidance && r.data.diets[0].guidance.completion === 100, "full profile -> completion 100");
  ok(r.data.diets[0].guidance.summary.length >= 3, "guidance summary populated");

  r = await j("GET", `/diet/${petA._id}`, { token: A.token, expect: 200 });
  ok(r.data.diet && r.data.diet.dailyPortionGrams === 300, "GET /diet/:pet returns profile");

  // feeding reminders created & linked
  const remindersA = await Reminder.find({ user: A.uid, source: "diet" }).lean();
  ok(remindersA.length === 2, `2 feeding reminders created (got ${remindersA.length})`);
  ok(remindersA.every((rem) => rem.type === "feeding" && rem.frequency === "daily" && rem.isActive === true),
    "reminders are active daily feeding");
  const reminderByMeal = remindersA.filter((rem) => mealIds.includes(String(rem.sourceId)));
  ok(reminderByMeal.length === 2, "reminders linked to meal ids (sourceId)");
  ok(reminderByMeal.some((rem) => rem.time === "08:00") && reminderByMeal.some((rem) => rem.time === "18:30"),
    "reminder times match meal times");
  ok(reminderByMeal.every((rem) => rem.nextRunAt && !Number.isNaN(new Date(rem.nextRunAt).getTime())),
    "reminders have nextRunAt scheduled");

  // conservative notification on create only (filtered to diet events —
  // Phase 8 also emits `pet-created` notifications under the same type)
  const notifs = await NotificationModel.find({ user: A.uid, type: "pet", title: /Diet profile created/ }).lean();
  ok(notifs.length === 1, `exactly 1 diet notification (got ${notifs.length})`);
  ok(notifs[0].referenceType === "pet" && String(notifs[0].referenceId) === petA._id,
    "diet notification references the pet");
  ok(/Diet profile created/.test(notifs[0].title), "diet notification title");

  // ---- E. minor edit is silent + linkage stable ----------------------
  console.log("-- E minor edit silent --");
  r = await createDiet(A.token, petA._id, {
    foodType: "dry",
    brand: "Acme Kibble XL",
    dailyPortionGrams: 300,
    activityLevel: "moderate",
    timezone: "UTC",
    allergies: ["chicken"],
    treatPolicy: "One small treat daily",
    notes: "Loves kibble",
    meals: mealsBase.map((m, i) => Object.assign({}, m, { _id: dietA.meals[i]._id })),
  });
  ok(r.status === 200 && r.data.created === false, "re-PUT is an update (created false)");

  const notifs2 = await NotificationModel.find({ user: A.uid, type: "pet", title: /Diet profile created/ }).lean();
  ok(notifs2.length === 1, "minor edit did not create another notification");

  const remindersA2 = await Reminder.find({ user: A.uid, source: "diet" }).lean();
  const idsBefore = remindersA2.map((rem) => String(rem._id)).sort();
  const idsOne = remindersA.map((rem) => String(rem._id)).sort();
  ok(JSON.stringify(idsBefore) === JSON.stringify(idsOne), "reminder docs unchanged by minor edit (no churn)");

  // ---- F. meal time change updates in place; remove deactivates -------
  console.log("-- F meal changes --");
  const breakfastId = dietA.meals[0]._id;
  r = await createDiet(A.token, petA._id, {
    foodType: "dry",
    brand: "Acme Kibble XL",
    dailyPortionGrams: 280,
    activityLevel: "moderate",
    timezone: "UTC",
    meals: [{ _id: breakfastId, label: "Breakfast", time: "07:30", portionGrams: 140 }],
  });
  ok(r.status === 200 && r.data.created === false, "meal edit PUT ok");
  ok(r.data.diet.meals.length === 1, "only 1 meal after removal");

  const remAfter = await Reminder.findOne({ user: A.uid, source: "diet", sourceId: breakfastId }).lean();
  ok(remAfter && remAfter.isActive === true && remAfter.time === "07:30", "edited meal reminder updated in place");
  ok(remAfter && remAfter.nextRunAt && new Date(remAfter.nextRunAt).getTime() > Date.now() - 7200e3,
    "edited meal reminder rescheduled");

  const disabledDinner = await Reminder.findOne({
    user: A.uid, source: "diet", isActive: false,
  }).lean();
  ok(disabledDinner && disabledDinner.time === "18:30", "removed meal's reminder deactivated");

  // re-add Dinner (new meal, no _id) -> 2 reminders again
  r = await createDiet(A.token, petA._id, {
    meals: [
      { _id: breakfastId, label: "Breakfast", time: "07:30" },
      { label: "Dinner", time: "18:45" },
    ],
  });
  ok(r.status === 200 && r.data.diet.meals.length === 2, "re-adding meal -> 2 meals");
  const remindersA3 = await Reminder.find({ user: A.uid, source: "diet" }).lean();
  ok(remindersA3.filter((rem) => rem.isActive).length === 2, "2 active feeding reminders restored");

  // ---- G. cross-user isolation ---------------------------------------
  console.log("-- G isolation --");
  r = await j("PUT", `/diet/${petA._id}`, { token: B.token, body: { meals: [{ time: "09:00" }] }, expect: 404 });
  r = await j("GET", `/diet/${petA._id}`, { token: B.token, expect: 404 });

  r = await createDiet(B.token, petB._id, {
    foodType: "wet",
    brand: "Purr",
    dailyPortionGrams: 80,
    meals: [{ label: "Snack", time: "12:00" }],
  });
  ok(r.status === 200 && r.data.created === true, "B creates diet for petB");

  r = await j("GET", "/diet", { token: B.token, expect: 200 });
  ok(r.data.count === 1 && r.data.diets[0].pet._id === petB._id, "B sees only petB's diet");
  const notifsB = await NotificationModel.find({ user: B.uid, type: "pet", title: /Diet profile created/ }).lean();
  ok(notifsB.length === 1, "B received exactly one diet notification");

  // ---- H. preference gate (types.pet=false) suppresses in-app ---------
  console.log("-- H preference gate --");
  await db.collection("notificationpreferences").updateOne(
    { user: new mongoose.Types.ObjectId(B.uid) },
    { $set: { "types.pet": false } },
    { upsert: true }
  );
  const petC = await makePet(B.token, { name: "Whiskers", species: "cat", breed: "Persian" });
  r = await createDiet(B.token, petC._id, { brand: "Miao", meals: [{ time: "10:00" }] });
  ok(r.status === 200 && r.data.created === true, "B creates diet with pet notifications off");
  const notifsB2 = await NotificationModel.find({ user: B.uid, type: "pet", title: /Diet profile created/ }).lean();
  ok(notifsB2.length === 1, "pet-type notification suppressed by preference (no diet event for petC)");
  const remC = await Reminder.find({ user: B.uid, source: "diet", pet: petC._id }).lean();
  ok(remC.length === 1 && remC[0].isActive === true, "feeding reminder still created when notifications off");
  await db.collection("notificationpreferences").updateOne(
    { user: new mongoose.Types.ObjectId(B.uid) },
    { $set: { "types.pet": true } }
  );

  // ---- I. delete deactivates reminders + empty guidance ---------------
  console.log("-- I delete --");
  const notifsBefore = await NotificationModel.find({ user: A.uid, type: "pet", title: /Diet profile created/ }).lean();
  r = await j("DELETE", `/diet/${petA._id}`, { token: A.token, expect: 200 });
  const dietGone = await PetDietModel.findOne({ user: A.uid, pet: petA._id }).lean();
  ok(!dietGone, "diet document removed");
  const remA = await Reminder.find({ user: A.uid, source: "diet", pet: petA._id }).lean();
  const activeRemA = remA.filter((rem) => rem.isActive === true).length;
  ok(activeRemA === 0, `all petA feeding reminders deactivated (${activeRemA} still active)`);
  const notifsAfter = await NotificationModel.find({ user: A.uid, type: "pet", title: /Diet profile created/ }).lean();
  ok(notifsAfter.length === notifsBefore.length, "delete is silent (no extra notification)");

  r = await j("GET", `/diet/${petA._id}`, { token: A.token, expect: 200 });
  ok(r.data.diet === null && r.data.guidance.completion === 0, "post-delete GET returns empty diet + guidance");
  r = await j("DELETE", `/diet/${petA._id}`, { token: A.token, expect: 404 });
  ok(r.status === 404, "double delete -> 404");

  // ---- cleanup fixtures -----------------------------------------------
  console.log("-- cleanup --");
  await Reminder.deleteMany({ user: { $in: [A.uid, B.uid] } });
  await PetDietModel.deleteMany({ user: { $in: [A.uid, B.uid] } });
  await NotificationModel.deleteMany({ user: { $in: [A.uid, B.uid] } });
  await mongoose.connection.collection("notificationpreferences").deleteMany({ user: { $in: [A.uid, B.uid] } });
  await mongoose.connection.collection("pets").deleteMany({ owner: { $in: [A.uid, B.uid] } });
  await mongoose.connection.collection("users").deleteMany({ email: { $in: emails } });

  console.log(`== RESULT: ${passed} passed, ${failures.length} failed ==`);
  if (failures.length) {
    console.log("FAILURES:", failures.join(" | "));
    process.exit(1);
  }
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.log("crash", e);
  process.exit(2);
});