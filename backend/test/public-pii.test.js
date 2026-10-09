// =========================================================
// Public-endpoint PII privacy — assert-based E2E checks.
// Run: node test/public-pii.test.js
// Requires a reachable MongoDB (test/db.js forces a `*_test` DB).
//
// Covers F-04: anonymous-readable endpoints must NEVER expose
// private owner/reporter/author contact info (email, phone).
// Pets / lost-found / community list+detail are public; the admin
// and owner-only endpoints keep their fields (asserted separately
// in pet-authz.test.js / admin usage).
// =========================================================

const assert = require("assert");
const { testDbUri } = require("./db");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const DB_NAME = "animal_planet_public_pii_test";
const URI = testDbUri(DB_NAME);
process.env.JWT_SECRET = process.env.JWT_SECRET || "public-pii-test-secret";

let passed = 0;
const ok = (name) => { passed++; console.log(`ok ${passed} - ${name}`); };
const tokenFor = (userId) => jwt.sign({ id: userId.toString() }, process.env.JWT_SECRET, { expiresIn: "1h" });

async function initAppRouter() {
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/api/pets", require("../routes/pet.routes"));
  app.use("/api/lost-found", require("../routes/lostFound.routes"));
  app.use("/api/community", require("../routes/community.routes"));
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function api(base, method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

const noContact = (person, name) => {
  assert.ok(person && typeof person === "object", `public response includes a ${name} object`);
  assert.strictEqual(person.email, undefined, `public ${name} must not expose email`);
  assert.strictEqual(person.phone, undefined, `public ${name} must not expose phone`);
  assert.ok(person.name, `public ${name} keeps the display name`);
};

(async () => {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
  const server = await initAppRouter();
  const base = `http://127.0.0.1:${server.address().port}`;

  const User = require("../models/User");
  const Breed = require("../models/Breed");

  const alice = await User.create({
    name: "Alice PII",
    email: "pii-alice@test.dev",
    phone: "+15551112222",
    password: "testpass123",
  });
  const aliceTok = tokenFor(alice._id);
  const breed = await Breed.create({ name: "PiiRetriever", species: "dog" });

  const pet = await api(base, "POST", "/api/pets", aliceTok, {
    breed: breed._id.toString(),
    name: "PiiDog",
    species: "dog",
    gender: "male",
    age: 2,
  });
  assert.strictEqual(pet.status, 201, "owner can create a pet for the fixture");

  const report = await api(base, "POST", "/api/lost-found", aliceTok, {
    type: "lost",
    petName: "PiiCat",
    species: "cat",
    location: "Testville",
    description: "Missing test cat",
    date: new Date().toISOString().slice(0, 10),
    contactName: "Alice",
    contactPhone: "+15550009999",
  });
  assert.strictEqual(report.status, 201, "owner can create a lost-found report");

  const post = await api(base, "POST", "/api/community", aliceTok, {
    title: "PiiPost",
    content: "Public post body",
  });
  assert.strictEqual(post.status, 201, "owner can create a community post");

  // ---- anonymous reads of the PUBLIC list endpoints ----
  const pets = await api(base, "GET", "/api/pets");
  assert.strictEqual(pets.status, 200, "anonymous GET /api/pets stays public");
  const p = pets.data.pets.find((x) => x.name === "PiiDog");
  assert.ok(p, "public pet list contains the fixture pet");
  noContact(p.owner, "pet.owner");
  ok("F-04: anonymous GET /api/pets exposes no owner email/phone");

  const reports = await api(base, "GET", "/api/lost-found");
  assert.strictEqual(reports.status, 200, "anonymous GET /api/lost-found stays public");
  noContact(reports.data.reports[0].user, "report.user");
  ok("F-04: anonymous GET /api/lost-found exposes no reporter email/phone");

  const posts = await api(base, "GET", "/api/community");
  assert.strictEqual(posts.status, 200, "anonymous GET /api/community stays public");
  noContact(posts.data.posts[0].user, "post.user");
  ok("F-04: anonymous GET /api/community exposes no author email");

  // ---- authenticated owner sees the SAME public projection ----
  const ownerPets = await api(base, "GET", "/api/pets", aliceTok);
  const op = ownerPets.data.pets.find((x) => x.name === "PiiDog");
  noContact(op.owner, "pet.owner (authenticated too)");
  ok("F-04: authenticated GET /api/pets is equally non-disclosing");

  const detail = await api(base, "GET", `/api/lost-found/${report.data.report._id}`);
  assert.strictEqual(detail.status, 200, "anonymous GET /api/lost-found/:id stays public");
  noContact(detail.data.report.user, "report-detail.user");
  ok("F-04: anonymous lost-found detail exposes no reporter email/phone");

  const postDetail = await api(base, "GET", `/api/community/${post.data.post._id}`);
  assert.strictEqual(postDetail.status, 200, "anonymous GET /api/community/:id stays public");
  noContact(postDetail.data.post.user, "post-detail.user");
  ok("F-04: anonymous community detail exposes no author email");

  // ---- public Pet Details (QR petUid lookup) stays PII-safe ----
  assert.ok(pet.data.pet.petUid, "created pet carries a stable petUid");
  const qrDetail = await api(base, "GET", `/api/pets/public/${pet.data.pet.petUid}`);
  assert.strictEqual(qrDetail.status, 200, "anonymous QR lookup resolves without auth");
  assert.strictEqual(qrDetail.data.pet.name, "PiiDog", "QR lookup returns the pet's details");
  noContact(qrDetail.data.pet.owner, "qr.pet.owner");
  assert.strictEqual(qrDetail.data.pet.petUid, pet.data.pet.petUid, "QR lookup returns the same stable id");
  ok("F-04: anonymous QR petUid lookup exposes no owner email/phone");

  const unknownUid = await api(base, "GET", "/api/pets/public/definitely-not-a-real-uid");
  assert.strictEqual(unknownUid.status, 404, "an unknown petUid 404s");

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();

  console.log(`\n${passed} checks passed`);
  process.exit(0);
})().catch((error) => {
  console.error("\nFAIL -", error.message);
  process.exit(1);
});