const express = require("express");
const env = require("../config/env");
const {
  suppressContact,
  searchLeads,
  listSuppressedLeads,
  processImport
} = require("../services/contactSuppressionService");

const router = express.Router();

function hasValidToken(req) {
  if (!env.panel.runToken) {
    return true;
  }
  return req.headers["x-panel-token"] === env.panel.runToken;
}

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

router.get("/search", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) {
      return res.status(400).json({ message: "Parametro q e obrigatorio" });
    }

    const limit = parseLimit(req.query.limit, 20);
    const data = await searchLeads({ q, limit });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
});

router.get("/suppressed", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const offset = parseOffset(req.query.offset, 0);
    const data = await listSuppressedLeads({ limit, offset });
    return res.json({ data, pagination: { limit, offset } });
  } catch (error) {
    return next(error);
  }
});

router.post("/suppress", async (req, res, next) => {
  try {
    if (!hasValidToken(req)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await suppressContact(req.body || {});
    if (!result.ok) {
      return res.status(result.matched === 0 ? 404 : 400).json({ message: result.error, data: result });
    }

    return res.status(200).json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.post("/import", async (req, res, next) => {
  try {
    if (!hasValidToken(req)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const mode = String(req.body?.mode || "suppress").trim().toLowerCase();
    const result = await processImport({
      mode,
      rows: Array.isArray(req.body?.rows) ? req.body.rows : null,
      csvText: req.body?.csvText || "",
      sourceId: req.body?.sourceId
    });

    if (!result.ok) {
      return res.status(400).json({ message: result.error, data: result });
    }

    return res.status(200).json({ data: result });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
