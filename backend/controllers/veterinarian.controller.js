const Veterinarian = require("../models/Veterinarian");
const {
  isValidObjectId,
  pickFields,
  escapeRegExp,
  stringOrUndefined,
  MAX_SEARCH_LENGTH,
} = require("../utils/validation");

const VETERINARIAN_ALLOWED_FIELDS = [
  "name",
  "email",
  "phone",
  "specialization",
  "qualifications",
  "experience",
  "clinic",
  "address",
  "city",
  "image",
  "rating",
  "availability",
  "consultationFee",
  "isActive",
];

// ========================================
// Get All Veterinarians
// ========================================
exports.getAllVeterinarians = async (req, res) => {
  try {
    const { search, specialization, city } = req.query;

    const query = {
      isActive: true,
    };

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
          { clinic: rx },
          { city: rx },
        ];
      }
    }

    if (specialization !== undefined) {
      const sp = stringOrUndefined(specialization);
      if (sp === undefined) {
        return res.status(400).json({ success: false, message: "Invalid specialization." });
      }
      const term = sp.trim().slice(0, MAX_SEARCH_LENGTH);
      if (term) {
        query.specialization = new RegExp(escapeRegExp(term), "i");
      }
    }

    if (city !== undefined) {
      const c = stringOrUndefined(city);
      if (c === undefined) {
        return res.status(400).json({ success: false, message: "Invalid city." });
      }
      const term = c.trim().slice(0, MAX_SEARCH_LENGTH);
      if (term) {
        query.city = new RegExp(escapeRegExp(term), "i");
      }
    }

    const veterinarians = await Veterinarian.find(query)
      .sort({ rating: -1, name: 1 });

    res.status(200).json({
      success: true,
      count: veterinarians.length,
      veterinarians,
    });
  } catch (error) {
    console.error("Get Veterinarians Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ========================================
// Get Veterinarian By ID
// ========================================
exports.getVeterinarianById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid veterinarian ID." });
    }

    const veterinarian = await Veterinarian.findById(req.params.id);

    if (!veterinarian) {
      return res.status(404).json({
        success: false,
        message: "Veterinarian not found",
      });
    }

    res.status(200).json({
      success: true,
      veterinarian,
    });
  } catch (error) {
    console.error("Get Veterinarian Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ========================================
// Create Veterinarian
// ========================================
exports.createVeterinarian = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      specialization,
      qualifications,
      experience,
      clinic,
      address,
      city,
      image,
      rating,
      availability,
      consultationFee,
    } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, email and phone are required.",
      });
    }

    if (typeof name !== "string" || name.trim().length > 100) {
      return res.status(400).json({ success: false, message: "Invalid name." });
    }

    if (typeof email !== "string" || email.trim().length > 254) {
      return res.status(400).json({ success: false, message: "Invalid email." });
    }

    if (typeof phone !== "string" || phone.trim().length > 40) {
      return res.status(400).json({ success: false, message: "Invalid phone." });
    }

    const veterinarian = await Veterinarian.create({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      specialization: Array.isArray(specialization) ? specialization : [],
      qualifications: Array.isArray(qualifications) ? qualifications : [],
      experience: Number(experience) || 0,
      clinic: typeof clinic === "string" ? clinic.slice(0, 200) : "",
      address: typeof address === "string" ? address.slice(0, 300) : "",
      city: typeof city === "string" ? city.slice(0, 100) : "",
      image: typeof image === "string" ? image.slice(0, 1000) : "",
      rating,
      availability: Array.isArray(availability) ? availability : [],
      consultationFee: consultationFee !== undefined ? Number(consultationFee) || 0 : 0,
    });

    res.status(201).json({
      success: true,
      message: "Veterinarian created successfully.",
      veterinarian,
    });
  } catch (error) {
    console.error("Create Veterinarian Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ========================================
// Update Veterinarian
// ========================================
exports.updateVeterinarian = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid veterinarian ID." });
    }

    const updates = pickFields(req.body, VETERINARIAN_ALLOWED_FIELDS);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update." });
    }

    if (updates.name !== undefined && (typeof updates.name !== "string" || updates.name.trim().length > 100)) {
      return res.status(400).json({ success: false, message: "Invalid name." });
    }
    if (updates.name !== undefined) updates.name = updates.name.trim();

    if (updates.email !== undefined && (typeof updates.email !== "string" || updates.email.trim().length > 254)) {
      return res.status(400).json({ success: false, message: "Invalid email." });
    }
    if (updates.email !== undefined) updates.email = updates.email.trim();

    if (updates.phone !== undefined && (typeof updates.phone !== "string" || updates.phone.trim().length > 40)) {
      return res.status(400).json({ success: false, message: "Invalid phone." });
    }
    if (updates.phone !== undefined) updates.phone = updates.phone.trim();

    if (updates.experience !== undefined && (typeof updates.experience !== "number" || updates.experience < 0)) {
      return res.status(400).json({ success: false, message: "Invalid experience." });
    }

    if (updates.rating !== undefined && (typeof updates.rating !== "number" || updates.rating < 0 || updates.rating > 5)) {
      return res.status(400).json({ success: false, message: "Invalid rating." });
    }

    for (const field of ["clinic", "address", "city", "image"]) {
      if (updates[field] !== undefined && typeof updates[field] !== "string") {
        return res.status(400).json({ success: false, message: `Invalid ${field}.` });
      }
    }

    for (const field of ["specialization", "qualifications", "availability"]) {
      if (updates[field] !== undefined && !Array.isArray(updates[field])) {
        return res.status(400).json({ success: false, message: `Invalid ${field}.` });
      }
    }

    const veterinarian = await Veterinarian.findByIdAndUpdate(
      req.params.id,
      updates,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!veterinarian) {
      return res.status(404).json({
        success: false,
        message: "Veterinarian not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Veterinarian updated successfully.",
      veterinarian,
    });
  } catch (error) {
    console.error("Update Veterinarian Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ========================================
// Delete Veterinarian
// ========================================
exports.deleteVeterinarian = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid veterinarian ID." });
    }

    const veterinarian = await Veterinarian.findByIdAndDelete(req.params.id);

    if (!veterinarian) {
      return res.status(404).json({
        success: false,
        message: "Veterinarian not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Veterinarian deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Veterinarian Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};