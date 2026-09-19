const Breed = require("../models/Breed");
const {
  isValidObjectId,
  pickFields,
  escapeRegExp,
  stringOrUndefined,
  MAX_SEARCH_LENGTH,
  SPECIES,
} = require("../utils/validation");

const BREED_ALLOWED_FIELDS = [
  "name",
  "species",
  "origin",
  "lifespan",
  "weightRange",
  "heightRange",
  "temperament",
  "exerciseRequirements",
  "groomingGuide",
  "commonDiseases",
  "suitableEnvironment",
  "description",
  "images",
  "popularity",
];

exports.getAllBreeds = async (req, res) => {
  try {
    const { species, search } = req.query;
    const query = { isActive: true };

    if (species !== undefined) {
      const sp = stringOrUndefined(species);
      if (sp === undefined || !SPECIES.includes(sp.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid species." });
      }
      query.species = sp.toLowerCase();
    }

    if (search !== undefined) {
      const s = stringOrUndefined(search);
      if (s === undefined) {
        return res.status(400).json({ success: false, message: "Invalid search." });
      }
      const term = s.trim().slice(0, MAX_SEARCH_LENGTH);
      if (term) {
        query.name = { $regex: escapeRegExp(term), $options: "i" };
      }
    }

    const breeds = await Breed.find(query).sort({ popularity: -1, name: 1 });
    res.json({ success: true, count: breeds.length, breeds });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getBreedById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid breed ID." });
    }

    const breed = await Breed.findById(req.params.id);
    if (!breed) return res.status(404).json({ success: false, message: "Breed not found." });

    res.json({ success: true, breed });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
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

    if (typeof name !== "string" || name.trim().length > 100) {
      return res.status(400).json({ success: false, message: "Invalid breed name." });
    }

    if (typeof species !== "string" || !SPECIES.includes(String(species).toLowerCase())) {
      return res.status(400).json({ success: false, message: "Invalid species." });
    }

    // Internal fields (_id, isActive, timestamps) are never accepted from the body.
    const breedData = pickFields(req.body, BREED_ALLOWED_FIELDS);
    breedData.name = name.trim();
    breedData.species = String(species).toLowerCase();

    const breed = await Breed.create(breedData);
    res.status(201).json({
      success: true,
      message: "Breed created successfully.",
      breed,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.updateBreed = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid breed ID." });
    }

    const updates = pickFields(req.body, BREED_ALLOWED_FIELDS);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update." });
    }

    if (updates.name !== undefined && (typeof updates.name !== "string" || updates.name.trim().length > 100)) {
      return res.status(400).json({ success: false, message: "Invalid breed name." });
    }
    if (updates.name !== undefined) updates.name = updates.name.trim();

    if (updates.species !== undefined && (typeof updates.species !== "string" || !SPECIES.includes(String(updates.species).toLowerCase()))) {
      return res.status(400).json({ success: false, message: "Invalid species." });
    }
    if (updates.species !== undefined) updates.species = String(updates.species).toLowerCase();

    const breed = await Breed.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!breed) return res.status(404).json({ success: false, message: "Breed not found." });

    res.json({
      success: true,
      message: "Breed updated successfully.",
      breed,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteBreed = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
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
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};