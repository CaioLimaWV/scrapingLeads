const axios = require("axios");

const ELASTIC_EMAIL_API_URL = "https://api.elasticemail.com/v4/emails/transactional";

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

function toElasticHeaders(headers) {
  if (!headers || typeof headers !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function createElasticEmailProvider(config) {
  if (!config.apiKey) {
    throw new Error("ELASTIC_EMAIL_API_KEY is required for elasticemail provider");
  }

  const client = axios.create({
    baseURL: ELASTIC_EMAIL_API_URL,
    timeout: 15000,
    headers: {
      "X-ElasticEmail-ApiKey": config.apiKey,
      "content-type": "application/json",
      accept: "application/json"
    }
  });

  return {
    name: "elasticemail",
    dailyLimit: config.dailyLimit,
    async send(mailOptions) {
      const from = parseAddress(mailOptions.from);
      const to = toRecipients(mailOptions.to).map((r) => r.email);
      const body = [];

      if (mailOptions.html) {
        body.push({ ContentType: "HTML", Content: mailOptions.html });
      }
      if (mailOptions.text) {
        body.push({ ContentType: "PlainText", Content: mailOptions.text });
      }

      const payload = {
        Recipients: { To: to },
        Content: {
          From: formatFrom(from),
          Subject: mailOptions.subject,
          Body: body,
          Headers: toElasticHeaders(mailOptions.headers)
        }
      };

      try {
        await client.post("", payload);
      } catch (err) {
        const apiData = err.response?.data;
        const apiMessage = apiData?.Error || apiData?.message || err.message;
        const status = err.response?.status;
        const wrapped = new Error(
          `Elastic Email API error${status ? ` (${status})` : ""}: ${apiMessage}`
        );
        wrapped.cause = err;
        throw wrapped;
      }
    }
  };
}

module.exports = { createElasticEmailProvider };
