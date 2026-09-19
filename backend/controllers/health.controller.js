const HealthRecord = require("../models/HealthRecord");
const Pet = require("../models/Pet");
const { isValidObjectId } = require("../utils/validation");

exports.getHealthRecords = async (req, res) => {
  try {
    const records = await HealthRecord.find({ user: req.user._id })
      .populate("pet", "name species images")
      .sort({ visitDate: -1 });

    res.json({ success: true, count: records.length, records });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getHealthRecordById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid health record ID." });
    }

    const record = await HealthRecord.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate("pet", "name species images");

    if (!record) {
      return res.status(404).json({ success: false, message: "Health record not found." });
    }

    res.json({ success: true, record });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.createHealthRecord = async (req, res) => {
  try {
    const { pet, diagnosis } = req.body;

    if (!pet || !diagnosis) {
      return res.status(400).json({
        success: false,
        message: "Pet and diagnosis are required.",
      });
    }

    if (!isValidObjectId(pet)) {
      return res.status(400).json({ success: false, message: "Invalid pet ID." });
    }

    if (typeof diagnosis !== "string" || diagnosis.trim().length > 500) {
      return res.status(400).json({ success: false, message: "Invalid diagnosis." });
    }

    const petExists = await Pet.findOne({ _id: pet, owner: req.user._id });
    if (!petExists) {
      return res.status(404).json({
        success: false,
        message: "Pet not found or not owned by you.",
      });
    }

    // Build the record from an explicit allowlist only.
    const record = await HealthRecord.create({
      user: req.user._id,
      pet,
      diagnosis: diagnosis.trim(),
      treatment: typeof req.body.treatment === "string" ? req.body.treatment.slice(0, 1000) : "",
      doctor: typeof req.body.doctor === "string" ? req.body.doctor.slice(0, 200) : "",
      hospital: typeof req.body.hospital === "string" ? req.body.hospital.slice(0, 200) : "",
      prescription: typeof req.body.prescription === "string" ? req.body.prescription.slice(0, 1000) : "",
      visitDate: req.body.visitDate ? new Date(req.body.visitDate) : Date.now(),
      nextVisit: req.body.nextVisit ? new Date(req.body.nextVisit) : undefined,
      notes: typeof req.body.notes === "string" ? req.body.notes.slice(0, 1000) : "",
    });

    res.status(201).json({
      success: true,
      message: "Health record created successfully.",
      record,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.updateHealthRecord = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid health record ID." });
    }

    const record = await HealthRecord.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!record) {
      return res.status(404).json({ success: false, message: "Health record not found." });
    }

    // Only editable content fields are accepted. user and pet are protected.
    const allowedFields = [
      "diagnosis",
      "treatment",
      "doctor",
      "hospital",
      "prescription",
      "visitDate",
      "nextVisit",
      "notes",
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

    for (const [field, max] of [
      ["diagnosis", 500],
      ["treatment", 1000],
      ["doctor", 200],
      ["hospital", 200],
      ["prescription", 1000],
      ["notes", 1000],
    ]) {
      if (updates[field] !== undefined) {
        if (typeof updates[field] !== "string" || updates[field].trim().length > max) {
          return res.status(400).json({ success: false, message: `Invalid ${field}.` });
        }
        updates[field] = updates[field].trim();
      }
    }

    for (const dateField of ["visitDate", "nextVisit"]) {
      if (updates[dateField] !== undefined) {
        const d = new Date(updates[dateField]);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ success: false, message: `Invalid ${dateField}.` });
        }
        updates[dateField] = d;
      }
    }

    Object.assign(record, updates);
    await record.save();

    res.json({
      success: true,
      message: "Health record updated successfully.",
      record,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteHealthRecord = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid health record ID." });
    }

    const record = await HealthRecord.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!record) {
      return res.status(404).json({ success: false, message: "Health record not found." });
    }

    res.json({ success: true, message: "Health record deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
