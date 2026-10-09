const mongoose = require("mongoose");
const Adoption = require("../models/Adoption");
const Pet = require("../models/Pet");
const { createNotification } = require("../services/notification.service");
const logger = require("../utils/logger");

// Used when an admin approves an application without a message. Kept on the
// application record and shown to the applicant, never silently discarded.
const GENERIC_ACCEPTANCE_MESSAGE =
  "Your adoption application has been approved. Please contact the pet owner for the next steps.";

exports.getAllAdoptions = async (req, res) => {
  try {
    const adoptions = await Adoption.find()
      .populate("pet", "name species images owner status")
      .populate("user", "name email phone")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: adoptions.length, adoptions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyAdoptions = async (req, res) => {
  try {
    const adoptions = await Adoption.find({ user: req.user._id })
      .populate("pet", "name species images status")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: adoptions.length, adoptions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    if (!mongoose.Types.ObjectId.isValid(pet)) {
      return res.status(400).json({ success: false, message: "Invalid pet ID." });
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

    // A user cannot request to adopt their own pet.
    if (petExists.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot adopt your own pet.",
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
      fullName,
      phone,
      address,
      occupation: occupation || "",
      experienceWithPets: experienceWithPets || "",
      reasonForAdoption,
    });

    // Notify the pet owner that a new adoption request was submitted.
    try {
      await createNotification({
        user: petExists.owner,
        title: "New Adoption Request",
        message: `${fullName} has submitted an adoption request for your pet ${petExists.name}.`,
        type: "adoption",
        url: "/app/adoption",
      });
    } catch (notifyError) {
      logger.error("Adoption owner notification error:", notifyError);
    }

    res.status(201).json({
      success: true,
      message: "Adoption request submitted successfully.",
      adoption,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateAdoptionStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid adoption request ID.",
      });
    }

    const allowed = ["Pending", "Approved", "Rejected"];
    const { status } = req.body;

    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Pending, Approved or Rejected.",
      });
    }

    // A rejected application always carries the admin's reason. Refusing to
    // accept a reason here stops an approval/rejection from silently
    // discarding the message the reviewer meant to send.
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (status === "Rejected" && !reason) {
      return res.status(400).json({
        success: false,
        message: "A rejection reason is required.",
      });
    }

    const adoption = await Adoption.findById(req.params.id)
      .populate("pet", "name status adopted owner");

    if (!adoption) {
      return res.status(404).json({
        success: false,
        message: "Adoption request not found.",
      });
    }

    // Approved requests are terminal: the pet is marked adopted and
    // cannot be rolled back to Pending/Rejected.
    if (adoption.status === "Approved" && status !== "Approved") {
      return res.status(400).json({
        success: false,
        message: "An already approved adoption request cannot be changed.",
      });
    }

    const pet = adoption.pet;

    if (status === "Approved") {
      const alreadyAdopted =
        pet && (pet.adopted === true || pet.status === "adopted");
      if (alreadyAdopted) {
        return res.status(400).json({
          success: false,
          message: "This pet has already been adopted.",
        });
      }

      adoption.status = status;
      adoption.acceptanceMessage = message || GENERIC_ACCEPTANCE_MESSAGE;
      await adoption.save();

      await Pet.findByIdAndUpdate(pet._id, {
        adopted: true,
        status: "adopted",
      });

      // Reject every other pending request for the same pet so only one
      // request can ever be approved.
      await Adoption.updateMany(
        {
          pet: pet._id,
          _id: { $ne: adoption._id },
          status: "Pending",
        },
        { status: "Rejected" }
      );
    } else {
      adoption.status = status;
      adoption.rejectionReason = reason;
      await adoption.save();
    }

    const statusMessage =
      status === "Approved"
        ? (adoption.acceptanceMessage || GENERIC_ACCEPTANCE_MESSAGE)
        : `Your adoption request for ${pet ? pet.name : "this pet"} is now ${status.toLowerCase()}.${
            reason ? ` Reason: ${reason}` : ""
          }`;

    await createNotification({
      user: adoption.user,
      title: `Adoption Request ${status}`,
      message: statusMessage,
      type: "adoption",
      url: "/app/adoption",
    });

    res.json({
      success: true,
      message: "Adoption status updated successfully.",
      adoption,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteAdoption = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid adoption request ID.",
      });
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
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.withdrawOwnAdoption = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid adoption request ID.",
      });
    }

    const adoption = await Adoption.findOne({
      _id: req.params.id,
      user: req.user._id,
      status: "Pending",
    });

    if (!adoption) {
      return res.status(404).json({
        success: false,
        message: "Adoption request not found or cannot be withdrawn.",
      });
    }

    // Withdrawal is a terminal state, not a deletion: the applicant keeps a
    // visible "Withdrawn" record, and can re-apply for the same pet because
    // duplicate protection only blocks other "Pending" requests.
    adoption.status = "Withdrawn";
    await adoption.save();

    res.json({
      success: true,
      message: "Adoption request withdrawn successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
