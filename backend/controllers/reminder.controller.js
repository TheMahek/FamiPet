const mongoose = require("mongoose");
const Reminder = require("../models/Reminder");
const Pet = require("../models/Pet");

exports.getReminders = async (req, res) => {
  try {
    const reminders = await Reminder.find({
      user: req.user._id,
      isActive: true,
    })
      .populate("pet", "name species images")
      .sort({ date: 1, time: 1 });

    res.json({ success: true, count: reminders.length, reminders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createReminder = async (req, res) => {
  try {
    const { title, type, date, time, pet } = req.body;

    if (!title || !type || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "Title, type, date and time are required.",
      });
    }

    if (pet) {
      const petExists = await Pet.findOne({ _id: pet, owner: req.user._id });
      if (!petExists) {
        return res.status(404).json({
          success: false,
          message: "Pet not found or not owned by you.",
        });
      }
    }

    const reminder = await Reminder.create({
      ...req.body,
      user: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Reminder created successfully.",
      reminder,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateReminder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reminder ID." });
    }

    const reminder = await Reminder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({ success: false, message: "Reminder not found." });
    }

    delete req.body.user;
    delete req.body.pet;
    Object.assign(reminder, req.body);
    await reminder.save();

    res.json({
      success: true,
      message: "Reminder updated successfully.",
      reminder,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.completeReminder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reminder ID." });
    }

    const reminder = await Reminder.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isCompleted: true },
      { new: true, runValidators: true }
    );

    if (!reminder) {
      return res.status(404).json({ success: false, message: "Reminder not found." });
    }

    res.json({
      success: true,
      message: "Reminder completed.",
      reminder,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteReminder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reminder ID." });
    }

    const reminder = await Reminder.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({ success: false, message: "Reminder not found." });
    }

    res.json({ success: true, message: "Reminder deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
