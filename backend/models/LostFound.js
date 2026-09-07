const mongoose = require("mongoose");

const lostFoundSchema = new mongoose.Schema(
  {
    // User who created the report
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Lost or Found
    type: {
      type: String,
      enum: ["lost", "found"],
      required: true,
    },

    // Pet information
    petName: {
      type: String,
      required: true,
      trim: true,
    },

    species: {
      type: String,
      enum: ["dog", "cat", "bird", "rabbit", "fish", "other"],
      required: true,
    },

    breed: {
      type: String,
      default: "",
      trim: true,
    },

    gender: {
      type: String,
      enum: ["male", "female", "unknown"],
      default: "unknown",
    },

    color: {
      type: String,
      default: "",
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    // Last seen / found location
    location: {
      type: String,
      required: true,
      trim: true,
    },

    // Date when pet was lost/found
    date: {
      type: Date,
      required: true,
    },

    // Contact information
    contactName: {
      type: String,
      required: true,
      trim: true,
    },

    contactPhone: {
      type: String,
      required: true,
      trim: true,
    },

    // Pet images
    images: {
      type: [String],
      default: [],
    },

    // Report status
    status: {
      type: String,
      enum: ["active", "resolved"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("LostFound", lostFoundSchema);