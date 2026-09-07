const express = require('express');
const router = express.Router();

const {
  getVaccinations,
  getUpcomingVaccinations,
  createVaccination,
  updateVaccination,
  deleteVaccination
} = require('../controllers/vaccination.controller');

const { protect } = require('../middleware/auth');

router.get('/', protect, getVaccinations);
router.get('/upcoming', protect, getUpcomingVaccinations);
router.post('/', protect, createVaccination);
router.put('/:id', protect, updateVaccination);
router.delete('/:id', protect, deleteVaccination);

module.exports = router;