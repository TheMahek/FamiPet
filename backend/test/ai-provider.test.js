// =========================================================
// PetGPT AI layer — application-level OpenAI-compatible config,
// assert-based checks (no framework, no live API calls).
// Run: node test/ai-provider.test.js
//
// Covers: env configuration loading, failing safely when the
// configuration is incomplete, normalized error codes against a real
// local mock endpoint, service-level fallback, and the guarantee that
// the API key never reaches a log line or an error message.
// =========================================================

const assert = require("assert");
const http = require("http");

// The secret used in these tests. If it ever appeared in a log line or an
// error message below, the assertions would catch it.
const SECRET = "sk-super-secret-do-not-log";

(async () => {
  // Fresh-load the AI layer under a given env snapshot. Config is
  // snapshotted at require time, so env only needs to be present
  // while modules load (mirrors real app boot).
  // Hermetic: any PETGPT_* var present in the ambient shell but NOT in
  // `env` is cleared for the load, so a "missing key" scenario cannot be
  // masked by inherited env (e.g. PETGPT_OPENAI_API_KEY exported to run
  // the live-endpoint E2E later in the same npm test chain).
  const AI_ENV_KEYS = [
    "PETGPT_TIMEOUT_MS",
    "PETGPT_MAX_QUESTION_LENGTH",
    "PETGPT_MAX_HISTORY_MESSAGES",
    "PETGPT_OPENAI_BASE_URL",
    "PETGPT_OPENAI_API_KEY",
    "PETGPT_OPENAI_MODEL",
  ];
  function loadLayer(env) {
    const prev = {};
    for (const k of Object.keys(env)) {
      prev[k] = process.env[k];
      process.env[k] = env[k];
    }
    const cleared = {};
    for (const k of AI_ENV_KEYS) {
      if (!(k in env) && k in process.env) {
        cleared[k] = process.env[k];
        delete process.env[k];
      }
    }
    for (const m of ["../config/ai", "../ai/provider", "../ai/openai", "../ai/index"]) {
      delete require.cache[require.resolve(m)];
    }
    const mods = {
      ai: require("../ai/index"),
      openai: require("../ai/openai"),
      config: require("../config/ai"),
    };
    for (const k of Object.keys(env)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    for (const k of Object.keys(cleared)) {
      process.env[k] = cleared[k];
    }
    return mods;
  }

  function stubFetch(handler) {
    const real = global.fetch;
    global.fetch = handler;
    return () => { global.fetch = real; };
  }

  async function awaitCatch(promise) {
    try {
      const value = await promise;
      throw new Error("expected rejection, got value: " + JSON.stringify(value));
    } catch (error) {
      return error;
    }
  }

  function captureLogs() {
    const out = { log: [], err: [] };
    const origLog = console.log, origErr = console.error;
    console.log = (...a) => out.log.push(a.join(" "));
    console.error = (...a) => out.err.push(a.join(" "));
    return { ...out, restore() { console.log = origLog; console.error = origErr; } };
  }

  const REQUEST = {
    system: "sys-instruction",
    question: "What food for a puppy?",
    petContext: [{ name: "Rex", species: "dog", breed: "Labrador" }],
  };

  let passed = 0;
  const ok = (name) => { passed++; console.log(`ok ${passed} - ${name}`); };

  // ---------------------------------------------------------------
  // Env configuration loading
  // ---------------------------------------------------------------

  {
    const { config } = loadLayer({
      PETGPT_OPENAI_BASE_URL: "http://example.test/v1/",
      PETGPT_OPENAI_API_KEY: SECRET,
      PETGPT_OPENAI_MODEL: "some-model",
    });
    assert.strictEqual(config.AI_CONFIG.openai.baseUrl, "http://example.test/v1", "trailing slash is stripped from the base URL");
    assert.strictEqual(config.AI_CONFIG.openai.model, "some-model", "model loads from env");
    assert.strictEqual(config.AI_CONFIG.openai.apiKey, SECRET, "key loads from env");
    ok("config: env variables load, base URL normalized");
  }

  {
    const { config } = loadLayer({});
    assert.ok(!("provider" in config.AI_CONFIG), "no provider selector remains");
    assert.ok(!("gemini" in config.AI_CONFIG), "no vendor-specific config block remains");
    ok("config: no provider selector and no vendor-specific block");
  }

  // ---------------------------------------------------------------
  // Missing configuration fails safely (no network, no key leak)
  // ---------------------------------------------------------------

  const CASES = [
    ["no configuration at all", {}],
    ["base URL only", { PETGPT_OPENAI_BASE_URL: "http://example.test/v1" }],
    ["missing model", { PETGPT_OPENAI_BASE_URL: "http://example.test/v1", PETGPT_OPENAI_API_KEY: SECRET }],
    ["missing key", { PETGPT_OPENAI_BASE_URL: "http://example.test/v1", PETGPT_OPENAI_MODEL: "some-model" }],
  ];
  for (const [label, env] of CASES) {
    const { openai } = loadLayer(env);
    const restore = stubFetch(async () => { throw new Error("fetch must not be called when unconfigured"); });
    const err = await awaitCatch(openai.generate(REQUEST));
    restore();
    assert.strictEqual(err.code, "config", `${label} -> CONFIG`);
    assert.ok(!err.message.includes(SECRET), `${label}: error message never contains the key`);
    ok(`openai: ${label} -> config error, no request sent`);
  }

  {
    // A partially-configured deployment must name the missing variable(s)
    // (never a value) so an operator can fix it from the log alone.
    const { openai } = loadLayer({});
    const err = await awaitCatch(openai.generate(REQUEST));
    for (const name of ["PETGPT_OPENAI_BASE_URL", "PETGPT_OPENAI_API_KEY", "PETGPT_OPENAI_MODEL"]) {
      assert.ok(err.message.includes(name), `error names ${name}`);
    }
    ok("openai: config error names the missing variables");
  }

  // ---------------------------------------------------------------
  // Generic OpenAI-compatible contract — real local mock endpoint
  // ---------------------------------------------------------------

  let mockMode = "ok";
  let lastRequest = null;
  const server = http.createServer((req, res) => {
    res.on("error", () => {});
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastRequest = { url: req.url, auth: req.headers.authorization, body: raw };
      if (mockMode === "ok") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { content: "mock openai answer" } }] }));
      } else if (mockMode === "http500") {
        res.statusCode = 500;
        res.end("boom");
      } else if (mockMode === "malformed") {
        res.setHeader("Content-Type", "application/json");
        res.end("this is not json {");
      } else if (mockMode === "tools") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [
                { id: "call_0", type: "function", function: { name: "list_pets", arguments: '{"limit":3}' } },
              ],
            },
          }],
        }));
      } else if (mockMode === "badToolArgs") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{ id: "call_0", type: "function", function: { name: "list_pets", arguments: "{not json" } }],
            },
          }],
        }));
      } else if (mockMode === "slow") {
        setTimeout(() => { try { res.end(JSON.stringify({ choices: [{ message: { content: "late" } }] })); } catch { /* res already ended */ } }, 2000);
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const mockBaseUrl = "http://127.0.0.1:" + server.address().port;

  const openaiEnv = {
    PETGPT_OPENAI_BASE_URL: mockBaseUrl,
    PETGPT_OPENAI_API_KEY: SECRET,
    PETGPT_OPENAI_MODEL: "test-model",
  };

  {
    const { openai } = loadLayer({ ...openaiEnv });
    const result = await openai.generate(REQUEST);
    assert.strictEqual(result.text, "mock openai answer", "parses choices[0].message.content");
    assert.strictEqual(lastRequest.url, "/chat/completions", "posts to {baseUrl}/chat/completions");
    assert.strictEqual(lastRequest.auth, `Bearer ${SECRET}`, "sends Authorization: Bearer <key>");
    assert.strictEqual(JSON.parse(lastRequest.body).model, "test-model", "sends the configured model");
    assert.ok(JSON.parse(lastRequest.body).messages.some((m) => m.content.includes("Rex")), "pet context reaches the model");
    ok("openai: mock endpoint parsed, correct URL / auth / model / context");
  }

  {
    mockMode = "http500";
    const { openai } = loadLayer({ ...openaiEnv });
    const err = await awaitCatch(openai.generate(REQUEST));
    assert.strictEqual(err.code, "http", "500 -> HTTP");
    assert.ok(!err.message.includes(SECRET), "HTTP error message never contains the key");
    mockMode = "ok";
    ok("openai: HTTP 500 -> http error, key not leaked");
  }

  {
    mockMode = "malformed";
    const { openai } = loadLayer({ ...openaiEnv });
    const err = await awaitCatch(openai.generate(REQUEST));
    assert.strictEqual(err.code, "malformed", "non-JSON -> MALFORMED");
    mockMode = "ok";
    ok("openai: non-JSON response -> malformed error");
  }

  {
    mockMode = "slow";
    const { openai } = loadLayer({ ...openaiEnv, PETGPT_TIMEOUT_MS: "100" });
    const err = await awaitCatch(openai.generate(REQUEST));
    assert.strictEqual(err.code, "timeout", "slow endpoint + short timeout -> TIMEOUT");
    mockMode = "ok";
    ok("openai: timeout -> timeout error");
  }

  // Guaranteed-closed port for the network-failure scenario.
  const ghost = http.createServer();
  await new Promise((resolve, reject) => { ghost.once("error", reject); ghost.listen(0, "127.0.0.1", resolve); });
  const ghostPort = ghost.address().port;
  await new Promise((resolve) => ghost.close(resolve));

  {
    const { openai } = loadLayer({
      PETGPT_OPENAI_BASE_URL: "http://127.0.0.1:" + ghostPort,
      PETGPT_OPENAI_API_KEY: SECRET,
      PETGPT_OPENAI_MODEL: "test-model",
    });
    const err = await awaitCatch(openai.generate(REQUEST));
    assert.strictEqual(err.code, "unknown", "connection refused -> UNKNOWN");
    assert.ok(!err.message.includes(SECRET), "network error message never contains the key");
    ok("openai: unreachable endpoint -> unknown error, key not leaked");
  }

  // ---------------------------------------------------------------
  // Tool calling still works over the same generic contract
  // ---------------------------------------------------------------

  {
    mockMode = "tools";
    const { openai } = loadLayer({ ...openaiEnv });
    const result = await openai.generateWithTools({
      messages: [{ role: "user", content: "which pets do I have?" }],
      tools: [{ type: "function", function: { name: "list_pets", parameters: { type: "object" } } }],
    });
    assert.deepStrictEqual(
      result.toolCalls,
      [{ id: "call_0", name: "list_pets", arguments: { limit: 3 } }],
      "tool calls normalize to { id, name, arguments }"
    );
    const sent = JSON.parse(lastRequest.body);
    assert.strictEqual(sent.tool_choice, "auto", "tool_choice sent when tools are declared");
    assert.ok(Array.isArray(sent.tools) && sent.tools.length === 1, "tool declarations sent");
    mockMode = "ok";
    ok("openai: tool calling -> normalized calls, tools sent");
  }

  {
    mockMode = "badToolArgs";
    const { openai } = loadLayer({ ...openaiEnv });
    const err = await awaitCatch(openai.generateWithTools({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "list_pets" } }],
    }));
    assert.strictEqual(err.code, "malformed", "non-JSON tool arguments -> MALFORMED");
    mockMode = "ok";
    ok("openai: malformed tool arguments -> malformed error");
  }

  {
    // No tools declared: the plain text path, no tool_choice field at all.
    const { openai } = loadLayer({ ...openaiEnv });
    const result = await openai.generateWithTools({ messages: [{ role: "user", content: "hi" }] });
    assert.strictEqual(result.text, "mock openai answer", "text-only turn returns text");
    assert.deepStrictEqual(result.toolCalls, [], "no tool calls");
    assert.strictEqual(JSON.parse(lastRequest.body).tool_choice, undefined, "no tool_choice without tools");
    ok("openai: text-only turn -> text, no tool fields sent");
  }

  // ---------------------------------------------------------------
  // Service layer: normalized fallback (returns null), key never logged
  // ---------------------------------------------------------------

  {
    const { ai } = loadLayer({ ...openaiEnv });
    const logs = captureLogs();
    const answer = await ai.generatePetGPTResponse(REQUEST.question, REQUEST.petContext);
    logs.restore();
    assert.strictEqual(answer, "mock openai answer", "service returns endpoint text");
    assert.ok(!logs.log.concat(logs.err).join("\n").includes(SECRET), "success log contains no key");
    ok("service: success -> text returned, key not logged");
  }

  await new Promise((resolve) => server.close(resolve));

  {
    const { ai } = loadLayer({});
    const logs = captureLogs();
    const answer = await ai.generatePetGPTResponse(REQUEST.question, REQUEST.petContext);
    logs.restore();
    assert.strictEqual(answer, null, "service returns null when unconfigured");
    assert.ok(
      logs.err.some((l) => l.includes("openai-compatible failed (config)")),
      "log names the contract + normalized code"
    );
    const everything = logs.log.concat(logs.err).join("\n");
    assert.ok(!everything.includes(SECRET), "no log line contains the key");
    ok("service: unconfigured -> config failure logged, null returned, no key in logs");
  }

  {
    const { ai } = loadLayer({
      PETGPT_OPENAI_BASE_URL: "http://127.0.0.1:" + ghostPort,
      PETGPT_OPENAI_API_KEY: SECRET,
      PETGPT_OPENAI_MODEL: "test-model",
    });
    const logs = captureLogs();
    const answer = await ai.generatePetGPTResponse(REQUEST.question, REQUEST.petContext);
    logs.restore();
    assert.strictEqual(answer, null, "unreachable endpoint -> null");
    assert.ok(
      logs.err.some((l) => l.includes("openai-compatible failed (unknown)")),
      "log names the contract + normalized code"
    );
    assert.ok(!logs.log.concat(logs.err).join("\n").includes(SECRET), "failure log contains no key");
    ok("service: unreachable endpoint -> null (fallback signal), key not logged");
  }

  // ---------------------------------------------------------------
  // Provider-independent architecture: one adapter, no vendor code
  // ---------------------------------------------------------------

  {
    const { ai } = loadLayer({ ...openaiEnv });
    assert.strictEqual(ai.adapter.name, "openai-compatible", "the single adapter has a contract label");
    assert.deepStrictEqual(ai.AI_ERROR_CODES, {
      CONFIG: "config", TIMEOUT: "timeout", HTTP: "http", MALFORMED: "malformed", UNKNOWN: "unknown",
    }, "normalized error codes are unchanged");
    for (const gone of ["register", "getProvider", "getProviderNames", "getActiveProvider", "supportsToolCalling", "getProviderCapabilities", "AI_CAPABILITIES"]) {
      assert.strictEqual(ai[gone], undefined, `no ${gone} on the AI surface`);
      assert.strictEqual(require("../ai/provider")[gone], undefined, `no ${gone} in the provider module`);
    }
    ok("architecture: single adapter, registry and capability API removed");
  }

  {
    // No vendor name, no vendor host, no vendor SDK may survive anywhere in
    // the AI layer. This is the "provider-independent" guarantee.
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname, "..", "ai");
    const banned = /gemini|generativelanguage|google|anthropic|\bvertex\b|@google-cloud|PETGPT_PROVIDER|apiKeyEnc/gi;
    const offenders = [];
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith(".js")) continue;
        const hit = fs.readFileSync(full, "utf8").match(banned);
        if (hit) offenders.push(`${path.relative(path.join(__dirname, ".."), full)}: ${[...new Set(hit)].join(", ")}`);
      }
    };
    walk(dir);
    assert.deepStrictEqual(offenders, [], `AI layer still references a vendor: ${offenders.join(" | ")}`);
    ok("architecture: AI layer source contains no vendor names, hosts, or SDKs");
  }

  console.log(`\nAll ${passed} AI-layer checks passed.`);
  process.exit(0);
})().catch((error) => {
  console.error("FAILED:", error && error.stack ? error.stack : error);
  process.exit(1);
});
