// =========================================================
// Real tool calling against the deployment's OpenAI-compatible endpoint.
// ---------------------------------------------------------
// Run: PETGPT_RUN_LIVE_E2E=1 node test/petgpt-tools-e2e.test.js
// Requires: a live OpenAI-compatible endpoint reachable at
// PETGPT_OPENAI_BASE_URL. A gateway usually accepts any non-empty key on
// /chat/completions, so this suite probes /chat/completions (not /models)
// and works with a dummy key. test/db.js scrubs the real key unless
// PETGPT_RUN_LIVE_E2E=1, and an unreachable endpoint SKIPS (exit 0)
// rather than fabricating a passing result.
//
// Verifies, end to end, against the real model:
//   * the model calls a registered read tool, results are fed back,
//     and a real final answer is persisted by the durable worker
//   * the persisted assistant message carries bounded `toolCalls`
//     metadata naming only registered tools (ok:true), no secrets
//   * ownership: the model cannot surface another user's pet data
//   * legacy POST /api/ai/ask still works (non-tool single turn)
//
// Uses a dedicated test DB on the locally running MongoDB.
// =========================================================

const assert = require("assert");
const { testDbUri } = require("./db");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const DB_NAME = "animal_planet_petgpt_tools_e2e_test";
const URI = testDbUri(DB_NAME);

const BASE_URL = process.env.PETGPT_OPENAI_BASE_URL || "http://localhost:20128/v1";
// The endpoint's /chat/completions usually accepts any non-empty key; a real
// key also works. Defaults to a dummy so the real path runs anywhere.
const API_KEY = process.env.PETGPT_OPENAI_API_KEY || "openai-tools-e2e-dummy-key";
const MODEL = process.env.PETGPT_OPENAI_MODEL || "auto/best-fast";

// Probe the live endpoint the same way the adapter will call it. An endpoint
// can be briefly busy mid-generation, so retry a few times before declaring it
// unreachable (and skipping honestly, never falsely passing).
async function reachable() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) return true;
    } catch (e) {
      /* retry */
    }
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  return false;
}

if (process.env.PETGPT_RUN_LIVE_E2E !== "1") {
  console.log(`SKIPPED: PETGPT_RUN_LIVE_E2E=1 not set (would call the live endpoint at ${BASE_URL}).`);
  process.exit(0);
}

(async () => {
  if (!(await reachable())) {
    console.log(`SKIPPED: live endpoint not reachable at ${BASE_URL}.`);
    process.exit(0);
  }

  process.env.NODE_ENV = "test";
  process.env.PETGPT_OPENAI_BASE_URL = BASE_URL;
  process.env.PETGPT_OPENAI_API_KEY = API_KEY;
  process.env.PETGPT_OPENAI_MODEL = MODEL;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "petgpt-tools-e2e-secret";
  process.env.PETGPT_WORKER_POLL_MS = process.env.PETGPT_WORKER_POLL_MS || "300";

  const { AI_CONFIG } = require("../config/ai");
  assert.ok(!("provider" in AI_CONFIG), "no provider selector: configuration is application-level");
  assert.strictEqual(AI_CONFIG.openai.baseUrl, BASE_URL.replace(/\/+$/, ""), "live endpoint base URL in play");

  const GenerationJob = require("../models/GenerationJob");
  const User = require("../models/User");
  const Message = require("../models/Message");
  const Pet = require("../models/Pet");
  const Breed = require("../models/Breed");
  const { listToolNames } = require("../ai/tools");

  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
  await GenerationJob.init();

  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/api/ai", require("../routes/ai.routes"));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/ai`;

  const { startWorker, stopWorker } = require("../jobs/generation.worker");

  const logLines = [];
  const origLog = console.log, origErr = console.error;
  console.log = (...a) => { logLines.push(a.join(" ")); origLog(...a); };
  console.error = (...a) => { logLines.push(a.join(" ")); origErr(...a); };

  async function api(method, path, token, body) {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    return { status: res.status, data };
  }

  async function awaitJobTerminal(jobId, token, timeoutMs = 180000) {
    const observed = [];
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const r = await api("GET", `/jobs/${jobId}`, token);
      assert.strictEqual(r.status, 200, `job ${jobId} readable while running`);
      observed.push(r.data.job.status);
      if (["completed", "failed"].includes(r.data.job.status)) return { ...r.data, observed };
      await new Promise((r2) => setTimeout(r2, 250));
    }
    throw new Error(`job ${jobId} did not reach terminal state; observed ${observed}`);
  }

  try {
    const alice = await User.create({ name: "Tool E2E Alice", email: "toolse2e-alice@test.dev", password: "testpass123" });
    const bob = await User.create({ name: "Tool E2E Bob", email: "toolse2e-bob@test.dev", password: "testpass123" });
    const aliceToken = jwt.sign({ id: alice._id.toString() }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const bobToken = jwt.sign({ id: bob._id.toString() }, process.env.JWT_SECRET, { expiresIn: "1h" });

    const breed = await Breed.create({ name: "Golden Retriever", species: "dog" });
    await Pet.create({ owner: alice._id, breed: breed._id, name: "Rex", species: "dog", gender: "male", age: 3 });
    await Pet.create({ owner: bob._id, breed: breed._id, name: "Max", species: "dog", gender: "male", age: 7 });

    const registered = listToolNames();
    assert.ok(registered.includes("get_my_pets"), "get_my_pets registered for the real exchange");

    // ---- 1. real tool-calling exchange through the durable worker ---------
    const c = await api("POST", "/conversations", aliceToken, {});
    assert.strictEqual(c.status, 201, "create -> 201");
    const convId = c.data.conversation.id;

    startWorker();

    let toolsJobT, attempts = 0;
    while (attempts++ < 2) {
      const a = await api("POST", `/conversations/${convId}/messages`, aliceToken, {
        content: "Use the available tools to look up my current pets and describe them in a sentence.",
      });
      assert.strictEqual(a.status, 202, "real tool-backed generation -> 202");
      toolsJobT = await awaitJobTerminal(a.data.job.id, aliceToken);
      if (toolsJobT.job.status !== "failed") break;
      // An endpoint hiccup is possible; retry once before reporting failure.
    }
    assert.strictEqual(toolsJobT.job.status, "completed", `real tool-backed job completes (saw ${toolsJobT.observed})`);
    assert.ok(toolsJobT.assistantMessage && typeof toolsJobT.assistantMessage.content === "string" &&
      toolsJobT.assistantMessage.content.trim().length > 0, "real final answer persisted");

    // The persisted assistant message keeps a bounded, secret-free tool trace.
    const assistantDoc = await Message.findById(toolsJobT.assistantMessage.id).lean();
    assert.ok(Array.isArray(assistantDoc.toolCalls) && assistantDoc.toolCalls.length > 0,
      "model really executed at least one registered tool (not a fabricated answer)");
    assert.ok(assistantDoc.toolCalls.length <= 20, "toolCalls metadata bounded");
    for (const entry of assistantDoc.toolCalls) {
      assert.ok(registered.includes(entry.name), `modelled tool "${entry.name}" is a registered read tool`);
      assert.strictEqual(typeof entry.ok, "boolean", "metadata records success");
    }
    assert.ok(assistantDoc.toolCalls.some((t) => t.name === "get_my_pets" && t.ok), "get_my_pets executed successfully");
    const reply = toolsJobT.assistantMessage.content;
    assert.ok(/rex/i.test(reply), `real reply mentions the user's own pet Rex (got: "${reply.slice(0, 120)}")`);
    assert.ok(!/max/i.test(reply), "reply never mentions another user's pet Max");

    // ---- 2. ownership: bob's pet is not reachable from alice's tools ------
    const j2 = await api("POST", `/conversations/${convId}/messages`, aliceToken, {
      content: "My neighbor's dog is named Max. Please fetch and describe Max's records using the pet tools.",
    });
    const T2 = await awaitJobTerminal(j2.data.job.id, aliceToken);
    assert.strictEqual(T2.job.status, "completed", "second exchange completes");
    const m2 = await Message.findById(T2.assistantMessage.id).lean();
    for (const entry of m2.toolCalls || []) {
      assert.strictEqual(entry.ok, true, `every executed tool (${entry.name}) was authorized`);
    }
    assert.ok(!/aged?\s*7|7\s*years?/i.test(T2.assistantMessage.content), "no foreign pet record leaked into the reply");

    // ---- 3. legacy /api/ai/ask still works (non-tool single turn) ---------
    const ask = await api("POST", "/ask", aliceToken, { question: "Give me a short tip about feeding an adult dog." });
    assert.strictEqual(ask.status, 200, "legacy /ask -> 200");
    assert.strictEqual(ask.data.success, true);
    assert.ok(typeof ask.data.answer === "string" && ask.data.answer.trim().length > 0, "legacy /ask returns a real answer");

    // ---- 4. no secrets anywhere -------------------------------------------
    for (const line of logLines) assert.ok(!line.includes(API_KEY), "API key not in logs");
    const jobJson = JSON.stringify(await GenerationJob.find().lean());
    const msgJson = JSON.stringify(await Message.find().lean());
    for (const blob of [jobJson, msgJson]) assert.ok(!blob.includes(API_KEY), "API key never persisted");
    assert.strictEqual(await GenerationJob.countDocuments({ status: { $in: ["queued", "processing"] } }), 0,
      "no jobs left dangling after the suite");

    origLog(`\n✅ petgpt-tools-e2e.test.js — real tool calling verified ` +
      `(${assistantDoc.toolCalls.length} tool call(s), reply "${reply.slice(0, 80)}…")`);
  } finally {
    stopWorker();
    console.log = origLog;
    console.error = origErr;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch(async (error) => {
  console.error("FAILED:", error && error.stack ? error.stack : error);
  try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
  process.exit(1);
});