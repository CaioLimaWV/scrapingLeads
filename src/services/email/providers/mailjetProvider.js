const axios = require("axios");

const MAILJET_API_URL = "https://api.mailjet.com/v3.1/send";

function parseAddress(value) {
  if (!value) return null;
  const match = String(value).match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  if (match) {
    return { Name: match[1].trim(), Email: match[2].trim() };
  }
  return { Email: String(value).trim() };
}

function toRecipients(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(",");
  return list.map((v) => parseAddress(v)).filter(Boolean);
}

function toMailjetHeaders(headers) {
  if (!headers || typeof headers !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function createMailjetProvider(config) {
  if (!config.apiKey || !config.secretKey) {
    throw new Error("MAILJET_API_KEY and MAILJET_SECRET_KEY are required for mailjet provider");
  }

  const client = axios.create({
    baseURL: MAILJET_API_URL,
    timeout: 15000,
    auth: { username: config.apiKey, password: config.secretKey },
    headers: { "content-type": "application/json", accept: "application/json" }
  });

  return {
    name: "mailjet",
    dailyLimit: config.dailyLimit,
    async send(mailOptions) {
      const from = parseAddress(mailOptions.from);
      const to = toRecipients(mailOptions.to);

      const message = {
        From: from,
        To: to,
        Subject: mailOptions.subject,
        HTMLPart: mailOptions.html,
        TextPart: mailOptions.text,
        Headers: toMailjetHeaders(mailOptions.headers)
      };

      try {
        await client.post("", { Messages: [message] });
      } catch (err) {
        const apiData = err.response?.data;
        const apiMessage =
          apiData?.Messages?.[0]?.Errors?.[0]?.ErrorMessage ||
          apiData?.ErrorMessage ||
          err.message;
        const status = err.response?.status;
        const wrapped = new Error(`Mailjet API error${status ? ` (${status})` : ""}: ${apiMessage}`);
        wrapped.cause = err;
        throw wrapped;
      }
    }
  };
}

module.exports = { createMailjetProvider };
