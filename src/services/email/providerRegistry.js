const env = require("../../config/env");
const logger = require("../../config/logger");
const { countSentTodayByProvider } = require("../../repositories/emailRepository");
const { createBrevoProvider } = require("./providers/brevoProvider");
const { createMailjetProvider } = require("./providers/mailjetProvider");

const FACTORIES = {
  brevo: createBrevoProvider,
  mailjet: createMailjetProvider
};

let providers = null;

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

async function getCapacityMap() {
  const list = getProviders();
  const counts = await countSentTodayByProvider();
  const sentByName = Object.fromEntries(counts.map((r) => [r.provider, Number(r.count)]));

  return list.map((p) => ({
    provider: p,
    sent: sentByName[p.name] || 0,
    remaining: Math.max(0, p.dailyLimit - (sentByName[p.name] || 0))
  }));
}

async function getTotalRemaining() {
  const capacity = await getCapacityMap();
  return capacity.reduce((sum, c) => sum + c.remaining, 0);
}

async function pickProvider(excludeNames = []) {
  const capacity = await getCapacityMap();
  const candidates = capacity
    .filter((c) => c.remaining > 0 && !excludeNames.includes(c.provider.name))
    .sort((a, b) => b.remaining - a.remaining);

  return candidates.length > 0 ? candidates[0].provider : null;
}

async function sendWithFallback(mailOptions) {
  const tried = [];
  let lastError = null;

  while (true) {
    const provider = await pickProvider(tried);
    if (!provider) {
      const err = new Error(
        lastError
          ? `All providers exhausted or failed. Last error: ${lastError.message}`
          : "No provider has remaining capacity"
      );
      err.providersExhausted = true;
      throw err;
    }

    try {
      await provider.send(mailOptions);
      return { providerName: provider.name };
    } catch (err) {
      lastError = err;
      tried.push(provider.name);
      logger.warn(
        { provider: provider.name, err: err.message },
        "Provider failed, trying next"
      );
    }
  }
}

function resetForTests() {
  providers = null;
}

module.exports = {
  getProviders,
  getCapacityMap,
  getTotalRemaining,
  pickProvider,
  sendWithFallback,
  resetForTests
};
