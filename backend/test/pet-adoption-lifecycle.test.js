// =========================================================
// Pet image persistence + adoption lifecycle — assert-based suite.
//
// Covers the two reported regressions and the full adoption flow:
//   BUG 1: an uploaded pet photo must persist (create + edit replacement)
//          and be returned by the API; no image => no stored image so the
//          frontend fallback still applies.
//   BUG 2: a newly created pet must NOT appear in the public adoption
//          gallery; the owner executes an explicit listing action; then the
//          application / approval / rejection / withdrawal lifecycle and
//          its authorization boundaries are exercised against a real DB.
//
// Uses the sanctioned isolated test URI (backend/test/db.js). Run with:
//   node test/pet-adoption-lifecycle.test.js
// =========================================================

const assert = require("assert");
const { testDbUri } = require("./db");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const DB_NAME = "animal_planet_adoption_test";
const URI = testDbUri(DB_NAME);

const IMG_A = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const IMG_B = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aFBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AH//Z";

process.env.JWT_SECRET = process.env.JWT_SECRET || "adoption-lifecycle-test-secret";

const ok = (msg) => console.log("ok - " + msg);

const tokenFor = (userId) =>
  jwt.sign({ id: userId.toString() }, process.env.JWT_SECRET, { expiresIn: "1h" });

let base;

async function api(method, path, token, body) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, data };
}

(async () => {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();

  const express = require("express");
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/pets", require("../routes/pet.routes"));
  app.use("/api/adoptions", require("../routes/adoption.routes"));
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  const User = require("../models/User");
  const Pet = require("../models/Pet");
  const Breed = require("../models/Breed");

  const breed = await Breed.create({ name: "AdoptionTestBreed", species: "dog" });
  const mk = (name, email, role = "user") =>
    User.create({ name, email, password: "testpass123", role });

  const alice = await mk("Alice", "adopt-alice@test.dev");
  const bob = await mk("Bob", "adopt-bob@test.dev");
  const carol = await mk("Carol", "adopt-carol@test.dev");
  const root = await mk("Root", "adopt-admin@test.dev", "admin");

  const aliceTok = tokenFor(alice._id);
  const bobTok = tokenFor(bob._id);
  const carolTok = tokenFor(carol._id);
  const adminTok = tokenFor(root._id);

  /* ---------------- BUG 1: PET IMAGE PERSISTENCE ---------------- */

  const withImage = await api("POST", "/api/pets", aliceTok, {
    breed: breed._id.toString(),
    name: "PhotoPet",
    species: "dog",
    gender: "male",
    age: 2,
    images: [IMG_A],
  });
  assert.strictEqual(withImage.status, 201, "create with image succeeds");
  assert.deepStrictEqual(withImage.data.pet.images, [IMG_A], "API returns the uploaded image");
  const persisted = await Pet.findById(withImage.data.pet._id).select("images");
  assert.deepStrictEqual(persisted.images, [IMG_A], "uploaded image persisted in the DB");
  ok("create pet persists the uploaded image");

  const replaced = await api("PUT", `/api/pets/${withImage.data.pet._id}`, aliceTok, {
    name: "PhotoPet",
    species: "dog",
    gender: "male",
    age: 2,
    images: [IMG_B],
  });
  assert.strictEqual(replaced.status, 200, "edit with a new image succeeds");
  assert.deepStrictEqual(replaced.data.pet.images, [IMG_B], "edit returns the replacement image");
  const persisted2 = await Pet.findById(withImage.data.pet._id).select("images");
  assert.deepStrictEqual(persisted2.images, [IMG_B], "replacement image persisted (old one gone)");
  ok("edit replaces the stored image");

  const noImage = await api("POST", "/api/pets", aliceTok, {
    breed: breed._id.toString(),
    name: "NoPhotoPet",
    species: "cat",
    gender: "female",
    age: 1,
  });
  assert.strictEqual(noImage.status, 201, "create without image succeeds");
  assert.ok(
    !noImage.data.pet.images || noImage.data.pet.images.length === 0,
    "a pet with no upload keeps an empty images array (frontend fallback)",
  );
  ok("pet without upload keeps no stored image");

  /* ---------------- BUG 2: NEW PET IS NOT LISTED ---------------- */

  assert.strictEqual(
    noImage.data.pet.status,
    "inactive",
    "a newly created pet is inactive, not available",
  );
  const galleryBefore = await api("GET", "/api/pets?status=available");
  assert.ok(
    !(galleryBefore.data.pets || []).some((p) => p._id === noImage.data.pet._id),
    "new pet does NOT appear in the adoption gallery",
  );
  ok("newly created pet is not listed for adoption");

  /* ---------------- EXPLICIT LISTING + AUTHORIZATION ---------------- */

  const crossList = await api("PUT", `/api/pets/${noImage.data.pet._id}/status`, bobTok, {
    status: "available",
  });
  assert.strictEqual(crossList.status, 403, "another user cannot list someone else's pet");

  const badStatus = await api("PUT", `/api/pets/${noImage.data.pet._id}/status`, aliceTok, {
    status: "adopted",
  });
  assert.strictEqual(badStatus.status, 400, "cannot forge 'adopted' via the listing endpoint");

  const listed = await api("PUT", `/api/pets/${noImage.data.pet._id}/status`, aliceTok, {
    status: "available",
  });
  assert.strictEqual(listed.status, 200, "owner can list their pet");
  assert.strictEqual(listed.data.pet.status, "available", "listing sets status=available");

  const galleryAfter = await api("GET", "/api/pets?status=available");
  const listedPet = (galleryAfter.data.pets || []).find((p) => p._id === noImage.data.pet._id);
  assert.ok(listedPet, "listed pet appears in the adoption gallery");
  assert.deepStrictEqual(listedPet.images, [], "listing does not invent an image (fallback applies)");
  assert.ok(
    !listedPet.owner || (!listedPet.owner.email && !listedPet.owner.phone),
    "public gallery does not expose owner PII",
  );
  ok("owner lists pet; it appears publicly without owner PII");

  /* ---------------- APPLICATION ---------------- */

  const selfApply = await api("POST", "/api/adoptions", aliceTok, {
    pet: noImage.data.pet._id,
    fullName: "Alice",
    phone: "111",
    address: "Home",
    reasonForAdoption: "I want my own pet back",
  });
  assert.strictEqual(selfApply.status, 400, "owner cannot apply for their own pet");

  const apply = await api("POST", "/api/adoptions", bobTok, {
    pet: noImage.data.pet._id,
    fullName: "Bob",
    phone: "222",
    address: "Bob's Home",
    reasonForAdoption: "Loving home",
  });
  assert.strictEqual(apply.status, 201, "a second user can apply");
  assert.strictEqual(apply.data.adoption.status, "Pending", "application starts Pending");
  const applicationId = apply.data.adoption._id;

  const myApps = await api("GET", "/api/adoptions/my", bobTok);
  assert.ok(
    (myApps.data.adoptions || []).some((a) => a._id === applicationId),
    "applicant sees their own persisted application",
  );

  const nonAdminReview = await api("PUT", `/api/adoptions/${applicationId}`, bobTok, {
    status: "Approved",
  });
  assert.strictEqual(nonAdminReview.status, 403, "applicant cannot approve their own application");
  ok("application persists; only admin can review");

  /* ---------------- WITHDRAWAL ---------------- */

  const wrongWithdraw = await api("DELETE", `/api/adoptions/my/${applicationId}`, carolTok);
  assert.strictEqual(wrongWithdraw.status, 404, "another user cannot withdraw this application");

  const withdraw = await api("DELETE", `/api/adoptions/my/${applicationId}`, bobTok);
  assert.strictEqual(withdraw.status, 200, "applicant can withdraw their pending application");

  const myAfterWithdraw = await api("GET", "/api/adoptions/my", bobTok);
  const withdrawnRecord = (myAfterWithdraw.data.adoptions || []).find((a) => a._id === applicationId);
  assert.ok(withdrawnRecord, "withdrawn application stays on the applicant's list");
  assert.strictEqual(withdrawnRecord.status, "Withdrawn", "withdrawal sets the status to Withdrawn");

  const withdrawnAgain = await api("DELETE", `/api/adoptions/my/${applicationId}`, bobTok);
  assert.strictEqual(withdrawnAgain.status, 404, "a withdrawn application cannot be withdrawn twice");

  const galleryStill = await api("GET", "/api/pets?status=available");
  assert.ok(
    (galleryStill.data.pets || []).some((p) => p._id === noImage.data.pet._id),
    "pet stays listed after the application was withdrawn",
  );

  const reApply = await api("POST", "/api/adoptions", bobTok, {
    pet: noImage.data.pet._id,
    fullName: "Bob",
    phone: "222",
    address: "Bob's Home",
    reasonForAdoption: "After withdrawing, I want to re-apply",
  });
  assert.strictEqual(reApply.status, 201, "a user can re-apply after withdrawing");
  const reApplyId = reApply.data.adoption._id;
  const reApplyWithdraw = await api("DELETE", `/api/adoptions/my/${reApplyId}`, bobTok);
  assert.strictEqual(reApplyWithdraw.status, 200, "re-applied pending request can be withdrawn again");
  ok("withdrawal becomes Withdrawn, keeps the pet available and allows re-apply");

  /* ---------------- MULTIPLE APPLICATIONS ---------------- */

  const bobApp2 = await api("POST", "/api/adoptions", bobTok, {
    pet: noImage.data.pet._id,
    fullName: "Bob",
    phone: "222",
    address: "Bob's Home",
    reasonForAdoption: "Second try",
  });
  const carolApp = await api("POST", "/api/adoptions", carolTok, {
    pet: noImage.data.pet._id,
    fullName: "Carol",
    phone: "333",
    address: "Carol's Home",
    reasonForAdoption: "Also interested",
  });
  assert.strictEqual(bobApp2.status, 201, "second applicant can apply");
  assert.strictEqual(carolApp.status, 201, "third applicant can apply");

  const duplicate = await api("POST", "/api/adoptions", carolTok, {
    pet: noImage.data.pet._id,
    fullName: "Carol",
    phone: "333",
    address: "Carol's Home",
    reasonForAdoption: "Duplicate",
  });
  assert.strictEqual(duplicate.status, 400, "duplicate pending application is rejected");
  ok("multiple applications allowed; duplicates rejected");

  /* ---------------- APPROVAL ---------------- */

  const approve = await api("PUT", `/api/adoptions/${bobApp2.data.adoption._id}`, adminTok, {
    status: "Approved",
  });
  assert.strictEqual(approve.status, 200, "admin can approve");
  assert.strictEqual(
    approve.data.adoption.acceptanceMessage,
    "Your adoption application has been approved. Please contact the pet owner for the next steps.",
    "an approval without a message stores the generic acceptance message",
  );

  const approvedRecord = await require("../models/Adoption").findById(bobApp2.data.adoption._id);
  assert.strictEqual(
    approvedRecord.acceptanceMessage,
    "Your adoption application has been approved. Please contact the pet owner for the next steps.",
    "generic acceptance message persisted in the DB",
  );
  assert.strictEqual(approvedRecord.rejectionReason || "", "", "approval carries no rejection reason");

  const adoptedPet = await Pet.findById(noImage.data.pet._id).select("status adopted");
  assert.strictEqual(adoptedPet.status, "adopted", "approved pet becomes adopted");
  assert.strictEqual(adoptedPet.adopted, true, "adopted flag set");

  const otherApp = await require("../models/Adoption").findById(carolApp.data.adoption._id);
  assert.strictEqual(otherApp.status, "Rejected", "other pending application is rejected on approval");

  const galleryAfterAdopt = await api("GET", "/api/pets?status=available");
  assert.ok(
    !(galleryAfterAdopt.data.pets || []).some((p) => p._id === noImage.data.pet._id),
    "adopted pet leaves the gallery",
  );

  const reList = await api("PUT", `/api/pets/${noImage.data.pet._id}/status`, aliceTok, {
    status: "available",
  });
  assert.strictEqual(reList.status, 400, "an adopted pet cannot be re-listed");

  const reApprove = await api("PUT", `/api/adoptions/${bobApp2.data.adoption._id}`, adminTok, {
    status: "Approved",
  });
  assert.strictEqual(reApprove.status, 400, "duplicate approval transition is rejected");
  const stillOneAdopted = await Pet.findById(noImage.data.pet._id).select("status");
  assert.strictEqual(stillOneAdopted.status, "adopted", "pet cannot be adopted twice");
  ok("approval adopts once, rejects siblings, removes the listing");

  /* ---------------- REJECTION ---------------- */

  const listed2 = await api("PUT", `/api/pets/${withImage.data.pet._id}/status`, aliceTok, {
    status: "available",
  });
  assert.strictEqual(listed2.status, 200, "owner lists a second pet");

  const carolApp2 = await api("POST", "/api/adoptions", carolTok, {
    pet: withImage.data.pet._id,
    fullName: "Carol",
    phone: "333",
    address: "Carol's Home",
    reasonForAdoption: "Please",
  });
  assert.strictEqual(carolApp2.status, 201, "application for the second pet succeeds");

  const rejectNoReason = await api("PUT", `/api/adoptions/${carolApp2.data.adoption._id}`, adminTok, {
    status: "Rejected",
  });
  assert.strictEqual(rejectNoReason.status, 400, "rejection without a reason is refused");

  const reject = await api("PUT", `/api/adoptions/${carolApp2.data.adoption._id}`, adminTok, {
    status: "Rejected",
    reason: "Another applicant was a better match for this pet.",
  });
  assert.strictEqual(reject.status, 200, "admin can reject with a reason");
  assert.strictEqual(
    reject.data.adoption.rejectionReason,
    "Another applicant was a better match for this pet.",
    "the rejection reason is returned to the caller",
  );

  const myRejected = await api("GET", "/api/adoptions/my", carolTok);
  assert.strictEqual(
    (myRejected.data.adoptions || []).find((a) => a._id === carolApp2.data.adoption._id).rejectionReason,
    "Another applicant was a better match for this pet.",
    "the applicant can read the stored rejection reason",
  );

  const rejectedPet = await Pet.findById(withImage.data.pet._id).select("status owner");
  assert.strictEqual(rejectedPet.status, "available", "rejected pet remains available");
  assert.strictEqual(
    rejectedPet.owner.toString(),
    alice._id.toString(),
    "rejection does not transfer ownership",
  );
  ok("rejection requires + stores a reason; pet stays available and ownership unchanged");

  /* ---------------- APPROVAL WITH A CUSTOM MESSAGE ---------------- */

  const dave = await mk("Dave", "adopt-dave@test.dev");
  const daveTok = tokenFor(dave._id);
  const daveApp = await api("POST", "/api/adoptions", daveTok, {
    pet: withImage.data.pet._id,
    fullName: "Dave",
    phone: "444",
    address: "Dave's Home",
    reasonForAdoption: "I would love this pet",
  });
  assert.strictEqual(daveApp.status, 201, "a new applicant can apply to the still-available pet");

  const customApprove = await api("PUT", `/api/adoptions/${daveApp.data.adoption._id}`, adminTok, {
    status: "Approved",
    message: "Welcome! Please call me to arrange picking up your new friend.",
  });
  assert.strictEqual(customApprove.status, 200, "admin can approve with a custom message");
  assert.strictEqual(
    customApprove.data.adoption.acceptanceMessage,
    "Welcome! Please call me to arrange picking up your new friend.",
    "the custom acceptance message is stored and returned",
  );
  const customPersisted = await require("../models/Adoption").findById(daveApp.data.adoption._id);
  assert.strictEqual(
    customPersisted.acceptanceMessage,
    "Welcome! Please call me to arrange picking up your new friend.",
    "custom acceptance message persisted in the DB",
  );
  ok("approval stores a custom acceptance message when one is provided");

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();

  console.log("\nAll pet-image + adoption-lifecycle checks passed.");
})().catch(async (err) => {
  console.error("FAILED:", err && err.message ? err.message : err);
  try {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});