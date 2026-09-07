const express = require("express");
const { protect } = require("../middleware/auth");

const router = express.Router();

const {
  register,
  verifyEmail,
  resendVerification,
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/auth.controller");

// =====================================================
// AUTH ROUTES
// =====================================================

// Register
router.post(
  "/register",
  register
);

// Login
router.post(
  "/login",
  login
);

// Verify email
router.get(
  "/verify-email/:token",
  verifyEmail
);

// Resend verification email
router.post(
  "/resend-verification",
  resendVerification
);

// Forgot password
router.post(
  "/forgot-password",
  forgotPassword
);

// Reset password
router.post(
  "/reset-password/:token",
  resetPassword
);

// =====================================================
// USER ROUTES
// =====================================================

// Current user
router.get("/me", protect, getMe);

// Update profile
router.put("/profile", protect, updateProfile);

// Change password
router.put("/change-password", protect, changePassword);

module.exports = router;