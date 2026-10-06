// =====================================================================
// FAMIPET — Phase 11 (AI Recommendations & AI CRUD) HTTP/API suite
// Exercises the Phase 11 surface end-to-end over HTTP:
//   GET  /api/ai/recommendations  (informational, real data, no model)
//   POST /api/ai/action           (accept a suggestion -> Phase 10
//                                  proposal; reads execute / mutations
//                                  require on-screen confirmation)
// Verifies: anonymous 401s; no-pets empty state; recommendations built
// ONLY from the caller's own data; suggested actions are valid Phase 10
// tool calls scoped to owned pets; confirm executes exactly-once; cancel
// blocks; cross-user denial at both proposal and confirm; allowlist
// validation rejects owner/operator injection; unknown tools rejected;
// the recommendations payload never leaks internal ids/tokens; repeated
// identical acceptance supersedes (dedup) -> single execution; and the
// engine stops re-suggesting already-actioned items.
// Run:  MSYS_NO_PATHCONV=1 docker run --rm --network fami-pet_famipet-backend-net
//       -v "$(pwd -W)/compose/scripts:/suite:ro" -w /app --entrypoint node
//       -e API_BASE=http://backend:5000/api famipet-backend:production
//       /suite/phase11-recommendations-api.cjs
// Exit 0 => pass, 1 => fail. (Transient fixture users are purged on exit.)
// =====================================================================

const BASE = process.env.API_BASE || "http://localhost:5000/api";

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

const Run = `p11a-${Date.now()}`;
const emails = [];
let db = null;
let mongoose = null;
let ObjectId = null;

const MUTATION_TOOLS = ["create_pet", "update_pet", "update_diet", "create_reminder", "update_reminder"];
const CATEGORIES = ["diet", "feeding_plan", "reminder", "appointment", "exercise", "care", "health"];

async function makeUser(tag) {
  const email = `${Run}-${tag}@famipet.test`;
  emails.push(email);
  await j("POST", "/auth/register", {
    body: { name: `Phase11 ${tag}`, email, password: "Password123!" },
    expect: 201,
  });
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

async function purgePriorRunFixtures() {
  const prior = await db
    .collection("users")
    .find({ email: /^p11a-.*@famipet\.test$/ })
    .toArray();
  const uids = prior.map((u) => u._id);
  if (!uids.length) return;
  await db.collection("toolconfirmations").deleteMany({ user: { $in: uids } });
  await db.collection("toolauditlogs").deleteMany({ user: { $in: uids } });
  await db.collection("users").deleteMany({ _id: { $in: uids } });
  await db.collection("pets").deleteMany({ owner: { $in: uids } });
  await db.collection("petdiets").deleteMany({ user: { $in: uids } });
  await db.collection("reminders").deleteMany({ user: { $in: uids } });
  await db.collection("notifications").deleteMany({ user: { $in: uids } });
  await db.collection("appointments").deleteMany({ user: { $in: uids } });
  await db.collection("healthrecords").deleteMany({ user: { $in: uids } });
  console.log(`-- purged ${uids.length} prior Phase11-api fixture user(s) --`);
}

async function countReminders(uid) {
  return db.collection("reminders").countDocuments({ user: new mongoose.Types.ObjectId(uid) });
}

async function main() {
  console.log(`== Phase 11 AI Recommendations & CRUD API suite (run ${Run}) ==`);

  mongoose = require("/app/node_modules/mongoose");
  ObjectId = mongoose.Types.ObjectId;
  await mongoose.connect("mongodb://mongodb:27017/petDB", { serverSelectionTimeoutMS: 15000 });
  db = mongoose.connection.db;
  await purgePriorRunFixtures();

  // ---- A. anonymous guards -------------------------------------------
  console.log("-- A auth guards --");
  let r = await j("GET", "/ai/recommendations", { expect: 401 });
  ok(!r.data.success, "anonymous GET /ai/recommendations -> 401");
  r = await j("POST", "/ai/action", { body: { tool: "get_reminders", args: {} }, expect: 401 });
  ok(!r.data.success, "anonymous POST /ai/action -> 401");

  // ---- B. no-pets empty state ----------------------------------------
  console.log("-- B no-pets user --");
  const Empty = await makeUser("empty");
  r = await j("GET", "/ai/recommendations", { token: Empty.token, expect: 200 });
  ok(r.data.success === true, "no-pets recommendations 200 success");
  const emptyRecs = r.data.recommendations || [];
  ok(Array.isArray(emptyRecs) && emptyRecs.length > 0, "no-pets returns suggestions");
  ok(typeof r.data.disclaimer === "string" && /not a diagnosis|not a prescription/i.test(r.data.disclaimer),
    "response carries the informational disclaimer");
  ok(emptyRecs.every((it) => it.pet === null), "no-pets items have no pet reference");
  ok(emptyRecs.some((it) => /add your first pet/i.test(it.title)), "no-pets includes the 'Add your first pet' prompt");
  ok(emptyRecs.every((it) => !it.action || !it.action.tool), "no-pets items propose no action");

  // ---- C. owner-scoped suggestions from real data ---------------------
  console.log("-- C suggestions from real data --");
  const A = await makeUser("a");
  const B = await makeUser("b");
  const petA = await makePet(A.token, { name: "Bruno" }); // age 3, dog, weight 22, vaccinated unset
  const petB = await makePet(B.token, { name: "Bella", species: "cat", age: 5 });

  r = await j("GET", "/ai/recommendations", { token: A.token, expect: 200 });
  const recsA = r.data.recommendations || [];
  const recsAJson = JSON.stringify(recsA);
  ok(recsA.length > 0 && recsA.length <= 12, `A got ${recsA.length} suggestions (<=12)`);
  ok(recsAJson.includes(petA._id), "A's suggestions reference A's own pet");
  ok(!recsAJson.includes(petB._id), "A's suggestions never reference B's pet (cross-user impossible)");
  ok(!/owner|__v|tokenHash|\bsecret\b/i.test(recsAJson), "recommendations payload leaks no internal fields");

  const shapeOk = recsA.every((it) =>
    it && typeof it.id === "string" &&
    CATEGORIES.includes(it.category) &&
    ["high", "medium", "low"].includes(it.priority) &&
    typeof it.title === "string" && typeof it.summary === "string" &&
    (it.pet === null || (it.pet && it.pet.id && it.pet.name))
  );
  ok(shapeOk, "every item is well-formed (id/category/priority/title/summary/pet)");

  const withActions = recsA.filter((it) => it && it.action && it.action.tool);
  ok(withActions.length >= 3, "dog (unvaccinated, no diet, no appts) yields action-bearing suggestions");
  ok(withActions.every((it) => MUTATION_TOOLS.includes(it.action.tool)), "every suggested action is a Phase 10 mutation tool");
  const argsOwned = withActions.every((it) => {
    const a = it.action.args || {};
    const ref = a.petId !== undefined ? a.petId : a.pet;
    return ref === undefined || String(ref) === petA._id;
  });
  ok(argsOwned, "every suggested action targets only the owned pet");

  ok(recsA.some((it) => it.category === "diet" && /diet profile/i.test(it.summary)), "diet suggestion (no diet recorded)");
  ok(recsA.some((it) => it.category === "appointment" && /checkup/i.test(it.title)), "checkup suggestion (no appointments)");
  ok(recsA.some((it) => it.category === "reminder" && /[Vv]accination/i.test(it.title) && it.action), "vaccination suggestion with action");
  ok(recsA.some((it) => it.category === "exercise" && it.action && it.action.tool === "create_reminder"), "exercise reminder suggestion for a dog");

  // second user with a cat is NOT offered the dog-only exercise suggestion
  r = await j("GET", "/ai/recommendations", { token: B.token, expect: 200 });
  const recsB = r.data.recommendations || [];
  ok(!recsB.some((it) => it.category === "exercise" && it.pet && it.pet.id === petB._id),
    "cat owner gets no dog-exercise suggestion (species-aware)");

  // ---- D. accept -> proposal -> confirm (exactly-once) ----------------
  console.log("-- D accept flow --");
  const vacSug = recsA.find((it) => it.category === "reminder" && it.action);
  ok(!!vacSug, "found vaccination suggestion to accept");
  const vacArgs = Object.assign({}, vacSug.action.args);

  r = await j("POST", "/ai/action", {
    token: A.token,
    body: { intent: "accept-vaccination", tool: vacSug.action.tool, args: vacArgs },
    expect: 200,
  });
  ok(r.data.success && r.data.requiresConfirmation === true, "accept -> proposal (not executed yet)");
  ok(r.data.preview && r.data.preview.summary, "proposal carries a human preview");
  ok(r.data.confirmation && r.data.confirmation.token, "proposal carries a single-use confirmation token");
  const vacToken = r.data.confirmation.token;
  ok((await countReminders(A.uid)) === 0, "nothing persisted by the proposal itself");

  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: { token: vacToken }, expect: 200 });
  ok(r.data.success && r.data.tool === "create_reminder", "confirm executed the accepted suggestion");
  ok((await countReminders(A.uid)) === 1, "exactly one reminder created");

  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: { token: vacToken }, expect: 400 });
  ok(r.data.errorCategory === "confirmation_invalid", "double-confirm -> exactly-once rejected");

  // engine now knows the vaccination reminder exists -> no re-suggestion
  r = await j("GET", "/ai/recommendations", { token: A.token, expect: 200 });
  const recsAfter = r.data.recommendations || [];
  ok(!recsAfter.some((it) => it.category === "reminder" && /[Vv]accination/i.test(it.title)),
    "vaccination suggestion no longer offered after the reminder was confirmed");

  // ---- E. repeated identical acceptance supersedes (dedup) ------------
  console.log("-- E dedupe --");
  const checkupSug = recsAfter.find((it) => it.category === "appointment" && it.action);
  ok(!!checkupSug, "checkup suggestion still available to accept");
  const apptArgs = Object.assign({}, checkupSug.action.args);

  r = await j("POST", "/ai/action", { token: A.token, body: { tool: "create_reminder", args: apptArgs }, expect: 200 });
  const apptT1 = r.data.confirmation && r.data.confirmation.token;
  r = await j("POST", "/ai/action", { token: A.token, body: { tool: "create_reminder", args: apptArgs }, expect: 200 });
  const apptT2 = r.data.confirmation && r.data.confirmation.token;
  ok(!!apptT1 && !!apptT2 && apptT1 !== apptT2, "identical re-acceptance mints a fresh proposal id");
  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: { token: apptT2 }, expect: 200 });
  ok(r.data.success, "newest proposal confirms");
  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: { token: apptT1 }, expect: 400 });
  ok(r.data.errorCategory === "confirmation_invalid", "superseded proposal cannot execute (dedup -> single live token)");
  ok((await countReminders(A.uid)) === 2, "dedup kept executions to exactly one more reminder");

  // ---- F. cancel blocks execution -------------------------------------
  console.log("-- F cancel --");
  const cancelArgs = { title: "Checkup plan B", type: "appointment", date: "2026-11-01", time: "11:00", pet: petA._id };
  r = await j("POST", "/ai/action", { token: A.token, body: { tool: "create_reminder", args: cancelArgs }, expect: 200 });
  const cancelToken = r.data.confirmation.token;
  r = await j("POST", "/ai/tools/cancel", { token: A.token, body: { token: cancelToken }, expect: 200 });
  ok(r.data.success, "cancel accepted");
  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: { token: cancelToken }, expect: 400 });
  ok(r.data.errorCategory === "confirmation_invalid", "cancelled suggestion cannot execute");
  ok((await countReminders(A.uid)) === 2, "cancelled action never persisted");

  // ---- G. injection + unknown tools rejected --------------------------
  console.log("-- G injection / unknown --");
  r = await j("POST", "/ai/action", {
    token: A.token,
    body: { tool: "create_reminder", args: Object.assign({}, vacArgs, { owner: B.uid }) },
    expect: 400,
  });
  ok(r.data.errorCategory === "validation", "owner field injection -> 400 validation");
  r = await j("POST", "/ai/action", {
    token: A.token,
    body: { tool: "create_reminder", args: Object.assign({ $where: "sleep(1000)" }, cancelArgs) },
    expect: 400,
  });
  ok(r.data.errorCategory === "validation", "mongo operator key -> 400 validation");
  r = await j("POST", "/ai/action", {
    token: A.token,
    body: { tool: "create_reminder", args: Object.assign({}, cancelArgs, { pet: { $gt: "" } }) },
    expect: 400,
  });
  ok(r.data.errorCategory === "validation", "operand-object pet id -> 400 validation");
  r = await j("POST", "/ai/action", { token: A.token, body: { tool: "update_reminder", args: { reminderId: petA._id, isCompleted: { $set: 1 } } }, expect: 400 });
  ok(r.data.errorCategory === "validation", "operator nested bool -> 400 validation");
  r = await j("POST", "/ai/action", { token: A.token, body: { tool: "eval", args: {} }, expect: 409 });
  ok(r.data.errorCategory === "tool_unavailable", "arbitrary function name -> 409 tool_unavailable");
  r = await j("POST", "/ai/action", { token: A.token, body: { tool: "db.adminCommand", args: {} }, expect: 409 });
  ok(r.data.errorCategory === "tool_unavailable", "adminCommand attempt -> 409 tool_unavailable");
  r = await j("POST", "/ai/action", { token: A.token, body: { tool: "create_reminder", args: [1, 2, 3] }, expect: 400 });
  ok(r.data.errorCategory === "validation", "non-object args -> 400 validation");

  // ---- H. cross-user denial -------------------------------------------
  console.log("-- H cross-user --");
  r = await j("POST", "/ai/action", {
    token: B.token,
    body: { tool: "create_reminder", args: { title: "Hijack", type: "vaccination", date: "2026-12-01", time: "09:00", pet: petA._id } },
    expect: 403,
  });
  ok(r.data.errorCategory === "authorization", "B proposing an action on A's pet -> 403");
  r = await j("POST", "/ai/action", {
    token: B.token,
    body: { tool: "update_pet", args: { petId: petA._id, name: "Hijack" } },
    expect: 403,
  });
  ok(r.data.errorCategory === "authorization", "B updating A's pet -> 403");

  r = await j("POST", "/ai/action", { token: A.token, body: { tool: "create_reminder", args: cancelArgs }, expect: 200 });
  const crossToken = r.data.confirmation.token;
  r = await j("POST", "/ai/tools/confirm", { token: B.token, body: { token: crossToken }, expect: 403 });
  ok(r.data.errorCategory === "authorization", "B confirming A's token -> 403");
  r = await j("POST", "/ai/tools/cancel", { token: A.token, body: { token: crossToken }, expect: 200 });
  ok(r.data.success, "cleanup: A cancels the leftover proposal");

  // ---- cleanup fixtures -----------------------------------------------
  console.log("-- cleanup --");
  const uids = [new ObjectId(A.uid), new ObjectId(B.uid), new ObjectId(Empty.uid)];
  await db.collection("toolconfirmations").deleteMany({ user: { $in: uids } });
  await db.collection("toolauditlogs").deleteMany({ user: { $in: uids } });
  await db.collection("reminders").deleteMany({ user: { $in: uids } });
  await db.collection("petdiets").deleteMany({ user: { $in: uids } });
  await db.collection("pets").deleteMany({ owner: { $in: uids } });
  await db.collection("notifications").deleteMany({ user: { $in: uids } });
  await db.collection("appointments").deleteMany({ user: { $in: uids } });
  await db.collection("healthrecords").deleteMany({ user: { $in: uids } });
  await db.collection("users").deleteMany({ email: { $in: emails } });

  console.log(`== RESULT: ${passed} passed, ${failures.length} failed ==`);
  if (failures.length) {
    console.log("FAILURES:", failures.join(" | "));
    await mongoose.disconnect();
    process.exit(1);
  }
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.log("crash", e);
  process.exit(2);
});