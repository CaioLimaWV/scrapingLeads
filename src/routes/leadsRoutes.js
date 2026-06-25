const express = require("express");
const env = require("../config/env");
const {
  listLeads,
  listEngagementLeads,
  listUncontactedLeadsWithPhone,
  markLeadAsContacted
} = require("../repositories/leadRepository");
const { getEngagementSummary, recalculateAllLeads, fetchLeadSignals, buildEngagementFromSignals } = require("../services/leadScoringService");

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
    const temperature = req.query.temperature ? String(req.query.temperature) : null;
    const funnelStage = req.query.funnel_stage ? String(req.query.funnel_stage) : null;

    const leads = await listLeads({ limit, offset, sourceId, gender, temperature, funnelStage });
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

router.get("/engagement/summary", async (req, res, next) => {
  try {
    const summary = await getEngagementSummary();
    res.json({ data: summary });
  } catch (error) {
    next(error);
  }
});

router.get("/engagement", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const offset = parseOffset(req.query.offset, 0);
    const sourceId = req.query.source_id ? Number(req.query.source_id) : null;
    const temperature = req.query.temperature ? String(req.query.temperature) : null;
    const funnelStage = req.query.funnel_stage ? String(req.query.funnel_stage) : null;

    const leads = await listEngagementLeads({ limit, offset, sourceId, temperature, funnelStage });
    res.json({ data: leads, pagination: { limit, offset, temperature, funnel_stage: funnelStage } });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/engagement", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }
    const signals = await fetchLeadSignals(id);
    if (!signals) {
      return res.status(404).json({ message: "Lead not found" });
    }
    res.json({ data: { signals, engagement: buildEngagementFromSignals(signals) } });
  } catch (error) {
    next(error);
  }
});

router.post("/engagement/recalculate", async (req, res, next) => {
  try {
    if (env.panel.runToken) {
      const token = req.headers["x-panel-token"];
      if (token !== env.panel.runToken) {
        return res.status(401).json({ message: "Unauthorized" });
      }
    }
    const result = await recalculateAllLeads();
    res.json({ data: result });
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
