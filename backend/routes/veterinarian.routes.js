const express = require('express');
const router = express.Router();

const {
  getAllVeterinarians,
  getVeterinarianById,
  createVeterinarian,
  updateVeterinarian,
  deleteVeterinarian
} = require('../controllers/veterinarian.controller');

const { protect, adminOnly } = require('../middleware/auth');

// Public routes
router.get('/', getAllVeterinarians);
router.get('/:id', getVeterinarianById);

// Admin routes
router.post('/', protect, adminOnly, createVeterinarian);
router.put('/:id', protect, adminOnly, updateVeterinarian);
router.delete('/:id', protect, adminOnly, deleteVeterinarian);

module.exports = router;