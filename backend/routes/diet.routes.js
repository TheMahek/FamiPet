const express = require("express");
const router = express.Router();
const {
  getDiets,
  getPetDiet,
  upsertPetDiet,
  deletePetDiet,
} = require("../controllers/diet.controller");
const { protect } = require("../middleware/auth");

router.get("/", protect, getDiets);
router.get("/:petId", protect, getPetDiet);
router.put("/:petId", protect, upsertPetDiet);
router.delete("/:petId", protect, deletePetDiet);

module.exports = router;