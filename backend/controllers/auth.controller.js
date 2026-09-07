const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendEmail } = require("../config/email");

// =====================================================
// FRONTEND BASE URL
// =====================================================

const getClientBase = (req) => {
  // Always embed the fully-configured CLIENT_URL so emailed links (verify email,
  // reset password) point at the correct Live Server host. Previously this tried
  // to derive the host from the incoming request's Origin header, which produced
  // bare path links (e.g. "/pages/verify-email.html") that error with
  // "Cannot GET /..." when the Origin header is absent or unexpected.
  const envBase = (process.env.CLIENT_URL || "http://localhost:5173").trim();
  return envBase.replace(/\/$/, "");
};

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
    } = req.body;

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

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters.",
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
    // -------------------------------------------------

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      phone: phone || "",

      isVerified: false,

      emailVerificationToken:
        hashedVerificationToken,

      // Token valid for 24 hours
      emailVerificationExpire:
        Date.now() + 24 * 60 * 60 * 1000,
    });

    // -------------------------------------------------
    // FRONTEND VERIFICATION URL
    // -------------------------------------------------

    const clientUrl =
      process.env.CLIENT_URL ||
      "http://localhost:5173";

    const verificationUrl =
      `${getClientBase(req)}/pages/verify-email.html?token=${verificationToken}`;

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

    if (!sent) {
      await User.findByIdAndDelete(user._id);

      return res.status(500).json({
        success: false,
        message:
          "Unable to send verification email. Please try again.",
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
          : error.message,
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

    const user = await User.findOne({
      emailVerificationToken: hashedToken,

      emailVerificationExpire: {
        $gt: Date.now(),
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or expired verification link.",
      });
    }

    // -------------------------------------------------
    // VERIFY USER
    // -------------------------------------------------

    user.isVerified = true;

    user.emailVerificationToken =
      undefined;

    user.emailVerificationExpire =
      undefined;

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
      message: error.message,
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
      Date.now() + 24 * 60 * 60 * 1000;

    await user.save();

    // -------------------------------------------------
    // VERIFICATION URL
    // -------------------------------------------------

    const clientUrl =
      process.env.CLIENT_URL ||
      "http://localhost:5173";

    const verificationUrl =
      `${getClientBase(req)}/pages/verify-email.html?token=${verificationToken}`;

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

    if (!sent) {
      return res.status(500).json({
        success: false,
        message:
          "Unable to send verification email.",
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
      message: error.message,
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
      message: error.message,
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
        .select("-password")
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
      message: error.message,
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

    const user =
      await User.findByIdAndUpdate(
        req.user._id,
        updates,
        {
          new: true,
          runValidators: true,
        }
      ).select("-password");

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
      message: error.message,
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
      message: error.message,
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
      "http://localhost:5173";

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

    if (!sent) {
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
      message: error.message,
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
      message: error.message,
    });
  }
};