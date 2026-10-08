// =========================================================
// Pet QR payload URL — pure unit test (no DB).
// Run: node test/pet-qr-url.test.js
//
// The QR encodes a stable destination URL built from the
// deployment's CLIENT_URL, never a hardcoded localhost URI.
// Scanning resolves to the public Pet Details page; the browser
// suite decodes an actual generated QR to prove the image
// contains exactly this string.
// =========================================================

const assert = require("assert");
const { petQrBaseUrl, petQrPayloadUrl } = require("../utils/petQr");

const ok = (msg) => console.log("ok - " + msg);

const withClientUrl = (value, fn) => {
  const prev = process.env.CLIENT_URL;
  if (value === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = prev;
  }
};

withClientUrl("https://famipet.example.com", () => {
  assert.strictEqual(
    petQrPayloadUrl("abc-123"),
    "https://famipet.example.com/pet/abc-123",
    "payload uses the configured public origin",
  );
  ok("QR payload uses the configured CLIENT_URL origin");
});

withClientUrl("https://famipet.example.com/", () => {
  assert.strictEqual(petQrBaseUrl(), "https://famipet.example.com", "trailing slash trimmed");
  ok("QR base trims a trailing slash");
});

withClientUrl("https://famipet.example.com,http://10.0.0.2", () => {
  assert.strictEqual(petQrBaseUrl(), "https://famipet.example.com", "comma list keeps the first origin");
  ok("QR base takes the first entry of a comma-separated CLIENT_URL");
});

withClientUrl(undefined, () => {
  assert.ok(
    petQrBaseUrl().startsWith("http://"),
    "an unset CLIENT_URL falls back to a plain http origin (never a hardcoded QR host)",
  );
  ok("QR base stays http(s) when CLIENT_URL is unset");
});

withClientUrl("https://famipet.example.com", () => {
  assert.strictEqual(
    petQrPayloadUrl("uid with spaces/"),
    "https://famipet.example.com/pet/uid%20with%20spaces%2F",
    "petUid is URL-encoded into the destination",
  );
  ok("petUid is URL-encoded into the QR destination");
});

console.log("\nAll pet QR URL checks passed.");