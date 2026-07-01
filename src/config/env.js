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
  },
  email: {
    from: process.env.EMAIL_FROM || "",
    fromName: process.env.EMAIL_FROM_NAME || "Contato",
    dailyLimit: toNumber(process.env.EMAIL_DAILY_LIMIT, 50),
    delayMinMs: toNumber(process.env.EMAIL_DELAY_MIN_MS, 8000),
    delayMaxMs: toNumber(process.env.EMAIL_DELAY_MAX_MS, 20000),
    // quando em servidor público, preencher com a URL base (ex: https://seuapp.com)
    // deixar vazio desabilita tracking de abertura e clique
    baseUrl: process.env.APP_BASE_URL ? process.env.APP_BASE_URL.replace(/\/$/, "") : "",
    // recebe 1 cópia idêntica à dos leads em cada disparo real (não dry-run)
    monitorTo: (process.env.EMAIL_MONITOR_TO || "").trim(),
    monitorName: (process.env.EMAIL_MONITOR_NAME || process.env.EMAIL_FROM_NAME || "Monitor").trim(),
    defaultBatch: toNumber(process.env.EMAIL_DEFAULT_BATCH, 50),
    providers: [
      {
        name: "brevo",
        apiKey: process.env.BREVO_API_KEY || "",
        dailyLimit: toNumber(process.env.BREVO_DAILY_LIMIT, 300)
      },
      {
        name: "mailjet",
        apiKey: process.env.MAILJET_API_KEY || "",
        secretKey: process.env.MAILJET_SECRET_KEY || "",
        dailyLimit: toNumber(process.env.MAILJET_DAILY_LIMIT, 200)
      },
      {
        name: "mailersend",
        apiKey: process.env.MAILERSEND_API_TOKEN || "",
        dailyLimit: toNumber(process.env.MAILERSEND_DAILY_LIMIT, 10)
      },
      {
        name: "sendgrid",
        apiKey: process.env.SENDGRID_API_KEY || "",
        dailyLimit: toNumber(process.env.SENDGRID_DAILY_LIMIT, 100)
      },
      {
        name: "resend",
        apiKey: process.env.RESEND_API_KEY || "",
        dailyLimit: toNumber(process.env.RESEND_DAILY_LIMIT, 100)
      },
      {
        name: "elasticemail",
        apiKey: process.env.ELASTIC_EMAIL_API_KEY || "",
        dailyLimit: toNumber(process.env.ELASTIC_EMAIL_DAILY_LIMIT, 100)
      }
    ].filter((p) => {
      if (p.name === "mailjet") return !!p.apiKey && !!p.secretKey;
      return !!p.apiKey;
    })
  }
};
