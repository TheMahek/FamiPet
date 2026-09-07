const mongoose = require("mongoose");

const breedSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    species: {
      type: String,
      required: true,
      enum: ["dog", "cat", "bird", "rabbit", "fish", "other"],
      lowercase: true,
      trim: true,
    },

    origin: {
      type: String,
      trim: true,
      default: "",
    },

    lifespan: {
      type: String,
      default: "",
    },

    weightRange: {
      type: String,
      default: "",
    },

    heightRange: {
      type: String,
      default: "",
    },

    temperament: [
      {
        type: String,
        trim: true,
      },
    ],

    exerciseRequirements: {
      type: String,
      default: "",
    },

    groomingGuide: {
      type: String,
      default: "",
    },

    commonDiseases: [
      {
        type: String,
        trim: true,
      },
    ],

    suitableEnvironment: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },

    images: [
      {
        type: String,
      },
    ],

    popularity: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Breed", breedSchema);