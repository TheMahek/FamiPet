const Adoption = require("../models/Adoption");
const Pet = require("../models/Pet");
const notificationService = require("../services/notification.service");
const {
  isValidObjectId,
  ADOPTION_STATUSES,
} = require("../utils/validation");

exports.getAllAdoptions = async (req, res) => {
  try {
    const adoptions = await Adoption.find()
      .populate("pet", "name species images owner status")
      .populate("user", "name email phone")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: adoptions.length, adoptions });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getMyAdoptions = async (req, res) => {
  try {
    const adoptions = await Adoption.find({ user: req.user._id })
      .populate("pet", "name species images status")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: adoptions.length, adoptions });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.createAdoption = async (req, res) => {
  try {
    const {
      pet, fullName, phone, address,
      occupation, experienceWithPets, reasonForAdoption,
    } = req.body;

    if (!pet || !fullName || !phone || !address || !reasonForAdoption) {
      return res.status(400).json({
        success: false,
        message: "Pet, full name, phone, address and reason for adoption are required.",
      });
    }

    if (!isValidObjectId(pet)) {
      return res.status(400).json({ success: false, message: "Invalid pet ID." });
    }

    // -------------------------------------------------
    // STRING LENGTH VALIDATION
    // -------------------------------------------------

    const lengthLimits = [
      ["fullName", 100],
      ["phone", 40],
      ["address", 300],
      ["occupation", 100],
      ["experienceWithPets", 300],
      ["reasonForAdoption", 1000],
    ];

    for (const [field, max] of lengthLimits) {
      const value = req.body[field];
      if (value !== undefined && value !== null && typeof value !== "string") {
        return res.status(400).json({ success: false, message: `Invalid ${field}.` });
      }
      if (typeof value === "string" && value.trim().length > max) {
        return res.status(400).json({ success: false, message: `Invalid ${field}.` });
      }
    }

    const petExists = await Pet.findById(pet);
    if (!petExists) {
      return res.status(404).json({ success: false, message: "Pet not found." });
    }

    if (petExists.status !== "available" || petExists.adopted) {
      return res.status(400).json({
        success: false,
        message: "This pet is not currently available for adoption.",
      });
    }

    const existing = await Adoption.findOne({
      pet,
      user: req.user._id,
      status: "Pending",
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending adoption request for this pet.",
      });
    }

    const adoption = await Adoption.create({
      pet,
      user: req.user._id,
      fullName: String(fullName).trim(),
      phone: String(phone).trim(),
      address: String(address).trim(),
      occupation: occupation ? String(occupation).trim() : "",
      experienceWithPets: experienceWithPets ? String(experienceWithPets).trim() : "",
      reasonForAdoption: String(reasonForAdoption).trim(),
    });

    res.status(201).json({
      success: true,
      message: "Adoption request submitted successfully.",
      adoption,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.updateAdoptionStatus = async (req, res) => {
  try {
    const allowed = ADOPTION_STATUSES;
    const { status } = req.body;

    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Pending, Approved or Rejected.",
      });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid adoption request ID." });
    }

    const adoption = await Adoption.findById(req.params.id)
      .populate("pet", "name status adopted");

    if (!adoption) {
      return res.status(404).json({
        success: false,
        message: "Adoption request not found.",
      });
    }

    adoption.status = status;
    await adoption.save();

    if (status === "Approved") {
      await Pet.findByIdAndUpdate(adoption.pet._id, {
        adopted: true,
        status: "adopted",
      });
    }

    await notificationService.createNotification({
      user: adoption.user,
      type: "adoption",
      category: "adoption",
      title: `Adoption Request ${status}`,
      message: `Your adoption request for ${adoption.pet.name} is now ${status.toLowerCase()}.`,
      priority: status === "Approved" ? "high" : "normal",
      referenceType: "adoption",
      referenceId: adoption._id,
      metadata: {
        adoptionStatus: status,
        petName: adoption.pet.name,
        petId: adoption.pet._id,
      },
      dedupKey: `adoption-status-${adoption._id}-${status.toLowerCase()}`,
    });

    res.json({
      success: true,
      message: "Adoption status updated successfully.",
      adoption,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteAdoption = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid adoption request ID." });
    }

    const adoption = await Adoption.findByIdAndDelete(req.params.id);

    if (!adoption) {
      return res.status(404).json({
        success: false,
        message: "Adoption request not found.",
      });
    }

    res.json({
      success: true,
      message: "Adoption request deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
