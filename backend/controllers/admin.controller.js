const User = require("../models/User");
const Pet = require("../models/Pet");
const Adoption = require("../models/Adoption");
const LostFound = require("../models/LostFound");
const CommunityPost = require("../models/CommunityPost");
const {
  isValidObjectId,
  LOST_FOUND_TYPES,
  LOST_FOUND_STATUSES,
} = require("../utils/validation");

const ADMIN_USER_FIELDS =
  "-password -resetPasswordToken -resetPasswordExpire -emailVerificationToken -emailVerificationExpire";

// ==========================
// Admin Dashboard Statistics
// ==========================
exports.getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalPets,
      availablePets,
      adoptedPets,
      pendingAdoptions,
      lostFoundReports,
    ] = await Promise.all([
      User.countDocuments(),
      Pet.countDocuments(),
      Pet.countDocuments({ status: "available" }),
      Pet.countDocuments({ adopted: true }),
      Adoption.countDocuments({ status: "Pending" }),
      LostFound.countDocuments({ status: "active" }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalPets,
        availablePets,
        adoptedPets,
        pendingAdoptions,
        lostFoundReports,
      },
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Get All Users
// ==========================
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select(ADMIN_USER_FIELDS)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Get Users Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Block / Unblock User
// ==========================
exports.toggleUserBlock = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    user.isBlocked = !user.isBlocked;

    await user.save();

    res.status(200).json({
      success: true,
      message: user.isBlocked
        ? "User blocked successfully."
        : "User unblocked successfully.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isBlocked: user.isBlocked,
      },
    });
  } catch (error) {
    console.error("Toggle User Block Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Delete User
// ==========================
exports.deleteUser = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "User deleted successfully.",
    });
  } catch (error) {
    console.error("Delete User Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Get All Pets
// ==========================
exports.getAllPets = async (req, res) => {
  try {
    const pets = await Pet.find()
      .populate("owner", "name email")
      .populate("breed", "name species")
      .sort({ createdAt: -1 });

    const petList = pets.map((pet) => ({
      id: pet._id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed ? pet.breed.name : "",
      age: pet.age,
      gender: pet.gender,
      status: pet.status,
      adopted: pet.adopted,
      vaccinated: pet.vaccinated,
      location: pet.location,
      owner: pet.owner ? { id: pet.owner._id, name: pet.owner.name, email: pet.owner.email } : null,
      createdAt: pet.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: petList.length,
      pets: petList,
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
// Delete Pet
// ==========================
exports.deletePet = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid pet ID." });
    }

    const pet = await Pet.findByIdAndDelete(req.params.id);

    if (!pet) {
      return res.status(404).json({
        success: false,
        message: "Pet not found.",
      });
    }

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
// Get Recent Users
// ==========================
exports.getRecentUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select(ADMIN_USER_FIELDS)
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Recent Users Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Get All Lost & Found Reports
// ==========================
exports.getAllLostFoundReports = async (req, res) => {
  try {
    const { type, status } = req.query;

    const query = {};
    if (type !== undefined && type !== null && type !== "") {
      if (!LOST_FOUND_TYPES.includes(String(type).toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid type." });
      }
      query.type = String(type).toLowerCase();
    }
    if (status !== undefined && status !== null && status !== "") {
      if (!LOST_FOUND_STATUSES.includes(String(status).toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid status." });
      }
      query.status = String(status).toLowerCase();
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
    console.error("Get All Lost & Found Reports Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Update Lost & Found Report Status
// ==========================
exports.updateLostFoundStatus = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid report ID." });
    }

    const { status } = req.body;

    if (!["active", "resolved"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'active' or 'resolved'.",
      });
    }

    const report = await LostFound.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).populate("user", "name email phone");

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Report status updated successfully.",
      report,
    });
  } catch (error) {
    console.error("Update Report Status Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Delete Lost & Found Report (Admin)
// ==========================
exports.deleteLostFoundReport = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid report ID." });
    }

    const report = await LostFound.findByIdAndDelete(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
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

// ==========================
// Get All Community Posts (Admin)
// ==========================
exports.getAllCommunityPosts = async (req, res) => {
  try {
    const posts = await CommunityPost.find()
      .populate("user", "name email avatar")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: posts.length,
      posts,
    });
  } catch (error) {
    console.error("Get All Community Posts Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Update Community Post Status (Admin)
// ==========================
exports.updateCommunityPostStatus = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid post ID." });
    }

    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean.",
      });
    }

    const post = await CommunityPost.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true, runValidators: true }
    ).populate("user", "name email avatar");

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Post status updated successfully.",
      post,
    });
  } catch (error) {
    console.error("Update Community Post Status Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Delete Community Post (Admin)
// ==========================
exports.deleteCommunityPost = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid post ID." });
    }

    const post = await CommunityPost.findByIdAndDelete(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Post deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Community Post Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};