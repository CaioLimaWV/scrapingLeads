#!/usr/bin/env node
/**
 * Re-enriquece leads GMaps com website mas sem e-mail real (@mapscraper.local).
 *
 * Uso:
 *   node scripts/enrich-leads-email.js
 *   node scripts/enrich-leads-email.js --limit=100
 *   node scripts/enrich-leads-email.js --dry-run
 */
require("dotenv").config();

const logger = require("../src/config/logger");
const db = require("../src/database/knex");
const { normalizeEmail } = require("../src/utils/normalizeLead");
const {
  listLeadsForEmailEnrichment,
  updateLeadEmailEnrichment
} = require("../src/repositories/leadRepository");
const { extractEmailFromWebsite } = require("../src/scrapers/sources/emailExtractor");

function parseArg(name, fallback = null) {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (!arg) return fallback;
  return arg.split("=")[1];
}

function parseWebsite(rawData) {
  if (!rawData) return null;
  let data = rawData;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const website = String(data.website || "").trim();
  if (!website || website === "null") return null;
  return website;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const batchLimit = Math.max(1, Number(parseArg("--limit", "200")));
  const dryRun = process.argv.includes("--dry-run");
  const delayMs = Math.max(500, Number(parseArg("--delay-ms", "1200")));

  let offset = 0;
  let processed = 0;
  let enriched = 0;
  let skipped = 0;
  let failed = 0;

  logger.info({ batchLimit, dryRun, delayMs }, "Starting email enrichment for mapscraper leads");

  while (processed < batchLimit) {
    const pageSize = Math.min(50, batchLimit - processed);
    const leads = await listLeadsForEmailEnrichment({ limit: pageSize, offset });
    if (!leads.length) break;

    for (const lead of leads) {
      if (processed >= batchLimit) break;
      processed += 1;

      const website = parseWebsite(lead.raw_data);
      if (!website) {
        skipped += 1;
        continue;
      }

      try {
        const email = await extractEmailFromWebsite(website, { timeoutMs: 12000, maxPages: 4 });
        if (!email) {
          skipped += 1;
          logger.debug({ leadId: lead.id, website }, "No email found on website");
          await sleep(delayMs);
          continue;
        }

        const emailNormalized = normalizeEmail(email);
        if (dryRun) {
          enriched += 1;
          logger.info({ leadId: lead.id, name: lead.name, email, website }, "[dry-run] Would enrich lead");
        } else {
          const result = await updateLeadEmailEnrichment(lead.id, {
            email,
            emailNormalized,
            enrichmentMeta: {
              email_enrichment_source: "website-rescrape",
              email_enrichment_website: website
            }
          });

          if (result?.updated) {
            enriched += 1;
            logger.info({ leadId: lead.id, email, website }, "Lead email enriched");
          } else {
            skipped += 1;
            logger.warn({ leadId: lead.id, email, reason: result?.reason }, "Lead not updated");
          }
        }
      } catch (err) {
        failed += 1;
        logger.warn({ leadId: lead.id, website, error: err.message }, "Enrichment failed");
      }

      await sleep(delayMs);
    }

    offset += leads.length;
    if (leads.length < pageSize) break;
  }

  logger.info({ processed, enriched, skipped, failed, dryRun }, "Email enrichment finished");
  console.log(JSON.stringify({ processed, enriched, skipped, failed, dryRun }, null, 2));
}

main()
  .catch((error) => {
    logger.error({ err: error }, "Email enrichment script failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
