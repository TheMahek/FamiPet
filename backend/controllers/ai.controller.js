const Pet = require("../models/Pet");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { isValidObjectId } = require("../utils/validation");

const GEMINI_MODEL = "gemini-3.6-flash";
const MAX_MESSAGE_LENGTH = 2000;

const SYSTEM_PROMPT =
  "You are PetGPT, an AI assistant focused on pets and responsible pet care. " +
  "Provide clear, helpful, easy-to-understand information about pets, including " +
  "dogs, cats, birds, rabbits and other common companion animals.\n\n" +
  "Health guidance rules:\n" +
  "- Give general educational information only. Never claim to diagnose diseases.\n" +
  "- For serious, emergency, or persistent symptoms, recommend consulting a qualified veterinarian.\n" +
  "- For emergencies, clearly advise contacting a veterinarian or an emergency veterinary service immediately.\n" +
  "- For questions unrelated to pets, politely explain that PetGPT is designed primarily for pet-related questions.";

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;
  return new GoogleGenerativeAI(apiKey.trim());
}

function normalizeMessage(body) {
  const raw =
    body && typeof body.message === "string"
      ? body.message
      : body && typeof body.question === "string"
      ? body.question
      : "";
  return typeof raw === "string" ? raw : "";
}

async function callGemini(question, petContext) {
  const genAI = getGenAI();
  if (!genAI) return null;

  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const userPets =
    petContext && petContext.length
      ? "The user's pets: " +
        petContext.map((p) => `${p.name} (${p.species}${p.breed ? ", " + p.breed : ""})`).join("; ") +
        ". "
      : "";

  const userPrompt = userPets + "User asks: " + question;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const result = await model.generateContent(
      {
        systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      },
      { signal: controller.signal }
    );

    const text =
      result && result.response && typeof result.response.text === "function"
        ? String(result.response.text() || "").trim()
        : "";

    if (!text) {
      console.error("PetGPT: empty Gemini response.");
    }

    return text || null;
  } catch (error) {
    console.error("Gemini error:", error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

exports.askPetGPT = async (req, res) => {
  try {
    const rawMessage = normalizeMessage(req.body);
    const message = rawMessage.trim();

    if (!message) {
      return res.status(400).json({ success: false, message: "Message is required." });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      });
    }

    if (!getGenAI()) {
      return res.status(500).json({
        success: false,
        message: "PetGPT is not configured yet. Please try again later.",
      });
    }

    let petContext = [];
    try {
      const pets = await Pet.find({ owner: req.user._id })
        .select("name species breed")
        .populate("breed", "name")
        .limit(5)
        .lean();

      petContext = pets.map((p) => ({
        name: p.name,
        species: p.species,
        breed: p.breed && p.breed.name ? p.breed.name : undefined,
      }));
    } catch (error) {
      petContext = [];
    }

    const answer = await callGemini(message, petContext);

    if (!answer) {
      return res.status(502).json({
        success: false,
        message: "Unable to get a response from PetGPT.",
      });
    }

    res.json({ success: true, message: answer });
  } catch (error) {
    console.error("PetGPT error:", error.message);
    res.status(500).json({ success: false, message: "Something went wrong. Please try again later." });
  }
};

exports.getPetAdvice = async (req, res) => {
  try {
    const { petId } = req.body;

    if (!petId || !isValidObjectId(petId)) {
      return res.status(400).json({ success: false, message: "Valid pet ID is required." });
    }

    const pet = await Pet.findOne({
      _id: petId,
      owner: req.user._id,
    }).populate("breed", "name species");

    if (!pet) {
      return res.status(404).json({
        success: false,
        message: "Pet not found or not owned by you.",
      });
    }

    const advice = [];

    if (!pet.vaccinated) advice.push("Your pet is marked as not vaccinated. Consult a veterinarian about required vaccinations.");
    if (pet.age < 1) advice.push("Your pet is young. Pay special attention to nutrition, vaccination, and veterinary visits.");
    if (pet.weight === undefined || pet.weight === null || pet.weight <= 0) advice.push("Weight information is missing. Consider recording your pet's current weight.");
    if (!advice.length) advice.push("Continue regular veterinary checkups, proper nutrition, exercise, and preventive care.");

    res.json({
      success: true,
      pet: {
        id: pet._id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        age: pet.age,
        weight: pet.weight,
        vaccinated: pet.vaccinated,
      },
      advice,
    });
  } catch (error) {
    console.error("PetGPT error:", error.message);
    res.status(500).json({ success: false, message: "Something went wrong. Please try again later." });
  }
};