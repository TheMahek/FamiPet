const mongoose = require('mongoose');

const veterinarianSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  specialization: [{ type: String }],
  qualifications: [{ type: String }],
  experience: { type: Number, default: 0 },
  clinic: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  image: { type: String, default: '' },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
  availability: [{
    day: String,
    startTime: String,
    endTime: String,
    isAvailable: Boolean,
  }],
  isActive: { type: Boolean, default: true },
  consultationFee: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Veterinarian', veterinarianSchema);
