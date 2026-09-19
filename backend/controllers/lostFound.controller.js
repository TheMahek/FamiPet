const LostFound = require("../models/LostFound");
const {
  isValidObjectId,
  escapeRegExp,
  stringOrUndefined,
  MAX_SEARCH_LENGTH,
  SPECIES,
  LOST_FOUND_TYPES,
  LOST_FOUND_GENDERS,
} = require("../utils/validation");
const {
  storeImageFile,
  deleteStoredImage,
  isSafeImageValue,
  MAX_IMAGE_STR_LENGTH,
} = require("../utils/imageUpload");

// =====================================================
// GET ALL LOST & FOUND REPORTS
// =====================================================

exports.getAllReports = async (req, res) => {
  try {
    const { type, status, species, search } = req.query;

    const query = {};

    if (type !== undefined) {
      const t = stringOrUndefined(type);
      if (t === undefined || !LOST_FOUND_TYPES.includes(t.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid type." });
      }
      query.type = t.toLowerCase();
    }

    if (status !== undefined) {
      const st = stringOrUndefined(status);
      if (st === undefined || !["active", "resolved"].includes(st.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid status." });
      }
      query.status = st.toLowerCase();
    }

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
        const rx = new RegExp(escapeRegExp(term), "i");
        query.$or = [
          { petName: rx },
          { location: rx },
          { description: rx },
          { breed: rx },
        ];
      }
    }

    const reports = await LostFound.find(query)
      .populate("user", "name email phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (error) {
    console.error("Get All Reports Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// =====================================================
// GET SINGLE REPORT
// =====================================================

exports.getReportById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report ID.",
      });
    }

    const report = await LostFound.findById(req.params.id).populate(
      "user",
      "name email phone"
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    console.error("Get Report Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// =====================================================
// CREATE LOST / FOUND REPORT
// =====================================================

exports.createReport = async (req, res) => {
  try {
    const {
      type,
      petName,
      species,
      breed,
      age,
      gender,
      color,
      description,
      location,
      date,
      contactName,
      contactPhone,
      images,
    } = req.body;

    // Required fields
    if (
      !type ||
      !petName ||
      !species ||
      !description ||
      !location ||
      !date ||
      !contactName ||
      !contactPhone
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Type, pet name, species, description, location, date, contact name and contact phone are required.",
      });
    }

    // -------------------------------------------------
    // TYPE / ENUM / LENGTH / DATE VALIDATION
    // -------------------------------------------------

    if (typeof type !== "string" || !LOST_FOUND_TYPES.includes(String(type).toLowerCase())) {
      return res.status(400).json({ success: false, message: "Invalid type." });
    }

    if (typeof petName !== "string" || petName.trim().length > 100) {
      return res.status(400).json({ success: false, message: "Invalid pet name." });
    }

    if (typeof species !== "string" || !SPECIES.includes(String(species).toLowerCase())) {
      return res.status(400).json({ success: false, message: "Invalid species." });
    }

    if (gender !== undefined && gender !== null && gender !== "") {
      if (typeof gender !== "string" || !LOST_FOUND_GENDERS.includes(String(gender).toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid gender." });
      }
    }

    for (const [field, max] of [
      ["breed", 100],
      ["color", 100],
      ["description", 2000],
      ["location", 300],
      ["contactName", 100],
      ["contactPhone", 40],
      ["age", 30],
    ]) {
      if (req.body[field] !== undefined && req.body[field] !== null && typeof req.body[field] !== "string") {
        return res.status(400).json({ success: false, message: `Invalid ${field}.` });
      }
      if (typeof req.body[field] === "string" && req.body[field].trim().length > max) {
        return res.status(400).json({ success: false, message: `Invalid ${field}.` });
      }
    }

    const reportDate = new Date(date);
    if (Number.isNaN(reportDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date." });
    }

    // -------------------------------------------------
    // IMAGE HANDLING
    // -------------------------------------------------
    // Supports the frontend's two existing flows:
    //   1. multipart file (rare) -> stored server-side (Cloudinary / local)
    //   2. body images array of base64 dataURLs / app-generated URLs
    // Arbitrary non-image payloads are rejected.

    let finalImages = [];

    if (req.file) {
      const stored = await storeImageFile(req.file.buffer, "animal-planet/lost-found");
      if (stored.invalid) {
        return res.status(400).json({ success: false, message: "File is not a valid image." });
      }
      finalImages.push(
        stored.url
          ? stored.url
          : `${req.protocol}://${req.get("host")}/uploads/${stored.filename}`
      );
    } else if (Array.isArray(images) && images.length > 0) {
      const cleaned = images.slice(0, 10);
      if (!cleaned.every(isSafeImageValue)) {
        return res.status(400).json({ success: false, message: "Invalid images." });
      }
      finalImages = cleaned.map((u) => u.slice(0, MAX_IMAGE_STR_LENGTH));
    }

    const report = await LostFound.create({
      user: req.user.id,
      type: String(type).toLowerCase(),
      petName: petName.trim(),
      species: String(species).toLowerCase(),
      breed: req.body.breed || "",
      age: req.body.age || "",
      gender: gender ? String(gender).toLowerCase() : "unknown",
      color: req.body.color || "",
      description: description.trim(),
      location: location.trim(),
      date: reportDate,
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      images: finalImages,
    });

    res.status(201).json({
      success: true,
      message: "Lost & Found report created successfully.",
      report,
    });
  } catch (error) {
    console.error("Create Report Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// =====================================================
// UPDATE REPORT
// =====================================================

exports.updateReport = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report ID.",
      });
    }

    const report = await LostFound.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    // Only report owner can update
    if (report.user.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this report.",
      });
    }

    // -------------------------------------------------
    // ALLOWLIST: only user-editable report content is
    // accepted. user/status remain server/admin-controlled.
    // -------------------------------------------------

    const allowedFields = [
      "type",
      "petName",
      "species",
      "breed",
      "age",
      "gender",
      "color",
      "description",
      "location",
      "date",
      "contactName",
      "contactPhone",
      "images",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0 && !req.file) {
      return res.status(400).json({ success: false, message: "Nothing to update." });
    }

    if (updates.type !== undefined && (typeof updates.type !== "string" || !LOST_FOUND_TYPES.includes(String(updates.type).toLowerCase()))) {
      return res.status(400).json({ success: false, message: "Invalid type." });
    }
    if (updates.type !== undefined) updates.type = String(updates.type).toLowerCase();

    if (updates.petName !== undefined && (typeof updates.petName !== "string" || updates.petName.trim().length > 100)) {
      return res.status(400).json({ success: false, message: "Invalid pet name." });
    }
    if (updates.petName !== undefined) updates.petName = updates.petName.trim();

    if (updates.species !== undefined && (typeof updates.species !== "string" || !SPECIES.includes(String(updates.species).toLowerCase()))) {
      return res.status(400).json({ success: false, message: "Invalid species." });
    }
    if (updates.species !== undefined) updates.species = String(updates.species).toLowerCase();

    if (updates.gender !== undefined && updates.gender !== "") {
      if (typeof updates.gender !== "string" || !LOST_FOUND_GENDERS.includes(String(updates.gender).toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid gender." });
      }
      updates.gender = String(updates.gender).toLowerCase();
    }

    for (const [field, max] of [
      ["breed", 100],
      ["color", 100],
      ["age", 30],
      ["description", 2000],
      ["location", 300],
      ["contactName", 100],
      ["contactPhone", 40],
    ]) {
      if (updates[field] !== undefined) {
        if (typeof updates[field] !== "string" || updates[field].trim().length > max) {
          return res.status(400).json({ success: false, message: `Invalid ${field}.` });
        }
        updates[field] = updates[field].trim();
      }
    }

    if (updates.date !== undefined) {
      const d = new Date(updates.date);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid date." });
      }
      updates.date = d;
    }

    if (updates.images !== undefined && !Array.isArray(updates.images)) {
      return res.status(400).json({ success: false, message: "Invalid images." });
    }

    if (updates.images !== undefined && !updates.images.slice(0, 10).every(isSafeImageValue)) {
      return res.status(400).json({ success: false, message: "Invalid images." });
    }

    // Process a multipart file first: validate content and store it.
    let uploadedImageUrl = null;
    if (req.file) {
      const stored = await storeImageFile(req.file.buffer, "animal-planet/lost-found");
      if (stored.invalid) {
        return res.status(400).json({ success: false, message: "File is not a valid image." });
      }
      uploadedImageUrl = stored.url
        ? stored.url
        : `${req.protocol}://${req.get("host")}/uploads/${stored.filename}`;
    }

    Object.assign(report, updates);

    if (uploadedImageUrl) {
      if (Array.isArray(report.images)) {
        report.images.push(uploadedImageUrl);
      } else {
        report.images = [uploadedImageUrl];
      }
    }

    await report.save();

    res.status(200).json({
      success: true,
      message: "Report updated successfully.",
      report,
    });
  } catch (error) {
    console.error("Update Report Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// =====================================================
// DELETE REPORT
// =====================================================

exports.deleteReport = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report ID.",
      });
    }

    const report = await LostFound.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    // Owner OR admin can delete
    const isOwner =
      report.user.toString() === req.user.id.toString();

    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this report.",
      });
    }

    await report.deleteOne();

    // Remove stored images after a successful delete (best effort).
    if (Array.isArray(report.images)) {
      report.images.slice(0, 10).forEach((img) => deleteStoredImage(img));
    }

    res.status(200).json({
      success: true,
      message: "Report deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Report Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};