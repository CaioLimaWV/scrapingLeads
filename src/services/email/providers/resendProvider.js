const axios = require("axios");

const RESEND_API_URL = "https://api.resend.com/emails";

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

function formatFrom(address) {
  if (!address) return "";
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

function toResendHeaders(headers) {
  if (!headers || typeof headers !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function createResendProvider(config) {
  if (!config.apiKey) {
    throw new Error("RESEND_API_KEY is required for resend provider");
  }

  const client = axios.create({
    baseURL: RESEND_API_URL,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      accept: "application/json"
    }
  });

  return {
    name: "resend",
    dailyLimit: config.dailyLimit,
    async send(mailOptions) {
      const from = parseAddress(mailOptions.from);
      const to = toRecipients(mailOptions.to).map((r) => r.email);

      const payload = {
        from: formatFrom(from),
        to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
        headers: toResendHeaders(mailOptions.headers)
      };

      try {
        await client.post("", payload);
      } catch (err) {
        const apiData = err.response?.data;
        const apiMessage = apiData?.message || err.message;
        const status = err.response?.status;
        const wrapped = new Error(`Resend API error${status ? ` (${status})` : ""}: ${apiMessage}`);
        wrapped.cause = err;
        throw wrapped;
      }
    }
  };
}

module.exports = { createResendProvider };
