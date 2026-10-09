const mongoose = require("mongoose");
const Breed = require("../models/Breed");
const { strLower, searchStr } = require("../utils/querySafe");
const { analyzeBreedImage } = require("../ai/breed/service");
const { breedAiStatus } = require("../config/breed-ai");
const logger = require("../utils/logger");

exports.getAllBreeds = async (req, res) => {
  try {
    const { species, search } = req.query;
    const query = { isActive: true };

    const sp = strLower(species);
    if (sp) query.species = sp;
    const s = searchStr(search);
    if (s) query.name = { $regex: s, $options: "i" };

    const breeds = await Breed.find(query).sort({ popularity: -1, name: 1 });
    res.json({ success: true, count: breeds.length, breeds });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBreedById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid breed ID." });
    }

    const breed = await Breed.findById(req.params.id);
    if (!breed) return res.status(404).json({ success: false, message: "Breed not found." });

    res.json({ success: true, breed });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createBreed = async (req, res) => {
  try {
    const { name, species } = req.body;

    if (!name || !species) {
      return res.status(400).json({
        success: false,
        message: "Name and species are required.",
      });
    }

    // Allow-list mirrors the Breed model. `source` / `verificationStatus`
    // are admin-only on purpose: an AI-written record can only be promoted
    // to `verified` by a human editing it.
    const allowed = ["name", "species", "aliases", "origin", "lifespan", "weightRange", "heightRange", "temperament", "exerciseRequirements", "groomingGuide", "commonDiseases", "suitableEnvironment", "characteristics", "nutritionNotes", "description", "images", "popularity", "source", "verificationStatus", "isActive"];
    const payload = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    });

    const breed = await Breed.create(payload);
    res.status(201).json({
      success: true,
      message: "Breed created successfully.",
      breed,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateBreed = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid breed ID." });
    }

    // Allow-list mirrors the Breed model. `source` / `verificationStatus`
    // are admin-only on purpose: an AI-written record can only be promoted
    // to `verified` by a human editing it.
    const allowed = ["name", "species", "aliases", "origin", "lifespan", "weightRange", "heightRange", "temperament", "exerciseRequirements", "groomingGuide", "commonDiseases", "suitableEnvironment", "characteristics", "nutritionNotes", "description", "images", "popularity", "source", "verificationStatus", "isActive"];
    const payload = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    });

    const breed = await Breed.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );

    if (!breed) return res.status(404).json({ success: false, message: "Breed not found." });

    res.json({
      success: true,
      message: "Breed updated successfully.",
      breed,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteBreed = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid breed ID." });
    }

    const breed = await Breed.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!breed) return res.status(404).json({ success: false, message: "Breed not found." });

    res.json({
      success: true,
      message: "Breed deactivated successfully.",
      breed,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// =========================================================
// AI BREED IDENTIFICATION
// ---------------------------------------------------------
// Two endpoints, both authenticated.
//
// `breedAiStatus` tells the UI whether to offer the flow at all,
// WITHOUT revealing the service URL, the provider key or anything
// else about the deployment — only whether each dependency is
// configured.
//
// `analyzeBreedImage` runs the pipeline in ai/breed/service.js and
// answers with one of three `status` values:
//   matched    -> an existing Breed (nothing written)
//   created    -> a new AI-written, UNVERIFIED Breed
//   unsupported -> no usable candidate (nothing written)
// The upload was validated in memory by the route's multer and is
// never persisted. No pet is touched by any of these paths: a
// prediction is a suggestion the user has to accept.
// =========================================================

exports.getBreedAiStatus = async (req, res) => {
  try {
    res.json({ success: true, ...breedAiStatus() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.analyzeBreedImage = async (req, res) => {
  try {
    const result = await analyzeBreedImage(req.file);

    logger.info(
      `Breed AI: user ${req.user._id} -> ${result.status}` +
        (result.reason ? ` (${result.reason})` : "") +
        (result.prediction ? ` [${result.prediction.label}]` : "")
    );

    res.json({ success: true, ...result });
  } catch (error) {
    const status = error && error.status ? error.status : 500;
    logger.error(`Breed AI: analyze failed (${status}).`);
    res.status(status).json({
      success: false,
      message: error.message || "Breed analysis failed.",
    });
  }
};
