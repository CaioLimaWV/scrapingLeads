const axios = require("axios");

const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

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

function toSendgridHeaders(headers) {
  if (!headers || typeof headers !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function createSendgridProvider(config) {
  if (!config.apiKey) {
    throw new Error("SENDGRID_API_KEY is required for sendgrid provider");
  }

  const client = axios.create({
    baseURL: SENDGRID_API_URL,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      accept: "application/json"
    }
  });

  return {
    name: "sendgrid",
    dailyLimit: config.dailyLimit,
    async send(mailOptions) {
      const from = parseAddress(mailOptions.from);
      const to = toRecipients(mailOptions.to);
      const content = [];

      if (mailOptions.text) {
        content.push({ type: "text/plain", value: mailOptions.text });
      }
      if (mailOptions.html) {
        content.push({ type: "text/html", value: mailOptions.html });
      }

      const payload = {
        personalizations: [{ to }],
        from,
        subject: mailOptions.subject,
        content,
        headers: toSendgridHeaders(mailOptions.headers)
      };

      try {
        await client.post("", payload);
      } catch (err) {
        const apiData = err.response?.data;
        const apiMessage =
          (Array.isArray(apiData?.errors) && apiData.errors.map((e) => e.message).join("; ")) ||
          apiData?.message ||
          err.message;
        const status = err.response?.status;
        const wrapped = new Error(`SendGrid API error${status ? ` (${status})` : ""}: ${apiMessage}`);
        wrapped.cause = err;
        throw wrapped;
      }
    }
  };
}

module.exports = { createSendgridProvider };
