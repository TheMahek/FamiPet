const Vaccination = require("../models/Vaccination");
const Pet = require("../models/Pet");
const {
  isValidObjectId,
  VACCINATION_STATUSES,
} = require("../utils/validation");

exports.getVaccinations = async (req, res) => {
  try {
    const vaccinations = await Vaccination.find({ user: req.user._id })
      .populate("pet", "name species images")
      .sort({ vaccinationDate: -1 });

    res.json({ success: true, count: vaccinations.length, vaccinations });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getUpcomingVaccinations = async (req, res) => {
  try {
    const upcoming = await Vaccination.find({
      user: req.user._id,
      nextDueDate: { $gte: new Date() },
      status: "Pending",
    })
      .populate("pet", "name species images")
      .sort({ nextDueDate: 1 });

    res.json({ success: true, count: upcoming.length, upcoming });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.createVaccination = async (req, res) => {
  try {
    const { pet, vaccineName, vaccinationDate, nextDueDate } = req.body;

    if (!pet || !vaccineName || !vaccinationDate || !nextDueDate) {
      return res.status(400).json({
        success: false,
        message: "Pet, vaccine name, vaccination date and next due date are required.",
      });
    }

    if (!isValidObjectId(pet)) {
      return res.status(400).json({ success: false, message: "Invalid pet ID." });
    }

    if (typeof vaccineName !== "string" || vaccineName.trim().length > 200) {
      return res.status(400).json({ success: false, message: "Invalid vaccine name." });
    }

    const vaccinationDateObj = new Date(vaccinationDate);
    const nextDueDateObj = new Date(nextDueDate);
    if (Number.isNaN(vaccinationDateObj.getTime()) || Number.isNaN(nextDueDateObj.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid vaccination date." });
    }

    let doseNumber = 1;
    if (req.body.doseNumber !== undefined && req.body.doseNumber !== null && req.body.doseNumber !== "") {
      doseNumber = Number(req.body.doseNumber);
      if (Number.isNaN(doseNumber) || doseNumber < 1) {
        return res.status(400).json({ success: false, message: "Invalid dose number." });
      }
    }

    const petExists = await Pet.findOne({ _id: pet, owner: req.user._id });
    if (!petExists) {
      return res.status(404).json({
        success: false,
        message: "Pet not found or not owned by you.",
      });
    }

    // Build the record from an explicit allowlist only.
    const vaccination = await Vaccination.create({
      user: req.user._id,
      pet,
      vaccineName: vaccineName.trim(),
      doseNumber,
      vaccinationDate: vaccinationDateObj,
      nextDueDate: nextDueDateObj,
      veterinarian: typeof req.body.veterinarian === "string" ? req.body.veterinarian.slice(0, 200) : "",
      hospital: typeof req.body.hospital === "string" ? req.body.hospital.slice(0, 200) : "",
      notes: typeof req.body.notes === "string" ? req.body.notes.slice(0, 1000) : "",
    });

    res.status(201).json({
      success: true,
      message: "Vaccination added successfully.",
      vaccination,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.updateVaccination = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid vaccination ID." });
    }

    const vaccination = await Vaccination.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!vaccination) {
      return res.status(404).json({
        success: false,
        message: "Vaccination record not found.",
      });
    }

    // Only editable content fields are accepted. user and pet are protected.
    const allowedFields = [
      "vaccineName",
      "doseNumber",
      "vaccinationDate",
      "nextDueDate",
      "veterinarian",
      "hospital",
      "notes",
      "status",
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

    if (updates.vaccineName !== undefined && (typeof updates.vaccineName !== "string" || updates.vaccineName.trim().length > 200)) {
      return res.status(400).json({ success: false, message: "Invalid vaccine name." });
    }
    if (updates.vaccineName !== undefined) updates.vaccineName = updates.vaccineName.trim();

    if (updates.doseNumber !== undefined) {
      const dose = Number(updates.doseNumber);
      if (Number.isNaN(dose) || dose < 1) {
        return res.status(400).json({ success: false, message: "Invalid dose number." });
      }
      updates.doseNumber = dose;
    }

    for (const dateField of ["vaccinationDate", "nextDueDate"]) {
      if (updates[dateField] !== undefined) {
        const d = new Date(updates[dateField]);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ success: false, message: `Invalid ${dateField}.` });
        }
        updates[dateField] = d;
      }
    }

    for (const field of ["veterinarian", "hospital"]) {
      if (updates[field] !== undefined) {
        if (typeof updates[field] !== "string") {
          return res.status(400).json({ success: false, message: `Invalid ${field}.` });
        }
        updates[field] = updates[field].slice(0, 200);
      }
    }

    if (updates.notes !== undefined) {
      if (typeof updates.notes !== "string") {
        return res.status(400).json({ success: false, message: "Invalid notes." });
      }
      updates.notes = updates.notes.slice(0, 1000);
    }

    if (updates.status !== undefined && !VACCINATION_STATUSES.includes(updates.status)) {
      return res.status(400).json({ success: false, message: "Invalid status." });
    }

    Object.assign(vaccination, updates);
    await vaccination.save();

    res.json({
      success: true,
      message: "Vaccination updated successfully.",
      vaccination,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteVaccination = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid vaccination ID." });
    }

    const vaccination = await Vaccination.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!vaccination) {
      return res.status(404).json({
        success: false,
        message: "Vaccination record not found.",
      });
    }

    res.json({ success: true, message: "Vaccination deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};