const axios = require("axios");

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function parseAddress(value) {
  if (!value) return null;
  const match = String(value).match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: String(value).trim() };
}

function toRecipients(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(",");
  return list.map((v) => parseAddress(v)).filter(Boolean);
}

function toBrevoHeaders(headers) {
  if (!headers || typeof headers !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function createBrevoProvider(config) {
  if (!config.apiKey) {
    throw new Error("BREVO_API_KEY is required for brevo provider");
  }

  const client = axios.create({
    baseURL: BREVO_API_URL,
    timeout: 15000,
    headers: {
      "api-key": config.apiKey,
      "content-type": "application/json",
      accept: "application/json"
    }
  });

  return {
    name: "brevo",
    dailyLimit: config.dailyLimit,
    async send(mailOptions) {
      const sender = parseAddress(mailOptions.from);
      const to = toRecipients(mailOptions.to);

      const payload = {
        sender,
        to,
        subject: mailOptions.subject,
        htmlContent: mailOptions.html,
        textContent: mailOptions.text,
        headers: toBrevoHeaders(mailOptions.headers)
      };

      try {
        await client.post("", payload);
      } catch (err) {
        const apiMessage = err.response?.data?.message || err.message;
        const status = err.response?.status;
        const wrapped = new Error(`Brevo API error${status ? ` (${status})` : ""}: ${apiMessage}`);
        wrapped.cause = err;
        throw wrapped;
      }
    }
  };
}

module.exports = { createBrevoProvider };
