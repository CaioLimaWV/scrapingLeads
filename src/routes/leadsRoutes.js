const express = require("express");
const { listLeads, listUncontactedLeadsWithPhone, markLeadAsContacted } = require("../repositories/leadRepository");

const router = express.Router();

function parseLimit(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
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

router.get("/uncontacted", async (req, res, next) => {
  try {
    const leads = await listUncontactedLeadsWithPhone(100);
    res.json({ data: leads });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/contact", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }
    await markLeadAsContacted(id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
