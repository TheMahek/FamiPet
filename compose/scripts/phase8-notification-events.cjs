// =====================================================================
// FAMIPET — Phase 8 (Notification Event Integration) API suite
// wires the shared Phase 5 notification service + Phase 6 push into the
// feature modules and verifies, per event group, that events create the
// RIGHT notification for the RIGHT user (server-derived recipients only),
// honor preferences, and are deduplicated within their windows.
//
// Event groups under test:
//   - pet management: pet created
//   - health: health record created
//   - vaccination: added + pending->completed (transition only)
//   - appointments: booked (exists), rescheduled (date/time move only),
//                   cancelled
//   - lost & found: report created, admin status change -> reporter
//   - adoption: application submitted, applicant status, pet-owner status
//   - community: comment, like (non-self, dedup on repeat like),
//                admin hide/restore
//   - system/account: welcome, email verified, password changed,
//                     blocked/unblocked
//   - preference gating: channels.inApp=false suppresses in-app doc
//   - isolation: no cross-user leakage of recipients
//
// Run (in-container):  node /suite/phase8-notification-events.cjs
// Exit 0 => pass, 1 => fail. (Transient fixture users are purged on exit.)
// =====================================================================

const BASE = process.env.API_BASE || "http://localhost:5000/api";

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d) => d.toISOString();
const isoOfUTC = (y, mo, d, h, mi) =>
  new Date(Date.UTC(y, mo, d, h || 0, mi || 0)).toISOString();

let passed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    passed += 1;
    console.log(`  PASS ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

async function j(method, path, { body, token, expect } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }
  if (expect !== undefined && res.status !== expect) {
    failures.push(`HTTP ${expect} for ${method} ${path} (got ${res.status})`);
    console.log(`  FAIL ${method} ${path} -> ${res.status} body=${JSON.stringify(data).slice(0, 200)}`);
  }
  return { status: res.status, data };
}

const Run = `pev-${Date.now()}`;
const emails = [];
let db = null;
let mongoose = null;
const crypto = require("crypto");

async function makeUser(tag, { admin = false } = {}) {
  const email = `${Run}-${tag}@famipet.test`;
  emails.push(email);
  const reg = await j("POST", "/auth/register", {
    body: { name: `Events ${tag}`, email, password: "Password123!" },
    expect: 201,
  });
  const upd = { isVerified: true };
  if (admin) upd.role = "admin";
  await db.collection("users").updateOne({ email }, { $set: upd });
  const l = await j("POST", "/auth/login", { body: { email, password: "Password123!" }, expect: 200 });
  const token = l.data.token;
  const uid = l.data.user && (l.data.user.id || l.data.user._id);
  ok(!!token && !!uid, `token+uid for user ${tag}${admin ? " (admin)" : ""}`);
  return { email, token, uid };
}

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const countFor = async (uid, dedupKey) =>
  db.collection("notifications").countDocuments({ user: oid(uid), dedupKey });
const findFor = async (uid, dedupKey) =>
  db.collection("notifications").findOne({ user: oid(uid), dedupKey });

async function main() {
  console.log(`== Phase 8 Notification Events suite (run ${Run}) ==`);

  mongoose = require("/app/node_modules/mongoose");
  await mongoose.connect("mongodb://mongodb:27017/petDB", { serverSelectionTimeoutMS: 15000 });
  db = mongoose.connection.db;

  // ---- A. fixtures ---------------------------------------------------
  console.log("-- A fixtures --");
  const O = await makeUser("owner");                                  // pet owner + poster
  const A = await makeUser("applicant");                              // adoption applicant
  const C = await makeUser("commenter");                              // likes + comments
  const R = await makeUser("reporter");                               // lost & found
  const P = await makeUser("prefs");                                  // preference-gate user
  const S = await makeUser("sysacc");                                 // system/account events
  const AD = await makeUser("admin", { admin: true });                // admin

  const vetRes = await db.collection("veterinarians").insertOne({
    name: "Dr Events",
    email: `${Run}-vet@famipet.test`,
    phone: "01999990000",
    specialization: ["General"],
    isActive: true,
    rating: 4.5,
  });
  const vetId = String(vetRes.insertedId);
  ok(!!vetId, "active veterinarian fixture");

  const pet1res = await j("POST", "/pets", {
    token: O.token,
    body: { breed: "Beagle", name: "Bruno", species: "dog", gender: "male", age: 3 },
    expect: 201,
  });
  const pet1 = pet1res.data.pet._id;
  const pet2 = (await j("POST", "/pets", {
    token: O.token,
    body: { breed: "Persian", name: "Bella", species: "cat", gender: "female", age: 2 },
    expect: 201,
  })).data.pet._id;
  await db.collection("pets").updateOne({ _id: oid(pet2) }, { $set: { status: "available", adopted: false } });
  ok(!!pet1 && !!pet2, "owner pets created");

  // ---- B. pet management --------------------------------------------
  console.log("-- B pet created --");
  let count = await countFor(O.uid, `pet-created-${pet1}`);
  ok(count === 1, `pet-created notification for owner (got ${count})`);
  let n = await findFor(O.uid, `pet-created-${pet1}`);
  ok(n && n.type === "pet" && n.category === "pet", "pet-created has type/category pet");
  ok(n && n.referenceType === "pet" && String(n.referenceId) === String(pet1), "pet-created deep-links reference pet");
  ok(n && n.metadata && n.metadata.petName === "Bruno", "pet-created carries pet metadata");

  // isolation: applicant must see none of the owner's pet events
  count = await countFor(A.uid, `pet-created-${pet1}`);
  ok(count === 0, "pet-created NOT leaked to other users");

  // ---- C. health -----------------------------------------------------
  console.log("-- C health record created --");
  const recRes = await j("POST", "/health", {
    token: O.token,
    body: { pet: pet1, diagnosis: "Skin allergy", treatment: "Antihistamines" },
    expect: 201,
  });
  const rec = recRes.data.record._id;
  count = await countFor(O.uid, `health-record-created-${rec}`);
  ok(count === 1, `health-record-created for owner (got ${count})`);
  n = await findFor(O.uid, `health-record-created-${rec}`);
  ok(n && n.type === "health" && n.category === "health", "health-created type/category health");
  ok(n && n.referenceType === "pet" && String(n.referenceId) === String(pet1), "health-created references the pet");
  ok(n && n.metadata && n.metadata.petName === "Bruno", "health-created carries pet metadata");

  // ---- D. vaccination -------------------------------------------------
  console.log("-- D vaccination added + completed (transition) --");
  const vacRes = await j("POST", "/vaccinations", {
    token: O.token,
    body: {
      pet: pet1,
      vaccineName: "Rabies",
      vaccinationDate: iso(new Date(Date.now() - 30 * DAY_MS)),
      nextDueDate: iso(new Date(Date.now() + 330 * DAY_MS)),
    },
    expect: 201,
  });
  const vac = vacRes.data.vaccination._id;
  count = await countFor(O.uid, `vaccination-created-${vac}`);
  ok(count === 1, `vaccination-created for owner (got ${count})`);
  n = await findFor(O.uid, `vaccination-created-${vac}`);
  ok(n && n.type === "vaccination" && n.referenceType === "pet", "vaccination-created type + deep-link");

  let up = await j("PUT", `/vaccinations/${vac}`, { token: O.token, body: { status: "Completed" }, expect: 200 });
  ok(up.data.success === true, "vaccination marked Completed");
  count = await countFor(O.uid, `vaccination-status-${vac}-completed`);
  ok(count === 1, `vaccination-completed fires on Pending->Completed (got ${count})`);

  up = await j("PUT", `/vaccinations/${vac}`, { token: O.token, body: { status: "Completed" }, expect: 200 });
  ok(up.data.success === true, "vaccination re-saved as Completed");
  count = await countFor(O.uid, `vaccination-status-${vac}-completed`);
  ok(count === 1, "vaccination-completed does NOT re-fire on Completed->Completed");

  // ---- E. appointments ------------------------------------------------
  console.log("-- E appointment booked / rescheduled / cancelled --");
  const apptRes = await j("POST", "/appointments", {
    token: O.token,
    body: {
      pet: pet1,
      veterinarian: vetId,
      date: isoOfUTC(2027, 1, 20, 9, 0),
      time: "10:00",
      type: "checkup",
      symptoms: "Limping",
    },
    expect: 201,
  });
  const appt = apptRes.data.appointment._id;
  count = await countFor(O.uid, `appointment-booked-${appt}`);
  ok(count === 1, "appointment-booked (existing Phase 5 event) still fires");
  ok((await countFor(A.uid, `appointment-booked-${appt}`)) === 0, "appointment events NOT leaked to others");

  // symptom/notes only edit -> no reschedule notification
  await j("PUT", `/appointments/${appt}`, { token: O.token, body: { symptoms: "Limping worse", notes: "" }, expect: 200 });
  count = await countFor(O.uid, `appointment-rescheduled-${appt}`);
  ok(count === 0, "symptom/notes edit does NOT create rescheduled notification");

  // real date move -> rescheduled
  await j("PUT", `/appointments/${appt}`, { token: O.token, body: { date: isoOfUTC(2027, 1, 22, 9, 0) }, expect: 200 });
  count = await countFor(O.uid, `appointment-rescheduled-${appt}`);
  ok(count === 1, "date move creates appointment-rescheduled notification");

  // cancel (soft delete)
  await j("DELETE", `/appointments/${appt}`, { token: O.token, expect: 200 });
  count = await countFor(O.uid, `appointment-cancelled-${appt}`);
  ok(count === 1, "cancel creates appointment-cancelled notification");

  // ---- F. lost & found ------------------------------------------------
  console.log("-- F lost & found --");
  const lfRes = await j("POST", "/lost-found", {
    token: R.token,
    body: {
      type: "lost",
      petName: "Max",
      species: "dog",
      breed: "",
      description: "Brown dog, lost near the park.",
      location: "Central Park",
      date: iso(new Date(Date.now() - 2 * DAY_MS)),
      contactName: "Reporter",
      contactPhone: "01999990001",
    },
    expect: 201,
  });
  const lfId = lfRes.data.report._id;
  count = await countFor(R.uid, `lostfound-created-${lfId}`);
  ok(count === 1, `lostfound-created for reporter (got ${count})`);
  n = await findFor(R.uid, `lostfound-created-${lfId}`);
  ok(n && n.type === "lost_found" && n.category === "lost_found", "lost_found-created type/category");
  ok(n && n.referenceType === "lost_found" && String(n.referenceId) === String(lfId), "lost_found-created reference");

  await j("PUT", `/admin/lost-found/${lfId}/status`, { token: AD.token, body: { status: "resolved" }, expect: 200 });
  count = await countFor(R.uid, `lostfound-status-${lfId}-resolved`);
  ok(count === 1, `admin resolve notifies reporter (got ${count})`);
  n = await findFor(R.uid, `lostfound-status-${lfId}-resolved`);
  ok(n && n.priority === "high", "resolve notification priority high");

  // ---- G. adoption ------------------------------------------------------
  console.log("-- G adoption submitted + status (applicant & pet-owner) --");
  const adoRes = await j("POST", "/adoptions", {
    token: A.token,
    body: {
      pet: pet2,
      fullName: "Applicant",
      phone: "01999990002",
      address: "12 Pet Street",
      reasonForAdoption: "I love cats and have a big home.",
    },
    expect: 201,
  });
  const adoId = adoRes.data.adoption._id;
  count = await countFor(A.uid, `adoption-created-${adoId}`);
  ok(count === 1, `adoption-submitted notifies applicant (got ${count})`);

  await j("PUT", `/adoptions/${adoId}`, { token: AD.token, body: { status: "Approved" }, expect: 200 });
  count = await countFor(A.uid, `adoption-status-${adoId}-approved`);
  ok(count === 1, "status change notifies applicant");
  count = await countFor(O.uid, `adoption-owner-status-${adoId}-approved`);
  ok(count === 1, "status change notifies the pet OWNER too");
  n = await findFor(O.uid, `adoption-owner-status-${adoId}-approved`);
  ok(n && n.metadata && n.metadata.petName === "Bella", "owner notification names the pet");

  // ---- H. community -----------------------------------------------------
  console.log("-- H community comment / like / moderation --");
  const postRes = await j("POST", "/community", {
    token: O.token,
    body: { title: "Bruno's day", content: "He played fetch all afternoon." },
    expect: 201,
  });
  const postId = postRes.data.post ? postRes.data.post._id : postRes.data._id;
  ok(!!postId, "owner community post created");

  // comment by C -> O notified; self-comment by O -> silent
  const cmRes = await j("POST", `/community/${postId}/comments`, {
    token: C.token,
    body: { text: "What a good boy!" },
    expect: 200,
  });
  const commentId =
    (cmRes.data.post && cmRes.data.post.comments && cmRes.data.post.comments.length
      ? cmRes.data.post.comments[cmRes.data.post.comments.length - 1]._id
      : null);
  ok(!!commentId, "comment id captured");
  count = await countFor(O.uid, `community-comment-${postId}-${commentId}`);
  ok(count === 1, "comment notifies the post author");

  await j("POST", `/community/${postId}/comments`, { token: O.token, body: { text: "Thanks everyone!" }, expect: 200 });
  // every community notification so far for the author is C's comment only
  const selfNotes = await db.collection("notifications").find({ user: oid(O.uid), type: "community" }).toArray();
  ok(selfNotes.length === 1 && selfNotes[0].dedupKey === `community-comment-${postId}-${commentId}`, "self-comment silent; only C's comment notified the author");

  // like by C -> O notified; C repeat-like (unlike, like) deduped
  await j("POST", `/community/${postId}/like`, { token: C.token, expect: 200 });
  count = await countFor(O.uid, `community-like-${postId}-${C.uid}`);
  ok(count === 1, "like notifies the post author");
  await j("POST", `/community/${postId}/like`, { token: C.token, expect: 200 }); // unlike
  await j("POST", `/community/${postId}/like`, { token: C.token, expect: 200 }); // like again
  count = await countFor(O.uid, `community-like-${postId}-${C.uid}`);
  ok(count === 1, "repeat like within dedup window does NOT duplicate notification");

  // own like by author -> silent
  await j("POST", `/community/${postId}/like`, { token: O.token, expect: 200 });
  count = await countFor(O.uid, `community-like-${postId}-${O.uid}`);
  ok(count === 0, "self-like does NOT notify author");

  // admin hides the post -> author notified
  await j("PUT", `/admin/community/${postId}/status`, { token: AD.token, body: { isActive: false }, expect: 200 });
  count = await countFor(O.uid, `community-post-status-${postId}-false`);
  ok(count === 1, "admin hide notifies the post author");
  await j("PUT", `/admin/community/${postId}/status`, { token: AD.token, body: { isActive: true }, expect: 200 });
  count = await countFor(O.uid, `community-post-status-${postId}-true`);
  ok(count === 1, "admin restore notifies the post author");

  // isolation: liker never receives the author's like/comment notifications
  ok((await countFor(C.uid, `community-like-${postId}-${C.uid}`)) === 0, "like recipient is the author, not the liker");

  // ---- I. system / account ----------------------------------------------
  console.log("-- I system / account events --");
  const sUid = S.uid;
  count = await countFor(sUid, `user-welcome-${sUid}`);
  ok(count === 1, "register creates welcome notification");

  const sdoc = await db.collection("users").findOne({ email: S.email });
  // The container's email provider is at daily quota, so register's quota path
  // clears the token. Inject a fresh single-use token so the controller flow
  // (tokens are hashed+salted in storage) runs end-to-end.
  const rawToken = `pev-token-${Run}`;
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  // Reset S to unverified: verifyEmail short-circuits when isVerified is
  // already true, which would skip the controller's notification hook.
  await db.collection("users").updateOne(
    { email: S.email },
    {
      $set: {
        isVerified: false,
        emailVerificationToken: hashedToken,
        emailVerificationExpire: new Date(Date.now() + 3600 * 1000),
      },
    }
  );
  ok(true, "verification token injected for user");
  const vres = await j("GET", `/auth/verify-email/${rawToken}`, { expect: 200 });
  ok(vres.data.success === true, "verify-email succeeds");
  count = await countFor(sUid, `user-verified-${sUid}`);
  ok(count === 1, "verify-email creates Email Verified notification");

  await j("PUT", "/auth/change-password", {
    token: S.token,
    body: { currentPassword: "Password123!", newPassword: "Password123!" },
    expect: 200,
  });
  count = await countFor(sUid, `password-changed-${sUid}`);
  ok(count === 1, "change-password creates Password Changed notification");

  await j("PUT", `/admin/users/${sUid}/block`, { token: AD.token, body: {}, expect: 200 });
  count = await countFor(sUid, `user-block-${sUid}-true`);
  ok(count === 1, "admin block notifies the affected user");
  n = await findFor(sUid, `user-block-${sUid}-true`);
  ok(n && n.priority === "urgent" && n.type === "system", "block notification urgent system type");

  await j("PUT", `/admin/users/${sUid}/block`, { token: AD.token, body: {}, expect: 200 });
  count = await countFor(sUid, `user-block-${sUid}-false`);
  ok(count === 1, "admin unblock notifies the affected user");
  n = await findFor(sUid, `user-block-${sUid}-false`);
  ok(n && n.priority === "normal", "unblock notification normal priority");

  // ---- J. preference gating ---------------------------------------------
  console.log("-- J preferences gate --");
  const pres = await j("POST", "/pets", {
    token: P.token,
    body: { breed: "Labrador", name: "Luna", species: "dog", gender: "female", age: 1 },
    expect: 201,
  });
  const pPet = pres.data.pet._id;
  ok((await countFor(P.uid, `pet-created-${pPet}`)) === 1, "prefs user receives pet event by default");

  const pPostRes = await j("POST", "/community", {
    token: P.token,
    body: { title: "Luna's first walk", content: "She loved the park!." },
    expect: 201,
  });
  const pPostId = pPostRes.data.post ? pPostRes.data.post._id : pPostRes.data._id;

  const c1res = await j("POST", `/community/${pPostId}/comments`, { token: C.token, body: { text: "Adorable!" }, expect: 200 });
  const c1id = c1res.data.post.comments[c1res.data.post.comments.length - 1]._id;
  const prefsNotesBefore = await db.collection("notifications").countDocuments({ user: oid(P.uid) });
  ok((await countFor(P.uid, `community-comment-${pPostId}-${c1id}`)) === 1, "comment to prefs user notifies by default");

  await j("PUT", "/notifications/preferences", { token: P.token, body: { channels: { inApp: false } }, expect: 200 });

  const c2res = await j("POST", `/community/${pPostId}/comments`, { token: C.token, body: { text: "So sweet!" }, expect: 200 });
  const c2id = c2res.data.post.comments[c2res.data.post.comments.length - 1]._id;
  const prefsNotesAfter = await db.collection("notifications").countDocuments({ user: oid(P.uid) });
  ok((await countFor(P.uid, `community-comment-${pPostId}-${c2id}`)) === 0, "inApp=false suppresses in-app notification");
  ok(prefsNotesAfter === prefsNotesBefore, "no notification doc created while inApp disabled (total unchanged)");

  await j("PUT", "/notifications/preferences", { token: P.token, body: { channels: { inApp: true } }, expect: 200 });
  const c3res = await j("POST", `/community/${pPostId}/comments`, { token: C.token, body: { text: "Ten out of ten." }, expect: 200 });
  const c3id = c3res.data.post.comments[c3res.data.post.comments.length - 1]._id;
  ok((await countFor(P.uid, `community-comment-${pPostId}-${c3id}`)) === 1, "re-enabling inApp restores notifications");

  // per-type toggle (community only) also gates
  await j("PUT", "/notifications/preferences", { token: P.token, body: { types: { community: false } }, expect: 200 });
  const c4res = await j("POST", `/community/${pPostId}/comments`, { token: C.token, body: { text: "Four times' a charm." }, expect: 200 });
  const c4id = c4res.data.post.comments[c4res.data.post.comments.length - 1]._id;
  ok((await countFor(P.uid, `community-comment-${pPostId}-${c4id}`)) === 0, "types.community=false suppresses community notifications");

  // ---- cleanup test users -------------------------------------------------
  const uids = [O, A, C, R, P, S, AD].map((u) => u.uid).filter(Boolean);
  try {
    const collections = [
      "notifications",
      "reminders",
      "appointments",
      "adoptions",
      "lostfounds",
      "communityposts",
    ];
    for (const col of collections) {
      await db.collection(col).deleteMany({ user: { $in: uids.map(oid) } });
    }
    await db.collection("pets").deleteMany({ owner: { $in: uids.map(oid) } });
    await db.collection("veterinarians").deleteMany({ email: { $regex: `^${Run}-vet@` } });
    const res = await db.collection("users").deleteMany({ email: { $in: emails } });
    console.log(`cleanup removed ${res.deletedCount} fixture user(s)`);
    await mongoose.disconnect();
  } catch (e) {
    console.log(`cleanup skipped: ${e.message}`);
  }

  console.log(`== RESULT: ${passed} passed, ${failures.length} failed ==`);
  if (failures.length) {
    console.log("failed: " + failures.join(" | "));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});