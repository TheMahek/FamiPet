const Pet = require("../models/Pet");
const Breed = require("../models/Breed");
const QRCode = require("qrcode");
const notificationService = require("../services/notification.service");
const {
  isValidObjectId,
  escapeRegExp,
  stringOrUndefined,
  MAX_SEARCH_LENGTH,
  SPECIES,
  GENDERS,
  PET_STATUSES,
} = require("../utils/validation");
const { isSafeImageArray } = require("../utils/imageUpload");

// ==========================
// Get All Pets
// ==========================
exports.getAllPets = async (req, res) => {
  try {
    const { species, breed, gender, status, search, sort, page, limit } = req.query;

    // -------------------------------------------------
    // Build the filter explicitly. Query params are never
    // passed raw into MongoDB: every value must be a plain
    // string, and only supported fields are used.
    // -------------------------------------------------

    const query = {};

    if (species !== undefined) {
      const s = stringOrUndefined(species);
      if (s === undefined || !SPECIES.includes(s.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid species." });
      }
      query.species = s.toLowerCase();
    }

    if (breed !== undefined) {
      if (typeof breed !== "string" || !isValidObjectId(breed)) {
        return res.status(400).json({ success: false, message: "Invalid breed." });
      }
      query.breed = breed;
    }

    if (gender !== undefined) {
      const g = stringOrUndefined(gender);
      if (g === undefined || !GENDERS.includes(g.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid gender." });
      }
      query.gender = g.toLowerCase();
    }

    if (status !== undefined) {
      const st = stringOrUndefined(status);
      if (st === undefined || !PET_STATUSES.includes(st.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid status." });
      }
      query.status = st.toLowerCase();
    }

    if (search !== undefined) {
      const s = stringOrUndefined(search);
      if (s === undefined) {
        return res.status(400).json({ success: false, message: "Invalid search." });
      }
      const term = s.trim().slice(0, MAX_SEARCH_LENGTH);
      if (term) {
        const rx = new RegExp(escapeRegExp(term), "i");
        query.$or = [
          { name: rx },
          { description: rx },
        ];
      }
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

    // Optional pagination: only applied when page/limit are supplied so the
    // existing frontend (which fetches the whole list) keeps working.
    let pageNum;
    let limitNum;

    if (page !== undefined || limit !== undefined) {
      pageNum = Math.max(1, parseInt(page, 10) || 1);
      limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    }

    let petsQuery = Pet.find(query)
      .populate("owner", "name email phone")
      .populate("breed", "name species")
      .sort(sortOption);

    if (pageNum !== undefined) {
      petsQuery = petsQuery.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const pets = await petsQuery.exec();

    res.status(200).json({
      success: true,
      count: pets.length,
      pets,
    });
  } catch (error) {
    console.error("Get All Pets Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
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
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Get Pet By ID
// ==========================
exports.getPetById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid pet ID." });
    }

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
      message: "Internal Server Error",
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
      health,
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

    // -------------------------------------------------
    // TYPE / ENUM / LENGTH VALIDATION
    // -------------------------------------------------

    if (typeof name !== "string" || name.trim().length > 100) {
      return res.status(400).json({ success: false, message: "Invalid pet name." });
    }

    if (typeof species !== "string" || !SPECIES.includes(String(species).toLowerCase())) {
      return res.status(400).json({ success: false, message: "Invalid species." });
    }

    if (typeof gender !== "string" || !GENDERS.includes(String(gender).toLowerCase())) {
      return res.status(400).json({ success: false, message: "Invalid gender." });
    }

    const ageNum = typeof age === "string" && age.trim() !== "" ? Number(age) : age;
    if (typeof ageNum !== "number" || Number.isNaN(ageNum) || ageNum < 0) {
      return res.status(400).json({ success: false, message: "Invalid age." });
    }

    let weightNum = weight;
    if (weight !== undefined && weight !== null && weight !== "") {
      weightNum = typeof weight === "string" ? Number(weight) : weight;
      if (typeof weightNum !== "number" || Number.isNaN(weightNum) || weightNum < 0) {
        return res.status(400).json({ success: false, message: "Invalid weight." });
      }
    }

    // Phase 12 — reject an implausible weight for the species (and, for
    // pets aged 1+, below the species floor too). Only applies while the
    // client actually supplies a weight; weight stays optional on the API.
    if (weightNum !== undefined && weightNum !== null) {
      const weightCheck = validateSpeciesWeight(
        String(species).toLowerCase(),
        ageNum,
        weightNum
      );
      if (!weightCheck.ok) {
        return res.status(400).json({ success: false, message: weightCheck.message });
      }
    }

    if (color !== undefined && typeof color !== "string") {
      return res.status(400).json({ success: false, message: "Invalid color." });
    }

    if (health !== undefined && typeof health !== "string") {
      return res.status(400).json({ success: false, message: "Invalid health." });
    }

    if (description !== undefined && typeof description !== "string") {
      return res.status(400).json({ success: false, message: "Invalid description." });
    }

    // Images must be application-generated image values (dataURLs, Cloudinary
    // / local upload URLs, seeded Unsplash links or frontend asset paths).
    // Arbitrary payloads are rejected before they reach MongoDB.
    if (images !== undefined) {
      if (!isSafeImageArray(images) || images.length > 10) {
        return res.status(400).json({ success: false, message: "Invalid images." });
      }
    }

    // Accept either the existing Breed ObjectId or the breed name used by the legacy frontend.
    if (typeof breed !== "string") {
      return res.status(400).json({ success: false, message: "Invalid breed." });
    }

    let breedId = breed;
    if (!isValidObjectId(breed)) {
      const breedName = breed.trim();
      if (!breedName || breedName.length > 100) {
        return res.status(400).json({ success: false, message: "Breed is required." });
      }
      let breedDoc = await Breed.findOne({ name: new RegExp(`^${escapeRegExp(breedName)}$`, "i") });
      if (!breedDoc) {
        if (!SPECIES.includes(String(species).toLowerCase())) {
          return res.status(400).json({ success: false, message: "Invalid species." });
        }
        breedDoc = await Breed.create({ name: breedName, species: String(species).toLowerCase() });
      }
      breedId = breedDoc._id;
    }

    const pet = await Pet.create({
      owner: req.user.id,
      breed: breedId,
      name: name.trim(),
      species: String(species).toLowerCase(),
      gender: String(gender).toLowerCase(),
      age: ageNum,
      weight: weightNum === undefined ? 0 : weightNum,
      color: color !== undefined ? String(color).slice(0, 50) : "",
      vaccinated: vaccinated !== undefined ? Boolean(vaccinated) : false,
      health: health !== undefined ? String(health).slice(0, 300) : "Good",
      adopted: adopted !== undefined ? Boolean(adopted) : false,
      images: images !== undefined ? images : [],
      description: description !== undefined ? String(description).slice(0, 2000) : "",
    });

    // -------------------------------------------------
    // AUTO-GENERATE UNIQUE DIGITAL PET ID + QR CODE
    // -------------------------------------------------

    try {
      const uniqueId = `${Date.now().toString(36)}-${pet._id.toString().slice(-8)}-${Math.floor(Math.random() * 10000)}`;
      const qrData = JSON.stringify({
        petId: pet._id,
        petUid: uniqueId,
        name: pet.name,
        species: pet.species,
        breed: pet.breed ? pet.breed : "",
      });

      const qrCodeDataUrl = await QRCode.toDataURL(qrData);

      pet.qrCode = qrCodeDataUrl;
      pet.petUid = uniqueId;
      await pet.save();
    } catch (qrError) {
      console.error("QR Generation Warning:", qrError);
    }

    // -------------------------------------------------
    // PET CREATED NOTIFICATION (Phase 8 events): only the
    // owner is notified; the created pet references types
    // added for the pet-management module.
    // -------------------------------------------------

    await notificationService.createNotification({
      user: req.user.id,
      type: "pet",
      category: "pet",
      title: "Pet Added",
      message: `Your pet ${pet.name} has been added to your family.`,
      priority: "normal",
      referenceType: "pet",
      referenceId: pet._id,
      metadata: {
        petId: String(pet._id),
        petName: pet.name,
        species: pet.species,
      },
      dedupKey: `pet-created-${pet._id}`,
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
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Update Pet
// ==========================
exports.updatePet = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid pet ID." });
    }

    // Only allow updating legitimate pet fields. Owner, status, adopted,
    // views, qrCode and petUid are protected/server-controlled.
    const allowedFields = [
      "breed",
      "name",
      "species",
      "gender",
      "age",
      "weight",
      "color",
      "vaccinated",
      "health",
      "images",
      "description",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update." });
    }

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

    // -------------------------------------------------
    // TYPE / ENUM / LENGTH VALIDATION
    // -------------------------------------------------

    if (updates.name !== undefined && (typeof updates.name !== "string" || updates.name.trim().length > 100)) {
      return res.status(400).json({ success: false, message: "Invalid pet name." });
    }

    if (updates.species !== undefined && (typeof updates.species !== "string" || !SPECIES.includes(String(updates.species).toLowerCase()))) {
      return res.status(400).json({ success: false, message: "Invalid species." });
    }

    if (updates.gender !== undefined && (typeof updates.gender !== "string" || !GENDERS.includes(String(updates.gender).toLowerCase()))) {
      return res.status(400).json({ success: false, message: "Invalid gender." });
    }

    if (updates.age !== undefined) {
      const ageNum = typeof updates.age === "string" ? Number(updates.age) : updates.age;
      if (typeof ageNum !== "number" || Number.isNaN(ageNum) || ageNum < 0) {
        return res.status(400).json({ success: false, message: "Invalid age." });
      }
      updates.age = ageNum;
    }

    if (updates.weight !== undefined) {
      const weightNum = typeof updates.weight === "string" ? Number(updates.weight) : updates.weight;
      if (typeof weightNum !== "number" || Number.isNaN(weightNum) || weightNum < 0) {
        return res.status(400).json({ success: false, message: "Invalid weight." });
      }
      updates.weight = weightNum;
    }

    // Phase 12 — same species/age weight-band check as create. Uses the
    // *effective* species/age (a new value supplied in this update, or the
    // pet's current stored value) so the band stays correct even when only
    // the weight is being changed, or when species/age move together.
    if (
      updates.weight !== undefined &&
      updates.weight !== null &&
      typeof updates.weight === "number"
    ) {
      const effectiveSpecies = String(
        updates.species !== undefined ? updates.species : pet.species
      ).toLowerCase();

      let effectiveAge =
        updates.age !== undefined
          ? typeof updates.age === "string"
            ? Number(updates.age)
            : updates.age
          : pet.age;

      if (typeof effectiveAge !== "number" || Number.isNaN(effectiveAge)) {
        effectiveAge = 0;
      }

      const weightCheck = validateSpeciesWeight(
        effectiveSpecies,
        effectiveAge,
        updates.weight
      );

      if (!weightCheck.ok) {
        return res.status(400).json({
          success: false,
          message: weightCheck.message,
        });
      }
    }

    for (const strField of ["color", "health", "description"]) {
      if (updates[strField] !== undefined && typeof updates[strField] !== "string") {
        return res.status(400).json({ success: false, message: `Invalid ${strField}.` });
      }
      if (typeof updates[strField] === "string") {
        updates[strField] = updates[strField].slice(0, strField === "description" ? 2000 : 300);
      }
    }

    if (updates.images !== undefined) {
      if (!isSafeImageArray(updates.images) || updates.images.length > 10) {
        return res.status(400).json({ success: false, message: "Invalid images." });
      }
    }

    // Validate breed if provided (accept either an ObjectId or a breed name used by the legacy frontend)
    if (req.body.breed !== undefined) {
      if (isValidObjectId(req.body.breed)) {
        updates.breed = req.body.breed;
      } else if (typeof req.body.breed === "string") {
        const breedName = req.body.breed.trim();
        if (!breedName) {
          return res.status(400).json({ success: false, message: "Invalid breed." });
        }
        let breedDoc = await Breed.findOne({ name: new RegExp(`^${escapeRegExp(breedName)}$`, "i") });
        if (!breedDoc) {
          const species = updates.species || pet.species || "dog";
          if (!SPECIES.includes(String(species).toLowerCase())) {
            return res.status(400).json({ success: false, message: "Invalid species." });
          }
          breedDoc = await Breed.create({ name: breedName, species });
        }
        updates.breed = breedDoc._id;
      } else {
        return res.status(400).json({ success: false, message: "Invalid breed." });
      }
    }

    Object.assign(pet, updates);

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
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Delete Pet
// ==========================
exports.deletePet = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid pet ID." });
    }

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
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Generate Digital Pet QR Code
// ==========================
exports.generateQRCode = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid pet ID." });
    }

    const pet = await Pet.findById(req.params.id)
      .populate("owner", "name phone email")
      .populate("breed", "name species");

    if (!pet) {
      return res.status(404).json({
        success: false,
        message: "Pet not found",
      });
    }

    // The QR embeds the owner's name and phone. Only the pet's owner (or an
    // admin) may generate it — never another authenticated user.
    if (
      pet.owner &&
      pet.owner._id &&
      pet.owner._id.toString() !== req.user.id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this pet ID.",
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
      message: "Internal Server Error",
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
      message: "Internal Server Error",
    });
  }
};