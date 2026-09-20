// =====================================================
// HEALTH SERVICE (Phase 10 AI Tool Layer)
// =====================================================
// Owner-scoped health-record reads extracted from health.controller.js so the
// AI tool layer can surface *existing, safe* health information without ever
// touching models directly. The AI layer is read-only here: it can summarize
// records the user already stored, never diagnose, prescribe, or write.

const HealthRecord = require("../models/HealthRecord");

/**
 * List the caller's own health records for one pet (or all pets when petId is
 * omitted), newest visit first.
 */
const listHealthRecords = async ({ user, petId }) => {
  const query = { user: user._id || user.id };
  if (petId !== undefined && petId !== null && petId !== "") query.pet = petId;

  const records = await HealthRecord.find(query)
    .populate("pet", "name species images")
    .sort({ visitDate: -1 })
    .lean();

  return { ok: true, status: 200, data: { count: records.length, records } };
};

module.exports = { listHealthRecords };