require("dotenv").config();

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  appPort: toNumber(process.env.APP_PORT, 3000),
  panel: {
    runToken: process.env.PANEL_RUN_TOKEN || ""
  },
  scrape: {
    timeoutMs: toNumber(process.env.SCRAPE_TIMEOUT_MS, 30000),
    retryMax: toNumber(process.env.SCRAPE_RETRY_MAX, 3),
    retryBaseDelayMs: toNumber(process.env.SCRAPE_RETRY_BASE_DELAY_MS, 1000),
    concurrency: toNumber(process.env.SCRAPE_CONCURRENCY, 2),
    maxItems: toNumber(process.env.SCRAPE_MAX_ITEMS, 80)
  }
};
