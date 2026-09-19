const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendEmail } = require("../config/email");
const { isSafeImageValue } = require("../utils/imageUpload");

// Email verification tokens are valid for 24 hours.
const VERIFY_TOKEN_TTL_MS =
  24 * 60 * 60 * 1000;

// Minimum time a user must wait before requesting another
// verification email. Prevents repeated sends that exhaust
// the provider's daily quota and break older emailed links.
const RESEND_COOLDOWN_MS =
  60 * 1000;

// =====================================================
// FRONTEND BASE URL
// =====================================================
// The base URL used to build emailed verification links comes ONLY from the
// environment configuration (FRONTEND_URL > CLIENT_URL), never from request
// headers or a hard-coded host.
//
//   - Development: FRONTEND_URL may be http://localhost:<port> or a LAN URL.
//   - Production:   FRONTEND_URL MUST be the deployed public HTTPS frontend
//     URL. Any localhost / 127.x / LAN (192.168.x, 10.x, 172.16-31.x,
//     .local, .internal) value is rejected so a verification link can never
//     point at a machine-local address. This keeps the link valid from ANY
//     device/network.
const net = require("net");
const isPublicUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return false;
    const ip = net.isIP(host);
    if (ip === 4) {
      const p = host.split(".").map(Number);
      if (p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] === 169) return false;
      if (p[0] === 192 && p[1] === 168) return false;
      if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
    }
    if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return false;
    return true;
  } catch (e) {
    return false;
  }
};

const getClientBase = () => {
  const envBase = (process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5502").trim();
  if (process.env.NODE_ENV === "production") {
    if (!isPublicUrl(envBase)) {
      console.error(
        "Email verification misconfigured: FRONTEND_URL must be a public " +
          "HTTPS URL in production but is " + JSON.stringify(envBase) + ". " +
          "Set FRONTEND_URL to the deployed public FamiPet frontend " +
          "(e.g. https://your-frontend.domain)."
      );
      throw new Error(
        "Server email configuration error. Please contact support."
      );
    }
  }
  return envBase.replace(/\/+$/, "");
};

const buildVerificationUrl = (plainToken) =>
  `${getClientBase()}/pages/verify-email.html?token=${plainToken}`;

// =====================================================
// GENERATE JWT TOKEN
// =====================================================

const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return jwt.sign(
    {
      id: id.toString(),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || "30d",
    }
  );
};

// =====================================================
// PUBLIC USER DATA
// =====================================================

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  phone: user.phone,
  address: user.address,
  city: user.city,
  isVerified: user.isVerified,
  isBlocked: user.isBlocked,
});

// Internal error messages (DB details, stack hints) must never reach clients
// in production. Development keeps the useful detail for debugging.
const safeErrorMessage = (error) =>
  process.env.NODE_ENV === "production"
    ? "Internal server error"
    : error.message;

// =====================================================
// REGISTER
// =====================================================

exports.register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      role,
    } = req.body;

    // -------------------------------------------------
    // ROLE VALIDATION
    // Owners and shelters pick a role at signup.
    // Anything else (e.g. "admin") is rejected so the
    // role can never be escalated through register.
    // -------------------------------------------------

    const allowedRoles = [
      "owner",
      "shelter",
    ];

    let selectedRole = "user";

    if (
      role !== undefined &&
      role !== null &&
      role !== ""
    ) {

      const trimmedRole =
        String(role).trim()
          .toLowerCase();

      if (
        !allowedRoles.includes(
          trimmedRole
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid role selected.",
        });
      }

      selectedRole = trimmedRole;

    }

    // -------------------------------------------------
    // VALIDATION
    // -------------------------------------------------

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Name, email and password are required.",
      });
    }

    if (typeof name !== "string" || name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid name.",
      });
    }

    if (typeof email !== "string" || email.trim().length > 254) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters.",
      });
    }

    if (typeof password !== "string" || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Invalid password.",
      });
    }

    // -------------------------------------------------
    // NORMALIZE EMAIL
    // -------------------------------------------------

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    // -------------------------------------------------
    // EMAIL FORMAT VALIDATION
    // Prevents malformed addresses like
    // "example@gmail.com@gmail.com" or "not-an-email".
    // -------------------------------------------------

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid email address.",
      });
    }

    // -------------------------------------------------
    // VALIDATE VERIFICATION LINK CONFIG (fail fast)
    // In production this throws if FRONTEND_URL is not a
    // public HTTPS URL, so a broken localhost/LAN link is
    // never generated and no user is created un-mailable.
    // -------------------------------------------------

    try {
      getClientBase();
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }

    // -------------------------------------------------
    // CHECK EXISTING USER
    // -------------------------------------------------

    const exists = await User.findOne({
      email: normalizedEmail,
    });

    if (exists) {
      return res.status(400).json({
        success: false,
        message:
          "User already exists with this email.",
      });
    }

    // -------------------------------------------------
    // GENERATE EMAIL VERIFICATION TOKEN
    // -------------------------------------------------

    const verificationToken = crypto
      .randomBytes(32)
      .toString("hex");

    const hashedVerificationToken = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    // -------------------------------------------------
    // CREATE USER
    // Users start unverified: they receive a verification
    // link by email and clicking it activates the account.
    // -------------------------------------------------

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      phone: phone || "",
      role: selectedRole,

      isVerified: false,

      emailVerificationToken:
        hashedVerificationToken,

      // Token valid for 24 hours
      emailVerificationExpire:
        Date.now() + VERIFY_TOKEN_TTL_MS,
    });

    // -------------------------------------------------
    // FRONTEND VERIFICATION URL
    // -------------------------------------------------

    const verificationUrl =
      buildVerificationUrl(verificationToken);

    if (process.env.NODE_ENV !== "production" || process.env.EMAIL_TRANSPORT === "json") {
      console.log("📧 Verification URL:", verificationUrl);
    }

    // -------------------------------------------------
    // VERIFICATION EMAIL HTML
    // -------------------------------------------------

    const html = `
      <!DOCTYPE html>
      <html>

      <head>
        <meta charset="UTF-8">
        <title>Verify Email - FamiPet</title>
      </head>

      <body style="
        margin:0;
        padding:0;
        background:#f4f7fb;
        font-family:Arial,sans-serif;
      ">

        <div style="
          max-width:600px;
          margin:40px auto;
          background:white;
          border-radius:12px;
          padding:30px;
          box-shadow:0 4px 15px rgba(0,0,0,0.08);
        ">

          <h1 style="
            color:#2563eb;
            margin-bottom:20px;
          ">
            🐾 FamiPet
          </h1>

          <h2>
            Verify Your Email
          </h2>

          <p>
            Hello ${user.name || "User"},
          </p>

          <p>
            Thank you for creating an account
            with FamiPet.
          </p>

          <p>
            Please verify your email address
            to activate your account.
          </p>

          <div style="
            text-align:center;
            margin:30px 0;
          ">

            <a
              href="${verificationUrl}"
              style="
                display:inline-block;
                background:#2563eb;
                color:white;
                padding:14px 25px;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
              "
            >
              Verify Email
            </a>

          </div>

          <p>
            This verification link will expire
            in <strong>24 hours</strong>.
          </p>

          <p>
            If you did not create this account,
            you can safely ignore this email.
          </p>

          <hr>

          <p style="
            color:#777;
            font-size:13px;
          ">
            FamiPet<br>
            Pet Care & Adoption Platform
          </p>

        </div>

      </body>
      </html>
    `;

    // -------------------------------------------------
    // SEND EMAIL
    // -------------------------------------------------

    console.log("=================================");
    console.log("📧 SENDING VERIFICATION EMAIL");
    console.log("Email:", user.email);
    console.log("=================================");

    const sent = await sendEmail(
      user.email,
      "FamiPet - Verify Your Email",
      html
    );

    // -------------------------------------------------
    // EMAIL FAILED
    // -------------------------------------------------
    // If the provider is rate-limited or out of quota we
    // keep the account (so it is never left unverifiable)
    // and let the user request a fresh link from the login
    // page instead of silently deleting a successful signup.

    if (!sent.ok) {
      console.log(
        "⚠️ Verification email could not be sent for:",
        user.email,
        sent.reason === "quota"
          ? "(email provider daily sending limit)"
          : "(send error)"
      );

      // Nothing was delivered, so forget the unsent token.
      // This way "resend" from the login page skips the
      // cooldown instead of misleading the user into
      // thinking an email was already sent.
      user.emailVerificationToken = undefined;
      user.emailVerificationExpire = undefined;

      await user.save();

      if (sent.reason === "quota") {
        return res.status(201).json({
          success: true,
          message:
            "Registration successful, but the verification email cannot be sent right now because the email service has reached its daily sending limit. Please request a new verification email from the login page later.",
          user: publicUser(user),
        });
      }

      return res.status(201).json({
        success: true,
        message:
          "Registration successful. We could not send a verification email right now. Please request a new verification email from the login page.",
        user: publicUser(user),
      });
    }

    // -------------------------------------------------
    // SUCCESS
    // -------------------------------------------------

    console.log(
      "✅ Verification email sent to:",
      user.email
    );

    return res.status(201).json({
      success: true,
      message:
        "Registration successful. Please check your email to verify your account.",
      user: publicUser(user),
    });

  } catch (error) {
    console.error(
      "❌ Register Error:",
      error
    );

    return res.status(
      error.code === 11000 ? 400 : 500
    ).json({
      success: false,
      message:
        error.code === 11000
          ? "Email already registered."
          : safeErrorMessage(error),
    });
  }
};

// =====================================================
// VERIFY EMAIL
// =====================================================

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message:
          "Verification token is required.",
      });
    }

    // -------------------------------------------------
    // HASH TOKEN
    // -------------------------------------------------

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // -------------------------------------------------
    // FIND USER
    // -------------------------------------------------
    // Look up by the token itself (ignoring expiry) so a
    // repeated click or an email client's link prefetch that
    // already completed verification is recognised instead of
    // being reported as a misleading "Verification failed".

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          "Verification link is invalid.",
      });
    }

    // Already verified → idempotent success, never an error.
    if (user.isVerified) {
      return res.status(200).json({
        success: true,
        message:
          "Email already verified. You can now login.",
        user: publicUser(user),
      });
    }

    // -------------------------------------------------
    // CHECK EXPIRY
    // -------------------------------------------------

    if (
      !user.emailVerificationExpire ||
      user.emailVerificationExpire < Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Verification link has expired. Please request a new verification email.",
      });
    }

    // -------------------------------------------------
    // VERIFY USER
    // -------------------------------------------------
    // The token is single-use: it is consumed here so the same
    // link can never be accepted again.

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;

    await user.save();

    console.log(
      "================================="
    );

    console.log(
      "✅ EMAIL VERIFIED"
    );

    console.log(
      "Email:",
      user.email
    );

    console.log(
      "================================="
    );

    return res.status(200).json({
      success: true,
      message:
        "Email verified successfully. You can now login.",
      user: publicUser(user),
    });

  } catch (error) {
    console.error(
      "❌ Verify Email Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: safeErrorMessage(error),
    });
  }
};

// =====================================================
// RESEND VERIFICATION EMAIL
// =====================================================

exports.resendVerification = async (
  req,
  res
) => {
  try {
    const email =
      req.body.email
        ?.trim()
        .toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const user = await User.findOne({
      email,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User not found.",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message:
          "Email is already verified.",
      });
    }

    // -------------------------------------------------
    // VALIDATE VERIFICATION LINK CONFIG (fail fast)
    // Refuse to regenerate tokens / send emails when the
    // production FRONTEND_URL is missing or not a public
    // HTTPS URL, so users never receive a broken link.
    // -------------------------------------------------

    try {
      getClientBase();
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }

    // -------------------------------------------------
    // RESEND COOLDOWN
    // -------------------------------------------------
    // Sending a fresh token invalidates previously emailed
    // links, so throttle repeat requests. The token's creation
    // time is inferred from its expiry (min token is 24h).
    // This keeps spam clicks from exhausting the provider's
    // daily sending limit and from breaking older links.

    const tokenCreatedAt =
      user.emailVerificationToken &&
      user.emailVerificationExpire
        ? user.emailVerificationExpire -
          VERIFY_TOKEN_TTL_MS
        : 0;

    if (
      tokenCreatedAt &&
      Date.now() - tokenCreatedAt <
        RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Please wait before requesting another verification email.",
      });
    }

    // -------------------------------------------------
    // GENERATE NEW TOKEN
    // -------------------------------------------------

    const verificationToken =
      crypto
        .randomBytes(32)
        .toString("hex");

    user.emailVerificationToken =
      crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex");

    user.emailVerificationExpire =
      Date.now() + VERIFY_TOKEN_TTL_MS;

    await user.save();

    // -------------------------------------------------
    // VERIFICATION URL
    // -------------------------------------------------

    const verificationUrl =
      buildVerificationUrl(verificationToken);

    if (process.env.NODE_ENV !== "production" || process.env.EMAIL_TRANSPORT === "json") {
      console.log("📧 Verification URL:", verificationUrl);
    }

    // -------------------------------------------------
    // EMAIL
    // -------------------------------------------------

    const html = `
      <!DOCTYPE html>
      <html>

      <body style="
        font-family:Arial,sans-serif;
        background:#f4f7fb;
        padding:30px;
      ">

        <div style="
          max-width:600px;
          margin:auto;
          background:white;
          padding:30px;
          border-radius:12px;
        ">

          <h1 style="color:#2563eb;">
            🐾 FamiPet
          </h1>

          <h2>
            Verify Your Email
          </h2>

          <p>
            Hello ${user.name || "User"},
          </p>

          <p>
            Here is your new email verification link.
          </p>

          <div style="
            text-align:center;
            margin:30px 0;
          ">

            <a
              href="${verificationUrl}"
              style="
                background:#2563eb;
                color:white;
                padding:14px 25px;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
              "
            >
              Verify Email
            </a>

          </div>

          <p>
            This link will expire in
            <strong>24 hours</strong>.
          </p>

        </div>

      </body>
      </html>
    `;

    const sent = await sendEmail(
      user.email,
      "FamiPet - Verify Your Email",
      html
    );

    if (!sent.ok) {
      if (sent.reason === "quota") {
        // Keep the generated token so the existing cooldown (60s) blocks
        // repeated clicks, avoiding hammering the already-limited provider.
        return res.status(503).json({
          success: false,
          code: "EMAIL_QUOTA_EXCEEDED",
          message:
            "Verification email cannot be sent right now. The email service has reached its daily sending limit. Please try again later.",
        });
      }

      // Non-quota failure: clear the token so the user can retry immediately
      // (no cooldown for a genuine delivery/SMTP error that is not a quota hit).
      user.emailVerificationToken = undefined;
      user.emailVerificationExpire = undefined;

      await user.save();

      return res.status(500).json({
        success: false,
        message: "Unable to send verification email.",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Verification email sent successfully.",
    });

  } catch (error) {
    console.error(
      "❌ Resend Verification Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: safeErrorMessage(error),
    });
  }
};

// =====================================================
// LOGIN
// =====================================================

exports.login = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password are required.",
      });
    }

    if (typeof email !== "string" || email.trim().length > 254) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address.",
      });
    }

    if (typeof password !== "string" || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Invalid password.",
      });
    }

    // -------------------------------------------------
    // NORMALIZE EMAIL
    // -------------------------------------------------

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    // -------------------------------------------------
    // FIND USER
    // -------------------------------------------------

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    // -------------------------------------------------
    // CHECK PASSWORD
    // -------------------------------------------------

    if (
      !user ||
      !(await user.comparePassword(password))
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password.",
      });
    }

    // -------------------------------------------------
    // CHECK BLOCKED
    // -------------------------------------------------

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message:
          "Your account has been blocked.",
      });
    }

    // -------------------------------------------------
    // CHECK EMAIL VERIFICATION
    // -------------------------------------------------

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your email before logging in.",
        isVerified: false,
      });
    }

    // -------------------------------------------------
    // LOGIN SUCCESS
    // -------------------------------------------------

    return res.status(200).json({
      success: true,
      message:
        "Login successful.",

      token: generateToken(user._id),

      user: publicUser(user),
    });

  } catch (error) {
    console.error(
      "❌ Login Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: safeErrorMessage(error),
    });
  }
};

// =====================================================
// GET CURRENT USER
// =====================================================

exports.getMe = async (req, res) => {
  try {
    const user =
      await User.findById(req.user._id)
        .select(
          "-password -resetPasswordToken -resetPasswordExpire -emailVerificationToken -emailVerificationExpire"
        )
        .populate("pets")
        .populate("favorites");

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });

  } catch (error) {
    console.error(
      "❌ GetMe Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: safeErrorMessage(error),
    });
  }
};

// =====================================================
// UPDATE PROFILE
// =====================================================

exports.updateProfile = async (
  req,
  res
) => {
  try {
    const allowed = [
      "name",
      "phone",
      "address",
      "city",
      "avatar",
    ];

    const updates = {};

    allowed.forEach((key) => {
      if (
        req.body[key] !== undefined
      ) {
        updates[key] =
          req.body[key];
      }
    });

    if (updates.name !== undefined && (typeof updates.name !== "string" || updates.name.trim().length > 100)) {
      return res.status(400).json({
        success: false,
        message: "Invalid name.",
      });
    }
    if (updates.name !== undefined) updates.name = updates.name.trim();

    for (const field of ["phone", "city"]) {
      if (updates[field] !== undefined && (typeof updates[field] !== "string" || updates[field].length > 100)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${field}.`,
        });
      }
    }

    if (updates.address !== undefined && (typeof updates.address !== "string" || updates.address.length > 300)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address.",
      });
    }

    if (updates.avatar !== undefined && (typeof updates.avatar !== "string" || updates.avatar.length > 1000)) {
      return res.status(400).json({
        success: false,
        message: "Invalid avatar.",
      });
    }
    // Avatar must be empty (use default) or an application-generated image
    // value (server URL, base64 image dataURL). Arbitrary payloads such as
    // javascript:/file:// or external scripts are rejected.
    if (updates.avatar !== "" && !isSafeImageValue(updates.avatar)) {
      return res.status(400).json({
        success: false,
        message: "Invalid avatar.",
      });
    }

    const user =
      await User.findByIdAndUpdate(
        req.user._id,
        updates,
        {
          new: true,
          runValidators: true,
        }
      ).select(
        "-password -resetPasswordToken -resetPasswordExpire -emailVerificationToken -emailVerificationExpire"
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Profile updated successfully.",
      user,
    });

  } catch (error) {
    console.error(
      "❌ Update Profile Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: safeErrorMessage(error),
    });
  }
};

// =====================================================
// CHANGE PASSWORD
// =====================================================

exports.changePassword = async (
  req,
  res
) => {
  try {
    const {
      currentPassword,
      newPassword,
    } = req.body;

    if (
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Current password and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be at least 6 characters.",
      });
    }

    if (typeof newPassword !== "string" || newPassword.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Invalid new password.",
      });
    }

    const user =
      await User.findById(
        req.user._id
      ).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User not found.",
      });
    }

    const isMatch =
      await user.comparePassword(
        currentPassword
      );

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message:
          "Current password is incorrect.",
      });
    }

    user.password =
      newPassword;

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "Password updated successfully.",
    });

  } catch (error) {
    console.error(
      "❌ Change Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: safeErrorMessage(error),
    });
  }
};

// =====================================================
// FORGOT PASSWORD
// =====================================================

exports.forgotPassword = async (
  req,
  res
) => {
  try {
    const email =
      req.body.email
        ?.trim()
        .toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message:
          "Email is required.",
      });
    }

    console.log(
      "================================="
    );

    console.log(
      "🔐 PASSWORD RESET REQUEST"
    );

    console.log(
      "Email:",
      email
    );

    console.log(
      "================================="
    );

    const user =
      await User.findOne({
        email,
      });

    // -------------------------------------------------
    // SECURITY
    // -------------------------------------------------

    if (!user) {
      console.log(
        "⚠️ No user found for:",
        email
      );

      return res.status(200).json({
        success: true,
        message:
          "If the email is registered, a reset link has been sent.",
      });
    }

    // -------------------------------------------------
    // GENERATE RESET TOKEN
    // -------------------------------------------------

    const resetToken =
      crypto
        .randomBytes(32)
        .toString("hex");

    user.resetPasswordToken =
      crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

    // 30 minutes
    user.resetPasswordExpire =
      Date.now() +
      30 * 60 * 1000;

    await user.save();

    // -------------------------------------------------
    // RESET URL
    // -------------------------------------------------

    const clientUrl =
      process.env.CLIENT_URL ||
      "http://localhost:5502";

    const resetUrl =
      `${getClientBase(req)}/pages/reset-password.html?token=${resetToken}`;

    console.log(
      "✅ User found:",
      user.email
    );

    console.log(
      "🔗 Reset URL:",
      resetUrl
    );

    // -------------------------------------------------
    // RESET EMAIL
    // -------------------------------------------------

    const html = `
      <!DOCTYPE html>
      <html>

      <head>
        <meta charset="UTF-8">

        <title>
          FamiPet Password Reset
        </title>
      </head>

      <body style="
        margin:0;
        padding:0;
        background:#f4f7fb;
        font-family:Arial,sans-serif;
      ">

        <div style="
          max-width:600px;
          margin:40px auto;
          background:white;
          border-radius:12px;
          padding:30px;
          box-shadow:0 4px 15px rgba(0,0,0,0.08);
        ">

          <h1 style="
            color:#2563eb;
          ">
            🐾 FamiPet
          </h1>

          <h2>
            Password Reset Request
          </h2>

          <p>
            Hello ${user.name || "User"},
          </p>

          <p>
            We received a request to reset your
            FamiPet account password.
          </p>

          <p>
            Click the button below to create
            a new password:
          </p>

          <div style="
            text-align:center;
            margin:30px 0;
          ">

            <a
              href="${resetUrl}"
              style="
                display:inline-block;
                background:#2563eb;
                color:white;
                padding:14px 25px;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
              "
            >
              Reset Password
            </a>

          </div>

          <p>
            This password reset link will expire
            in <strong>30 minutes</strong>.
          </p>

          <p>
            If you did not request this password reset,
            you can safely ignore this email.
          </p>

          <hr>

          <p style="
            color:#777;
            font-size:13px;
          ">
            FamiPet<br>
            Pet Care & Adoption Platform
          </p>

        </div>

      </body>
      </html>
    `;

    // -------------------------------------------------
    // SEND EMAIL
    // -------------------------------------------------

    console.log(
      "📧 Sending reset email..."
    );

    const sent =
      await sendEmail(
        user.email,
        "FamiPet - Password Reset",
        html
      );

    if (!sent.ok) {
      console.error(
        "❌ Password reset email could not be sent."
      );

      user.resetPasswordToken =
        undefined;

      user.resetPasswordExpire =
        undefined;

      await user.save();

      return res.status(500).json({
        success: false,
        message:
          "Unable to send reset email. Please check email configuration.",
      });
    }

    console.log(
      "✅ Password reset email sent to:",
      user.email
    );

    return res.status(200).json({
      success: true,
      message:
        "Password reset email sent successfully.",
    });

  } catch (error) {
    console.error(
      "❌ Forgot Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: safeErrorMessage(error),
    });
  }
};

// =====================================================
// RESET PASSWORD
// =====================================================

exports.resetPassword = async (
  req,
  res
) => {
  try {
    const {
      password,
    } = req.body;

    if (
      !password ||
      password.length < 6
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters.",
      });
    }

    if (
      typeof password !== "string" ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid password.",
      });
    }

    if (!req.params.token) {
      return res.status(400).json({
        success: false,
        message:
          "Reset token is required.",
      });
    }

    // -------------------------------------------------
    // HASH TOKEN
    // -------------------------------------------------

    const hashedToken =
      crypto
        .createHash("sha256")
        .update(req.params.token)
        .digest("hex");

    // -------------------------------------------------
    // FIND USER
    // -------------------------------------------------

    const user =
      await User.findOne({
        resetPasswordToken:
          hashedToken,

        resetPasswordExpire: {
          $gt: Date.now(),
        },
      }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or expired reset token.",
      });
    }

    // -------------------------------------------------
    // UPDATE PASSWORD
    // -------------------------------------------------

    user.password =
      password;

    user.resetPasswordToken =
      undefined;

    user.resetPasswordExpire =
      undefined;

    await user.save();

    console.log(
      "✅ Password reset successful for:",
      user.email
    );

    return res.status(200).json({
      success: true,
      message:
        "Password reset successful.",

      token:
        generateToken(user._id),
    });

  } catch (error) {
    console.error(
      "❌ Reset Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: safeErrorMessage(error),
    });
  }
};