const mongoose = require("mongoose");

const adoptionSchema = new mongoose.Schema(
  {
    pet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pet",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
    },

    address: {
      type: String,
      required: true,
    },

    occupation: {
      type: String,
      default: "",
    },

    experienceWithPets: {
      type: String,
      default: "",
    },

    reasonForAdoption: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Withdrawn"],
      default: "Pending",
    },

    // Filled by the admin when the request is rejected (mandatory reason).
    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },

    // Message sent to the applicant on approval. Defaults to a generic
    // acceptance message when the admin provides none.
    acceptanceMessage: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Adoption", adoptionSchema);