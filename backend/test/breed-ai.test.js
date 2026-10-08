// =========================================================
// Breed AI tests
// ---------------------------------------------------------
// Assert-based, no framework, no live ML service and no live AI
// provider: every upstream is stubbed, so this suite is
// deterministic and hermetic.
//
// Covers the whole pipeline in backend/ai/breed/:
//   * ImageNet -> FamiPet mapping (incl. non-dog/cat species)
//   * confidence thresholds (breed-specific vs species-level)
//   * unsupported / low-confidence outcomes
//   * existing-breed lookup (case- and alias-insensitive)
//   * AI enrichment + strict validation + normalization
//   * duplicate prevention
//   * ML service unavailable / bad response
//   * upload validation (missing, wrong type, oversized)
//   * the HTTP surface: auth, rate limit, status codes, body shape
//
// Run: node test/breed-ai.test.js
// =========================================================

const assert = require("assert");
const { testDbUri } = require("./db");
const mongoose = require("mongoose");

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = testDbUri("animal_planet_breed_ai_test");
process.env.JWT_SECRET = process.env.JWT_SECRET || "breed-ai-test-secret";

// ML service address. Unreachable on purpose unless a test stubs
// global.fetch; `enabled` only depends on the URL being well formed.
process.env.PET_BREED_AI_URL = "http://127.0.0.1:9";
process.env.PET_BREED_AI_TIMEOUT_MS = "1500";
process.env.PET_BREED_MAX_UPLOAD_BYTES = String(1024 * 64); // 64 KB for the size test
process.env.PET_BREED_MIN_CONFIDENCE = "0.35";
process.env.PET_BREED_MIN_CONFIDENCE_GENERIC = "0.55";

// The enrichment provider must look configured, and never reachable:
// any accidental real call fails fast instead of spending quota.
process.env.PETGPT_OPENAI_BASE_URL = "http://127.0.0.1:9/v1";
process.env.PETGPT_OPENAI_API_KEY = "sk-breed-ai-test";
process.env.PETGPT_OPENAI_MODEL = "test-model";

const Breed = require("../models/Breed");
const { mapImageNetLabel, slugify, mappingSize } = require("../ai/breed/imagenet-map");
const schema = require("../ai/breed/schema");
const service = require("../ai/breed/service");
const { BREED_AI_CONFIG, normalizeServiceUrl, breedAiStatus } = require("../config/breed-ai");

let passed = 0;
const ok = (name) => { passed++; console.log(`ok ${passed} - ${name}`); };

// The route is mounted on its own app, not on server.js, so the
// suite never opens a port the rest of the project competes for.
// The multer error handler mirrors the one in server.js, because the
// LIMIT_FILE_SIZE -> 413 mapping lives on the app, not on the route.
function initApp() {
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/api/breeds", require("../routes/breed.routes"));
  app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
    if (error && error.name === "MulterError") {
      return res.status(413).json({ success: false, message: "File too large." });
    }
    return res
      .status((error && error.status) || 500)
      .json({ success: false, message: (error && error.message) || "Internal Server Error" });
  });
  return app;
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const PNG_MAGIC = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(40),
]);

function jpeg(bytes = 256) {
  return { buffer: Buffer.concat([JPEG_MAGIC, Buffer.alloc(Math.max(0, bytes - JPEG_MAGIC.length))]) };
}

function png(bytes = 256) {
  return { buffer: Buffer.concat([PNG_MAGIC, Buffer.alloc(Math.max(0, bytes - PNG_MAGIC.length))]) };
}

// Stub global.fetch for the ML call only: the provider adapter also
// uses fetch, so the stub dispatches on the URL.
function stubFetch({ predictions = [], status = 200, body = null, providerText = null } = {}) {
  const real = global.fetch;
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    // The suite talks to its own server over the same global fetch, so
    // only upstream calls are intercepted; everything else is passed
    // through untouched.
    if (!href.startsWith("http://127.0.0.1:9") && !href.includes("/v1/chat/completions")) {
      return real(url, options);
    }
    if (href.includes("/predict")) {
      if (status >= 400) {
        return { ok: false, status, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => body || { predictions } };
    }
    // The OpenAI-compatible enrichment endpoint.
    if (href.includes("/chat/completions")) {
      if (providerText === "__throw__") throw Object.assign(new Error("boom"), { code: "http" });
      if (providerText === null) throw Object.assign(new Error("no provider"), { code: "config" });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: providerText } }],
        }),
      };
    }
    throw new Error("unexpected fetch: " + href);
  };
  return () => { global.fetch = real; };
}

const GOOD_DRAFT = {
  name: "Golden Retriever",
  species: "dog",
  origin: "  Scotland  ",
  lifespan: "10-12 years",
  weightRange: "25-34",
  heightRange: "51",
  temperament: ["Friendly", "friendly", "Intelligent"],
  exerciseRequirements: "Long daily walks.",
  groomingGuide: "Brush weekly.",
  commonDiseases: ["Hip dysplasia", "hip dysplasia", "Cataracts"],
  suitableEnvironment: "Active family home.",
  characteristics: ["Dense golden coat"],
  nutritionNotes: "Balanced large-breed diet.",
  description: "A friendly retriever.",
  aliases: ["Goldie", "golden retriever dog", "Golden Retriever"],
};

// Aliases default to the overridden name, never to GOOD_DRAFT's. Leaving
// them behind would let a Golden Retriever alias ride along on a Papillon
// draft and collide with the Golden Retriever record the suite created.
function validProviderJson(overrides = {}) {
  const draft = Object.assign({}, GOOD_DRAFT, overrides);
  if (!("aliases" in overrides)) {
    draft.aliases = [String(draft.name).split(" ")[0]];
  }
  return JSON.stringify(draft);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();

  const User = require("../models/User");
  const Pet = require("../models/Pet");
  const jwt = require("jsonwebtoken");
  const alice = await User.create({ name: "Alice", email: "breed-ai-alice@test.dev", password: "Test1234!" });

  // =========================================================
  // 1. IMAGE -> CLASS MAPPING
  // =========================================================

  // The mapping is the gate that stops an arbitrary ImageNet label
  // from becoming a breed, so it is checked directly and hard.
  assert.ok(mappingSize() >= 120, `mapping covers a broad label set (${mappingSize()})`);

  const golden = mapImageNetLabel("golden_retriever");
  assert.strictEqual(golden.species, "dog");
  assert.strictEqual(golden.breedName, "Golden Retriever");
  assert.strictEqual(golden.breedSpecific, true);

  // Real breed label for a cat.
  const persian = mapImageNetLabel("Persian_cat");
  assert.strictEqual(persian.species, "cat");
  assert.strictEqual(persian.breedName, "Persian Cat");
  assert.strictEqual(persian.breedSpecific, true);

  // Species beyond dog and cat must be representable.
  assert.strictEqual(mapImageNetLabel("goldfish").species, "fish");
  assert.strictEqual(mapImageNetLabel("macaw").species, "bird");
  assert.strictEqual(mapImageNetLabel("wood_rabbit").species, "rabbit");
  assert.strictEqual(mapImageNetLabel("hamster").species, "other");

  // A species-level label is explicitly NOT breed-specific.
  assert.strictEqual(mapImageNetLabel("tabby").breedSpecific, false);

  // Anything outside the table is unsupported, never invented.
  for (const label of ["African_elephant", "espresso", "not_a_real_class", "", "volcano"]) {
    assert.strictEqual(mapImageNetLabel(label), null, `no mapping invented for "${label}"`);
  }
  ok("ImageNet -> FamiPet mapping covers dog, cat, bird, rabbit, fish, other and invents nothing");

  // The slug must match what the Python service emits, byte for byte.
  for (const raw of ["Shih-Tzu", "  Persian_cat ", "RED-BONE"]) {
    assert.strictEqual(slugify(raw), slugify(raw.toLowerCase().trim()));
  }
  assert.strictEqual(slugify("Shih-Tzu"), "shih_tzu");
  ok("label slugging matches the ML service's normalisation");

  // =========================================================
  // 2. CONFIDENCE THRESHOLDS
  // =========================================================

  // Below the breed bar -> no candidate.
  let built = service.buildCandidates([{ label: "golden_retriever", displayName: "golden retriever", confidence: 0.2 }]);
  assert.strictEqual(built.candidates.length, 0);
  assert.strictEqual(built.unsupported.length, 0, "a mapped label is not 'unsupported', it is filtered");

  // At/above the breed bar -> candidate.
  built = service.buildCandidates([{ label: "golden_retriever", displayName: "golden retriever", confidence: 0.91 }]);
  assert.strictEqual(built.candidates.length, 1);

  // Species-level labels are held to the stricter bar.
  const genericLow = service.buildCandidates([{ label: "tabby", displayName: "tabby", confidence: 0.5 }]);
  assert.strictEqual(genericLow.candidates.length, 0, "tabby at 0.50 is below the generic bar of 0.55");
  const genericHigh = service.buildCandidates([{ label: "tabby", displayName: "tabby", confidence: 0.6 }]);
  assert.strictEqual(genericHigh.candidates.length, 1);

  // An unmapped label lands in `unsupported`, never in candidates.
  built = service.buildCandidates([
    { label: "golden_retriever", displayName: "golden retriever", confidence: 0.9 },
    { label: "espresso", displayName: "espresso", confidence: 0.95 },
  ]);
  assert.strictEqual(built.candidates.length, 1);
  assert.strictEqual(built.unsupported.length, 1);
  assert.strictEqual(built.unsupported[0].label, "espresso");

  // Candidates come back strongest-first.
  built = service.buildCandidates([
    { label: "beagle", displayName: "beagle", confidence: 0.4 },
    { label: "chihuahua", displayName: "Chihuahua", confidence: 0.8 },
  ]);
  assert.strictEqual(built.candidates[0].breedName, "Chihuahua");
  ok("confidence thresholds: breed bar 0.35, stricter generic bar 0.55, unsupported labels excluded");

  // =========================================================
  // 3. UNSUPPORTED PREDICTION -> nothing written
  // =========================================================

  let restore = stubFetch({ predictions: [{ label: "espresso", displayName: "espresso", confidence: 0.99 }] });
  let result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.status, "unsupported");
  assert.strictEqual(result.reason, service.REASON.UNSUPPORTED_ANIMAL);
  assert.strictEqual(result.predictions.length, 1, "the raw prediction is echoed for transparency");
  assert.strictEqual(await Breed.countDocuments({ name: /espresso/i }), 0, "no breed was invented");
  ok("an unsupported animal returns `unsupported` and writes nothing");

  // Low confidence on a supported animal is reported as such.
  restore = stubFetch({ predictions: [{ label: "tabby", displayName: "tabby", confidence: 0.3 }] });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.status, "unsupported");
  assert.strictEqual(result.reason, service.REASON.LOW_CONFIDENCE);
  ok("a low-confidence prediction is rejected with a `low_confidence` reason");

  // =========================================================
  // 4. EXISTING BREED LOOKUP
  // =========================================================

  await Breed.create({ name: "Golden Retriever", species: "dog", source: "curated", verificationStatus: "verified" });

  restore = stubFetch({ predictions: [{ label: "golden_retriever", displayName: "golden retriever", confidence: 0.93 }] });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.status, "matched");
  assert.strictEqual(result.reason, service.REASON.MATCHED);
  assert.strictEqual(result.breed.name, "Golden Retriever");
  assert.strictEqual(result.prediction.label, "golden_retriever");
  assert.strictEqual(result.prediction.confidence, 0.93);
  assert.strictEqual(await Breed.countDocuments({ name: /golden retriever/i }), 1, "no second record");
  ok("an existing breed is matched and returned, without the AI being called");

  // Case-insensitive: "golden retriever" must resolve to the same doc.
  const found = await service.findExistingBreed({ breedName: "  GOLDEN   retriever " });
  assert.ok(found, "lookup ignores case and extra whitespace");
  assert.strictEqual(found.name, "Golden Retriever");

  // Alias-aware: a record is found by one of its aliases too.
  await Breed.create({ name: "Labrador Retriever", species: "dog", aliases: ["Lab", "Labrador"], source: "curated" });
  const byAlias = await service.findExistingBreed({ breedName: "lab" });
  assert.ok(byAlias, "lookup is alias-aware");
  assert.strictEqual(byAlias.name, "Labrador Retriever");
  ok("existing-breed lookup is case-, whitespace- and alias-insensitive");

  // =========================================================
  // 5. MISSING BREED -> AI ENRICHMENT -> CREATED
  // =========================================================

  restore = stubFetch({
    predictions: [{ label: "basset", displayName: "basset", confidence: 0.88 }],
    providerText: validProviderJson({
      name: "Basset Hound",
      species: "dog",
      lifespan: "10-12 years",
      weightRange: "20-30",
      heightRange: "33",
      temperament: ["Patient", "Low-key"],
      aliases: ["Basset"],
    }),
  });
  result = await service.analyzeBreedImage(jpeg());
  restore();

  assert.strictEqual(result.status, "created");
  assert.strictEqual(result.reason, service.REASON.CREATED);
  assert.strictEqual(result.prediction.label, "basset");

  const basset = await Breed.findOne({ name: "Basset Hound" });
  assert.ok(basset, "the enriched breed was persisted");
  assert.strictEqual(basset.species, "dog");
  assert.strictEqual(basset.imagenetLabel, "basset");
  // An AI-written record must never look human-verified.
  assert.strictEqual(basset.source, "ai");
  assert.strictEqual(basset.verificationStatus, "unverified");
  assert.strictEqual(basset.normalizedName, "basset hound");

  // Normalization actually happened on the way in.
  assert.strictEqual(basset.origin, "Scotland");
  assert.strictEqual(basset.lifespan, "10-12 years", "lifespan normalized");
  assert.strictEqual(basset.weightRange, "20-30 kg", "a bare weight range gets its unit");
  assert.strictEqual(basset.heightRange, "33 cm", "a bare height gets its unit");
  assert.deepStrictEqual(
    basset.temperament,
    ["Patient", "Low-key"],
    "temperament replaced and de-duplicated"
  );
  assert.ok(
    !basset.aliases.includes("Basset Hound"),
    "an alias equal to the name is dropped"
  );
  ok("a missing breed is enriched by the existing provider, normalized, and created as unverified");

  // The response tells the caller the record is AI-generated.
  assert.strictEqual(result.breed.source, "ai");
  assert.strictEqual(result.breed.verificationStatus, "unverified");

  // Running the same image again must NOT create a second record.
  restore = stubFetch({
    predictions: [{ label: "basset", displayName: "basset", confidence: 0.88 }],
    providerText: validProviderJson({ name: "Basset Hound", species: "dog" }),
  });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.status, "matched", "the second run matches instead of duplicating");
  assert.strictEqual(await Breed.countDocuments({ name: /basset hound/i }), 1);
  ok("re-analyzing the same breed matches the existing record (duplicate prevention)");

  // A different case/spacing for the same breed resolves to one record.
  await Breed.create({ name: "Beagle", species: "dog", source: "curated" });
  assert.ok(await service.findExistingBreed({ breedName: "beagle" }), "beagle resolves case-insensitively");

  // Case-variant duplicates are impossible through the model itself.
  let duplicateRejected = false;
  try {
    await Breed.create({ name: "beagle", species: "dog" });
  } catch (error) {
    duplicateRejected = error.code === 11000;
  }
  assert.ok(duplicateRejected, "the unique normalizedName index rejects a case variant");
  ok("case/whitespace variants cannot become independent records");

  // =========================================================
  // 6. MALFORMED AI OUTPUT IS REJECTED
  // =========================================================

  // Not JSON at all.
  restore = stubFetch({
    predictions: [{ label: "papillon", displayName: "papillon", confidence: 0.8 }],
    providerText: "I'm sorry, I can't do that.",
  });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.status, "unsupported");
  assert.strictEqual(result.reason, service.REASON.ENRICH_REJECTED);
  assert.strictEqual(await Breed.countDocuments({ name: /papillon/i }), 0, "nothing was written");

  // Valid JSON, wrong shape.
  restore = stubFetch({
    predictions: [{ label: "papillon", displayName: "papillon", confidence: 0.8 }],
    providerText: JSON.stringify(["not", "an", "object"]),
  });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.reason, service.REASON.ENRICH_REJECTED);

  // A fenced JSON block IS accepted (real models fence their output).
  restore = stubFetch({
    predictions: [{ label: "papillon", displayName: "papillon", confidence: 0.8 }],
    providerText: "```json\n" + validProviderJson({ name: "Papillon", species: "dog" }) + "\n```",
  });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.status, "created", "a fenced JSON object is understood");
  assert.ok(await Breed.findOne({ name: "Papillon" }));

  // The AI renaming the breed away from the mapping is refused.
  restore = stubFetch({
    predictions: [{ label: "pomeranian", displayName: "Pomeranian", confidence: 0.9 }],
    providerText: validProviderJson({ name: "Chihuahua", species: "dog" }),
  });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.reason, service.REASON.ENRICH_REJECTED, "a mismatched breed name is rejected");
  assert.strictEqual(await Breed.countDocuments({ name: "Chihuahua" }), 0);

  // An invented species is refused.
  restore = stubFetch({
    predictions: [{ label: "pomeranian", displayName: "Pomeranian", confidence: 0.9 }],
    providerText: validProviderJson({ name: "Pomeranian", species: "dragon" }),
  });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.reason, service.REASON.ENRICH_REJECTED);
  assert.strictEqual(await Breed.countDocuments({ name: "Pomeranian" }), 0);

  // Provider down -> reported, not crashed, nothing written.
  restore = stubFetch({
    predictions: [{ label: "pomeranian", displayName: "Pomeranian", confidence: 0.9 }],
    providerText: "__throw__",
  });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.status, "unsupported");
  assert.strictEqual(result.reason, service.REASON.ENRICH_UNAVAILABLE);
  assert.strictEqual(await Breed.countDocuments({ name: "Pomeranian" }), 0);
  ok("malformed, mismatched and unavailable AI output is rejected without writing a breed");

  // =========================================================
  // 7. SPECIES HANDLING
  // =========================================================

  // A species-level label maps to a generic record and is still
  // created unverified.
  restore = stubFetch({
    predictions: [{ label: "goldfish", displayName: "goldfish", confidence: 0.77 }],
    providerText: validProviderJson({
      name: "Goldfish",
      species: "fish",
      lifespan: "10-30 years",
      weightRange: "10-500 g",
      heightRange: "5-25 cm",
    }),
  });
  result = await service.analyzeBreedImage(png());
  restore();
  assert.strictEqual(result.status, "created");
  assert.strictEqual(result.prediction.breedSpecific, false);
  const goldfish = await Breed.findOne({ name: "Goldfish" });
  assert.strictEqual(goldfish.species, "fish", "a non-dog/cat species is created correctly");
  assert.strictEqual(goldfish.verificationStatus, "unverified", "a generic mapping stays unverified");
  ok("species beyond dog and cat are handled end to end (fish)");

  // Bird, from a species-level label too.
  restore = stubFetch({
    predictions: [{ label: "macaw", displayName: "macaw", confidence: 0.7 }],
    providerText: validProviderJson({
      name: "Macaw",
      species: "bird",
      lifespan: "30-50 years",
      weightRange: "0.9-1.5 kg",
      heightRange: "80-100 cm",
    }),
  });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.status, "created");
  assert.strictEqual((await Breed.findOne({ name: "Macaw" })).species, "bird");
  ok("a bird breed is created from a species-level ImageNet label");

  // =========================================================
  // 8. ML SERVICE UNAVAILABLE
  // =========================================================

  restore = stubFetch({ status: 503 });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.status, "unsupported");
  assert.strictEqual(result.reason, service.REASON.ML_UNAVAILABLE);
  assert.ok(result.message.includes("temporarily unavailable"));

  // Non-JSON body from the ML service.
  restore = stubFetch({ body: "definitely not json" });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.reason, service.REASON.ML_BAD_RESPONSE);

  // A JSON body with no predictions array.
  restore = stubFetch({ body: { nope: true } });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.reason, service.REASON.ML_BAD_RESPONSE);

  // Network failure (connection refused) is handled, not thrown.
  const realFetch = global.fetch;
  global.fetch = async () => { throw Object.assign(new Error("nope"), { cause: { code: "ECONNREFUSED" } }); };
  result = await service.analyzeBreedImage(jpeg());
  global.fetch = realFetch;
  assert.strictEqual(result.reason, service.REASON.ML_UNAVAILABLE);
  ok("an unavailable or broken ML service degrades cleanly instead of failing the request");

  // =========================================================
  // 9. UPLOAD VALIDATION
  // =========================================================

  await assert.rejects(
    () => service.analyzeBreedImage({ buffer: Buffer.alloc(0) }),
    /image file is required/i
  );

  // A script renamed to .jpg must not reach the ML service.
  let called = false;
  global.fetch = async () => { called = true; throw new Error("should not be called"); };
  await assert.rejects(
    () => service.analyzeBreedImage({ buffer: Buffer.from("<?php system($_GET['c']); ?>") }),
    /unsupported file type/i
  );
  global.fetch = realFetch;
  assert.strictEqual(called, false, "a non-image never leaves the backend");

  // SVG is not an accepted raster format.
  await assert.rejects(
    () => service.analyzeBreedImage({ buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') }),
    /unsupported file type/i
  );

  // Over the configured ceiling -> 400, and no request is made.
  called = false;
  global.fetch = async () => { called = true; throw new Error("should not be called"); };
  await assert.rejects(
    () => service.analyzeBreedImage(jpeg(BREED_AI_CONFIG.maxUploadBytes + 1)),
    /too large/i
  );
  global.fetch = realFetch;
  assert.strictEqual(called, false, "an oversized upload is rejected before any upstream call");
  ok("upload validation: missing, non-image, unsupported format and oversized are all rejected");

  // Sniffing accepts exactly the five documented formats.
  assert.strictEqual(service.sniffImageType(jpeg().buffer), "image/jpeg");
  assert.strictEqual(service.sniffImageType(png().buffer), "image/png");
  assert.strictEqual(service.sniffImageType(Buffer.from("RIFF0000WEBPVP8 ")), "image/webp");
  assert.strictEqual(service.sniffImageType(Buffer.from("BM6v0000000000")), "image/bmp");
  assert.strictEqual(service.sniffImageType(Buffer.from("GIF89a00000000")), "image/gif");
  assert.strictEqual(service.sniffImageType(Buffer.from("GIF87a00000000")), null, "GIF87a is not accepted");
  assert.strictEqual(service.sniffImageType(Buffer.from("%PDF-1.4 not an image")), null);
  assert.strictEqual(service.sniffImageType(Buffer.alloc(0)), null);

  // =========================================================
  // 10. NEVER TOUCHES A PET
  // =========================================================

  const bassetDoc = await Breed.findOne({ name: "Basset Hound" });
  const rex = await Pet.create({
    owner: alice._id,
    breed: bassetDoc._id,
    name: "Rex",
    species: "dog",
    gender: "male",
    age: 4,
  });
  restore = stubFetch({
    predictions: [{ label: "beagle", displayName: "beagle", confidence: 0.95 }],
    providerText: null,
  });
  result = await service.analyzeBreedImage(jpeg());
  restore();
  assert.strictEqual(result.prediction.breedName, "Beagle");
  const rexAfter = await Pet.findById(rex._id).populate("breed", "name");
  assert.strictEqual(rexAfter.breed.name, "Basset Hound", "a prediction never changes an existing pet");
  ok("analyze never modifies an existing pet's breed");

  // =========================================================
  // 11. SCHEMA VALIDATION / NORMALIZATION (unit level)
  // =========================================================

  assert.strictEqual(schema.validateBreedDraft(null).error !== null, true);
  assert.strictEqual(schema.validateBreedDraft({ name: "X" }).error !== null, true, "species is required");
  assert.strictEqual(schema.validateBreedDraft({ name: "X", species: "dragon" }).error !== null, true);
  assert.strictEqual(schema.validateBreedDraft({ name: "X", species: "dog" }).error, null);

  // Unknown keys from the model are dropped, never written.
  const cleaned = schema.normalizeBreedDraft(
    {
      name: "Beagle",
      species: "dog",
      popularity: 9999,
      _id: "deadbeef",
      isActive: false,
      source: "curated",
      verificationStatus: "verified",
      description: "  a   beagle  ",
    },
    { breedName: "Beagle", species: "dog", label: "beagle" }
  );
  assert.strictEqual(cleaned.error, null);
  assert.strictEqual(cleaned.draft.popularity, undefined, "popularity is not model-controlled");
  assert.strictEqual(cleaned.draft._id, undefined);
  assert.strictEqual(cleaned.draft.source, "ai", "the model cannot claim a breed is curated");
  assert.strictEqual(cleaned.draft.verificationStatus, "unverified", "the model cannot mark itself verified");
  assert.strictEqual(cleaned.draft.description, "a beagle", "whitespace is collapsed");
  assert.strictEqual(cleaned.draft.imagenetLabel, "beagle");

  // An unusable lifespan is dropped rather than stored as prose.
  assert.strictEqual(schema.cleanLifespan("varies a lot"), "");
  assert.strictEqual(schema.cleanLifespan("10 to 12 years"), "10-12 years");
  assert.strictEqual(schema.cleanLifespan("12 years"), "12 years");

  // List de-duplication is case-insensitive and order-preserving.
  assert.deepStrictEqual(
    schema.cleanList(["A", "a", " B ", "", 42, "C"]),
    ["A", "B", "C"]
  );

  // The JSON extractor only accepts a balanced object.
  assert.deepStrictEqual(schema.extractJsonObject('prose {"a":{"b":1}} more'), { a: { b: 1 } });
  assert.strictEqual(schema.extractJsonObject("no json here"), null);
  assert.strictEqual(schema.extractJsonObject('{"a": 1'), null, "truncated JSON is not accepted");
  ok("the enrichment schema rejects malformed drafts and normalizes everything it accepts");

  // =========================================================
  // 12. CONFIG / SSRF BOUNDARY
  // =========================================================

  assert.strictEqual(normalizeServiceUrl(""), "");
  assert.strictEqual(normalizeServiceUrl("not a url"), "");
  assert.strictEqual(normalizeServiceUrl("file:///etc/passwd"), "", "a file:// URL is refused");
  assert.strictEqual(normalizeServiceUrl("javascript:alert(1)"), "");
  assert.strictEqual(normalizeServiceUrl("http://ai:8000/"), "http://ai:8000", "a trailing slash is trimmed");
  assert.strictEqual(normalizeServiceUrl("https://ml.example.test"), "https://ml.example.test");
  // A private/loopback host is allowed on purpose (Compose `ai` service).
  assert.strictEqual(normalizeServiceUrl("http://127.0.0.1:8000"), "http://127.0.0.1:8000");

  // The status payload must not leak deployment detail.
  const status = breedAiStatus();
  assert.deepStrictEqual(Object.keys(status).sort(), [
    "enabled", "enrichEnabled", "maxUploadBytes", "minConfidence", "minConfidenceGeneric",
  ]);
  const statusJson = JSON.stringify(status);
  assert.ok(!statusJson.includes("127.0.0.1"), "no service URL in the status payload");
  assert.ok(!/sk-/i.test(statusJson), "no API key in the status payload");
  ok("config accepts only http(s) URLs and the status endpoint leaks no URL or key");

  // =========================================================
  // 13. HTTP SURFACE (auth, rate limit, status codes)
  // =========================================================

  const server = initApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = (userId) => jwt.sign({ id: userId.toString() }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const token = tokenFor(alice._id);

  const post = async (headers, body, filename = "pet.jpg") => {
    const form = new FormData();
    form.append("image", new Blob([body], { type: "image/jpeg" }), filename);
    return fetch(`${base}/api/breeds/analyze`, { method: "POST", headers, body: form });
  };

  // Unauthenticated -> 401.
  let res = await post({}, jpeg().buffer);
  assert.strictEqual(res.status, 401, "analyze requires authentication");

  // A bad token -> 401.
  res = await post({ Authorization: "Bearer not-a-real-token" }, jpeg().buffer);
  assert.strictEqual(res.status, 401, "an invalid token is rejected");

  // The status endpoint is authenticated too.
  res = await fetch(`${base}/api/breeds/ai/status`);
  assert.strictEqual(res.status, 401, "the AI status endpoint requires authentication");
  res = await fetch(`${base}/api/breeds/ai/status`, { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(res.status, 200);
  const statusBody = await res.json();
  assert.strictEqual(statusBody.success, true);
  assert.ok(!JSON.stringify(statusBody).includes("127.0.0.1"), "no service URL leaks over HTTP");

  // A non-image upload -> 400, not 500.
  res = await post({ Authorization: `Bearer ${token}` }, Buffer.from("not an image at all"), "pet.jpg");
  assert.strictEqual(res.status, 400);
  const badBody = await res.json();
  assert.strictEqual(badBody.success, false);
  assert.ok(/unsupported file type/i.test(badBody.message));

  // No file at all -> 400.
  res = await fetch(`${base}/api/breeds/analyze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(res.status, 400);

  // An oversized upload is rejected by the route's own limit.
  res = await post({ Authorization: `Bearer ${token}` }, jpeg(BREED_AI_CONFIG.maxUploadBytes + 4096).buffer);
  assert.strictEqual(res.status, 413, "the multer limit maps to 413");

  // A good upload with the ML service down -> 200 + `unsupported`,
  // because "no result" is a valid answer, not an HTTP error.
  restore = stubFetch({ status: 503 });
  res = await post({ Authorization: `Bearer ${token}` }, jpeg().buffer);
  restore();
  assert.strictEqual(res.status, 200);
  const mlDown = await res.json();
  assert.strictEqual(mlDown.status, "unsupported");
  assert.strictEqual(mlDown.reason, service.REASON.ML_UNAVAILABLE);
  assert.ok(!JSON.stringify(mlDown).includes("127.0.0.1"), "no upstream URL in the response");

  // A successful match over HTTP returns `status` + `prediction` + `breed`.
  restore = stubFetch({
    predictions: [{ label: "beagle", displayName: "beagle", confidence: 0.9 }],
    providerText: null,
  });
  res = await post({ Authorization: `Bearer ${token}` }, jpeg().buffer);
  restore();
  assert.strictEqual(res.status, 200);
  const matched = await res.json();
  assert.strictEqual(matched.status, "matched");
  assert.strictEqual(matched.breed.name, "Beagle");
  assert.strictEqual(matched.prediction.label, "beagle");

  // Rate limiting: the route is metered per IP (10/min).
  let limited = false;
  for (let i = 0; i < 15; i += 1) {
    restore = stubFetch({ predictions: [] });
    const attempt = await post({ Authorization: `Bearer ${token}` }, jpeg().buffer);
    restore();
    if (attempt.status === 429) { limited = true; break; }
  }
  assert.ok(limited, "the analyze route is rate limited");
  ok("POST /api/breeds/analyze enforces auth, upload limits, rate limiting and the response contract");

  // Admin breed management still works with the new fields.
  const admin = await User.create({ name: "Admin", email: "breed-ai-admin@test.dev", password: "Test1234!", role: "admin" });
  const adminToken = tokenFor(admin._id);
  res = await fetch(`${base}/api/breeds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: "Whippet", species: "dog", aliases: ["Sighthound"], source: "ai", verificationStatus: "verified" }),
  });
  assert.strictEqual(res.status, 201);
  const adminCreated = (await res.json()).breed;
  assert.deepStrictEqual(adminCreated.aliases, ["Sighthound"]);
  assert.strictEqual(adminCreated.verificationStatus, "verified", "an admin can promote a record to verified");

  // A non-admin cannot create breeds (unchanged behaviour).
  res = await fetch(`${base}/api/breeds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Nope", species: "dog" }),
  });
  assert.strictEqual(res.status, 403, "breed creation stays admin-only");

  // Public breed listing still works and hides deactivated breeds.
  res = await fetch(`${base}/api/breeds`);
  assert.strictEqual(res.status, 200);
  const list = await res.json();
  assert.ok(list.breeds.length > 0);
  ok("existing breed endpoints keep working, and admins manage AI provenance fields");

  await new Promise((resolve) => server.close(resolve));

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  console.log(`\n${passed} checks passed.`);
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("\nFAILED:", error && error.message);
    console.error(error && error.stack);
    try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
  });
