// =========================================================
// PetGPT conversations — the real live-endpoint path through the
// deployment's OpenAI-compatible endpoint.
// Run: PETGPT_RUN_LIVE_E2E=1 node test/petgpt-e2e.test.js
// Requires: a live OpenAI-compatible endpoint reachable at
// PETGPT_OPENAI_BASE_URL (default http://localhost:20128/v1).
// test/db.js scrubs the real key unless PETGPT_RUN_LIVE_E2E=1; without
// that opt-in the suite SKIPS (exit 0) rather than calling anything.
//
// Uses a dedicated test DB on the locally running MongoDB. In-scope
// exchanges are durable jobs (202): the worker calls the endpoint and
// persists the assistant reply; out-of-scope stays synchronous.
// =========================================================

const assert = require("assert");
const { testDbUri } = require("./db");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const DB_NAME = "animal_planet_petgpt_e2e_test";
const URI = testDbUri(DB_NAME);

const BASE_URL = process.env.PETGPT_OPENAI_BASE_URL || "http://localhost:20128/v1";
const API_KEY = process.env.PETGPT_OPENAI_API_KEY;
const MODEL = process.env.PETGPT_OPENAI_MODEL || "auto/best-fast";

if (process.env.PETGPT_RUN_LIVE_E2E !== "1") {
  console.log(`SKIPPED: PETGPT_RUN_LIVE_E2E=1 not set (would call the live endpoint at ${BASE_URL}).`);
  process.exit(0);
}

let passed = 0;
const ok = (name) => { passed++; console.log(`ok ${passed} - ${name}`); };

(async () => {
  // Reachability pre-check -> skip gracefully when the container is down.
  const probe = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  }).then(() => true).catch(() => false);
  if (!probe) {
    console.log(`SKIPPED: live endpoint not reachable at ${BASE_URL}.`);
    process.exit(0);
  }

  process.env.PETGPT_OPENAI_BASE_URL = BASE_URL;
  process.env.PETGPT_OPENAI_API_KEY = API_KEY;
  process.env.PETGPT_OPENAI_MODEL = MODEL;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "petgpt-e2e-test-secret";

  const { AI_CONFIG } = require("../config/ai");
  assert.ok(!("provider" in AI_CONFIG), "no provider selector: configuration is application-level");
  assert.strictEqual(AI_CONFIG.openai.baseUrl, BASE_URL.replace(/\/+$/, ""), "live endpoint base URL in play");

  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();

  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/api/ai", require("../routes/ai.routes"));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const User = require("../models/User");
  const GenerationJob = require("../models/GenerationJob");
  const Conversation = require("../models/Conversation");
  const Message = require("../models/Message");
  await GenerationJob.init(); // rebuild unique idempotency index after drop

  const { startWorker, stopWorker } = require("../jobs/generation.worker");

  const logLines = [];
  const origLog = console.log, origErr = console.error;
  console.log = (...a) => { logLines.push(a.join(" ")); origLog(...a); };
  console.error = (...a) => { logLines.push(a.join(" ")); origErr(...a); };

  const user = await User.create({ name: "Phase2 Live", email: "phase2-e2e@test.dev", password: "testpass123" });
  const token = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const convPath = "/api/ai/conversations";

  async function api(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    return { status: res.status, data };
  }

  // Phase 4: poll a durable generation job to its terminal state.
  async function awaitJob(jobId) {
    const started = Date.now();
    while (Date.now() - started < 60000) {
      const r = await api("GET", `/api/ai/jobs/${jobId}`);
      assert.strictEqual(r.status, 200, "job status readable while running");
      if (["completed", "failed"].includes(r.data.job.status)) return r.data;
      await new Promise((s) => setTimeout(s, 100));
    }
    throw new Error(`job ${jobId} not terminal in time`);
  }

  startWorker();

  let convId;
  {
    const c = await api("POST", convPath, {});
    assert.strictEqual(c.status, 201, "create -> 201");
    convId = c.data.conversation.id;
    ok("e2e: conversation created");
  }

  // Real endpoint exchange (durable job): user + assistant persisted.
  {
    const q = "Give me a short tip about feeding an adult dog.";
    const a = await api("POST", `${convPath}/${convId}/messages`, { content: q });
    assert.strictEqual(a.status, 202, "real endpoint exchange -> 202 (durable generation)");
    assert.strictEqual(a.data.userMessage.role, "user");
    assert.strictEqual(a.data.userMessage.content, q, "user message persisted");
    assert.ok(a.data.job && a.data.job.id, "job queued");
    const T = await awaitJob(a.data.job.id);
    assert.strictEqual(T.job.status, "completed", "job completes");
    assert.strictEqual(T.assistantMessage.role, "assistant");
    assert.ok(typeof T.assistantMessage.content === "string" && T.assistantMessage.content.trim().length > 0, "real assistant reply non-empty");
    ok("e2e: real reply persisted as assistant message by the worker");
  }

  // Follow-up with history context; 4 messages in order afterwards.
  {
    const q2 = "How often should that dog be walked daily?";
    const a = await api("POST", `${convPath}/${convId}/messages`, { content: q2 });
    assert.strictEqual(a.status, 202, "follow-up -> 202");
    const T = await awaitJob(a.data.job.id);
    assert.strictEqual(T.job.status, "completed", "follow-up completes");
    assert.ok(T.assistantMessage.content.trim().length > 0, "follow-up reply non-empty");
    const g = await api("GET", `${convPath}/${convId}`);
    assert.strictEqual(g.status, 200);
    assert.strictEqual(g.data.messages.length, 4, "history durable across exchanges");
    assert.deepStrictEqual(g.data.messages.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
    assert.ok(g.data.messages[0].content.includes("adult dog"), "first user question intact");
    const prev = g.data.messages.map((m) => m.content).join(" ");
    assert.ok(!prev.includes(API_KEY), "API key never leaked into persisted messages");
    ok("e2e: follow-up persisted with full history (DB is source of truth)");
  }

  // Scope gate still short-circuits the AI call in the chat flow.
  {
    const a = await api("POST", `${convPath}/${convId}/messages`, { content: "what is the capital of France" });
    assert.strictEqual(a.status, 200, "off-topic -> 200");
    assert.ok(a.data.assistantMessage.content.startsWith("I'm PetGPT, FamiPet's pet-care assistant"), "canned scope response persisted");
    const g = await api("GET", `${convPath}/${convId}`);
    assert.strictEqual(g.data.messages.length, 6, "scope exchange persisted");
    ok("e2e: scope gate still enforced inside the conversation flow");
  }

  // No secrets in logs.
  for (const line of logLines) {
    assert.ok(!line.includes(API_KEY), "API key not present in any log line");
  }
  ok("e2e: API key absent from all captured logs");

  await Message.deleteMany({});
  await Conversation.deleteMany({});
  await GenerationJob.deleteMany({});
  await User.deleteMany({ _id: user._id });
  stopWorker();
  console.log = origLog;
  console.error = origErr;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));

  console.log(`\nAll ${passed} live-endpoint E2E checks passed.`);
  process.exit(0);
})().catch(async (error) => {
  console.error("FAILED:", error && error.stack ? error.stack : error);
  try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
  process.exit(1);
});