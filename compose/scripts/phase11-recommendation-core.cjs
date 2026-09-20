// =====================================================================
// FAMIPET — Phase 11 (AI Recommendations & CRUD) CORE in-process suite
// Exercises recommendation.service.buildRecommendations() DIRECTLY (not
// over HTTP) to pin the safety invariants that depend on the engine:
//   - deterministic: same real data + same `now` -> same suggestion set
//   - informational only: disclaimer always present
//   - cross-user impossible: output never contains another user's pet id
//   - every suggestedAction is a VALID Phase 10 tool call: accepted by
//     runTool (proposal), scoped to an owned pet, never auto-executed
//   - per-pet failure isolation leaves the rest of the list intact
// Fixtures via the real HTTP API; purged on exit. Inside the backend
// container; requires mongodb.
// Run:  MSYS_NO_PATHCONV=1 docker run --rm --network fami-pet_famipet-backend-net
//       -v "$(pwd -W)/compose/scripts:/suite:ro" -w /app --entrypoint node
//       -e API_BASE=http://backend:5000/api famipet-backend:production
//       /suite/phase11-recommendation-core.cjs
// Exit 0 => pass, 1 => fail.
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

const Run = `p11c-${Date.now()}`;
const emails = [];
let db = null;
let mongoose = null;
let ObjectId = null;
let recService = null;
let toolLayer = null;
let User = null;

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
  const user = await User.findById(uid).lean();
  return { email, token, uid, user };
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
    .find({ email: /^p11c-.*@famipet\.test$/ })
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
  console.log(`-- purged ${uids.length} prior Phase11-core fixture user(s) --`);
}

const run = (fn, opts) => recService[fn](opts).catch((e) => ({ ok: false, crashed: e.message }));

async function main() {
  console.log(`== Phase 11 Recommendations core suite (run ${Run}) ==`);

  mongoose = require("/app/node_modules/mongoose");
  ObjectId = mongoose.Types.ObjectId;
  User = require("/app/models/User");
  recService = require("/app/services/recommendation.service");
  toolLayer = require("/app/services/toolLayer");

  await mongoose.connect("mongodb://mongodb:27017/petDB", { serverSelectionTimeoutMS: 15000 });
  db = mongoose.connection.db;
  await purgePriorRunFixtures();

  // ---- A. exports + empty user ----------------------------------------
  console.log("-- A empty state --");
  ok(typeof recService.DISCLAIMER === "string" && /not a diagnosis/i.test(recService.DISCLAIMER), "DISCLAIMER exported and non-medical");
  ok(recService.MAX_RECOMMENDATIONS === 12, "MAX_RECOMMENDATIONS exported (12)");

  const Empty = await makeUser("empty");
  const emptyRes = await run("buildRecommendations", { user: Empty.user, now: "2026-09-21T09:00:00.000Z" });
  ok(emptyRes.ok && emptyRes.data && Array.isArray(emptyRes.data.recommendations), "empty user -> ok with array");
  ok(emptyRes.data.recommendations.length === 2, "empty user -> 2 care prompts");
  ok(emptyRes.data.recommendations.every((it) => it.action === null), "empty user -> no actions suggested");

  // ---- B. deterministic, sorted, real-data suggestions ----------------
  console.log("-- B real-data suggestions --");
  const A = await makeUser("a");
  const B = await makeUser("b");
  const NOW = "2026-09-21T09:00:00.000Z";
  const petA = await makePet(A.token, { name: "Bruno" }); // dog, 3, 22kg, vaccinated unset
  const petB = await makePet(B.token, { name: "Bella", species: "cat", age: 5 });

  const r1 = await run("buildRecommendations", { user: A.user, now: NOW });
  const r2 = await run("buildRecommendations", { user: A.user, now: NOW });
  ok(r1.ok && r2.ok, "deterministic calls both succeed");
  const recs = r1.data.recommendations;
  const sig = (arr) => JSON.stringify(arr.map((it) => [it.category, it.priority, it.title]));
  ok(sig(recs) === sig(r2.data.recommendations), "same real data + same now -> identical suggestion set");
  ok(recs.length <= recService.MAX_RECOMMENDATIONS, "hard cap enforced");

  const recsJson = JSON.stringify(recs);
  ok(!recsJson.includes(petB._id), "A never references B's pet");
  ok(recsJson.includes(petA._id), "A references own pet");
  ok(!/owner|__v|tokenHash|\bsecret\b/i.test(recsJson), "no internal/secret fields leaked");

  const prio = { high: 0, medium: 1, low: 2 };
  const sorted = recs.every((it, i) => i === 0 || prio[recs[i - 1].priority] <= prio[it.priority]);
  ok(sorted, "items sorted by priority (high -> low)");
  ok(recs[0].priority === "high", "highest-priority item is 'high'");
  ok(recs.every((it) => CATEGORIES.includes(it.category) && typeof it.title === "string" && typeof it.summary === "string"),
    "every item shape valid");

  // ---- C. suggestedAction safety --------------------------------------
  console.log("-- C suggested actions --");
  const withActions = recs.filter((it) => it && it.action && it.action.tool);
  ok(withActions.length >= 3, `dog/unvaccinated/no-diet yields suggested actions (${withActions.length})`);
  ok(withActions.every((it) => MUTATION_TOOLS.includes(it.action.tool)), "actions are only Phase 10 mutation tools");
  const ownedRefs = withActions.every((it) => {
    const a = it.action.args || {};
    const ref = a.petId !== undefined ? a.petId : a.pet;
    return ref === undefined || String(ref) === petA._id;
  });
  ok(ownedRefs, "action args reference only owned pet ids");

  const rid = () => `p11c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const proposedTokens = [];
  for (const it of withActions) {
    const pro = await toolLayer.runTool({
      user: A.user,
      requestId: rid(),
      tool: it.action.tool,
      args: it.action.args,
      callBudget: { used: 0, max: 8 },
    });
    ok(pro.ok && pro.requiresConfirmation, `suggested ${it.action.tool} accepted by runTool as a proposal`);
    ok(!pro.data, "proposal never carries read/executed data");
    if (pro.confirmation && pro.confirmation.token) proposedTokens.push(pro.confirmation.token);
  }
  const remCount = await db.collection("reminders").countDocuments({ user: new ObjectId(A.uid) });
  ok(remCount === 0, "minting proposals alone persisted nothing (0 reminders)");

  // every proposal is confirmable by the owner, exactly-once
  const confirmedOne = await toolLayer.confirmTool({ user: A.user, requestId: rid(), token: proposedTokens[0] });
  ok(confirmedOne.ok && confirmedOne.kind === "mutation", "accepted suggestion confirmable and executes via the tool layer");
  const remCountAfter = await db.collection("reminders").countDocuments({ user: new ObjectId(A.uid) });
  ok(remCountAfter === 1, `confirmation created exactly one persisted resource (${remCountAfter})`);
  const double = await toolLayer.confirmTool({ user: A.user, requestId: rid(), token: proposedTokens[0] });
  ok(!double.ok && double.errorCategory === "confirmation_invalid", "re-confirm same token -> exactly-once rejected");

  // ---- D. cross-user isolation + failure isolation --------------------
  console.log("-- D cross-user / isolation --");
  const recsB = await run("buildRecommendations", { user: B.user, now: NOW });
  ok(recsB.ok, "B recommendations ok");
  ok(!JSON.stringify(recsB.data.recommendations).includes(petA._id), "B never references A's pet id");
  ok(recsB.data.recommendations.every((it) => !it.action || !it.action.args || !it.action.args.petId || String(it.action.args.petId) === petB._id),
    "B action refs scoped to B's owned pet");

  // a malformed row on one pet must not kill the whole list (engine-level)
  const A2 = await makeUser("a2");
  await makePet(A2.token, { name: "OkPet" });
  await db.collection("reminders").insertOne({
    user: new ObjectId(A2.uid),
    title: "Weird",
    type: "medicine",
    pet: null,
    isActive: false,
    isCompleted: false,
    date: new Date("2099-01-01"),
    time: "09:00",
    timezone: "UTC",
    frequency: "once",
    priority: "normal",
    notificationEnabled: false,
  });
  const a2Res = await run("buildRecommendations", { user: A2.user, now: NOW });
  ok(a2Res.ok && Array.isArray(a2Res.data.recommendations) && a2Res.data.recommendations.length > 0,
    "a null-pet reminder row does not break the whole list (per-pet isolation)");

  // ---- cleanup fixtures -----------------------------------------------
  console.log("-- cleanup --");
  const allUids = [new ObjectId(A.uid), new ObjectId(B.uid), new ObjectId(Empty.uid), new ObjectId(A2.uid)];
  await db.collection("toolconfirmations").deleteMany({ user: { $in: allUids } });
  await db.collection("toolauditlogs").deleteMany({ user: { $in: allUids } });
  await db.collection("reminders").deleteMany({ user: { $in: allUids } });
  await db.collection("petdiets").deleteMany({ user: { $in: allUids } });
  await db.collection("pets").deleteMany({ owner: { $in: allUids } });
  await db.collection("notifications").deleteMany({ user: { $in: allUids } });
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