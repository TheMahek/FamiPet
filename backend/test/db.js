// =========================================================
// Test database isolation — the ONLY sanctioned way for a
// suite to build its Mongo URI.
//
// Why this exists: the suites used to read
//   process.env.MONGODB_URI || "mongodb://localhost:27017/<test db>"
// and then call mongoose.connection.dropDatabase(). The
// fallback protected nothing: with MONGODB_URI present in the
// environment — which is exactly what `docker run --env-file
// backend/.env` does — the URI became the PRODUCTION uri and
// dropDatabase() dropped the live `petDB`. That happened once.
//
// Two guarantees, both enforced here rather than per suite:
//
//   1. The database NAME is never taken from the environment.
//      The host:port still is, so a suite can be pointed at a
//      containerized mongod, but the name is always the test
//      name this suite passed in. There is no code path that
//      yields a production database name.
//   2. A name that does not end in `_test` throws before any
//      connection is opened. Even a typo can no longer reach a
//      real database, and a suite that forgets to use this
//      helper fails loudly instead of silently.
//
// Use:  const { testDbUri } = require("./db");
//       process.env.MONGODB_URI = testDbUri("animal_planet_foo_test");
// =========================================================

const SUFFIX = "_test";

// Live endpoint credentials are the second isolation hazard, and they
// bit the same way: `docker compose run` loads the service env, so a
// normal `npm test` inherited the real key and a suite whose intent was
// "no endpoint configured" quietly reached the live API instead. Scrubbed
// here, at the same chokepoint, so no suite can spend real quota or depend
// on a real key by accident.
//
// Suites that want an endpoint set their own dummy key AFTER this
// require, which still works. The live-endpoint e2e suites read the
// ambient key to decide whether to run, so they now self-skip unless
// explicitly opted in:
//
//   PETGPT_RUN_LIVE_E2E=1 npm test
//
// That makes "skipped" the honest default for a suite that would
// otherwise spend a real API key.
const LIVE_PROVIDER_KEYS = ["PETGPT_OPENAI_API_KEY"];

function scrubLiveProviderKeys(env = process.env) {
  if (env.PETGPT_RUN_LIVE_E2E === "1") return false;
  const removed = [];
  for (const key of LIVE_PROVIDER_KEYS) {
    if (env[key]) {
      delete env[key];
      removed.push(key);
    }
  }
  return removed.length > 0;
}

scrubLiveProviderKeys();

// Strip credentials, query and path off an incoming URI, keeping
// only what identifies the SERVER. Deliberately crude: the only
// thing reused from the ambient value is where to connect, and any
// database name in it is discarded unconditionally.
function serverOrigin(uri) {
  const m = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)/i.exec(String(uri).trim());
  if (!m) return null;
  const scheme = m[1];
  // Drop any userinfo (user:pass@) — it must never reach a log line.
  const authority = m[2].replace(/^[^@]*@/, "");
  return authority ? scheme + authority : null;
}

// Build an isolated test URI for `dbName`.
//
// `dbName` must end in `_test`. The resulting URI always points at
// `dbName`, whatever MONGODB_URI says, so dropDatabase() on it can
// only ever touch a throwaway test database.
function testDbUri(dbName) {
  const name = String(dbName || "").trim();
  if (!name) {
    throw new Error("testDbUri: a test database name is required");
  }
  if (!name.endsWith(SUFFIX)) {
    // Fail BEFORE connecting. A suite that cannot prove it targets
    // a test database must not run at all.
    throw new Error(
      `testDbUri: refusing database name "${name}" — test database names must end in "${SUFFIX}". ` +
        "A suite must never be able to drop a non-test database."
    );
  }
  const origin = serverOrigin(process.env.MONGODB_URI || "");
  // No ambient URI (or an unparseable one): plain local mongod, the
  // historical default.
  return `${origin || "mongodb://localhost:27017"}/${name}`;
}

module.exports = { testDbUri, scrubLiveProviderKeys, LIVE_PROVIDER_KEYS };
