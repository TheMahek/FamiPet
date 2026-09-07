const mongoose = require("mongoose");
const Pet = require("../models/Pet");
const Breed = require("../models/Breed");
const QRCode = require("qrcode");

// ==========================
// Get All Pets
// ==========================
exports.getAllPets = async (req, res) => {
  try {
    const { species, breed, gender, status, search, sort } = req.query;

    const query = {};

    if (species) {
      query.species = species;
    }

    if (breed && mongoose.Types.ObjectId.isValid(breed)) {
      query.breed = breed;
    }

    if (gender) {
      query.gender = gender;
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }

    let sortOption = { createdAt: -1 };

    if (sort === "oldest") {
      sortOption = { createdAt: 1 };
    } else if (sort === "name") {
      sortOption = { name: 1 };
    } else if (sort === "age") {
      sortOption = { age: 1 };
    } else if (sort === "popular") {
      sortOption = { views: -1 };
    }

    const pets = await Pet.find(query)
      .populate("owner", "name email phone")
      .populate("breed", "name species")
      .sort(sortOption);

    res.status(200).json({
      success: true,
      count: pets.length,
      pets,
    });
  } catch (error) {
    console.error("Get All Pets Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// Get My Pets
// ==========================
exports.getMyPets = async (req, res) => {
  try {
    const pets = await Pet.find({
      owner: req.user.id,
    })
      .populate("breed", "name species")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: pets.length,
      pets,
    });
  } catch (error) {
    console.error("Get My Pets Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// Get Pet By ID
// ==========================
exports.getPetById = async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id)
      .populate("owner", "name email phone")
      .populate("breed", "name species");

    if (!pet) {
      return res.status(404).json({
        success: false,
        message: "Pet not found",
      });
    }

    // Increase views
    pet.views += 1;
    await pet.save();

    res.status(200).json({
      success: true,
      pet,
    });
  } catch (error) {
    console.error("Get Pet Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// Create Pet
// ==========================
exports.createPet = async (req, res) => {
  try {
    const {
      breed,
      name,
      species,
      gender,
      age,
      weight,
      color,
      vaccinated,
      adopted,
      images,
      description,
    } = req.body;

    // Required fields
    if (
      !breed ||
      !name ||
      !species ||
      !gender ||
      age === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Breed, name, species, gender and age are required.",
      });
    }

    // Accept either the existing Breed ObjectId or the breed name used by the legacy frontend.
    let breedId = breed;
    if (!mongoose.Types.ObjectId.isValid(breed)) {
      const breedName = String(breed).trim();
      if (!breedName) return res.status(400).json({ success: false, message: "Breed is required." });
      let breedDoc = await Breed.findOne({ name: new RegExp(`^${breedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      if (!breedDoc) {
        breedDoc = await Breed.create({ name: breedName, species: String(species).toLowerCase() });
      }
      breedId = breedDoc._id;
    }

    const pet = await Pet.create({
      owner: req.user.id,
      breed: breedId,
      name,
      species,
      gender,
      age,
      weight,
      color,
      vaccinated,
      adopted,
      images,
      description,
    });

    res.status(201).json({
      success: true,
      message: "Pet created successfully.",
      pet,
    });
  } catch (error) {
    console.error("Create Pet Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// Update Pet
// ==========================
exports.updatePet = async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) {
      return res.status(404).json({
        success: false,
        message: "Pet not found",
      });
    }

    // Only owner can update their pet
    if (pet.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this pet.",
      });
    }

    // Prevent changing owner
    delete req.body.owner;

    // Validate breed if provided (accept either an ObjectId or a breed name used by the legacy frontend)
    if (req.body.breed) {
      if (mongoose.Types.ObjectId.isValid(req.body.breed)) {
        // Already a valid ObjectId reference
      } else {
        const breedName = String(req.body.breed).trim();
        if (!breedName) {
          return res.status(400).json({
            success: false,
            message: "Invalid breed.",
          });
        }
        let breedDoc = await Breed.findOne({ name: new RegExp(`^${breedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
        if (!breedDoc) {
          const species = req.body.species || pet.species || "dog";
          breedDoc = await Breed.create({ name: breedName, species });
        }
        req.body.breed = breedDoc._id;
      }
    }

    Object.assign(pet, req.body);

    await pet.save();

    res.status(200).json({
      success: true,
      message: "Pet updated successfully.",
      pet,
    });
  } catch (error) {
    console.error("Update Pet Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// Delete Pet
// ==========================
exports.deletePet = async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) {
      return res.status(404).json({
        success: false,
        message: "Pet not found",
      });
    }

    // Only owner can delete their pet
    if (pet.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this pet.",
      });
    }

    await pet.deleteOne();

    res.status(200).json({
      success: true,
      message: "Pet deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Pet Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// Generate Digital Pet QR Code
// ==========================
exports.generateQRCode = async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id)
      .populate("owner", "name phone email")
      .populate("breed", "name species");

    if (!pet) {
      return res.status(404).json({
        success: false,
        message: "Pet not found",
      });
    }

    const qrData = JSON.stringify({
      petId: pet._id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed ? pet.breed.name : "",
      owner: pet.owner
        ? {
            name: pet.owner.name,
            phone: pet.owner.phone,
          }
        : null,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(qrData);

    pet.qrCode = qrCodeDataUrl;
    await pet.save();

    res.status(200).json({
      success: true,
      message: "QR code generated successfully.",
      qrCode: qrCodeDataUrl,
    });
  } catch (error) {
    console.error("Generate QR Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// Get Featured Pets
// ==========================
exports.getFeaturedPets = async (req, res) => {
  try {
    const pets = await Pet.find({
      status: "available",
      adopted: false,
    })
      .populate("breed", "name species")
      .sort({ views: -1 })
      .limit(8);

    res.status(200).json({
      success: true,
      count: pets.length,
      pets,
    });
  } catch (error) {
    console.error("Get Featured Pets Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};