const express = require('express');
const router = express.Router();
const {
  getReminders,
  getUpcomingReminders,
  getTodayReminders,
  getPetReminders,
  createReminder,
  updateReminder,
  completeReminder,
  activateReminder,
  deactivateReminder,
  deleteReminder,
} = require('../controllers/reminder.controller');
const { protect } = require('../middleware/auth');

// Static segments MUST be registered before the parameterized ones.
router.get('/', protect, getReminders);
router.get('/upcoming', protect, getUpcomingReminders);
router.get('/today', protect, getTodayReminders);
router.get('/pet/:petId', protect, getPetReminders);
router.post('/', protect, createReminder);
router.put('/:id', protect, updateReminder);
router.patch('/:id', protect, updateReminder);
router.put('/:id/complete', protect, completeReminder);
router.post('/:id/complete', protect, completeReminder);
router.patch('/:id/complete', protect, completeReminder);
router.put('/:id/activate', protect, activateReminder);
router.post('/:id/activate', protect, activateReminder);
router.put('/:id/deactivate', protect, deactivateReminder);
router.post('/:id/deactivate', protect, deactivateReminder);
router.delete('/:id', protect, deleteReminder);

module.exports = router;