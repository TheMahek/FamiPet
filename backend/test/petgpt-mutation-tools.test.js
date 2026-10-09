// =========================================================
// Phase 6 — PetGPT mutation tool tests
// ---------------------------------------------------------
// Direct-layer tests (no HTTP, no worker), mirroring
// petgpt-tools.test.js:
//   * registration + declarations + readOnly flags
//   * the enforced ask-before-mutating protocol: preview -> confirm
//   * create_reminder / complete_reminder success + persistence
//   * argument and enum validation (schema.js is types-only, so enum
//     checks live in tool execute — asserted here)
//   * ownership isolation and foreign/invalid IDs (no existence oracle)
//   * MutationEffect idempotency: same job + same args -> replay, no
//     second write; different job -> legitimate second action;
//     failed mutations leave NO ledger row; no jobId -> no ledger
//   * prompt-level mutation-confirm safety and enumeration
//   * no secret leakage in results, persisted docs, or declarations
//
// Every mutating call goes through `turn()` below, which is the same
// shape the durable worker builds: the tool context is derived from the
// PERSISTED USER MESSAGE, so a test cannot accidentally assert against a
// confirmation the backend would never recognise.
// =========================================================

const assert = require("assert");
const { testDbUri } = require("./db");
const mongoose = require("mongoose");

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = testDbUri("animal_planet_petgpt_mutation_tools_test");
process.env.PETGPT_OPENAI_BASE_URL = "http://127.0.0.1:9/v1";
process.env.PETGPT_OPENAI_API_KEY = "sk-mutation-test";
process.env.PETGPT_OPENAI_MODEL = "test-model";
process.env.PETGPT_MAX_TOOL_ITERATIONS = "3";

require("../ai"); // registers adapters + all tools (read + mutation)
const User = require("../models/User");
const Pet = require("../models/Pet");
const Breed = require("../models/Breed");
const Reminder = require("../models/Reminder");
const Conversation = require("../models/Conversation");
const MutationEffect = require("../models/MutationEffect");
const MutationRequest = require("../models/MutationRequest");
const { executeTool, getTool, listToolNames, listToolDeclarations } = require("../ai/tools");
const { isExplicitConfirmation } = require("../ai/confirmation");
const { buildSystemPrompt } = require("../config/ai");
const { REMINDER_TYPES, REMINDER_FREQUENCIES, normalizeCreatedReminder } = require("../ai/tools/mutation-tools");

let passed = 0;
const ok = (name) => { passed++; console.log(`ok ${passed} - ${name}`); };

// Reproduce exactly one turn of the real protocol, from the worker's
// side: the tool context comes from the persisted user message, never
// from anything the model produced. `text` is that user message.
function turn({ tool, args, userId, conversation, jobId, text }) {
  return executeTool(tool, args, userId, {
    jobId,
    conversation,
    confirmed: isExplicitConfirmation(text),
  });
}

// A non-confirming user turn: a request, never an approval.
const REQUEST_TURN = "add a reminder to feed Rex tomorrow morning";
// A minimal, unambiguous approval.
const CONFIRM_TURN = "yes";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await MutationEffect.init();
  await MutationRequest.init();

  const alice = await User.create({ name: "Alice", email: "mut-alice@test.dev", password: "Test1234!" });
  const bob = await User.create({ name: "Bob", email: "mut-bob@test.dev", password: "Test1234!" });
  const breed = await Breed.create({ name: "Labrador", species: "dog" });
  const rex = await Pet.create({ owner: alice._id, breed: breed._id, name: "Rex", species: "dog", gender: "male", age: 3 });
  const conversation = await Conversation.create({ owner: alice._id });
  // A second chat, used to prove a confirmation is scoped to the
  // conversation that previewed the action.
  const otherConversation = await Conversation.create({ owner: alice._id });

  // ---- 1. registration / declarations / readOnly flags -----------------
  const names = listToolNames();
  for (const expected of ["create_reminder", "complete_reminder"]) {
    assert.ok(names.includes(expected), `tool "${expected}" registered`);
  }
  const decls = listToolDeclarations();
  const createDecl = decls.find((d) => d.function && d.function.name === "create_reminder");
  assert.ok(createDecl, "create_reminder has a provider declaration");
  assert.deepStrictEqual(createDecl.function.parameters.required, ["petId", "title", "type", "date", "time"], "create_reminder requires its mandatory args");
  assert.ok(createDecl.function.description.includes("confirm"), "create_reminder description tells the model the backend requires confirmation");
  assert.strictEqual(getTool("create_reminder").readOnly, false, "create_reminder is flagged as a mutation");
  assert.strictEqual(getTool("complete_reminder").readOnly, false, "complete_reminder is flagged as a mutation");
  assert.strictEqual(getTool("get_my_pets").readOnly, true, "read tools stay flagged read-only");
  assert.strictEqual(typeof getTool("create_reminder").describe, "function", "every mutation can describe the action it wants to take");
  assert.strictEqual(typeof getTool("complete_reminder").describe, "function");
  assert.strictEqual(typeof getTool("create_appointment").describe, "function");
  ok("mutations: both mutation tools registered as readOnly:false alongside read tools");

  // ---- 2. ASK-BEFORE-MUTATING, ENFORCED BY THE TOOL LAYER ---------------
  // The five required scenarios, in order. `flowArgs` is a distinct
  // reminder from the one section 3 writes, so counts stay readable.
  const flowArgs = {
    petId: rex._id.toString(),
    title: "Evening walk",
    type: "exercise",
    date: "2026-09-28",
    time: "18:00",
  };

  // 2a. First request -> confirmation required, NOTHING written.
  const firstJob = new mongoose.Types.ObjectId();
  const ask = await turn({
    tool: "create_reminder",
    args: flowArgs,
    userId: alice._id,
    conversation: conversation._id,
    jobId: firstJob,
    text: REQUEST_TURN,
  });
  assert.strictEqual(ask.ok, true, "the first request is answered, not crashed");
  assert.strictEqual(ask.confirmationRequired, true, "the first request comes back confirmation-required");
  assert.strictEqual(ask.result.confirmationRequired, true, "the result itself is flagged confirmation-required");
  assert.strictEqual(ask.result.tool, "create_reminder", "the result names the tool that was withheld");
  assert.ok(ask.result.action.includes("Evening walk"), `the result summarises the action: ${ask.result.action}`);
  assert.ok(ask.result.action.includes(rex.name), `the confirmation names the pet, not a raw id: ${ask.result.action}`);
  assert.ok(!ask.result.action.includes(rex._id.toString()), "the confirmation never shows an opaque id the user cannot check");
  assert.ok(!ask.result.reminder, "no reminder is returned on an unconfirmed request");
  assert.strictEqual(await Reminder.countDocuments({ title: "Evening walk" }), 0,
    "FIRST REQUEST MUST NOT MUTATE: no reminder was written");
  assert.strictEqual(await MutationEffect.countDocuments({ job: firstJob }), 0, "an unconfirmed request writes no ledger row");
  const pending = await MutationRequest.findOne({ owner: alice._id, conversation: conversation._id, tool: "create_reminder" }).lean();
  assert.ok(pending, "the pending request is recorded so a later turn can match it");
  assert.strictEqual(pending.status, "pending", "a previewed request is pending, not executed");
  ok("mutations: first request returns confirmation-required and writes nothing");

  // 2a-bis. Re-issuing the SAME call inside the same user turn still cannot
  // execute. The tool-calling loop may iterate; the confirmation verdict is
  // per user turn, so a model that retries in a loop gains nothing.
  const retrySameTurn = await turn({
    tool: "create_reminder",
    args: flowArgs,
    userId: alice._id,
    conversation: conversation._id,
    jobId: firstJob,
    text: REQUEST_TURN,
  });
  assert.strictEqual(retrySameTurn.confirmationRequired, true, "retrying inside the same turn is still refused");
  assert.strictEqual(await Reminder.countDocuments({ title: "Evening walk" }), 0, "loop retries still write nothing");
  ok("mutations: same-turn retries cannot bypass the gate");

  // 2a-ter. A non-affirmative "confirmation" is not a confirmation.
  for (const notConsent of ["no thanks", "wait, not yet", "can you book that for tomorrow instead?", "yes but make it 6am"]) {
    const hedged = await turn({
      tool: "create_reminder",
      args: flowArgs,
      userId: alice._id,
      conversation: conversation._id,
      jobId: new mongoose.Types.ObjectId(),
      text: notConsent,
    });
    assert.strictEqual(hedged.confirmationRequired, true, `"${notConsent}" is not treated as consent`);
  }
  assert.strictEqual(await Reminder.countDocuments({ title: "Evening walk" }), 0, "hedged answers still write nothing");
  ok("mutations: only an explicit, unambiguous affirmative counts as consent");

  // 2b. Explicit confirmation -> the mutation runs.
  const confirmJob = new mongoose.Types.ObjectId();
  const confirmed = await turn({
    tool: "create_reminder",
    args: flowArgs,
    userId: alice._id,
    conversation: conversation._id,
    jobId: confirmJob,
    text: CONFIRM_TURN,
  });
  assert.ok(!confirmed.confirmationRequired, "a confirming turn is not re-prompted");
  assert.ok(!confirmed.replayed, "the confirming turn is a real first execution");
  assert.strictEqual(confirmed.result.reminder.title, "Evening walk", "the confirmed result carries the created reminder");
  assert.strictEqual(await Reminder.countDocuments({ title: "Evening walk" }), 1, "confirmation wrote the reminder exactly once");
  const executed = await MutationRequest.findOne({ owner: alice._id, conversation: conversation._id, tool: "create_reminder" }).lean();
  assert.strictEqual(executed.status, "executed", "the request is now recorded as executed with its result");
  assert.strictEqual(executed.result.reminder.id.toString(), confirmed.result.reminder.id.toString(),
    "the receipt stores the real result, so a replay can never invent one");
  ok("mutations: explicit confirmation executes the mutation");

  // 2c. WRONG petId -> rejected, whether or not the turn is confirmed.
  // Ownership is checked BEFORE the gate, so a bad pet is refused outright
  // instead of being turned into a confirmation prompt.
  const wrongPet = await turn({
    tool: "create_reminder",
    args: { ...flowArgs, title: "Wrong pet", petId: "000000000000000000000000" },
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: REQUEST_TURN,
  });
  assert.strictEqual(wrongPet.ok, false, "a wrong petId is rejected on the requesting turn");
  assert.ok(wrongPet.error.includes("not found or not owned"), `wrong pet rejected: ${wrongPet.error}`);
  assert.strictEqual(await MutationRequest.countDocuments({ owner: alice._id, tool: "create_reminder", status: "pending" }), 0,
    "a rejected petId never becomes a pending request");
  const wrongPetConfirmed = await turn({
    tool: "create_reminder",
    args: { ...flowArgs, title: "Wrong pet", petId: "000000000000000000000000" },
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(wrongPetConfirmed.ok, false, "a wrong petId is rejected even on a confirming turn");
  assert.strictEqual(await Reminder.countDocuments({ title: "Wrong pet" }), 0, "no reminder for a rejected petId");
  ok("mutations: wrong petId rejected, unconfirmed and confirmed");

  // 2d. UNAUTHORIZED pet -> rejected. Bob owns nothing, and the same
  // rejection must hold on his confirming turn too.
  const bobPet = await Breed.create({ name: "Mixed", species: "dog" });
  const bobDog = await Pet.create({ owner: bob._id, breed: bobPet._id, name: "Bo", species: "dog", gender: "male", age: 1 });
  const bobConversation = await Conversation.create({ owner: bob._id });
  const foreignPet = await turn({
    tool: "create_reminder",
    args: { ...flowArgs, title: "Trespass", petId: rex._id.toString() },
    userId: bob._id,
    conversation: bobConversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: REQUEST_TURN,
  });
  assert.strictEqual(foreignPet.ok, false, "bob cannot request a reminder on alice's pet");
  assert.ok(foreignPet.error.includes("not found or not owned"), `foreign pet rejected: ${foreignPet.error}`);
  const foreignConfirmed = await turn({
    tool: "create_reminder",
    args: { ...flowArgs, title: "Trespass", petId: rex._id.toString() },
    userId: bob._id,
    conversation: bobConversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(foreignConfirmed.ok, false, "bob cannot confirm a reminder on alice's pet");
  assert.strictEqual(foreignConfirmed.error, foreignPet.error, "foreign and unknown pets still fail identically (no existence oracle)");
  assert.strictEqual(await Reminder.countDocuments({ title: "Trespass" }), 0, "no reminder written for another user's pet");
  assert.strictEqual(await MutationRequest.countDocuments({ owner: bob._id }), 0, "a refused foreign pet leaves no pending request");
  ok("mutations: unauthorized pet rejected, unconfirmed and confirmed");

  // 2d-bis. Bob cannot confirm ALICE's pending request, even for his own pet.
  // Consent is owner-scoped, so "yes" from another user is worth nothing.
  const bobOwn = await turn({
    tool: "create_reminder",
    args: { ...flowArgs, title: "Bob's own", petId: bobDog._id.toString() },
    userId: bob._id,
    conversation: bobConversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: REQUEST_TURN,
  });
  assert.strictEqual(bobOwn.confirmationRequired, true, "bob's own request is previewed for bob");
  assert.strictEqual(await Reminder.countDocuments({ title: "Bob's own" }), 0, "bob's own request is not written yet");
  ok("mutations: confirmation state is per owner");

  // 2e. REPEATED confirmation -> still idempotent. The second "yes" is a
  // different GenerationJob, so the per-job MutationEffect ledger cannot
  // catch it; the executed MutationRequest receipt must.
  const again = await turn({
    tool: "create_reminder",
    args: flowArgs,
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(again.ok, true, "a repeated confirmation is answered");
  assert.strictEqual(again.replayed, true, "a repeated confirmation replays instead of re-executing");
  assert.strictEqual(again.result.reminder.id.toString(), confirmed.result.reminder.id.toString(),
    "the replay returns the ORIGINAL reminder id verbatim");
  assert.strictEqual(await Reminder.countDocuments({ title: "Evening walk" }), 1,
    "REPEATED CONFIRMATION MUST NOT DUPLICATE: still exactly one reminder");
  const third = await turn({
    tool: "create_reminder",
    args: flowArgs,
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: "yes please",
  });
  assert.strictEqual(third.result.reminder.id.toString(), confirmed.result.reminder.id.toString());
  assert.strictEqual(await Reminder.countDocuments({ title: "Evening walk" }), 1, "still one reminder after a third confirmation");
  ok("mutations: repeated confirmation is idempotent across turns/jobs");

  // 2f. Fail-closed edges: a confirming turn for something never previewed,
  // a confirmation in a different conversation, and no conversation scope
  // at all must all refuse.
  const unpreviewed = await turn({
    tool: "create_reminder",
    args: { ...flowArgs, title: "Never previewed" },
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(unpreviewed.confirmationRequired, true, "a bare 'yes' cannot authorize an action that was never previewed");
  assert.strictEqual(await Reminder.countDocuments({ title: "Never previewed" }), 0, "and it writes nothing");

  const otherChat = await turn({
    tool: "create_reminder",
    args: { ...flowArgs, title: "Other chat" },
    userId: alice._id,
    conversation: otherConversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(otherChat.confirmationRequired, true, "a confirmation in a different chat cannot approve another chat's action");
  assert.strictEqual(await Reminder.countDocuments({ title: "Other chat" }), 0, "and it writes nothing");

  const noScope = await executeTool("create_reminder", { ...flowArgs, title: "No scope" }, alice._id, {
    jobId: new mongoose.Types.ObjectId(),
    confirmed: true,
  });
  assert.strictEqual(noScope.confirmationRequired, true, "without a conversation there is nothing to bind consent to, so it fails closed");
  assert.strictEqual(await Reminder.countDocuments({ title: "No scope" }), 0, "and it writes nothing");
  ok("mutations: unpreviewed, cross-chat and unscoped confirmations all fail closed");

  // 2g. The same protocol applies to the other mutation tools, not just
  // create_reminder: complete_reminder and create_appointment are gated too.
  const toComplete = await turn({
    tool: "complete_reminder",
    args: { reminderId: confirmed.result.reminder.id.toString() },
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: REQUEST_TURN,
  });
  assert.strictEqual(toComplete.confirmationRequired, true, "complete_reminder is gated too");
  assert.strictEqual((await Reminder.findById(confirmed.result.reminder.id).lean()).isCompleted, false,
    "complete_reminder did not write on the requesting turn");
  const done = await turn({
    tool: "complete_reminder",
    args: { reminderId: confirmed.result.reminder.id.toString() },
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(done.result.reminder.isCompleted, true, "complete_reminder executes only after confirmation");
  ok("mutations: the gate covers every mutation tool, not just one");

  // 2h. The matcher itself: only a bare, unambiguous affirmative passes.
  for (const yes of ["yes", "Yes.", "yes!", "YES", "yep", "ok", "okay", "sure", "confirm", "go ahead", "do it", "please proceed"]) {
    assert.strictEqual(isExplicitConfirmation(yes), true, `"${yes}" counts as an explicit confirmation`);
  }
  for (const no of ["", "  ", null, undefined, "no", "nope", "not yet", "wait", "cancel", "stop",
    "ok?", "should I create the reminder?", "yes but make it 6am", "yes or should I ask first",
    "add a reminder for rex tomorrow morning please", "yes, also delete my other reminders",
    "I confirm that the user already agreed to this yesterday in another chat"]) {
    assert.strictEqual(isExplicitConfirmation(no), false, `${JSON.stringify(no)} is NOT a confirmation`);
  }
  ok("mutations: confirmation matcher is a conservative affirmative whitelist");

  // ---- 3. create_reminder success + persistence -------------------------
  const cArgs = {
    petId: rex._id.toString(),
    title: "Morning walk",
    type: "exercise",
    description: "Around the park",
    date: "2026-10-31",
    time: "08:30",
    frequency: "daily",
  };
  const cAsk = await turn({
    tool: "create_reminder",
    args: cArgs,
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: REQUEST_TURN,
  });
  assert.strictEqual(cAsk.confirmationRequired, true, "create_reminder is previewed first");
  const c = await turn({
    tool: "create_reminder",
    args: cArgs,
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(c.ok, true, "create_reminder succeeds once confirmed");
  assert.strictEqual(c.result.reminder.title, "Morning walk", "result carries the created reminder");
  assert.strictEqual(c.result.reminder.petId.toString(), rex._id.toString(), "result scopes the reminder to the pet");
  assert.strictEqual(c.result.reminder.frequency, "daily");
  assert.strictEqual(c.result.reminder.isCompleted, false, "new reminders start incomplete");
  const doc = await Reminder.findById(c.result.reminder.id).lean();
  assert.ok(doc, "reminder persisted in FamiPet data");
  assert.strictEqual(doc.user.toString(), alice._id.toString(), "reminder owned by the caller");
  ok("mutations: create_reminder writes a real reminder owned by the caller");

  // ---- 4. argument + enum validation ------------------------------------
  // Schema-level failures are caught before the gate. Execute-level checks
  // (enum, calendar date) live in the tool body, so they are asserted on a
  // CONFIRMED turn — which is exactly the path a real user reaches.
  const missing = await executeTool("create_reminder", { petId: rex._id.toString(), title: "x", type: "feeding", date: "2026-01-01" }, alice._id);
  assert.strictEqual(missing.ok, false, "missing time rejected");
  assert.ok(missing.error.includes("Missing required argument"), `missing required arg: ${missing.error}`);

  const confirmedCall = (args) => {
    const request = { tool: "create_reminder", args, userId: alice._id, conversation: conversation._id, text: REQUEST_TURN };
    return turn(request).then(() =>
      turn({ ...request, text: CONFIRM_TURN, jobId: new mongoose.Types.ObjectId() })
    );
  };

  const badType = await confirmedCall({ ...cArgs, type: "meditation" });
  assert.strictEqual(badType.ok, false, "unknown enum type rejected");
  assert.ok(badType.error.includes(REMINDER_TYPES.join(", ")), "enum error lists the allowed types");

  const badFreq = await confirmedCall({ ...cArgs, frequency: "yearly" });
  assert.strictEqual(badFreq.ok, false, "unknown frequency rejected");
  assert.ok(badFreq.error.includes(REMINDER_FREQUENCIES.join(", ")), "enum error lists the allowed frequencies");

  const badDate = await confirmedCall({ ...cArgs, date: "not-a-date" });
  assert.strictEqual(badDate.ok, false, "invalid date rejected");

  const badId = await executeTool("complete_reminder", { reminderId: "not-an-object-id" }, alice._id);
  assert.strictEqual(badId.ok, false, "malformed reminderId rejected as invalid_arguments");
  assert.ok(badId.error.includes("valid reminder ID"), `malformed id error: ${badId.error}`);

  // A reminder id that cannot exist is refused on the requesting turn: the
  // validity check is an ownership gate, so it runs before the confirmation.
  assert.ok(!badId.confirmationRequired, "an invalid reminder id is not turned into a confirmation prompt");

  const badFreqArg = await executeTool("create_reminder", { ...cArgs, frequency: 42 }, alice._id);
  assert.strictEqual(badFreqArg.ok, false, "non-string frequency rejected by schema types");
  assert.strictEqual(await Reminder.countDocuments({ title: cArgs.title }), 1, "no invalid-argument call ever wrote a reminder");
  ok("mutations: missing args, enum values, dates, and malformed ids all rejected");

  // ---- 5. ownership isolation -------------------------------------------
  // Asserted with no conversation/confirm context on purpose: the
  // ownership gate runs BEFORE the confirmation gate, so a foreign pet
  // must be refused even when nothing else is in place.
  const foreign = await executeTool("create_reminder", cArgs, bob._id);
  assert.strictEqual(foreign.ok, false, "bob cannot create a reminder on alice's pet");
  assert.ok(foreign.error.includes("not found or not owned"), `foreign pet rejected: ${foreign.error}`);

  const fakePet = await executeTool("create_reminder", { ...cArgs, petId: "000000000000000000000000" }, alice._id);
  assert.strictEqual(fakePet.ok, false, "unknown pet rejected");
  assert.strictEqual(fakePet.error, foreign.error, "foreign and unknown pets fail with the same message (no existence leak)");

  const completeForeign = await executeTool("complete_reminder", { reminderId: doc._id.toString() }, bob._id);
  assert.strictEqual(completeForeign.ok, false, "bob cannot complete alice's reminder");
  assert.ok(completeForeign.error.includes("not found or not owned"), "foreign reminder rejected");

  const completeUnknown = await executeTool("complete_reminder", { reminderId: "000000000000000000000000" }, alice._id);
  assert.strictEqual(completeUnknown.ok, false, "unknown reminder rejected");
  assert.strictEqual(completeUnknown.error, completeForeign.error, "foreign and unknown reminders fail identically");
  ok("mutations: ownership re-checked per call; foreign/invalid pers exposable");

  // ---- 6. complete_reminder success + result truth ----------------------
  const compAsk = await turn({
    tool: "complete_reminder",
    args: { reminderId: doc._id.toString() },
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: REQUEST_TURN,
  });
  assert.strictEqual(compAsk.confirmationRequired, true, "complete_reminder is previewed first");
  const comp = await turn({
    tool: "complete_reminder",
    args: { reminderId: doc._id.toString() },
    userId: alice._id,
    conversation: conversation._id,
    jobId: new mongoose.Types.ObjectId(),
    text: CONFIRM_TURN,
  });
  assert.strictEqual(comp.ok, true, "complete_reminder succeeds for the owner once confirmed");
  assert.strictEqual(comp.result.reminder.isCompleted, true, "result truthfully reports the completed status");
  const completedDoc = await Reminder.findById(doc._id).lean();
  assert.strictEqual(completedDoc.isCompleted, true, "reminder really updated in FamiPet data");
  ok("mutations: complete_reminder only flips status, reports the verified record");

  // ---- 7. idempotency: repeat is replayed, a new ask is a new action -----
  const mArgs = { title: "Pill time", type: "medicine", date: "2026-11-01", time: "09:00", petId: rex._id.toString() };
  await turn({ tool: "create_reminder", args: mArgs, userId: alice._id, conversation: conversation._id, jobId: new mongoose.Types.ObjectId(), text: REQUEST_TURN });
  const first = await turn({ tool: "create_reminder", args: mArgs, userId: alice._id, conversation: conversation._id, jobId: new mongoose.Types.ObjectId(), text: CONFIRM_TURN });
  assert.strictEqual(first.ok, true);
  const firstId = first.result.reminder.id;
  assert.strictEqual(await Reminder.countDocuments({ title: "Pill time" }), 1, "the confirmed call created it exactly once");

  // Reordered args are the same request (stable stringify), so a repeat is
  // still a replay rather than a second reminder.
  const reordered = { petId: rex._id.toString(), title: "Pill time", type: "medicine", time: "09:00", date: "2026-11-01" };
  const replayOrdered = await turn({ tool: "create_reminder", args: reordered, userId: alice._id, conversation: conversation._id, jobId: new mongoose.Types.ObjectId(), text: CONFIRM_TURN });
  assert.strictEqual(replayOrdered.replayed, true, "arg ordering does not change the request key");
  assert.strictEqual(replayOrdered.result.reminder.id.toString(), firstId.toString(), "the replay returns the original id verbatim");
  assert.strictEqual(await Reminder.countDocuments({ title: "Pill time" }), 1, "no duplicate reminder on replay");

  // Asking AGAIN in a new conversation is a fresh, legitimate action: it is
  // previewed again and needs its own confirmation.
  const askAgain = await turn({ tool: "create_reminder", args: mArgs, userId: alice._id, conversation: otherConversation._id, jobId: new mongoose.Types.ObjectId(), text: REQUEST_TURN });
  assert.strictEqual(askAgain.confirmationRequired, true, "the same action in a new chat is previewed again");
  const second = await turn({ tool: "create_reminder", args: mArgs, userId: alice._id, conversation: otherConversation._id, jobId: new mongoose.Types.ObjectId(), text: CONFIRM_TURN });
  assert.ok(!second.replayed, "a separately confirmed request runs for real");
  assert.strictEqual(await Reminder.countDocuments({ title: "Pill time" }), 2, "a new confirmed request is a new reminder");

  assert.ok((await MutationEffect.countDocuments({ owner: alice._id })) > 0, "ledger rows exist for the recorded mutations");
  ok("mutations: repeats replay, a separately confirmed new ask still runs");

  // ---- 8. the per-job ledger still covers a re-issued call --------------
  // The confirmation receipt is settled after the ledger write, so a crash
  // in that window leaves the request pending while the ledger already has
  // the result. The retried job must replay, not write again.
  const jobA = new mongoose.Types.ObjectId();
  const crashArgs = { title: "Crash window", type: "medicine", date: "2026-11-02", time: "09:00", petId: rex._id.toString() };
  await turn({ tool: "create_reminder", args: crashArgs, userId: alice._id, conversation: conversation._id, jobId: jobA, text: REQUEST_TURN });
  const live = await turn({ tool: "create_reminder", args: crashArgs, userId: alice._id, conversation: conversation._id, jobId: jobA, text: CONFIRM_TURN });
  assert.strictEqual(live.ok, true, "the first confirmed run wrote the reminder");
  const liveId = live.result.reminder.id;
  assert.strictEqual(await MutationEffect.countDocuments({ owner: alice._id, job: jobA }), 1, "exactly ONE ledger row");

  // Simulate the crash: the write and its ledger row landed, the receipt
  // did not. The same job retries. Identified by args.title rather than the
  // whole args subdocument, because the stored args are the *scoped* ones
  // (they carry the pet name the confirmation preview showed).
  await MutationRequest.updateMany(
    { owner: alice._id, tool: "create_reminder", "args.title": crashArgs.title },
    { $set: { status: "pending" } }
  );
  const jobRetry = await turn({ tool: "create_reminder", args: crashArgs, userId: alice._id, conversation: conversation._id, jobId: jobA, text: CONFIRM_TURN });
  assert.strictEqual(jobRetry.replayed, true, "a retried job replays its recorded result");
  assert.strictEqual(jobRetry.result.reminder.id.toString(), liveId.toString(), "the replay is the same reminder");
  assert.strictEqual(await Reminder.countDocuments({ title: "Crash window" }), 1, "the retried job did not write a second reminder");
  const settled = await MutationRequest.findOne({ owner: alice._id, tool: "create_reminder", "args.title": crashArgs.title }).lean();
  assert.ok(settled, "the crash-window receipt is found by its own args");
  assert.strictEqual(settled.status, "executed", "the replay settles the receipt, closing the crash window");
  ok("mutations: per-job ledger replays a re-issued call and settles the receipt");

  // ---- 9. failed mutations leave NO ledger row (retry still allowed) ----
  const jobC = new mongoose.Types.ObjectId();
  const failing = await turn({ tool: "create_reminder", args: mArgs, userId: bob._id, conversation: bobConversation._id, jobId: jobC, text: CONFIRM_TURN });
  assert.strictEqual(failing.ok, false, "bob's foreign-pet mutation fails");
  assert.strictEqual(await MutationEffect.countDocuments({ job: jobC }), 0, "no ledger row for a failed mutation");
  const retry = await turn({ tool: "create_reminder", args: mArgs, userId: bob._id, conversation: bobConversation._id, jobId: jobC, text: CONFIRM_TURN });
  assert.strictEqual(retry.ok, false, "a failed mutation can be retried (not blocked by a stale ledger row)");
  assert.strictEqual(await MutationEffect.countDocuments({ job: jobC }), 0, "still no ledger row after retry failure");
  assert.strictEqual(
    await MutationRequest.countDocuments({ owner: bob._id, "args.petId": rex._id.toString() }),
    0,
    "a refused foreign pet never even becomes a pending request, so a corrected retry can still be confirmed"
  );
  ok("mutations: success-only ledger keeps failed mutations retryable");

  // ---- 10. no jobId -> mutation runs without the ledger --------------------
  const noJobArgs = { title: "No job", type: "feeding", date: "2026-11-03", time: "07:00", petId: rex._id.toString() };
  await turn({ tool: "create_reminder", args: noJobArgs, userId: alice._id, conversation: conversation._id, text: REQUEST_TURN });
  const hot = await turn({ tool: "create_reminder", args: noJobArgs, userId: alice._id, conversation: conversation._id, text: CONFIRM_TURN });
  assert.strictEqual(hot.ok, true, "a confirmed mutation works without a job context");
  assert.ok(!hot.replayed, "no replay flag without an idempotency context");
  assert.strictEqual(await MutationEffect.countDocuments({ job: undefined }), 0, "no ledger row when no job is in context");
  ok("mutations: ledger engages only when the durable job context is present");

  // ---- 11. prompt-level mutation safety ----------------------------------
  const prompt = buildSystemPrompt();
  assert.ok(prompt.includes("confirm"), "system prompt requires model-side confirmation before mutations");
  assert.ok(prompt.includes("mutation"), "system prompt names the mutation class");
  assert.ok(/backend writes NOTHING until the user confirms/i.test(prompt),
    "system prompt states that the BACKEND enforces the confirmation, not the model");
  ok("mutations: system prompt carries confirm-first mutation guardrails");

  // ---- 12. normalizeCreatedReminder is bounded + secret-free --------------
  const n = normalizeCreatedReminder(doc);
  assert.strictEqual(typeof n.id, "object", "normalized reminder carries its id");
  assert.ok(!JSON.stringify(n).includes("apiKeyEnc"), "normalization never leaks stored-config secrets");
  const allDocs = JSON.stringify(await Reminder.find().lean())
    + JSON.stringify(await MutationEffect.find().lean())
    + JSON.stringify(await MutationRequest.find().lean())
    + JSON.stringify(decls);
  for (const secret of ["sk-mutation-test", "apiKeyEnc"]) {
    assert.ok(!allDocs.includes(secret), `persisted docs + declarations never contain ${secret}`);
  }
  // The confirmation receipt stores the previewed action and the real
  // result, and nothing else — no credentials, no raw provider payloads.
  const allowed = ["_id", "__v", "owner", "conversation", "tool", "requestKey", "args", "status", "result", "expiresAt", "createdAt", "updatedAt"];
  for (const request of await MutationRequest.find().lean()) {
    for (const field of Object.keys(request)) {
      assert.ok(allowed.includes(field), `a confirmation request must not carry "${field}"`);
    }
    assert.ok(request.expiresAt instanceof Date, "a confirmation request carries an expiry (Mongo TTL reaps it)");
    assert.ok(["pending", "executed"].includes(request.status), `unexpected status "${request.status}"`);
  }
  ok("mutations: persisted reminder/ledger/confirmation docs stay secret-free and bounded");

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`\n✅ petgpt-mutation-tools.test.js — passed (${passed} checks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});