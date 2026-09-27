// =========================================================
// PetGPT provider configuration — settings-UI contract + server
// encryption configuration. Assert-based checks, no framework.
//
// Run: node test/provider-config-ui.test.js
// Requires a reachable MongoDB (default localhost:27017 test DB).
//
// Deliberately network-free: the Gemini checks assert provider RESOLUTION and
// ADAPTER SELECTION (what a user-configured Gemini provider resolves to) rather
// than a live generativelanguage.googleapis.com call, because the adapter host
// is fixed and a real API key is never used in tests. End-to-end worker
// execution through a configured provider is covered by provider-config.test.js.
//
// No real API key anywhere: every key below is a throwaway string asserted
// never to leave the server as plaintext.
// =========================================================

const assert = require("assert");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const DB_NAME = "animal_planet_petgpt_provider_cfg_ui_test";
const URI = process.env.MONGODB_URI || `mongodb://localhost:27017/${DB_NAME}`;

const ENCRYPTION_KEY = "petgpt-provider-cfg-ui-test-encryption-key";
const API_KEY = "sk-ui-test-plaintext-never-returned";
const ROTATED_KEY = "sk-ui-test-rotated-key";
const ENCRYPTION_KEY_MISSING = "PETGPT_ENCRYPTION_KEY_MISSING";
let passed = 0;
const ok = (name) => { passed++; console.log(`ok ${passed} - ${name}`); };

// Env fallback must be deterministic and must not accidentally satisfy the
// user-configured path, so clear every provider variable first.
for (const k of ["PETGPT_PROVIDER", "GEMINI_API_KEY", "PETGPT_OPENAI_BASE_URL", "PETGPT_OPENAI_API_KEY", "PETGPT_OPENAI_MODEL"]) {
  if (k in process.env) delete process.env[k];
}
process.env.JWT_SECRET = "petgpt-provider-cfg-ui-test-secret";
process.env.PETGPT_ENCRYPTION_KEY = ENCRYPTION_KEY;

const { AI_CONFIG } = require("../config/ai");
const { decryptSecret } = require("../utils/cipher");
const AiProvider = require("../models/AiProvider");
const ai = require("../ai");
const { supportsToolCalling } = require("../ai/provider");

// The exact field set the settings UI is typed against (api/petgpt.ts
// `PetGPTProvider`). Anything extra here is a contract change; anything missing
// breaks the UI.
const SAFE_FIELDS = ["active", "baseUrl", "configured", "createdAt", "enabled", "id", "model", "name", "provider", "updatedAt"].sort();

(async () => {
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
  await AiProvider.init();

  const [alice, bob] = await Promise.all([
    User.create({ name: "CfgUI Alice", email: "cfgui-a@test.dev", password: "testpass123" }),
    User.create({ name: "CfgUI Bob", email: "cfgui-b@test.dev", password: "testpass123" }),
  ]);
  const aliceTok = jwt.sign({ id: alice._id.toString() }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const bobTok = jwt.sign({ id: bob._id.toString() }, process.env.JWT_SECRET, { expiresIn: "1h" });

  const logLines = [];
  const origLog = console.log, origErr = console.error;
  console.log = (...a) => { logLines.push(a.join(" ")); origLog(...a); };
  console.error = (...a) => { logLines.push(a.join(" ")); origErr(...a); };

  async function api(method, path, token, body) {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    return { status: res.status, data };
  }

  const provPath = "/api/ai/providers";
  const json = (x) => JSON.stringify(x);
  const assertMasked = (payload, where) => {
    assert.ok(!json(payload).includes(API_KEY), `plaintext API key not in ${where}`);
    assert.ok(!json(payload).includes("apiKeyEnc"), `ciphertext field not in ${where}`);
    assert.ok(!json(payload).includes(ENCRYPTION_KEY), `encryption key not in ${where}`);
  };
  const assertSafeShape = (p, where) => {
    assert.deepStrictEqual(Object.keys(p).sort(), SAFE_FIELDS, `safe provider shape at ${where}`);
    assert.strictEqual(typeof p.configured, "boolean", `configured mask is boolean at ${where}`);
    assert.strictEqual(p.configured, true, `stored key reported only as a mask at ${where}`);
  };

  /* ---- 1. Empty state: the UI must never read "configured" from nothing -- */
  {
    const a = await api("GET", provPath, aliceTok);
    assert.strictEqual(a.status, 200);
    assert.deepStrictEqual(a.data.providers, [], "no configuration -> explicit empty list");
    const raw = await AiProvider.countDocuments({ owner: alice._id });
    assert.strictEqual(raw, 0, "no provider doc is fabricated for a fresh account");
    const resolved = await ai.resolveActiveProviderConfig(alice._id);
    assert.strictEqual(resolved, null, "no active config -> backend env fallback, never a phantom provider");
    assert.strictEqual(AI_CONFIG.provider, "google", "server env fallback intact");
    ok("providers: empty state is explicit (empty list, no phantom config, env fallback intact)");
  }

  /* ---- 2. A user-configured Gemini provider resolves to the NATIVE adapter */
  let geminiId;
  {
    const a = await api("POST", provPath, aliceTok, {
      provider: "google", name: "My Gemini", model: "gemini-2.0-flash", apiKey: API_KEY,
    });
    assert.strictEqual(a.status, 201, "gemini create -> 201");
    geminiId = a.data.provider.id;
    assertSafeShape(a.data.provider, "create");
    assertMasked(a.data, "gemini create response");
    // Gemini configs carry no endpoint: the field is present but empty.
    assert.strictEqual(a.data.provider.baseUrl, "", "gemini config stores no base URL");

    const list = await api("GET", provPath, aliceTok);
    assertSafeShape(list.data.providers[0], "list");
    assertMasked(list.data, "list response");

    // Resolution is strictly owner-scoped: only alice's active+enabled config.
    const resolved = await ai.resolveActiveProviderConfig(alice._id);
    assert.ok(resolved, "owner-scoped resolution finds the stored Gemini config");
    assert.strictEqual(resolved.provider, "google");
    assert.strictEqual(resolved.model, "gemini-2.0-flash");
    assert.strictEqual(await ai.resolveActiveProviderConfig(bob._id), null, "never another owner's provider");

    // The decrypted credentials are what the native Gemini adapter would call
    // with — and it is the google adapter, never the OpenAI-compatible one.
    const request = ai.buildProviderRequest(resolved);
    assert.strictEqual(request.adapter.name, "google", "resolves to the native Gemini adapter");
    assert.notStrictEqual(request.adapter.name, "openai", "Gemini is not routed through the OpenAI adapter");
    assert.strictEqual(request.config.apiKey, API_KEY, "stored key decrypted for the request only");
    assert.strictEqual(request.config.model, "gemini-2.0-flash", "user model passed through, not the env default");
    assert.strictEqual(request.config.baseUrl, undefined, "no OpenAI base URL injected into Gemini");
    // Gemini declares no tool calling, so the worker takes the single-turn
    // generate() path with the user's credentials (not the tool loop).
    assert.strictEqual(supportsToolCalling("google"), false, "Gemini stays off the tool-calling path");
    assertMasked({ request: { adapter: request.adapter.name, model: request.config.model } }, "resolution");
    ok("providers: user-configured Gemini resolves owner-scoped to the native adapter with decrypted credentials");
  }

  /* ---- 3. Active / enabled semantics the UI badges as "Active" ---------- */
  {
    // active:false -> not resolved -> backend keeps the env fallback.
    const off = await api("PATCH", `${provPath}/${geminiId}`, aliceTok, { active: false });
    assert.strictEqual(off.status, 200);
    assert.strictEqual(off.data.provider.active, false, "active flag reflects the request");
    assertSafeShape(off.data.provider, "update");
    assertMasked(off.data, "deactivate response");
    assert.strictEqual(await ai.resolveActiveProviderConfig(alice._id), null, "active:false is not resolved");

    // enabled:false on an active config -> also not resolved.
    await api("PATCH", `${provPath}/${geminiId}`, aliceTok, { active: true, enabled: false });
    assert.strictEqual(await ai.resolveActiveProviderConfig(alice._id), null, "disabled config is not resolved");

    // Promote again -> resolved, and it takes precedence over the env provider.
    const on = await api("PATCH", `${provPath}/${geminiId}`, aliceTok, { active: true, enabled: true });
    assert.strictEqual(on.data.provider.active, true);
    assert.strictEqual(on.data.provider.enabled, true);
    const resolved = await ai.resolveActiveProviderConfig(alice._id);
    assert.ok(resolved, "re-enabled active config is resolved again");
    // Precedence: with nothing stored the backend uses the env adapter; with a
    // stored active config the resolution switches to the user's document and
    // the env adapter is no longer what the worker would pick.
    assert.strictEqual(ai.getActiveProvider().name, AI_CONFIG.provider, "env fallback adapter still available");
    assert.strictEqual(resolved.provider, "google", "the user's stored config is what now resolves");
    assert.notStrictEqual(resolved.apiKeyEnc, undefined, "the stored config carries its own credentials");
    const activeCount = await AiProvider.countDocuments({ owner: alice._id, active: true });
    assert.strictEqual(activeCount, 1, "at most one active provider per owner");
    ok("providers: active+enabled is what counts as in use; env fallback resumes when neither");
  }

  /* ---- 4. API-key masking on every write path ------------------------- */
  {
    // Replacing a key: the response masks it and the new ciphertext is stored.
    const up = await api("PATCH", `${provPath}/${geminiId}`, aliceTok, { apiKey: ROTATED_KEY, model: "gemini-2.0-flash-exp" });
    assert.strictEqual(up.status, 200);
    assertSafeShape(up.data.provider, "key rotation");
    assert.ok(!json(up.data).includes(ROTATED_KEY), "newly submitted key is not echoed back");
    const raw = await AiProvider.findById(geminiId).lean();
    assert.notStrictEqual(raw.apiKeyEnc, ROTATED_KEY, "rotated key stored as ciphertext only");
    assert.strictEqual(decryptSecret(raw.apiKeyEnc), ROTATED_KEY, "rotated key round-trips");
    assert.ok(!json(raw).includes(API_KEY), "old plaintext key is gone from the doc");

    // An update that omits apiKey must keep the stored key (the UI sends no
    // key when the user leaves the field blank, because it cannot read it back).
    const keep = await api("PATCH", `${provPath}/${geminiId}`, aliceTok, { model: "gemini-2.0-flash" });
    assert.strictEqual(keep.status, 200);
    assert.strictEqual(keep.data.provider.configured, true, "key still reported as configured");
    const raw2 = await AiProvider.findById(geminiId).lean();
    assert.strictEqual(raw2.apiKeyEnc, raw.apiKeyEnc, "omitting apiKey leaves the stored key untouched");

    // /test never returns the key, not even on the failure path.
    const t = await api("POST", `${provPath}/${geminiId}/test`, aliceTok);
    assert.strictEqual(t.status, 200, "/test answers 200 even when the provider is unreachable");
    assert.strictEqual(t.data.success, true);
    assert.strictEqual(t.data.ok, false, "unreachable provider reports ok:false, not a fabricated success");
    assert.ok(t.data.error && typeof t.data.error.code === "string", "/test returns a normalized error code");
    assertMasked(t.data, "test response");
    ok("providers: API key is masked on every response path; blank field keeps the stored key");
  }

  /* ---- 5. Server encryption configuration is an actionable error ------- */
  {
    delete process.env.PETGPT_ENCRYPTION_KEY;
    const before = await AiProvider.countDocuments({});

    // create -> a configuration error, not a generic 500, and nothing stored.
    const create = await api("POST", provPath, bobTok, {
      provider: "openai", baseUrl: "https://example.invalid/v1", model: "m", apiKey: "sk-should-never-store",
    });
    assert.strictEqual(create.status, 503, "missing encryption config -> 503, not a generic 500");
    assert.strictEqual(create.data.success, false);
    assert.strictEqual(create.data.code, ENCRYPTION_KEY_MISSING, "stable code the UI can key on");
    assert.ok(String(create.data.message).includes("PETGPT_ENCRYPTION_KEY"), "message names the variable to fix");
    assert.ok(!json(create.data).includes("sk-should-never-store"), "the submitted key is not echoed on failure");
    assert.strictEqual(await AiProvider.countDocuments({}), before, "failed create persists nothing");

    // update with a NEW key -> same actionable error, and no partial write.
    const beforeDoc = await AiProvider.findById(geminiId).lean();
    const update = await api("PATCH", `${provPath}/${geminiId}`, aliceTok, { apiKey: "sk-another-never-stored", model: "should-not-persist" });
    assert.strictEqual(update.status, 503, "update that must encrypt -> 503");
    assert.strictEqual(update.data.code, ENCRYPTION_KEY_MISSING);
    assertMasked(update.data, "update response without encryption config");
    const after = await AiProvider.findById(geminiId).lean();
    assert.strictEqual(after.model, beforeDoc.model, "no partial write when encryption is unavailable");
    assert.strictEqual(after.apiKeyEnc, beforeDoc.apiKeyEnc, "the previously stored ciphertext is untouched");

    // update that does NOT need the cipher still works: the read/list path is
    // unaffected by a missing encryption secret.
    const readOnly = await api("PATCH", `${provPath}/${geminiId}`, aliceTok, { model: "gemini-2.0-flash" });
    assert.strictEqual(readOnly.status, 200, "updates that do not encrypt are unaffected");
    const list = await api("GET", provPath, aliceTok);
    assert.strictEqual(list.data.providers.length, 1, "listing still works");
    assertSafeShape(list.data.providers[0], "list without encryption config");

    // /test stays a normalized 200 (no 500, no crash) when the key cannot be read.
    const t = await api("POST", `${provPath}/${geminiId}/test`, aliceTok);
    assert.strictEqual(t.status, 200, "/test never 500s on missing encryption config");
    assert.strictEqual(t.data.ok, false);
    assert.strictEqual(t.data.error.code, "config", "unreadable credentials normalize to the config code");
    assertMasked(t.data, "test response without encryption config");

    // Validation still runs before the cipher, so a bad payload is a 400.
    const invalid = await api("POST", provPath, bobTok, { provider: "nope", model: "m", apiKey: "k" });
    assert.strictEqual(invalid.status, 400, "validation still short-circuits before encryption");

    process.env.PETGPT_ENCRYPTION_KEY = ENCRYPTION_KEY;
    assert.ok(logLines.every((l) => !l.includes(API_KEY) && !l.includes(ROTATED_KEY)), "no key in any log line");
    ok("encryption: missing PETGPT_ENCRYPTION_KEY is an actionable 503 that stores nothing and leaves prior keys intact");
  }

  /* ---- 6. Ownership isolation across the whole settings surface -------- */
  {
    const foreignList = await api("GET", provPath, bobTok);
    assert.deepStrictEqual(foreignList.data.providers, [], "bob's list never contains alice's provider");
    const foreignRead = await api("PATCH", `${provPath}/${geminiId}`, bobTok, { model: "hijacked", apiKey: "sk-hijack" });
    assert.strictEqual(foreignRead.status, 404, "cross-owner update is indistinguishable from not found");
    const foreignDelete = await api("DELETE", `${provPath}/${geminiId}`, bobTok);
    assert.strictEqual(foreignDelete.status, 404, "cross-owner delete is indistinguishable from not found");
    const foreignTest = await api("POST", `${provPath}/${geminiId}/test`, bobTok);
    assert.strictEqual(foreignTest.status, 404, "cross-owner test is indistinguishable from not found");
    const stillThere = await AiProvider.findById(geminiId).lean();
    assert.strictEqual(stillThere.model, "gemini-2.0-flash", "alice's provider is untouched by bob");
    assert.strictEqual(decryptSecret(stillThere.apiKeyEnc), ROTATED_KEY, "alice's key is untouched by bob");
    assert.strictEqual(await ai.resolveActiveProviderConfig(bob._id), null, "bob resolves nothing, never alice's config");
    const unknown = await api("PATCH", `${provPath}/64b7f1c2a1b2c3d4e5f60718`, aliceTok, { model: "x" });
    assert.strictEqual(unknown.status, 404, "unknown id behaves identically to a foreign id");
    ok("providers: ownership isolation — a second user can read, update, delete, test, or resolve nothing of the first");
  }

  console.log = origLog;
  console.error = origErr;
  await AiProvider.deleteMany({});
  await User.deleteMany({ _id: { $in: [alice._id, bob._id] } });
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));

  console.log(`\nAll ${passed} provider-configuration UI checks passed.`);
  process.exit(0);
})().catch(async (error) => {
  console.error("FAILED:", error && error.stack ? error.stack : error);
  try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
  process.exit(1);
});
