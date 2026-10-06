const User = require("../models/User");
const Pet = require("../models/Pet");
const { isValidObjectId } = require("../utils/validation");
const {
  detectImageType,
  isCloudinaryConfigured,
  uploadImageToCloudinary,
  uploadImageToLocal,
  deleteStoredImage,
} = require("../utils/imageUpload");

const PUBLIC_USER_FIELDS =
  "-password -resetPasswordToken -resetPasswordExpire -emailVerificationToken -emailVerificationExpire";

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select(PUBLIC_USER_FIELDS)
      .sort({ createdAt: -1 });

    res.json({ success: true, count: users.length, users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getUserById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    // Users may only fetch their own profile (admins may fetch any profile).
    if (req.params.id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const user = await User.findById(req.params.id)
      .select(PUBLIC_USER_FIELDS)
      .populate("pets")
      .populate("favorites");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.toggleFavorite = async (req, res) => {
  try {
    const { petId } = req.params;

    if (!isValidObjectId(petId)) {
      return res.status(400).json({ success: false, message: "Invalid pet ID." });
    }

    const petExists = await Pet.exists({ _id: petId });
    if (!petExists) {
      return res.status(404).json({ success: false, message: "Pet not found." });
    }

    const user = await User.findById(req.user._id);
    const index = user.favorites.findIndex((id) => id.toString() === petId);

    if (index === -1) {
      user.favorites.push(petId);
    } else {
      user.favorites.splice(index, 1);
    }

    await user.save();

    res.json({
      success: true,
      favorites: user.favorites,
      isFavorite: index === -1,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Avatar image is required." });
    }

    // Validate actual image content via magic bytes. The MIME type and
    // extension are attacker-controlled; content is the source of truth.
    const imageType = detectImageType(req.file.buffer);
    if (!imageType) {
      return res.status(400).json({ success: false, message: "File is not a valid image." });
    }

    let avatarUrl;

    if (isCloudinaryConfigured()) {
      const result = await uploadImageToCloudinary(req.file.buffer, "animal-planet/avatars");
      avatarUrl = result.url;
    } else {
      // Safe local fallback: server-generated filename with an image
      // extension that matches the detected content type.
      const local = uploadImageToLocal(req.file.buffer, imageType);
      avatarUrl = `${req.protocol}://${req.get("host")}/uploads/${local.filename}`;
    }

    // Keep the old avatar so a failed DB update never orphans it.
    const current = await User.findById(req.user._id).select("avatar");

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: avatarUrl },
      { new: true }
    ).select(PUBLIC_USER_FIELDS);

    // New avatar persisted: remove the previous asset (best effort).
    if (current && current.avatar && current.avatar !== avatarUrl) {
      deleteStoredImage(current.avatar);
    }

    res.json({ success: true, avatar: avatarUrl, user });
  } catch (error) {
    console.error("Avatar Upload Error:", error.message);
    res.status(500).json({ success: false, message: "Image upload failed." });
  }
};
