// =====================================================================
// FAMIPET — Phase 10 (AI Tool Layer) HTTP/API suite
// Exercises the three new protected endpoints end-to-end over HTTP:
//   POST /api/ai/tool          (proposal-mode; reads auto-execute)
//   POST /api/ai/tools/confirm (execute an approved mutation ONCE)
//   POST /api/ai/tools/cancel  (invalidate a pending proposal)
// Verifies HTTP status mapping for the tool-layer error categories,
// anonymous 401s, cross-user denial at both proposal and confirm, and
// exactly-once execution persisted to Mongo.
// Run:  MSYS_NO_PATHCONV=1 docker run --rm --network fami-pet_famipet-backend-net
//       -v "$(pwd -W)/compose/scripts:/suite:ro" -w /app --entrypoint node
//       -e API_BASE=http://backend:5000/api famipet-backend:production
//       /suite/phase10-ai-tools-api.cjs
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

const Run = `p10a-${Date.now()}`;
const emails = [];
let db = null;
let mongoose = null;

async function makeUser(tag) {
  const email = `${Run}-${tag}@famipet.test`;
  emails.push(email);
  await j("POST", "/auth/register", {
    body: { name: `Phase10 ${tag}`, email, password: "Password123!" },
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
    .find({ email: /^p10a-.*@famipet\.test$/ })
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
  console.log(`-- purged ${uids.length} prior Phase10-api fixture user(s) --`);
}

async function main() {
  console.log(`== Phase 10 AI Tool Layer API suite (run ${Run}) ==`);

  mongoose = require("/app/node_modules/mongoose");
  await mongoose.connect("mongodb://mongodb:27017/petDB", { serverSelectionTimeoutMS: 15000 });
  db = mongoose.connection.db;

  await purgePriorRunFixtures();

  // ---- A. anonymous guards -------------------------------------------
  console.log("-- A auth guards --");
  let r = await j("POST", "/ai/tool", { body: { tool: "get_reminders", args: {} }, expect: 401 });
  ok(!r.data.success, "anonymous /ai/tool -> 401");
  r = await j("POST", "/ai/tools/confirm", { body: { token: "x" }, expect: 401 });
  r = await j("POST", "/ai/tools/cancel", { body: { token: "x" }, expect: 401 });
  ok(r.status === 401, "anonymous /ai/tools/cancel -> 401");
  r = await j("POST", "/ai/ask", { body: { message: "hi" }, expect: 401 });
  ok(r.status === 401, "auth wiring intact: anonymous /ai/ask -> 401");

  // ---- fixtures ------------------------------------------------------
  console.log("-- fixtures --");
  const A = await makeUser("a");
  const B = await makeUser("b");
  const petA = await makePet(A.token, { name: "Bruno" });

  // ---- B. validation + unknown tool status mapping -------------------
  console.log("-- B validation mapping --");
  r = await j("POST", "/ai/tool", { token: A.token, body: { tool: "no_such_tool", args: {} }, expect: 409 });
  ok(r.data.errorCategory === "tool_unavailable", "unknown tool -> 409 tool_unavailable");
  r = await j("POST", "/ai/tool", { token: A.token, body: { tool: "get_reminders", args: { foo: "bar" } }, expect: 400 });
  ok(r.data.errorCategory === "validation", "unknown arg -> 400 validation");
  r = await j("POST", "/ai/tool", { token: A.token, body: { tool: "get_reminders", args: { $where: "1" } }, expect: 400 });
  ok(r.data.errorCategory === "validation", "operator key -> 400 validation");
  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: {}, expect: 400 });
  ok(r.data.errorCategory === "confirmation_invalid", "confirm without token -> 400 confirmation_invalid");

  // ---- C. reads over HTTP --------------------------------------------
  console.log("-- C reads --");
  r = await j("POST", "/ai/tool", { token: A.token, body: { tool: "get_pet", args: { petId: petA._id } }, expect: 200 });
  ok(r.data.success && r.data.tool === "get_pet" && r.data.kind === "read", "get_pet read");
  ok(r.data.data.pet && r.data.data.pet.id === petA._id && r.data.data.pet.name === "Bruno", "read payload normalized");
  r = await j("POST", "/ai/tool", { token: B.token, body: { tool: "get_pet", args: { petId: petA._id } }, expect: 404 });
  ok(r.data.errorCategory === "not_found", "cross-user read -> 404 not_found");
  r = await j("POST", "/ai/tool", { token: A.token, body: { tool: "get_reminders", args: {} }, expect: 200 });
  ok(r.data.success && Array.isArray(r.data.data.reminders), "get_reminders -> array");

  // ---- D. proposal -> confirm (exactly-once) -------------------------
  console.log("-- D create_reminder E2E --");
  r = await j("POST", "/ai/tool", {
    token: A.token,
    body: { tool: "create_reminder", args: { title: "Vaccination visit", type: "vaccination", date: "2026-10-01", time: "10:30", pet: petA._id } },
    expect: 200,
  });
  ok(r.data.requiresConfirmation === true && r.data.action === "create_reminder", "mutation -> proposal (not executed)");
  ok(r.data.preview && r.data.preview.summary && r.data.confirmation && r.data.confirmation.token, "proposal preview + confirmation carried");
  const token1 = r.data.confirmation.token;
  ok(token1 && !/^[a-f0-9]{64}$/.test(token1), "response token is the SINGLE-USE raw token (not a hash)");

  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: { token: token1 }, expect: 200 });
  ok(r.data.success && r.data.tool === "create_reminder", "confirm executed mutation");
  const remDoc = await db.collection("reminders").findOne({ user: new mongoose.Types.ObjectId(A.uid) });
  ok(remDoc && remDoc.title === "Vaccination visit" && remDoc.pet && String(remDoc.pet) === petA._id, "reminder persisted with owned pet");

  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: { token: token1 }, expect: 400 });
  ok(r.data.errorCategory === "confirmation_invalid", "re-confirm -> 400 exactly-once");

  // ---- E. cancel path -------------------------------------------------
  console.log("-- E cancel --");
  r = await j("POST", "/ai/tool", {
    token: A.token,
    body: { tool: "update_reminder", args: { reminderId: String(remDoc._id), isCompleted: true } },
    expect: 200,
  });
  const token2 = r.data.confirmation.token;
  ok(!!token2, "update_reminder proposal minted");
  r = await j("POST", "/ai/tools/cancel", { token: A.token, body: { token: token2 }, expect: 200 });
  ok(r.data.success === true, "cancel -> 200");
  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: { token: token2 }, expect: 400 });
  ok(r.data.errorCategory === "confirmation_invalid", "cancelled token confirm -> 400");
  const remUnchanged = await db.collection("reminders").findOne({ _id: remDoc._id });
  ok(remUnchanged.isCompleted !== true, "cancelled action never applied (reminder unchanged)");

  // ---- F. cross-user confirm ------------------------------------------
  console.log("-- F cross-user --");
  r = await j("POST", "/ai/tool", {
    token: A.token,
    body: { tool: "create_pet", args: { name: "Rex", breed: "Labrador", species: "dog", gender: "male", age: 2 } },
    expect: 200,
  });
  const token3 = r.data.confirmation.token;
  r = await j("POST", "/ai/tools/confirm", { token: B.token, body: { token: token3 }, expect: 403 });
  ok(r.data.errorCategory === "authorization", "cross-user confirm -> 403 authorization");

  // ---- G. create_pet + update_pet E2E --------------------------------
  console.log("-- G pet E2E --");
  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: { token: token3 }, expect: 200 });
  ok(r.data.success && r.data.data.pet && r.data.data.pet.name === "Rex", "create_pet confirmed via tool API");
  const rex = await db.collection("pets").findOne({ name: "Rex", owner: new mongoose.Types.ObjectId(A.uid) });
  ok(rex && String(rex.owner) === A.uid, "confirmed pet owned by A");

  r = await j("POST", "/ai/tool", {
    token: A.token,
    body: { tool: "update_pet", args: { petId: petA._id, name: "Bruno Jr", weight: 25 } },
    expect: 200,
  });
  ok(r.data.requiresConfirmation && r.data.preview.fields.weight === 25, "update_pet proposal carries optional fields");
  const updToken = r.data.confirmation.token;
  r = await j("POST", "/ai/tools/confirm", { token: A.token, body: { token: updToken }, expect: 200 });
  const updated = await db.collection("pets").findOne({ _id: new mongoose.Types.ObjectId(petA._id) });
  ok(updated && updated.name === "Bruno Jr" && updated.weight === 25, "update_pet applied optional fields");

  // ---- cleanup fixtures -----------------------------------------------
  console.log("-- cleanup --");
  const uids = [new mongoose.Types.ObjectId(A.uid), new mongoose.Types.ObjectId(B.uid)];
  await db.collection("toolconfirmations").deleteMany({ user: { $in: uids } });
  await db.collection("toolauditlogs").deleteMany({ user: { $in: uids } });
  await db.collection("reminders").deleteMany({ user: { $in: uids } });
  await db.collection("petdiets").deleteMany({ user: { $in: uids } });
  await db.collection("notifications").deleteMany({ user: { $in: uids } });
  await db.collection("pets").deleteMany({ owner: { $in: uids } });
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