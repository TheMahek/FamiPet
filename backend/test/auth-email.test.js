// =========================================================
// Auth email configuration + verification/reset link tests.
// Run: node test/auth-email.test.js
// Requires a reachable MongoDB (test/db.js forces a `*_test` DB).
//
// Covers the Phase 6 hardenings:
//   F-02  Unconfigured SMTP (no EMAIL_USER/EMAIL_PASS) -> honest 503 on
//         register/resend/forgot-password, no orphaned users, no fake success.
//   F-03  Emailed links target the React routes (/verify-email/<token>,
//         /reset-password/<token>) and the full verify/reset flows work.
//
// The "configured" half stubs only the nodemailer sendMail call (the same
// transporter object sendEmail uses at call time) so the routes run exactly
// as in production without a real SMTP server, and the captured mail lets
// us inspect the exact link that would have gone out.
// =========================================================

const assert = require("assert");
const { testDbUri } = require("./db");
const mongoose = require("mongoose");
const email = require("../config/email");

const DB_NAME = "animal_planet_auth_email_test";
const URI = testDbUri(DB_NAME);
process.env.JWT_SECRET = process.env.JWT_SECRET || "auth-email-test-secret";

let passed = 0;
const ok = (name) => { passed++; console.log(`ok ${passed} - ${name}`); };

const clearEmailEnv = () => {
  delete process.env.EMAIL_SERVICE;
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
};

const sentMail = [];
const realSendMail = email.transporter.sendMail;

async function initAppRouter() {
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/api/auth", require("../routes/auth.routes"));
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

(async () => {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
  const server = await initAppRouter();
  const base = `http://127.0.0.1:${server.address().port}`;
  const User = require("../models/User");

  clearEmailEnv();

  // -------------------------------------------------------
  // F-02 UNCONFIGURED: signup fails before an account is created
  // -------------------------------------------------------
  const reg = await api(base, "POST", "/api/auth/register", undefined, {
    name: "EmailTest",
    email: "emailtest@test.dev",
    password: "testpass123",
  });
  assert.strictEqual(reg.status, 503, "register returns 503 when SMTP is unconfigured");
  assert.ok(/email/i.test(reg.data.message), "503 message mentions email (frontend shows it under the email field)");
  const orphan = await User.findOne({ email: "emailtest@test.dev" });
  assert.strictEqual(orphan, null, "no orphaned unverified user is created when mail cannot be sent");
  ok("F-02: unconfigured email -> register 503, no orphan user");

  // resend verification: honest 503, existing user untouched
  const unverified = await User.create({
    name: "Unverified",
    email: "unverified@test.dev",
    password: "testpass123",
    isVerified: false,
  });
  const resend = await api(base, "POST", "/api/auth/resend-verification", undefined, {
    email: "unverified@test.dev",
  });
  assert.strictEqual(resend.status, 503, "resend returns 503 when SMTP is unconfigured");
  const afterResend = await User.findById(unverified._id);
  assert.strictEqual(afterResend.emailVerificationToken, undefined, "resend failure leaves the old token untouched");
  ok("F-02: unconfigured email -> resend 503, token untouched");

  // forgot password: honest 503 for both known and unknown accounts
  const forgotKnown = await api(base, "POST", "/api/auth/forgot-password", undefined, {
    email: "unverified@test.dev",
  });
  assert.strictEqual(forgotKnown.status, 503, "forgot-password returns 503 (no fake 'link sent')");
  const forgotUnknown = await api(base, "POST", "/api/auth/forgot-password", undefined, {
    email: "nobody@test.dev",
  });
  assert.strictEqual(forgotUnknown.status, 503, "forgot-password is 503 even for unknown emails (transport is the problem)");
  ok("F-02: unconfigured email -> forgot-password 503 either way");

  // -------------------------------------------------------
  // F-02 CONFIGURED: transport stub captures the exact mail
  // -------------------------------------------------------
  process.env.EMAIL_USER = "famipet@test.dev";
  process.env.EMAIL_PASS = "dummy-pass";
  email.transporter.sendMail = async (mail) => {
    sentMail.push(mail);
    return { messageId: "captured" };
  };

  const reg2 = await api(base, "POST", "/api/auth/register", undefined, {
    name: "Second",
    email: "second@test.dev",
    password: "testpass123",
  });
  assert.strictEqual(reg2.status, 201, "register succeeds when the transport is configured");

  const verifyMail = sentMail[sentMail.length - 1];
  const verifyUrl = /\/verify-email\/([a-f0-9]{64})/.exec(verifyMail.html);
  assert.ok(verifyUrl, "verification email carries a /verify-email/<64hex-token> link");
  assert.strictEqual(verifyMail.to, "second@test.dev", "verification mail is addressed to the new user");
  ok("F-03: register email links to /verify-email/<64hex-token>");

  // same link format for resend
  const resend2 = await api(base, "POST", "/api/auth/resend-verification", undefined, {
    email: "second@test.dev",
  });
  assert.strictEqual(resend2.status, 200, "resend succeeds when configured");
  const resendMail = sentMail[sentMail.length - 1];
  const resendUrl = /\/verify-email\/([a-f0-9]{64})/.exec(resendMail.html);
  assert.ok(resendUrl, "resend email also links to /verify-email/<token>");
  ok("F-03: resend email links to /verify-email/<64hex-token>");

  // invalid token -> intentional error state (React page shows it)
  const badVerify = await api(base, "GET", `/api/auth/verify-email/${"a".repeat(64)}`);
  assert.strictEqual(badVerify.status, 400, "invalid verification token is 400");
  ok("F-03: invalid verification token -> 400 (intentional error state)");

  // valid token -> verifies (the resend regenerated the stored token, so the
  // register one from verifyUrl is stale - use the freshest one)
  const goodVerify = await api(base, "GET", `/api/auth/verify-email/${resendUrl[1]}`);
  assert.strictEqual(goodVerify.status, 200, "valid verification token verifies the user");
  const verifiedUser = await User.findOne({ email: "second@test.dev" });
  assert.strictEqual(verifiedUser.isVerified, true, "user is verified in the database");
  ok("F-03: valid verification token verifies the user");

  // -------------------------------------------------------
  // F-03 reset-password link + flow
  // -------------------------------------------------------
  const for2 = await api(base, "POST", "/api/auth/forgot-password", undefined, {
    email: "second@test.dev",
  });
  assert.strictEqual(for2.status, 200, "forgot-password succeeds when configured");
  const resetMail = sentMail[sentMail.length - 1];
  const resetUrl = /\/reset-password\/([a-f0-9]{64})/.exec(resetMail.html);
  assert.ok(resetUrl, "reset email carries a /reset-password/<64hex-token> link");
  ok("F-03: forgot-password email links to /reset-password/<64hex-token>");

  const badReset = await api(base, "POST", `/api/auth/reset-password/${"a".repeat(64)}`, undefined, {
    password: "newpass123",
  });
  assert.strictEqual(badReset.status, 400, "invalid reset token is 400");
  ok("F-03: invalid reset token -> 400 (intentional error state)");

  const goodReset = await api(base, "POST", `/api/auth/reset-password/${resetUrl[1]}`, undefined, {
    password: "newpass123",
  });
  assert.strictEqual(goodReset.status, 200, "valid reset token resets the password");

  const loginNew = await api(base, "POST", "/api/auth/login", undefined, {
    email: "second@test.dev",
    password: "newpass123",
  });
  assert.strictEqual(loginNew.status, 200, "login works with the reset password");
  assert.ok(loginNew.data.token, "login returns a session token");
  ok("F-03: password reset completes and the new password logs in");

  // expired reset token -> 400, and the expired value is refused
  const expired = await api(base, "POST", "/api/auth/forgot-password", undefined, {
    email: "second@test.dev",
  });
  assert.strictEqual(expired.status, 200, "expiry setup: fresh reset token issued");
  const expiredResetMail = sentMail[sentMail.length - 1];
  const expiredToken = /\/reset-password\/([a-f0-9]{64})/.exec(expiredResetMail.html)[1];
  await User.updateOne(
    { email: "second@test.dev" },
    { resetPasswordExpire: Date.now() - 1000 },
  );
  const expiredReset = await api(base, "POST", `/api/auth/reset-password/${expiredToken}`, undefined, {
    password: "newpass888",
  });
  assert.strictEqual(expiredReset.status, 400, "expired reset token is 400");
  const loginOld = await api(base, "POST", "/api/auth/login", undefined, {
    email: "second@test.dev",
    password: "newpass123",
  });
  assert.strictEqual(loginOld.status, 200, "expired-token reset did NOT change the password");
  ok("F-03: expired reset token -> 400 and does not change the password");

  // cleanup
  email.transporter.sendMail = realSendMail;
  clearEmailEnv();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();

  console.log(`\n${passed} checks passed`);
  process.exit(0);
})().catch((error) => {
  console.error("\nFAIL -", error.message);
  process.exit(1);
});