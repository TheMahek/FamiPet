// =====================================================================
// FAMIPET — Phase 10 (AI Tool Layer) CORE in-process suite
// Runs inside the backend container and exercises toolLayer.js DIRECTLY
// (not over HTTP) for the security-critical invariants:
//   - registry is exactly the required 9 tools (no extras)
//   - arg validation is allowlist-only (unknown keys / operators /
//     meal-injection rejected; raw tokens are never stored plain)
//   - reads auto-execute owned data only; cross-user -> 404/403
//   - mutations NEVER run from model input: proposal -> token -> confirm;
//     exactly-once execution; cancel invalidates; superseding dedupe
//   - per-request budget + quota gates hold
//   - every call is audited to ToolAuditLog
// Fixtures (users/pets via the real HTTP API + DB writes for cleanup) are
// purged on exit. Requires the famipet-backend container + mongodb.
// Run:  MSYS_NO_PATHCONV=1 docker run --rm --network fami-pet_famipet-backend-net
//       -v "$(pwd -W)/compose/scripts:/suite:ro" -w /app --entrypoint node
//       -e API_BASE=http://backend:5000/api famipet-backend:production
//       /suite/phase10-tool-core.cjs
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

const Run = `p10c-${Date.now()}`;
const emails = [];
let mongoose = null;
let db = null;
let User = null;
let toolLayer = null;
let ToolConfirmation = null;
let ToolAuditLog = null;
let Reminder = null;
let PetDietModel = null;

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
  return { email, token, uid, user: await User.findById(uid).lean() };
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

async function callLayer(fn, opts) {
  try {
    const r = await toolLayer[fn](opts);
    return r;
  } catch (e) {
    return { ok: false, crashed: true, message: e.message };
  }
}

async function purgePriorRunFixtures() {
  const prior = await db
    .collection("users")
    .find({ email: /^p10c-.*@famipet\.test$/ })
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
  console.log(`-- purged ${uids.length} prior Phase10-core fixture user(s) --`);
}

async function main() {
  console.log(`== Phase 10 AI Tool Layer core suite (run ${Run}) ==`);

  mongoose = require("/app/node_modules/mongoose");
  User = require("/app/models/User");
  ToolConfirmation = require("/app/models/ToolConfirmation");
  ToolAuditLog = require("/app/models/ToolAuditLog");
  Reminder = require("/app/models/Reminder");
  PetDietModel = require("/app/models/PetDiet");
  toolLayer = require("/app/services/toolLayer");

  await mongoose.connect("mongodb://mongodb:27017/petDB", { serverSelectionTimeoutMS: 15000 });
  db = mongoose.connection.db;

  await purgePriorRunFixtures();

  const rid = () => `suite-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // ---- A. registry ---------------------------------------------------
  console.log("-- A registry --");
  const NAMES = ["get_pet", "create_pet", "update_pet", "get_diet", "update_diet", "get_appointments", "get_reminders", "create_reminder", "update_reminder"];
  ok(JSON.stringify(toolLayer.TOOL_NAMES) === JSON.stringify(NAMES), "registry has exactly the 9 required tools in order");
  ok(toolLayer.TOOL_MAX_CALLS_PER_REQUEST === 8 && toolLayer.TOOL_MAX_ROUNDS === 5, "budgets set (8 calls / 5 rounds)");

  const defs = toolLayer.getToolDefinitions();
  ok(defs.length === 9, "getToolDefinitions -> 9 declarations");
  for (const d of defs) {
    const okd = !!d.name && !!d.description && d.parameters && d.parameters.type === "OBJECT" && d.parameters.properties;
    ok(okd, `def ${d.name} well-formed`);
    const names = Object.keys(d.parameters.properties);
    ok(d.parameters.required.every((r) => names.includes(r)), `def ${d.name} required subset of properties`);
  }
  const updPetDef = defs.find((d) => d.name === "update_pet");
  ok(updPetDef.parameters.properties.weight && !updPetDef.parameters.required.includes("weight"),
    "update_pet exposes optional weight in properties, not in required");
  const rmDef = defs.find((d) => d.name === "get_reminders");
  ok(rmDef.parameters.properties.filter && !rmDef.parameters.required.includes("filter"),
    "get_reminders exposes optional filter");

  // ---- fixtures ------------------------------------------------------
  console.log("-- fixtures --");
  const A = await makeUser("a");
  const B = await makeUser("b");
  const petA = await makePet(A.token, { name: "Bruno" });
  const petB = await makePet(B.token, { name: "Bella" });

  // ---- B. auth + unknown tool + validation ---------------------------
  console.log("-- B auth/unknown/validation --");
  let r = await callLayer("runTool", { requestId: rid(), tool: "get_pet", args: { petId: petA._id } });
  ok(!r.ok && r.errorCategory === "auth", "no user -> auth");
  ok(r.statusCode === 401, "no user -> 401");

  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "eval", args: {} });
  ok(!r.ok && r.errorCategory === "tool_unavailable", "unknown tool -> tool_unavailable");
  ok(r.statusCode === 409, "unknown tool -> 409");

  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "get_reminders", args: { $where: "true" } });
  ok(!r.ok && r.errorCategory === "validation", "operator key rejected -> validation");

  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "create_pet", args: { name: "X", species: "dog", owner: petA._id } });
  ok(!r.ok && r.errorCategory === "validation", "owner/unknown field rejected -> validation");

  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "create_reminder", args: { title: "Meds", type: "medicine", pet: petA._id } });
  ok(!r.ok && r.errorCategory === "validation", "missing required date/time -> validation");

  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "get_pet", args: { petId: "shazam" } });
  ok(!r.ok && r.errorCategory === "validation", "bad petId -> validation");

  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "update_diet", args: { petId: petA._id, meals: [{ label: "B", time: "08:00", $gt: 1 }] } });
  ok(!r.ok && r.errorCategory === "validation", "unknown meal field (operator) rejected");

  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "create_pet", args: { name: "X", breed: "Beagle", species: "dragon", gender: "male", age: 2 } });
  ok(!r.ok && r.errorCategory === "validation", "bad species enum -> validation");

  // budget gate
  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "create_pet", args: { name: "X", breed: "Beagle", species: "dog", gender: "male", age: 2 }, callBudget: { used: 1, max: 1 } });
  ok(!r.ok && r.errorCategory === "tool_unavailable", "call budget exhausted -> tool_unavailable");

  // ---- C. reads (auto-execute, owned, normalized) --------------------
  console.log("-- C reads --");
  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "get_pet", args: { petId: petA._id } });
  ok(r.ok && r.kind === "read" && r.data.pet && r.data.pet.id === petA._id, "get_pet own pet ok");
  ok(r.data.pet.name === "Bruno" && r.data.pet.species === "dog", "get_pet normalizer strips to safe pet");

  r = await callLayer("runTool", { user: B.user, requestId: rid(), tool: "get_pet", args: { petId: petA._id } });
  ok(!r.ok && r.errorCategory === "not_found" && r.statusCode === 404, "get_pet cross-user -> 404");

  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "get_diet", args: { petId: petA._id } });
  ok(r.ok && r.data.diet === null && r.data.guidance, "get_diet empty profile + guidance");

  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "get_appointments", args: {} });
  ok(r.ok && Array.isArray(r.data.appointments), "get_appointments -> array");

  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "get_reminders", args: {} });
  ok(r.ok && Array.isArray(r.data.reminders), "get_reminders raw-array service wrapped -> array");
  r = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "get_reminders", args: { filter: "bogus" } });
  ok(!r.ok && r.errorCategory === "validation", "get_reminders bad filter -> validation");

  // ---- D. mutations: nothing executes without confirmation -----------
  console.log("-- D proposal/confirm security --");
  const pro = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "create_pet", args: { name: "Rex", breed: "Labrador", species: "dog", gender: "male", age: 1, weight: 18 } });
  ok(pro.ok && pro.requiresConfirmation && pro.action === "create_pet", "create_pet -> proposal, not execution");
  ok(!!pro.confirmation && !!pro.confirmation.token && !!pro.confirmation.id, "proposal carries id + token");
  ok(pro.preview && String(pro.preview.summary).includes("Rex"), "preview summarizes the action");

  const still = await db.collection("pets").countDocuments({ owner: new mongoose.Types.ObjectId(A.uid) });
  ok(still === 1, "no pet created by the proposal itself");

  const rawDoc = await ToolConfirmation.findById(pro.confirmation.id).lean();
  ok(rawDoc && rawDoc.status === "pending" && rawDoc.kind === "mutation", "proposal persisted pending mutation");
  ok(rawDoc.tokenHash !== pro.confirmation.token && !JSON.stringify(rawDoc).includes(pro.confirmation.token),
    "raw confirmation token never stored (only HMAC hash)");

  // model-facing result strips the token
  const forModel = toolLayer.resultForModel(pro);
  ok(forModel.requiresConfirmation && !forModel.confirmation && !forModel.token, "resultForModel never leaks the token");

  const conf = await callLayer("confirmTool", { user: A.user, requestId: rid(), token: pro.confirmation.token });
  ok(conf.ok && conf.action === "create_pet" && conf.data.resource, "confirm executes exactly once");
  const rex = await db.collection("pets").findOne({ owner: new mongoose.Types.ObjectId(A.uid), name: "Rex" });
  ok(!!rex, "confirmed pet actually persisted");

  const double = await callLayer("confirmTool", { user: A.user, requestId: rid(), token: pro.confirmation.token });
  ok(!double.ok && double.errorCategory === "confirmation_invalid", "re-confirm same token -> exactly-once rejected");

  // cross-user confirm of user B's proposal
  const proB = await callLayer("runTool", { user: B.user, requestId: rid(), tool: "create_reminder", args: { title: "Groom", type: "grooming", date: "2026-09-21", time: "09:00", pet: petB._id } });
  ok(proB.ok && proB.requiresConfirmation, "B mints reminder proposal for own pet");
  const cross = await callLayer("confirmTool", { user: A.user, requestId: rid(), token: proB.confirmation.token });
  ok(!cross.ok && cross.errorCategory === "authorization" && cross.statusCode === 403, "cross-user confirm -> 403");

  // cross-user proposal reference denied at proposal time
  r = await callLayer("runTool", { user: B.user, requestId: rid(), tool: "update_pet", args: { petId: petA._id, name: "Hijack" } });
  ok(!r.ok && r.errorCategory === "authorization", "cross-user update_pet proposal -> 403");

  // ---- E. supersede dedupe + cancel + exactly-once creation ----------
  console.log("-- E dedupe/cancel --");
  const rmArgs = { title: "Vitamins", type: "medicine", date: "2026-09-22", time: "18:00", pet: petA._id };
  const p1 = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "create_reminder", args: rmArgs });
  const p2 = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "create_reminder", args: rmArgs });
  ok(p1.ok && p2.ok && p1.confirmation.id !== p2.confirmation.id, "two live proposal ids differ");
  const s1 = await ToolConfirmation.findById(p1.confirmation.id).lean();
  ok(s1.status === "cancelled", "identical re-proposal supersedes (p1 cancelled)");
  const c2 = await callLayer("confirmTool", { user: A.user, requestId: rid(), token: p2.confirmation.token });
  ok(c2.ok, "superseding token confirms");
  const c1 = await callLayer("confirmTool", { user: A.user, requestId: rid(), token: p1.confirmation.token });
  ok(!c1.ok && c1.errorCategory === "confirmation_invalid", "superseded token cannot execute");
  const remCount = await db.collection("reminders").countDocuments({ user: new mongoose.Types.ObjectId(A.uid) });
  ok(remCount === 1, `exactly one reminder created (got ${remCount})`);

  // cancel then confirm fails
  const firstReminder = await db.collection("reminders").findOne({ user: new mongoose.Types.ObjectId(A.uid) });
  const p3 = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "update_reminder", args: { reminderId: String(firstReminder._id), isCompleted: true } });
  ok(p3.ok && p3.requiresConfirmation, "update_reminder proposal ok");
  const cancelled = await callLayer("cancelTool", { user: A.user, requestId: rid(), token: p3.confirmation.token });
  ok(cancelled.ok, "cancel succeeds");
  const afterCancel = await callLayer("confirmTool", { user: A.user, requestId: rid(), token: p3.confirmation.token });
  ok(!afterCancel.ok && afterCancel.errorCategory === "confirmation_invalid", "cancelled token cannot confirm");
  const cancelledAgain = await callLayer("cancelTool", { user: A.user, requestId: rid(), token: p3.confirmation.token });
  ok(cancelledAgain.ok, "cancel is idempotent");

  // ---- F. update_diet through the layer ------------------------------
  console.log("-- F update_diet --");
  const dietPro = await callLayer("runTool", { user: A.user, requestId: rid(), tool: "update_diet", args: { petId: petA._id, foodType: "dry", dailyPortionGrams: 300, meals: [{ label: "Breakfast", time: "08:00", portionGrams: 150 }] } });
  ok(dietPro.ok && dietPro.requiresConfirmation && dietPro.preview.fields.meals.length === 1, "update_diet proposal + preview meals");
  const dietConf = await callLayer("confirmTool", { user: A.user, requestId: rid(), token: dietPro.confirmation.token });
  ok(dietConf.ok && dietConf.data.resource && dietConf.data.diet && dietConf.data.diet.id, "update_diet confirmed + persisted");
  const dietDoc = await db.collection("petdiets").findOne({ user: new mongoose.Types.ObjectId(A.uid) });
  ok(dietDoc && dietDoc.foodType === "dry" && dietDoc.meals.length === 1, "diet doc in DB matches confirm args");

  // ---- G. audit ------------------------------------------------------
  console.log("-- G audit --");
  const readOk = await toolLayer.runTool({ user: A.user, requestId: "audit-read", tool: "get_appointments", args: {} });
  // Audit writes are fire-and-forget; give the insert a moment to flush.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const auditRows = await ToolAuditLog.find({ user: A.uid }).lean();
  ok(auditRows.length >= 1, "ToolAuditLog has rows for the user");
  ok(auditRows.some((x) => x.requestId === "audit-read" && x.ok === true && x.kind === "read"), "read audited (requestId audit-read)");
  const VALID_CATS = ["validation", "auth", "authorization", "not_found", "confirmation_required", "confirmation_invalid", "tool_unavailable", "execution"];
  ok(auditRows.every((x) => !x.errorCategory || VALID_CATS.includes(x.errorCategory)),
    "audit errorCategory values match the enum");
  ok(auditRows.some((x) => x.tool === "create_reminder" && x.kind === "mutation" && x.ok === true), "mutation execution audited");
  ok(typeof readOk.ok === "boolean", "quota 'audit-read' run did not pollute assertions (ok boolean)");

  // ---- cleanup fixtures -----------------------------------------------
  console.log("-- cleanup --");
  const uids = [new mongoose.Types.ObjectId(A.uid), new mongoose.Types.ObjectId(B.uid)];
  await db.collection("toolconfirmations").deleteMany({ user: { $in: uids } });
  await db.collection("toolauditlogs").deleteMany({ user: { $in: uids } });
  await db.collection("reminders").deleteMany({ user: { $in: uids } });
  await db.collection("petdiets").deleteMany({ user: { $in: uids } });
  await db.collection("pets").deleteMany({ owner: { $in: uids } });
  await db.collection("notifications").deleteMany({ user: { $in: uids } });
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