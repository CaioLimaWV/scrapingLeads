const env = require("../../config/env");
const logger = require("../../config/logger");
const { countSentTodayByProvider } = require("../../repositories/emailRepository");
const {
  isDailyQuotaError,
  isRateLimitError,
  isQuotaError,
  isAuthError,
  parseResetHeader,
  parseRetryAfterSeconds
} = require("./quotaErrors");
const { createBrevoProvider } = require("./providers/brevoProvider");
const { createElasticEmailProvider } = require("./providers/elasticEmailProvider");
const { createMailjetProvider } = require("./providers/mailjetProvider");
const { createMailersendProvider } = require("./providers/mailersendProvider");
const { createResendProvider } = require("./providers/resendProvider");
const { createSendgridProvider } = require("./providers/sendgridProvider");

const FACTORIES = {
  brevo: createBrevoProvider,
  elasticemail: createElasticEmailProvider,
  mailjet: createMailjetProvider,
  mailersend: createMailersendProvider,
  resend: createResendProvider,
  sendgrid: createSendgridProvider
};

let providers = null;
const quotaBlockedUntil = new Map();
const authBlockedProviders = new Map();
const mailersendQuotaCache = { remaining: null, reset: null, fetchedAt: 0 };
const MAILERSEND_QUOTA_CACHE_MS = 60_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProviderBlocked(name) {
  const until = quotaBlockedUntil.get(name);
  if (!until) return false;
  if (Date.now() >= until.getTime()) {
    quotaBlockedUntil.delete(name);
    return false;
  }
  return true;
}

function markAuthBlocked(name, message) {
  authBlockedProviders.set(name, {
    message: String(message || "Authentication failed"),
    blockedAt: new Date().toISOString()
  });

  if (name === "mailersend") {
    mailersendQuotaCache.remaining = 0;
    mailersendQuotaCache.fetchedAt = Date.now();
  }

  logger.warn({ provider: name, message }, "Provider blocked due to auth error");
}

function getAuthBlockedInfo() {
  return Object.fromEntries(authBlockedProviders.entries());
}

function applyProviderFromOverride(provider, mailOptions) {
  if (provider.name !== "mailersend") return mailOptions;

  const fromEmail = env.email.mailersendFrom || env.email.from;
  const fromName = env.email.mailersendFromName || env.email.fromName;
  if (!fromEmail) return mailOptions;

  return {
    ...mailOptions,
    from: `"${fromName}" <${fromEmail}>`
  };
}

function markQuotaExhausted(name, resetAt = null) {
  const until = resetAt instanceof Date ? resetAt : null;
  if (until) {
    quotaBlockedUntil.set(name, until);
  } else {
    const nextUtcMidnight = new Date();
    nextUtcMidnight.setUTCHours(24, 0, 0, 0);
    quotaBlockedUntil.set(name, nextUtcMidnight);
  }

  if (name === "mailersend") {
    mailersendQuotaCache.remaining = 0;
    if (until) mailersendQuotaCache.reset = until;
    mailersendQuotaCache.fetchedAt = Date.now();
  }

  logger.warn(
    { provider: name, blockedUntil: quotaBlockedUntil.get(name)?.toISOString() },
    "Provider marked exhausted due to API daily quota"
  );
}

async function refreshMailersendQuota(provider) {
  if (!provider?.fetchApiQuota) return null;

  const cachedAge = Date.now() - mailersendQuotaCache.fetchedAt;
  if (mailersendQuotaCache.remaining !== null && cachedAge < MAILERSEND_QUOTA_CACHE_MS) {
    return mailersendQuotaCache;
  }

  try {
    const quota = await provider.fetchApiQuota();
    mailersendQuotaCache.remaining = quota.remaining;
    mailersendQuotaCache.reset = quota.reset;
    mailersendQuotaCache.quota = quota.quota;
    mailersendQuotaCache.fetchedAt = Date.now();

    if (quota.remaining <= 0) {
      markQuotaExhausted("mailersend", quota.reset);
    } else if (quota.reset) {
      quotaBlockedUntil.delete("mailersend");
    }

    return mailersendQuotaCache;
  } catch (err) {
    logger.warn({ err: err.message }, "Failed to fetch MailerSend API quota");
    return null;
  }
}

function getProviders() {
  if (providers) return providers;

  providers = env.email.providers
    .map((cfg) => {
      const factory = FACTORIES[cfg.name];
      if (!factory) {
        logger.warn({ provider: cfg.name }, "Unknown email provider, skipping");
        return null;
      }
      return factory(cfg);
    })
    .filter(Boolean);

  if (providers.length === 0) {
    throw new Error("No email providers configured");
  }
  return providers;
}

async function getProviderRemaining(provider, sent) {
  if (authBlockedProviders.has(provider.name)) {
    return 0;
  }

  if (isProviderBlocked(provider.name)) {
    return 0;
  }

  const fromLocalLimit = Math.max(0, provider.dailyLimit - sent);

  if (provider.name !== "mailersend") {
    return fromLocalLimit;
  }

  const apiQuota = await refreshMailersendQuota(provider);
  if (!apiQuota || apiQuota.remaining === null) {
    return fromLocalLimit;
  }

  return Math.min(fromLocalLimit, Math.max(0, apiQuota.remaining));
}

async function getCapacityMap() {
  const list = getProviders();
  const counts = await countSentTodayByProvider();
  const sentByName = Object.fromEntries(counts.map((r) => [r.provider, Number(r.count)]));

  const capacity = [];
  for (const provider of list) {
    const sent = sentByName[provider.name] || 0;
    const remaining = await getProviderRemaining(provider, sent);
    capacity.push({ provider, sent, remaining });
  }
  return capacity;
}

async function getTotalRemaining() {
  const capacity = await getCapacityMap();
  return capacity.reduce((sum, c) => sum + c.remaining, 0);
}

async function pickProvider(excludeNames = [], options = {}) {
  const { preferProvider = null } = options;
  const capacity = await getCapacityMap();
  let candidates = capacity.filter(
    (c) => c.remaining > 0 && !excludeNames.includes(c.provider.name)
  );

  if (preferProvider) {
    const preferred = candidates.find((c) => c.provider.name === preferProvider);
    if (preferred) return preferred.provider;
  }

  candidates = candidates.sort((a, b) => b.remaining - a.remaining);
  return candidates.length > 0 ? candidates[0].provider : null;
}

async function sendWithProvider(provider, mailOptions) {
  const payload = applyProviderFromOverride(provider, mailOptions);

  while (true) {
    try {
      await provider.send(payload);
      if (provider.name === "mailersend" && mailersendQuotaCache.remaining !== null) {
        mailersendQuotaCache.remaining = Math.max(0, mailersendQuotaCache.remaining - 1);
      }
      return;
    } catch (err) {
      if (isDailyQuotaError(err)) {
        markQuotaExhausted(provider.name, parseResetHeader(err));
        throw err;
      }

      if (isAuthError(err)) {
        markAuthBlocked(provider.name, err.message);
        throw err;
      }

      if (isRateLimitError(err)) {
        const retryAfter = parseRetryAfterSeconds(err);
        logger.warn(
          { provider: provider.name, retryAfter },
          "Provider rate limit hit, waiting before retry"
        );
        await sleep(retryAfter * 1000);
        continue;
      }

      throw err;
    }
  }
}

async function sendWithFallback(mailOptions, options = {}) {
  const { preferProvider = null } = options;
  const tried = [];
  let lastError = null;

  while (true) {
    const provider = await pickProvider(tried, { preferProvider });
    if (!provider) {
      const err = new Error(
        lastError
          ? `All providers exhausted or failed. Last error: ${lastError.message}`
          : "No provider has remaining capacity"
      );
      err.providersExhausted = true;
      err.quotaExhausted = !lastError;
      throw err;
    }

    try {
      await sendWithProvider(provider, mailOptions);
      return { providerName: provider.name };
    } catch (err) {
      lastError = err;
      tried.push(provider.name);
      if (isAuthError(err)) {
        markAuthBlocked(provider.name, err.message);
      } else if (isQuotaError(err) && !isRateLimitError(err)) {
        markQuotaExhausted(provider.name, parseResetHeader(err));
      }
      logger.warn(
        { provider: provider.name, err: err.message },
        "Provider failed, trying next"
      );
    }
  }
}

function resetForTests() {
  providers = null;
  quotaBlockedUntil.clear();
  authBlockedProviders.clear();
  mailersendQuotaCache.remaining = null;
  mailersendQuotaCache.reset = null;
  mailersendQuotaCache.quota = null;
  mailersendQuotaCache.fetchedAt = 0;
}

module.exports = {
  getProviders,
  getCapacityMap,
  getTotalRemaining,
  pickProvider,
  sendWithFallback,
  markQuotaExhausted,
  markAuthBlocked,
  getAuthBlockedInfo,
  resetForTests
};
