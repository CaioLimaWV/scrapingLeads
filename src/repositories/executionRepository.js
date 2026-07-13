const db = require("../database/knex");

async function createExecution(sourceId) {
  const insertedIds = await db("scraping_executions").insert({ source_id: sourceId, status: "running" });
  const insertedId = Array.isArray(insertedIds) ? insertedIds[0] : insertedIds;
  const row = await db("scraping_executions")
    .select("id", "source_id", "status", "started_at")
    .where({ id: insertedId })
    .first();
  return row;
}

async function finishExecution(executionId, payload) {
  const serializedErrorLog = payload.error_log ? JSON.stringify(payload.error_log) : null;

  await db("scraping_executions").where({ id: executionId }).update({
    status: payload.status,
    total_scraped: payload.total_scraped || 0,
    total_saved: payload.total_saved || 0,
    duplicates_found: payload.duplicates_found || 0,
    errors_count: payload.errors_count || 0,
    error_log: serializedErrorLog,
    finished_at: db.fn.now(),
    updated_at: db.fn.now()
  });

  const row = await db("scraping_executions")
    .select("id", "status", "total_scraped", "total_saved", "duplicates_found", "errors_count", "finished_at")
    .where({ id: executionId })
    .first();
  return row;
}

async function logScrapingError(data) {
  await db("scraping_errors").insert({
    execution_id: data.execution_id,
    error_type: data.error_type,
    error_code: data.error_code || null,
    message: data.message,
    url_attempted: data.url_attempted || null,
    html_sample: data.html_sample || null
  });
}

async function listExecutions(limit = 50, offset = 0) {
  return db("scraping_executions")
    .select("id", "source_id", "status", "total_scraped", "total_saved", "duplicates_found", "errors_count", "started_at", "finished_at")
    .orderBy("id", "desc")
    .limit(limit)
    .offset(offset);
}

async function countRunningExecutions() {
  const row = await db("scraping_executions")
    .where({ status: "running" })
    .count({ total: "id" })
    .first();
  return Number(row?.total || 0);
}

async function updateExecutionProgress(executionId, counters) {
  await db("scraping_executions").where({ id: executionId }).update({
    total_scraped: counters.scraped || 0,
    total_saved: counters.saved || 0,
    duplicates_found: counters.duplicates || 0,
    errors_count: counters.errors || 0,
    updated_at: db.fn.now()
  });
}

async function recoverInterruptedExecutions() {
  const updated = await db("scraping_executions")
    .where({ status: "running" })
    .update({
      status: "failed",
      errors_count: db.raw("errors_count + 1"),
      finished_at: db.fn.now(),
      updated_at: db.fn.now(),
      error_log: JSON.stringify([{
        code: "INTERRUPTED",
        message: "Execution interrupted before completion (server restart or crash)"
      }])
    });
  return updated;
}

async function cleanupStaleExecutions(staleMinutes = 120) {
  const minutes = Math.max(1, Number(staleMinutes) || 120);
  const updated = await db("scraping_executions")
    .where({ status: "running" })
    .whereRaw("TIMESTAMPDIFF(MINUTE, started_at, NOW()) >= ?", [minutes])
    .update({
      status: "failed",
      errors_count: db.raw("errors_count + 1"),
      finished_at: db.fn.now(),
      updated_at: db.fn.now(),
      error_log: JSON.stringify([{
        code: "STALE_TIMEOUT",
        message: `Execution exceeded ${minutes} minutes without completion`
      }])
    });
  return updated;
}

async function getExecutionStats() {
  const totals = await db("scraping_executions")
    .select("status")
    .count({ total: "id" })
    .groupBy("status");

  const latestExecution = await db("scraping_executions")
    .select("id", "source_id", "status", "total_scraped", "total_saved", "duplicates_found", "errors_count", "started_at", "finished_at")
    .orderBy("id", "desc")
    .first();

  const statusTotals = {
    running: 0,
    completed: 0,
    partial: 0,
    failed: 0
  };

  for (const row of totals) {
    if (Object.hasOwn(statusTotals, row.status)) {
      statusTotals[row.status] = Number(row.total || 0);
    }
  }

  return {
    statusTotals,
    latestExecution: latestExecution || null
  };
}

module.exports = {
  createExecution,
  finishExecution,
  logScrapingError,
  listExecutions,
  getExecutionStats,
  countRunningExecutions,
  updateExecutionProgress,
  cleanupStaleExecutions,
  recoverInterruptedExecutions
};
