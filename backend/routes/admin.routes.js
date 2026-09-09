const express = require("express");

const router = express.Router();

const {
  getDashboardStats,
  getAllUsers,
  toggleUserBlock,
  deleteUser,
  getAllPets,
  deletePet,
  getRecentUsers,
  getAllLostFoundReports,
  updateLostFoundStatus,
  deleteLostFoundReport,
  getAllCommunityPosts,
  updateCommunityPostStatus,
  deleteCommunityPost,
} = require("../controllers/admin.controller");

const { protect, adminOnly } = require("../middleware/auth");

// Dashboard
router.get("/dashboard", protect, adminOnly, getDashboardStats);

// Users
router.get("/users", protect, adminOnly, getAllUsers);
router.get("/users/recent", protect, adminOnly, getRecentUsers);
router.put("/users/:id/block", protect, adminOnly, toggleUserBlock);
router.delete("/users/:id", protect, adminOnly, deleteUser);

// Pets
router.get("/pets", protect, adminOnly, getAllPets);
router.delete("/pets/:id", protect, adminOnly, deletePet);

// Lost & Found moderation
router.get("/lost-found", protect, adminOnly, getAllLostFoundReports);
router.put("/lost-found/:id/status", protect, adminOnly, updateLostFoundStatus);
router.delete("/lost-found/:id", protect, adminOnly, deleteLostFoundReport);

// Community moderation
router.get("/community", protect, adminOnly, getAllCommunityPosts);
router.put("/community/:id/status", protect, adminOnly, updateCommunityPostStatus);
router.delete("/community/:id", protect, adminOnly, deleteCommunityPost);

module.exports = router;