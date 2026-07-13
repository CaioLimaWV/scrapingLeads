const { Router } = require("express");
const env = require("../config/env");
const { runEmailCampaign, dispatchSavedCampaign, getEmailStatus, sendTestEmail } = require("../services/emailService");
const {
  listEmailSends,
  markLeadUnsubscribed,
  getAnalyticsByDay,
  getClickStats,
  getUtmCampaignStats
} = require("../repositories/emailRepository");
const {
  listCampaignsWithStats,
  getCampaignById,
  createCampaign,
  updateCampaign,
  getCampaignStats
} = require("../repositories/campaignRepository");
const {
  listStepsByCampaignId,
  createStep,
  updateStep,
  deleteStep,
  replaceAllSteps,
  getStepStats
} = require("../repositories/campaignStepRepository");

const router = Router();

function checkToken(req, res) {
  const token = env.panel.runToken;
  if (!token) return true;
  return req.headers["x-panel-token"] === token;
}

function parseLimit(value, fallback = 50) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : fallback;
}

function parseIdArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

function parseStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
}

function parseStepsPayload(value) {
  if (!Array.isArray(value)) return null;
  return value
    .map((step, index) => ({
      subject: String(step.subject || "").trim(),
      template: String(step.template || "").trim(),
      minDaysSincePrevious:
        index === 0 ? null : Number(step.minDaysSincePrevious ?? step.minDays ?? 3) || 3
    }))
    .filter((step) => step.subject && step.template);
}

function validateCampaignPayload(body, { partial = false } = {}) {
  const errors = [];
  if (!partial || body.name !== undefined) {
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) errors.push("name is required");
  }
  if (!partial || body.subject !== undefined) {
    if (!body.subject || typeof body.subject !== "string" || !body.subject.trim()) errors.push("subject is required");
  }
  if (!partial || body.template !== undefined) {
    if (!body.template || typeof body.template !== "string" || !body.template.trim()) errors.push("template is required");
  }
  return errors;
}

router.get("/campaigns", async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    const data = await listCampaignsWithStats({ includeArchived });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get("/campaigns/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const campaign = await getCampaignById(id);
    if (!campaign) return res.status(404).json({ message: "Campanha não encontrada" });
    const stats = await getCampaignStats(id);
    const steps = await getStepStats(id);
    res.json({ campaign, stats, steps });
  } catch (err) {
    next(err);
  }
});

router.post("/campaigns", async (req, res, next) => {
  try {
    if (!checkToken(req, res)) return res.status(401).json({ message: "Unauthorized" });
    const errors = validateCampaignPayload(req.body);
    if (errors.length) return res.status(400).json({ message: errors.join(", ") });

    const campaign = await createCampaign({
      name: req.body.name,
      subject: req.body.subject,
      template: req.body.template,
      sourceIds: parseIdArray(req.body.sourceIds),
      fieldAreas: parseStringArray(req.body.fieldAreas),
      dailyBatchSize: req.body.dailyBatchSize ? Number(req.body.dailyBatchSize) : null,
      notes: req.body.notes || null,
      steps: parseStepsPayload(req.body.steps)
    });
    const stats = await getCampaignStats(campaign.id);
    const steps = await getStepStats(campaign.id);
    res.status(201).json({ campaign, stats, steps });
  } catch (err) {
    next(err);
  }
});

router.put("/campaigns/:id", async (req, res, next) => {
  try {
    if (!checkToken(req, res)) return res.status(401).json({ message: "Unauthorized" });
    const id = Number(req.params.id);
    const errors = validateCampaignPayload(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ message: errors.join(", ") });

    const campaign = await updateCampaign(id, {
      name: req.body.name,
      subject: req.body.subject,
      template: req.body.template,
      sourceIds: req.body.sourceIds !== undefined ? parseIdArray(req.body.sourceIds) : undefined,
      fieldAreas: req.body.fieldAreas !== undefined ? parseStringArray(req.body.fieldAreas) : undefined,
      dailyBatchSize: req.body.dailyBatchSize !== undefined ? (req.body.dailyBatchSize ? Number(req.body.dailyBatchSize) : null) : undefined,
      status: req.body.status,
      notes: req.body.notes
    });
    if (!campaign) return res.status(404).json({ message: "Campanha não encontrada" });

    if (Array.isArray(req.body.steps)) {
      const steps = parseStepsPayload(req.body.steps);
      if (steps?.length) {
        await replaceAllSteps(id, steps);
      }
    }

    const stats = await getCampaignStats(id);
    const steps = await getStepStats(id);
    res.json({ campaign, stats, steps });
  } catch (err) {
    next(err);
  }
});

router.put("/campaigns/:id/steps", async (req, res, next) => {
  try {
    if (!checkToken(req, res)) return res.status(401).json({ message: "Unauthorized" });
    const id = Number(req.params.id);
    const campaign = await getCampaignById(id);
    if (!campaign) return res.status(404).json({ message: "Campanha não encontrada" });

    const steps = parseStepsPayload(req.body.steps);
    if (!steps?.length) {
      return res.status(400).json({ message: "Informe ao menos 1 email na sequência" });
    }

    const saved = await replaceAllSteps(id, steps);
    const stats = await getCampaignStats(id);
    res.json({ steps: saved, stats });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    next(err);
  }
});

router.post("/campaigns/:id/steps", async (req, res, next) => {
  try {
    if (!checkToken(req, res)) return res.status(401).json({ message: "Unauthorized" });
    const id = Number(req.params.id);
    const campaign = await getCampaignById(id);
    if (!campaign) return res.status(404).json({ message: "Campanha não encontrada" });

    const { subject, template, minDaysSincePrevious } = req.body;
    if (!subject?.trim() || !template?.trim()) {
      return res.status(400).json({ message: "subject e template são obrigatórios" });
    }

    const step = await createStep(id, {
      subject,
      template,
      minDaysSincePrevious: minDaysSincePrevious != null ? Number(minDaysSincePrevious) : 3
    });
    const stats = await getCampaignStats(id);
    res.status(201).json({ step, stats });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    next(err);
  }
});

router.post("/campaigns/:id/dispatch", async (req, res, next) => {
  try {
    if (!checkToken(req, res)) return res.status(401).json({ message: "Unauthorized" });
    const id = Number(req.params.id);
    const dryRun = req.body.dryRun === true || req.body.dryRun === "true";
    const preferProvider =
      req.body.preferProvider === "mailersend" || req.body.useMailersend === true
        ? "mailersend"
        : null;
    const totals = await dispatchSavedCampaign(id, { dryRun, preferProvider });
    res.json({ success: true, totals });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    next(err);
  }
});

router.post("/run", async (req, res, next) => {
  try {
    if (!checkToken(req, res)) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { sourceId, subject, template, dryRun } = req.body;
    if (!subject || typeof subject !== "string" || subject.trim() === "") {
      return res.status(400).json({ message: "subject is required" });
    }
    if (!template || typeof template !== "string" || template.trim() === "") {
      return res.status(400).json({ message: "template is required" });
    }
    const totals = await runEmailCampaign({
      sourceId: sourceId ? Number(sourceId) : null,
      subject: subject.trim(),
      template: template.trim(),
      dryRun: dryRun === true || dryRun === "true"
    });
    res.json({ success: true, totals });
  } catch (err) {
    next(err);
  }
});

router.get("/status", async (req, res, next) => {
  try {
    const status = await getEmailStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const data = await listEmailSends({ limit, offset });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get("/analytics", async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const [byDay, topLinks, utmCampaigns] = await Promise.all([
      getAnalyticsByDay(days),
      getClickStats(days),
      getUtmCampaignStats(days)
    ]);
    res.json({ byDay, topLinks, utmCampaigns });
  } catch (err) {
    next(err);
  }
});

router.post("/test", async (req, res, next) => {
  try {
    const { toEmail, subject, template } = req.body;
    if (!toEmail || typeof toEmail !== "string" || !toEmail.includes("@")) {
      return res.status(400).json({ message: "toEmail inválido" });
    }
    if (!subject || typeof subject !== "string" || subject.trim() === "") {
      return res.status(400).json({ message: "subject is required" });
    }
    if (!template || typeof template !== "string" || template.trim() === "") {
      return res.status(400).json({ message: "template is required" });
    }
    const result = await sendTestEmail({ toEmail: toEmail.trim(), subject: subject.trim(), template: template.trim() });
    res.json({ success: true, message: `Email de teste enviado para ${toEmail} via ${result.provider}`, provider: result.provider });
  } catch (err) {
    next(err);
  }
});

router.post("/unsubscribe/:leadId", async (req, res, next) => {
  try {
    const leadId = Number(req.params.leadId);
    if (!leadId || !Number.isInteger(leadId)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }
    await markLeadUnsubscribed(leadId);
    const { recalculateLeadEngagement } = require("../services/leadScoringService");
    await recalculateLeadEngagement(leadId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
