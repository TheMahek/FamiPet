// =====================================================
// PET SERVICE (Phase 10 AI Tool Layer)
// =====================================================
// The owned-pet operations shared by the HTTP controllers and the AI tool
// layer. Logic is extracted *verbatim* from pet.controller.js so both entry
// points run identical validation and business rules; the controller becomes
// a thin HTTP mapper and the tool layer becomes a thin caller. Every function
// derives the owning user from the authenticated caller — never from client
// input — and keeps the controller's existing strict allowlists/enum/length
// validation. No raw queries ever reach the model layer from tool input.

const Pet = require("../models/Pet");
const Breed = require("../models/Breed");
const QRCode = require("qrcode");
const notificationService = require("../services/notification.service");
const {
  isValidObjectId,
  escapeRegExp,
  SPECIES,
  GENDERS,
} = require("../utils/validation");
const { isSafeImageArray } = require("../utils/imageUpload");

/**
 * Shared owner gate: resolves a pet ONLY when it belongs to the caller.
 * Returns { ok:true, pet } or { ok:false, status, message }. Used by the pet
 * routes and reused by the diet/reminder services + the AI tool layer so the
 * authorization rule lives in exactly one place.
 */
const ownedPetResult = async ({ user, petId }) => {
  if (!isValidObjectId(petId)) {
    return { ok: false, status: 400, message: "Invalid pet ID." };
  }
  const pet = await Pet.findOne({ _id: petId, owner: user._id || user.id });
  if (!pet) {
    return { ok: false, status: 404, message: "Pet not found or not owned by you." };
  }
  return { ok: true, pet };
};

/**
 * List the authenticated user's own pets (identity of the owner comes from
 * the caller context, never from input).
 */
const listUserPets = async ({ user }) => {
  const pets = await Pet.find({ owner: user._id || user.id })
    .populate("breed", "name species")
    .sort({ createdAt: -1 });
  return { ok: true, status: 200, data: { count: pets.length, pets } };
};

/**
 * Fetch one pet ONLY when owned by the caller. Returns a not-found result
 * otherwise so callers cannot learn about other users' pets.
 */
const getOwnedPet = async ({ user, petId }) => {
  if (!isValidObjectId(petId)) {
    return { ok: false, status: 400, message: "Invalid pet ID." };
  }
  const pet = await Pet.findOne({ _id: petId, owner: user._id || user.id })
    .populate("breed", "name species")
    .lean();
  if (!pet) {
    return { ok: false, status: 404, message: "Pet not found or not owned by you." };
  }
  return { ok: true, status: 200, data: { pet } };
};

/**
 * Create a pet for the authenticated user. Mirrors pet.controller.createPet
 * validation + the QR / notification side effects.
 */
const createPetForUser = async ({ user, input }) => {
  const {
    breed,
    name,
    species,
    gender,
    age,
    weight,
    color,
    vaccinated,
    health,
    adopted,
    images,
    description,
  } = input;

  if (!breed || !name || !species || !gender || age === undefined) {
    return {
      ok: false,
      status: 400,
      message: "Breed, name, species, gender and age are required.",
    };
  }

  if (typeof name !== "string" || name.trim().length > 100) {
    return { ok: false, status: 400, message: "Invalid pet name." };
  }

  if (typeof species !== "string" || !SPECIES.includes(String(species).toLowerCase())) {
    return { ok: false, status: 400, message: "Invalid species." };
  }

  if (typeof gender !== "string" || !GENDERS.includes(String(gender).toLowerCase())) {
    return { ok: false, status: 400, message: "Invalid gender." };
  }

  const ageNum = typeof age === "string" && age.trim() !== "" ? Number(age) : age;
  if (typeof ageNum !== "number" || Number.isNaN(ageNum) || ageNum < 0) {
    return { ok: false, status: 400, message: "Invalid age." };
  }

  let weightNum = weight;
  if (weight !== undefined && weight !== null && weight !== "") {
    weightNum = typeof weight === "string" ? Number(weight) : weight;
    if (typeof weightNum !== "number" || Number.isNaN(weightNum) || weightNum < 0) {
      return { ok: false, status: 400, message: "Invalid weight." };
    }
  }

  if (color !== undefined && typeof color !== "string") {
    return { ok: false, status: 400, message: "Invalid color." };
  }

  if (health !== undefined && typeof health !== "string") {
    return { ok: false, status: 400, message: "Invalid health." };
  }

  if (description !== undefined && typeof description !== "string") {
    return { ok: false, status: 400, message: "Invalid description." };
  }

  if (images !== undefined) {
    if (!isSafeImageArray(images) || images.length > 10) {
      return { ok: false, status: 400, message: "Invalid images." };
    }
  }

  if (typeof breed !== "string") {
    return { ok: false, status: 400, message: "Invalid breed." };
  }

  let breedId = breed;
  if (!isValidObjectId(breed)) {
    const breedName = breed.trim();
    if (!breedName || breedName.length > 100) {
      return { ok: false, status: 400, message: "Breed is required." };
    }
    let breedDoc = await Breed.findOne({ name: new RegExp(`^${escapeRegExp(breedName)}$`, "i") });
    if (!breedDoc) {
      if (!SPECIES.includes(String(species).toLowerCase())) {
        return { ok: false, status: 400, message: "Invalid species." };
      }
      breedDoc = await Breed.create({ name: breedName, species: String(species).toLowerCase() });
    }
    breedId = breedDoc._id;
  }

  const pet = await Pet.create({
    owner: user._id || user.id,
    breed: breedId,
    name: name.trim(),
    species: String(species).toLowerCase(),
    gender: String(gender).toLowerCase(),
    age: ageNum,
    weight: weightNum === undefined ? 0 : weightNum,
    color: color !== undefined ? String(color).slice(0, 50) : "",
    vaccinated: vaccinated !== undefined ? Boolean(vaccinated) : false,
    health: health !== undefined ? String(health).slice(0, 300) : "Good",
    adopted: adopted !== undefined ? Boolean(adopted) : false,
    images: images !== undefined ? images : [],
    description: description !== undefined ? String(description).slice(0, 2000) : "",
  });

  try {
    const uniqueId = `${Date.now().toString(36)}-${pet._id.toString().slice(-8)}-${Math.floor(Math.random() * 10000)}`;
    const qrData = JSON.stringify({
      petId: pet._id,
      petUid: uniqueId,
      name: pet.name,
      species: pet.species,
      breed: pet.breed ? pet.breed : "",
    });

    const qrCodeDataUrl = await QRCode.toDataURL(qrData);

    pet.qrCode = qrCodeDataUrl;
    pet.petUid = uniqueId;
    await pet.save();
  } catch (qrError) {
    console.error("QR Generation Warning:", qrError);
  }

  await notificationService.createNotification({
    user: user._id || user.id,
    type: "pet",
    category: "pet",
    title: "Pet Added",
    message: `Your pet ${pet.name} has been added to your family.`,
    priority: "normal",
    referenceType: "pet",
    referenceId: pet._id,
    metadata: {
      petId: String(pet._id),
      petName: pet.name,
      species: pet.species,
    },
    dedupKey: `pet-created-${pet._id}`,
  });

  return { ok: true, status: 201, data: { pet } };
};

/**
 * Update one owned pet. Mirrors pet.controller.updatePet validation + the
 * owner gate (owner can only ever be the caller).
 */
const updatePetForUser = async ({ user, petId, input }) => {
  if (!isValidObjectId(petId)) {
    return { ok: false, status: 400, message: "Invalid pet ID." };
  }

  const allowedFields = [
    "breed",
    "name",
    "species",
    "gender",
    "age",
    "weight",
    "color",
    "vaccinated",
    "health",
    "images",
    "description",
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (input[field] !== undefined) {
      updates[field] = input[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, message: "Nothing to update." };
  }

  const pet = await Pet.findById(petId);
  if (!pet) {
    return { ok: false, status: 404, message: "Pet not found" };
  }

  if (pet.owner.toString() !== String(user._id || user.id)) {
    return { ok: false, status: 403, message: "You are not authorized to update this pet." };
  }

  if (updates.name !== undefined && (typeof updates.name !== "string" || updates.name.trim().length > 100)) {
    return { ok: false, status: 400, message: "Invalid pet name." };
  }

  if (updates.species !== undefined && (typeof updates.species !== "string" || !SPECIES.includes(String(updates.species).toLowerCase()))) {
    return { ok: false, status: 400, message: "Invalid species." };
  }

  if (updates.gender !== undefined && (typeof updates.gender !== "string" || !GENDERS.includes(String(updates.gender).toLowerCase()))) {
    return { ok: false, status: 400, message: "Invalid gender." };
  }

  if (updates.age !== undefined) {
    const ageNum = typeof updates.age === "string" ? Number(updates.age) : updates.age;
    if (typeof ageNum !== "number" || Number.isNaN(ageNum) || ageNum < 0) {
      return { ok: false, status: 400, message: "Invalid age." };
    }
    updates.age = ageNum;
  }

  if (updates.weight !== undefined) {
    const weightNum = typeof updates.weight === "string" ? Number(updates.weight) : updates.weight;
    if (typeof weightNum !== "number" || Number.isNaN(weightNum) || weightNum < 0) {
      return { ok: false, status: 400, message: "Invalid weight." };
    }
    updates.weight = weightNum;
  }

  for (const strField of ["color", "health", "description"]) {
    if (updates[strField] !== undefined && typeof updates[strField] !== "string") {
      return { ok: false, status: 400, message: `Invalid ${strField}.` };
    }
    if (typeof updates[strField] === "string") {
      updates[strField] = updates[strField].slice(0, strField === "description" ? 2000 : 300);
    }
  }

  if (updates.images !== undefined) {
    if (!isSafeImageArray(updates.images) || updates.images.length > 10) {
      return { ok: false, status: 400, message: "Invalid images." };
    }
  }

  if (input.breed !== undefined) {
    if (isValidObjectId(input.breed)) {
      updates.breed = input.breed;
    } else if (typeof input.breed === "string") {
      const breedName = input.breed.trim();
      if (!breedName) {
        return { ok: false, status: 400, message: "Invalid breed." };
      }
      let breedDoc = await Breed.findOne({ name: new RegExp(`^${escapeRegExp(breedName)}$`, "i") });
      if (!breedDoc) {
        const species = updates.species || pet.species || "dog";
        if (!SPECIES.includes(String(species).toLowerCase())) {
          return { ok: false, status: 400, message: "Invalid species." };
        }
        breedDoc = await Breed.create({ name: breedName, species });
      }
      updates.breed = breedDoc._id;
    } else {
      return { ok: false, status: 400, message: "Invalid breed." };
    }
  }

  Object.assign(pet, updates);
  await pet.save();

  return { ok: true, status: 200, data: { message: "Pet updated successfully.", pet } };
};

module.exports = {
  ownedPetResult,
  listUserPets,
  getOwnedPet,
  createPetForUser,
  updatePetForUser,
};