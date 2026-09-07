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

module.exports = router;