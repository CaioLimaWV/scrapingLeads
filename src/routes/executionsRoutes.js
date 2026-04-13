const express = require("express");
const { listExecutions } = require("../repositories/executionRepository");

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
    const executions = await listExecutions(limit, offset);
    res.json({ data: executions, pagination: { limit, offset } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
