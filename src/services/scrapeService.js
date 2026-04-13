const env = require("../config/env");
const logger = require("../config/logger");
const db = require("../database/knex");
const { leadSchema } = require("../validation/leadSchema");
const { normalizeLead } = require("../utils/normalizeLead");
const { getActiveSources } = require("../repositories/sourceRepository");
const {
  createExecution,
  finishExecution,
  logScrapingError
} = require("../repositories/executionRepository");
const {
  findLeadByEmailAndSource,
  insertLead
} = require("../repositories/leadRepository");
const { scrapeSource } = require("../scrapers");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithRetry(handler, { retries, baseDelayMs }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await handler();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
      const delay = baseDelayMs * 2 ** attempt;
      await sleep(delay);
    }
  }
  throw lastError;
}

async function processLead(executionId, sourceId, rawLead, counters) {
  const { error, value } = leadSchema.validate({ ...rawLead, source_id: sourceId });
  if (error) {
    counters.errors += 1;
    await logScrapingError({
      execution_id: executionId,
      error_type: "validation",
      error_code: "LEAD_SCHEMA_INVALID",
      message: error.message
    });
    return;
  }

  const normalized = normalizeLead(value);
  if (!normalized.phone_normalized) {
    normalized.phone = null;
  }

  if (!normalized.name || !normalized.email_normalized) {
    counters.errors += 1;
    await logScrapingError({
      execution_id: executionId,
      error_type: "validation",
      error_code: "REQUIRED_FIELDS_MISSING",
      message: "Lead rejected: name and email are mandatory"
    });
    return;
  }

  const duplicate = await findLeadByEmailAndSource(normalized.email_normalized, sourceId);
  if (duplicate) {
    counters.duplicates += 1;
    return;
  }

  await db.transaction(async (trx) => {
    await insertLead(trx, normalized);
  });

  counters.saved += 1;
}

async function processSource(source) {
  const execution = await createExecution(source.id);
  const counters = {
    scraped: 0,
    saved: 0,
    duplicates: 0,
    errors: 0
  };

  try {
    const rawLeads = await runWithRetry(
      () => scrapeSource(source, env.scrape, logger),
      { retries: env.scrape.retryMax, baseDelayMs: env.scrape.retryBaseDelayMs }
    );

    counters.scraped = rawLeads.length;

    for (const rawLead of rawLeads) {
      // Process sequentially to keep transaction and logs deterministic.
      await processLead(execution.id, source.id, rawLead, counters);
    }

    await finishExecution(execution.id, {
      status: counters.errors > 0 ? "partial" : "completed",
      total_scraped: counters.scraped,
      total_saved: counters.saved,
      duplicates_found: counters.duplicates,
      errors_count: counters.errors,
      error_log: null
    });

    await db("lead_sources")
      .where({ id: source.id })
      .update({ last_scraped_at: db.fn.now(), updated_at: db.fn.now() });

    return counters;
  } catch (error) {
    logger.error({ err: error, sourceId: source.id }, "Source scraping failed");

    await logScrapingError({
      execution_id: execution.id,
      error_type: "runtime",
      error_code: error.code || "UNKNOWN",
      message: error.message,
      url_attempted: source.base_url
    });

    await finishExecution(execution.id, {
      status: "failed",
      total_scraped: counters.scraped,
      total_saved: counters.saved,
      duplicates_found: counters.duplicates,
      errors_count: counters.errors + 1,
      error_log: [{ message: error.message, code: error.code || "UNKNOWN" }]
    });

    return counters;
  }
}

async function runScraping({ sourceId } = {}) {
  // Cleanup defensivo: se um processo foi interrompido (ex.: Ctrl+C), evita execucoes eternamente em running.
  await db("scraping_executions")
    .where({ status: "running" })
    .whereRaw("TIMESTAMPDIFF(MINUTE, started_at, NOW()) >= 2")
    .update({
      status: "failed",
      errors_count: db.raw("errors_count + 1"),
      finished_at: db.fn.now(),
      updated_at: db.fn.now(),
      error_log: JSON.stringify([{ code: "INTERRUPTED", message: "Execution interrupted before completion" }])
    });

  const sources = await getActiveSources();
  const selectedSources = sourceId
    ? sources.filter((source) => source.id === Number(sourceId))
    : sources;

  if (selectedSources.length === 0) {
    logger.warn({ sourceId }, "No sources to process");
    return { processedSources: 0, totals: { scraped: 0, saved: 0, duplicates: 0, errors: 0 } };
  }

  const totals = {
    scraped: 0,
    saved: 0,
    duplicates: 0,
    errors: 0
  };

  for (const source of selectedSources) {
    const sourceResult = await processSource(source);
    totals.scraped += sourceResult.scraped;
    totals.saved += sourceResult.saved;
    totals.duplicates += sourceResult.duplicates;
    totals.errors += sourceResult.errors;
  }

  return {
    processedSources: selectedSources.length,
    totals
  };
}

module.exports = {
  runScraping
};
