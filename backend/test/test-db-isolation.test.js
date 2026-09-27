// =========================================================
// Test database isolation — assert-based check on the guard
// that keeps the suites off any real database.
// Run: node test/test-db-isolation.test.js
//
// Deliberately first in the `npm test` chain and needs no
// MongoDB: it verifies the CONSTRUCTION of the test URI, so a
// regression that would let a suite connect to (and drop) a
// production database fails here before anything connects.
//
// The incident this guards: a suite read MONGODB_URI straight
// from the environment and then called dropDatabase(). Run with
// the production env injected (`--env-file backend/.env`) that
// dropped the live `petDB`.
// =========================================================

const assert = require("assert");
const { testDbUri, scrubLiveProviderKeys, LIVE_PROVIDER_KEYS } = require("./db");

let passed = 0;
const ok = (name) => { passed++; console.log(`ok ${passed} - ${name}`); };

// Run `fn` with MONGODB_URI set to `uri`, restoring it after.
function withEnv(uri, fn) {
  const prev = process.env.MONGODB_URI;
  if (uri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = uri;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = prev;
  }
}

const DB = "animal_planet_isolation_test";

// 1. The production URI in the environment does NOT leak its
//    database name into the test URI. This is the exact shape of
//    the incident.
withEnv("mongodb://mongodb:27017/petDB", () => {
  const uri = testDbUri(DB);
  assert.ok(uri.endsWith("/" + DB), `expected the test database name, got ${uri}`);
  assert.ok(!uri.includes("petDB"), `production database name leaked: ${uri}`);
  ok("production MONGODB_URI cannot reach the test URI's database name");
});

// 2. The server (host:port) IS still honoured, so suites can be
//    pointed at a containerized mongod.
withEnv("mongodb://mongodb:27017/petDB", () => {
  assert.strictEqual(testDbUri(DB), `mongodb://mongodb:27017/${DB}`);
  ok("host and port are taken from the environment");
});

// 3. Credentials in the ambient URI are not carried into the test
//    URI, so they cannot end up in a log line.
withEnv("mongodb://user:hunter2@mongodb:27017/petDB", () => {
  const uri = testDbUri(DB);
  assert.ok(!uri.includes("hunter2"), `credentials leaked: ${uri}`);
  assert.strictEqual(uri, `mongodb://mongodb:27017/${DB}`);
  ok("credentials are stripped from the ambient URI");
});

// 4. With no ambient URI the historical local default is used.
withEnv(undefined, () => {
  assert.strictEqual(testDbUri(DB), `mongodb://localhost:27017/${DB}`);
  ok("defaults to local mongod when MONGODB_URI is unset");
});

// 5. A database name that is not a test database is REFUSED, so a
//    typo can never point dropDatabase() at real data.
for (const bad of ["petDB", "animal_planet", "prod_test2", ""]) {
  withEnv("mongodb://mongodb:27017/petDB", () => {
    assert.throws(() => testDbUri(bad), /_test|required/,
      `expected "${bad}" to be refused`);
  });
}
ok("a non-test database name is refused before connecting");

// 6. Live provider credentials are scrubbed, so a suite can never
//    reach a real API by inheriting the service env. Without this a
//    "no provider configured" case silently called the live provider.
//    The import above already ran the scrub, so the ambient keys are
//    gone by now regardless of how this process was started.
for (const key of LIVE_PROVIDER_KEYS) {
  assert.strictEqual(process.env[key], undefined,
    `${key} survived into the test process; a suite could reach a live provider`);
}
ok("live provider keys are scrubbed on import");

// 7. The scrub is reversible only by an explicit opt-in, so the
//    live-provider e2e suites stay opt-in rather than accidental.
{
  const fake = {
    PETGPT_OPENAI_API_KEY: "real-key",
  };
  const removed = scrubLiveProviderKeys(fake);
  assert.ok(removed, "scrub reports that it removed something");
  for (const key of LIVE_PROVIDER_KEYS) {
    assert.strictEqual(fake[key], undefined, `${key} not removed`);
  }

  const optedIn = { PETGPT_OPENAI_API_KEY: "real-key", PETGPT_RUN_LIVE_E2E: "1" };
  assert.strictEqual(scrubLiveProviderKeys(optedIn), false,
    "opt-in must be a no-op");
  assert.strictEqual(optedIn.PETGPT_OPENAI_API_KEY, "real-key",
    "PETGPT_RUN_LIVE_E2E=1 keeps the key for the live suites");
}
ok("the scrub is opt-in via PETGPT_RUN_LIVE_E2E=1");

console.log(`\n${passed} passed`);
