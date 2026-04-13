const express = require("express");
const { listLeads } = require("../repositories/leadRepository");

const router = express.Router();

function parseLimit(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 100);
}

function parseOffset(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

router.get("/", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const offset = parseOffset(req.query.offset, 0);
    const sourceId = req.query.source_id ? Number(req.query.source_id) : null;
    const rawGender = req.query.gender ? String(req.query.gender).toUpperCase() : null;
    const gender = rawGender && ["F", "M"].includes(rawGender) ? rawGender : null;

    const leads = await listLeads({ limit, offset, sourceId, gender });
    res.json({ data: leads, pagination: { limit, offset, gender } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
