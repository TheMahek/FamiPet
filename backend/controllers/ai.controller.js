const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { isValidObjectId } = require("../utils/validation");
const petService = require("../services/pet.service");
const toolLayer = require("../services/toolLayer");

const GEMINI_MODEL = "gemini-3.6-flash";
const MAX_MESSAGE_LENGTH = 2000;
const PET_CONTEXT_LIMIT = 5;

const SYSTEM_PROMPT =
  "You are PetGPT, an AI assistant focused on pets and responsible pet care. " +
  "Provide clear, helpful, easy-to-understand information about pets, including " +
  "dogs, cats, birds, rabbits and other common companion animals.\n\n" +
  "Health guidance rules:\n" +
  "- Give general educational information only. Never claim to diagnose diseases.\n" +
  "- For serious, emergency, or persistent symptoms, recommend consulting a qualified veterinarian.\n" +
  "- For emergencies, clearly advise contacting a veterinarian or an emergency veterinary service immediately.\n" +
  "- For questions unrelated to pets, politely explain that PetGPT is designed primarily for pet-related questions.\n\n" +
  "Tool use rules:\n" +
  "- You may call the provided functions to READ the user's own data or to PROPOSE an action " +
  "(creating/updating a pet, diet profile or reminder).\n" +
  "- Proposed actions are NEVER executed until the user confirms them on screen. After emitting a " +
  "proposal, tell the user what you propose and that the app will ask them to confirm.\n" +
  "- Only use ids that appear in the data you have read or in the user context. Never invent ids.\n" +
  "- If you cannot format a valid call, just answer conversationally in plain text.";

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

// Build the compact pet context WITHOUT touching models — through the service.
async function buildPetContext(user) {
  try {
    const result = await petService.listUserPets({ user });
    if (!result.ok || !result.data || !Array.isArray(result.data.pets)) return [];
    return result.data.pets
      .slice(0, PET_CONTEXT_LIMIT)
      .map((p) => ({
        id: String(p._id),
        name: p.name,
        species: p.species,
        breed: p.breed && p.breed.name ? p.breed.name : undefined,
      }))
      .filter((p) => p.id && p.name);
  } catch (error) {
    console.error("PetGPT: pet context unavailable:", error.message);
    return [];
  }
}

/**
 * Bounded Gemini function-calling loop. Reads auto-return; mutation proposals
 * are surfaced as `action` for the UI. The raw confirmation token is only
 * returned in the final `action` (for the client) and NEVER in a tool result
 * handed back to the model.
 */
async function askWithTools({ genAI, user, question, petContext }) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const toolDefs = toolLayer.getToolDefinitions();
  const requestId = crypto.randomBytes(8).toString("hex");

  const userPets =
    petContext && petContext.length
      ? "The user's pets: " +
        petContext.map((p) => `${p.name} (${p.species}${p.breed ? ", " + p.breed : ""}, id ${p.id})`).join("; ") +
        ". "
      : "";

  const userPrompt =
    userPets + "User asks: " + question;

  let contents = [{ role: "user", parts: [{ text: userPrompt }] }];
  let latestAction = null; // { ok, requiresConfirmation, action, preview, confirmation }
  let finalText = "";
  let toolCallsUsed = 0;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    for (let round = 0; round < toolLayer.TOOL_MAX_ROUNDS; round++) {
      const request = {
        systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools: toolDefs.length ? [{ functionDeclarations: toolDefs }] : undefined,
      };
      const result = await model.generateContent(request, { signal: controller.signal });
      const response = result && result.response ? result.response : null;
      const parts =
        response && response.candidates && response.candidates[0] && response.candidates[0].content
          ? (response.candidates[0].content.parts || [])
          : [];
      const fnCalls = parts.filter((p) => p && p.functionCall);
      const textParts = parts
        .filter((p) => p && p.text && String(p.text).trim())
        .map((p) => String(p.text).trim());

      if (fnCalls.length === 0) {
        finalText = textParts.join("\n").trim();
        break;
      }

      // Keep any interim text; supply function responses for every call.
      finalText = textParts.join("\n").trim();
      const modelTurn = {
        role: "model",
        parts: fnCalls.map((fc) => ({
          functionCall: { name: fc.functionCall.name, args: fc.functionCall.args || {} },
        })),
      };
      const functionParts = [];
      for (const fc of fnCalls) {
        const name = fc.functionCall.name;
        const args = fc.functionCall.args || {};
        const resultObj = await toolLayer.runTool({
          user,
          requestId,
          tool: name,
          args,
          callBudget: { used: toolCallsUsed, max: toolLayer.TOOL_MAX_CALLS_PER_REQUEST },
        });
        toolCallsUsed += 1;
        if (resultObj && resultObj.ok && resultObj.requiresConfirmation) {
          latestAction = resultObj;
        }
        functionParts.push({
          functionResponse: { name, response: toolLayer.resultForModel(resultObj) },
        });
      }
      contents = contents.concat([modelTurn, { role: "function", parts: functionParts }]);
    }
  } catch (error) {
    console.error("Gemini error:", error.message);
    return { message: null, action: latestAction };
  } finally {
    clearTimeout(timer);
  }

  if (!finalText && latestAction) {
    finalText = "I've prepared an action for your approval — please review it below.";
  }

  if (!finalText && !latestAction) {
    console.error("PetGPT: no non-empty response produced.");
  }

  return { message: finalText || null, action: latestAction };
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

    const petContext = await buildPetContext(req.user);

    const { message: answer, action } = await askWithTools({
      genAI: getGenAI(),
      user: req.user,
      question: message,
      petContext,
    });

    if (!answer && !action) {
      return res.status(502).json({
        success: false,
        message: "Unable to get a response from PetGPT.",
      });
    }

    const payload = { success: true, message: answer || undefined };
    if (action) payload.action = action;
    res.json(payload);
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

    const owned = await petService.getOwnedPet({ user: req.user, petId });
    if (!owned.ok || !owned.data || !owned.data.pet) {
      return res.status(404).json({
        success: false,
        message: "Pet not found or not owned by you.",
      });
    }
    const pet = owned.data.pet;

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