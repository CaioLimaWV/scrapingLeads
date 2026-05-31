const { Router } = require("express");
const env = require("../config/env");
const { runEmailCampaign, getEmailStatus, sendTestEmail } = require("../services/emailService");
const {
  listEmailSends,
  markLeadUnsubscribed,
  getAnalyticsByDay,
  getClickStats
} = require("../repositories/emailRepository");

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
    const [byDay, topLinks] = await Promise.all([
      getAnalyticsByDay(days),
      getClickStats(days)
    ]);
    res.json({ byDay, topLinks });
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
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
