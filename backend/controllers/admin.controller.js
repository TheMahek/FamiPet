const User = require("../models/User");
const Pet = require("../models/Pet");
const Adoption = require("../models/Adoption");
const LostFound = require("../models/LostFound");

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
      .select("-password -resetPasswordToken -resetPasswordExpire -emailVerificationToken")
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
      .select("-password -resetPasswordToken -resetPasswordExpire -emailVerificationToken")
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