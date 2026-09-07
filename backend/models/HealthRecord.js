const mongoose = require("mongoose");

const healthRecordSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    diagnosis: { type: String, required: true, trim: true },
    treatment: { type: String, default: "", trim: true },
    doctor: { type: String, default: "", trim: true },
    hospital: { type: String, default: "", trim: true },
    prescription: { type: String, default: "", trim: true },
    visitDate: { type: Date, default: Date.now },
    nextVisit: { type: Date },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("HealthRecord", healthRecordSchema);
