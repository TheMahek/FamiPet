const mongoose = require("mongoose");

const vaccinationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    vaccineName: { type: String, required: true, trim: true },
    doseNumber: { type: Number, default: 1, min: 1 },
    vaccinationDate: { type: Date, required: true },
    nextDueDate: { type: Date, required: true },
    veterinarian: { type: String, default: "", trim: true },
    hospital: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["Pending", "Completed"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vaccination", vaccinationSchema);
