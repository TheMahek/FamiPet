const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pet: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet' },
  title: { type: String, required: true },
  type: { type: String, enum: ['feeding', 'medicine', 'vaccination', 'grooming', 'appointment', 'exercise', 'custom'], required: true },
  description: { type: String, default: '' },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  frequency: { type: String, enum: ['once', 'daily', 'weekly', 'monthly'], default: 'once' },
  isActive: { type: Boolean, default: true },
  isCompleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Reminder', reminderSchema);
