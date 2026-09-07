const mongoose = require("mongoose");
const Favorite = require("../models/Favorite");
const User = require("../models/User");
const Pet = require("../models/Pet");

exports.getFavorites = async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user._id })
      .populate("pet", "name species breed images description status")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: favorites.length, favorites });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addFavorite = async (req, res) => {
  try {
    const pet = req.body.pet;

    if (!pet || !mongoose.Types.ObjectId.isValid(pet)) {
      return res.status(400).json({ success: false, message: "Valid pet ID is required." });
    }

    const petExists = await Pet.findById(pet);
    if (!petExists) {
      return res.status(404).json({ success: false, message: "Pet not found." });
    }

    const favorite = await Favorite.findOneAndUpdate(
      { user: req.user._id, pet },
      { user: req.user._id, pet },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { favorites: pet },
    });

    res.status(201).json({
      success: true,
      message: "Pet added to favorites.",
      favorite,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.removeFavorite = async (req, res) => {
  try {
    const favorite = await Favorite.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!favorite) {
      return res.status(404).json({ success: false, message: "Favorite not found." });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { favorites: favorite.pet },
    });

    res.json({ success: true, message: "Favorite removed successfully." });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
