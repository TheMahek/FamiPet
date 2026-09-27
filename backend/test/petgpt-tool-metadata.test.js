// =========================================================
// Tool metadata is fail-closed — readOnly must be declared
// ---------------------------------------------------------
// Run: node test/petgpt-tool-metadata.test.js
//
// The one thing this guards: a tool that WRITES can never end up
// outside the confirmation gate by accident.
//
// executeTool only consults the confirmation gate for a non-read-only
// tool. So while `readOnly` defaulted to `true`, a mutating tool that
// simply forgot the flag was silently treated as a reader — it skipped
// the gate entirely and wrote on the first turn, with no preview, no
// pending request and nothing for the user to confirm. That is the worst
// possible failure for a policy the backend advertises as enforced in
// code, and it was invisible: no error, no log line, just a write.
//
// There is no safe default to substitute. readOnly is now a required
// boolean, so the mistake surfaces as a startup failure that names the
// tool instead of as a silent bypass. The gate itself is unchanged —
// `readOnly: false` still flows through gateMutation exactly as before,
// and ownership, MutationRequest and MutationEffect are untouched.
//
// The probe tools below are registered into this process's own registry
// (npm test runs each suite in its own process) so the real tool set is
// never modified and no existing suite's registry is polluted.
// =========================================================

const assert = require("assert");
const { testDbUri } = require("./db");
const mongoose = require("mongoose");

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = testDbUri("animal_planet_petgpt_tool_metadata_test");

require("../ai"); // registers adapters + all production tools
const User = require("../models/User");
const Pet = require("../models/Pet");
const Breed = require("../models/Breed");
const Reminder = require("../models/Reminder");
const Conversation = require("../models/Conversation");
const MutationEffect = require("../models/MutationEffect");
const MutationRequest = require("../models/MutationRequest");
const { registerTool, executeTool, getTool, listToolNames } = require("../ai/tools");
const { isExplicitConfirmation } = require("../ai/confirmation");

let passed = 0;
const ok = (name) => { passed++; console.log(`ok ${passed} - ${name}`); };

const PROBE_SCHEMA = {
  type: "object",
  properties: { label: { type: "string" } },
  required: ["label"],
};

// A read-only probe: its execute() is a counter, and a reader is
// expected to run it with no conversation and no confirmation at all.
let readWrites = 0;
registerTool({
  name: "test_readonly_probe",
  description: "Read-only probe tool used to assert readOnly metadata.",
  readOnly: true,
  schema: PROBE_SCHEMA,
  execute: async () => {
    readWrites++;
    return { probe: "read" };
  },
});

// A MUTATING probe with the flag set correctly. It is the honest version
// of an accidentally-added mutating tool: it must be gated.
let mutationWrites = 0;
registerTool({
  name: "test_mutation_probe",
  description: "Mutating probe tool used to assert the confirmation gate.",
  readOnly: false,
  describe: (a) => `write ${String(a.label).trim()}`,
  schema: PROBE_SCHEMA,
  execute: async ({ args }) => {
    mutationWrites++;
    return { probe: "written", label: args.label };
  },
});

// Reproduce one turn exactly as the worker builds the context: the
// verdict comes from the persisted user message, never from the model.
function turn(tool, args, userId, { conversation, jobId, text }) {
  return executeTool(tool, args, userId, {
    jobId,
    conversation,
    confirmed: isExplicitConfirmation(text),
  });
}

const REQUEST_TURN = "please write the thing";
const CONFIRM_TURN = "yes";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await MutationEffect.init();
  await MutationRequest.init();

  const alice = await User.create({ name: "Alice", email: "meta-alice@test.dev", password: "Test1234!" });
  const conversation = await Conversation.create({ owner: alice._id });

  // ---- 1. every PRODUCTION tool still declares the flag ----------------
  // The change makes the declaration mandatory, so a production tool
  // that omitted it would now refuse to boot. Assert the whole shipped
  // registry is well-formed, which is what keeps that from being a
  // surprise at startup.
  const names = listToolNames().filter((n) => !n.startsWith("test_"));
  assert.ok(names.length > 0, "the production registry is not empty");
  for (const name of names) {
    const tool = getTool(name);
    assert.strictEqual(
      typeof tool.readOnly,
      "boolean",
      `production tool "${name}" must register with a boolean readOnly`
    );
  }
  ok(`fail-closed: all ${names.length} production tools declare readOnly explicitly`);

  // ---- 2. readOnly: true registers as read-only ------------------------
  // A declared reader is NOT gated: no conversation, no confirmation,
  // no pending request — the tool simply runs.
  assert.strictEqual(getTool("test_readonly_probe").readOnly, true, "readOnly: true is kept as read-only");
  const read = await executeTool("test_readonly_probe", { label: "harmless" }, alice._id);
  assert.strictEqual(read.ok, true, "a declared read-only tool still executes");
  assert.strictEqual(read.confirmationRequired, undefined, "a reader is never asked for confirmation");
  assert.strictEqual(readWrites, 1, "a reader runs its execute() with no conversation scope at all");
  ok("readOnly: true registers as read-only and is not confirmation-gated");

  // ---- 3. omitted readOnly is refused at registration ------------------
  // The regression itself: a tool with no readOnly must not register,
  // and it must not become an ungated writer.
  assert.throws(
    () => registerTool({ name: "test_omitted_readonly", description: "no flag", schema: PROBE_SCHEMA, execute: async () => ({}) }),
    (error) => {
      assert.strictEqual(error.code, "execution_error", "an omitted readOnly is a registration error");
      assert.match(error.message, /test_omitted_readonly/, "the failure names the offending tool");
      assert.match(error.message, /readOnly/, "the failure says what to declare");
      return true;
    },
    "a tool that omits readOnly is rejected instead of silently defaulting"
  );
  assert.strictEqual(getTool("test_omitted_readonly"), undefined, "the undeclared tool is NOT in the registry");

  // A truthy non-boolean is the same mistake wearing a disguise.
  for (const bad of ["false", "true", 1, 0, null, undefined]) {
    assert.throws(
      () => registerTool({ name: `test_bad_readonly_${String(bad)}`, description: "bad flag", readOnly: bad, schema: PROBE_SCHEMA, execute: async () => ({}) }),
      /must declare readOnly explicitly/,
      `readOnly: ${JSON.stringify(bad)} is refused, not coerced`
    );
  }
  assert.ok(listToolNames().every((n) => !n.startsWith("test_bad_readonly_")), "no coerced tool reached the registry");
  ok("fail-closed: an omitted or non-boolean readOnly is rejected at registration, naming the tool");

  // ---- 4. readOnly: false is mutation-gated ---------------------------
  assert.strictEqual(getTool("test_mutation_probe").readOnly, false, "readOnly: false is kept as a mutation");

  // 4a. No conversation scope at all -> cannot bind consent, fail closed.
  const noScope = await executeTool("test_mutation_probe", { label: "no scope" }, alice._id, {
    jobId: new mongoose.Types.ObjectId(),
    confirmed: true,
  });
  assert.strictEqual(noScope.ok, true, "an unscoped mutation is refused without failing the call");
  assert.strictEqual(noScope.confirmationRequired, true, "an unscoped mutation asks for confirmation");
  assert.strictEqual(mutationWrites, 0, "an unscoped mutation wrote NOTHING");
  ok("readOnly: false with no conversation scope fails closed and writes nothing");

  // 4b. The accidental-bypass scenario. A mutating tool added without
  // any thought about confirmation, on a NON-confirming turn: it must
  // not write, it must preview, and a pending request must be recorded
  // so a later turn can match it.
  const args = { label: "accidental write" };
  const first = await turn("test_mutation_probe", args, alice._id, {
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: REQUEST_TURN,
  });
  assert.strictEqual(first.ok, true, "an unconfirmed mutation is a successful refusal, not an error");
  assert.strictEqual(first.confirmationRequired, true, "the model is told a confirmation is required");
  assert.strictEqual(mutationWrites, 0, "an unconfirmed mutating tool wrote NOTHING — no silent bypass");
  assert.match(first.result.action, /accidental write/, "the preview describes the exact action");
  const pending = await MutationRequest.find({ owner: alice._id, tool: "test_mutation_probe" }).lean();
  assert.strictEqual(pending.length, 1, "the preview is recorded as a pending request");
  assert.strictEqual(pending[0].status, "pending", "the recorded request is pending, not executed");
  ok("fail-closed: an accidentally added mutating tool cannot silently bypass confirmation");

  // 4c. A bare "yes" approves that exact action — and only that one.
  const confirmed = await turn("test_mutation_probe", args, alice._id, {
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(confirmed.ok, true, "the confirmed mutation executes");
  assert.strictEqual(confirmed.confirmationRequired, undefined, "a confirmed mutation is not re-asked");
  assert.strictEqual(mutationWrites, 1, "the confirmed turn wrote exactly once");

  // The consent is bound to the previewed ARGUMENTS, so the same "yes"
  // cannot authorize a different action.
  const elsewhere = await turn("test_mutation_probe", { label: "a different action" }, alice._id, {
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(elsewhere.confirmationRequired, true, "a yes does not approve a different action");
  assert.strictEqual(mutationWrites, 1, "the un-previewed action still wrote NOTHING");
  ok("confirmation stays bound to the exact previewed arguments");

  // 4d. Repeated confirmation is idempotent, across turns.
  const repeated = await turn("test_mutation_probe", args, alice._id, {
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(repeated.ok, true, "a repeated confirmation is accepted");
  assert.strictEqual(repeated.replayed, true, "a repeated confirmation replays the recorded result");
  assert.strictEqual(mutationWrites, 1, "a repeated confirmation wrote NOTHING the second time");
  const settled = await MutationRequest.find({ owner: alice._id, tool: "test_mutation_probe", status: "executed" }).lean();
  assert.strictEqual(settled.length, 1, "the request settled exactly once as executed");
  ok("repeated confirmation replays the receipt instead of writing twice");

  // ---- 5. ownership still runs BEFORE confirmation ---------------------
  // The gate change must not have reordered anything: a foreign pet is
  // refused outright, never converted into a confirmation prompt.
  const breed = await Breed.create({ name: "Labrador", species: "dog" });
  const owned = await Pet.create({ owner: alice._id, breed: breed._id, name: "Rex", species: "dog", gender: "male", age: 3 });
  const bob = await User.create({ name: "Bob", email: "meta-bob@test.dev", password: "Test1234!" });
  const foreign = await turn("create_reminder", {
    petId: owned._id.toString(),
    title: "Not yours",
    type: "feeding",
    date: "2026-09-28",
    time: "08:00",
  }, bob._id, {
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: "yes",
  });
  assert.strictEqual(foreign.ok, false, "a foreign pet is refused even on a confirming turn");
  assert.ok(!JSON.stringify(foreign).includes("confirmationRequired"), "a refusal is not turned into a confirmation prompt");
  assert.strictEqual(await Reminder.countDocuments({}), 0, "the refused mutation wrote NOTHING");
  ok("ownership authorization still precedes the confirmation gate");

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`\n✅ petgpt-tool-metadata.test.js — passed (${passed} checks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
