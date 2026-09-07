const express = require('express');
const router = express.Router();
const { getReminders, createReminder, updateReminder, completeReminder, deleteReminder } = require('../controllers/reminder.controller');
const { protect } = require('../middleware/auth');

router.get('/', protect, getReminders);
router.post('/', protect, createReminder);
router.put('/:id', protect, updateReminder);
router.put('/:id/complete', protect, completeReminder);
router.delete('/:id', protect, deleteReminder);

module.exports = router;
