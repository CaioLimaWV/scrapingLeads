const axios = require("axios");

const MAILERSEND_API_URL = "https://api.mailersend.com/v1/email";
const MAILERSEND_QUOTA_URL = "https://api.mailersend.com/v1/api-quota";

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

function extractApiMessage(err) {
  const data = err.response?.data;
  if (!data) return err.message;
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.map((e) => e.message || e).join("; ");
  }
  return err.message;
}

function parseQuotaReset(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function fetchMailersendApiQuota(apiKey) {
  const response = await axios.get(MAILERSEND_QUOTA_URL, {
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      accept: "application/json"
    },
    validateStatus: (status) => status < 500
  });

  if (response.status === 401) {
    throw new Error("MailerSend API token is invalid (401)");
  }
  if (response.status !== 200) {
    throw new Error(`MailerSend quota check failed (${response.status})`);
  }

  const headerRemaining = response.headers["x-apiquota-remaining"];
  const headerReset = response.headers["x-apiquota-reset"];
  const body = response.data || {};

  return {
    quota: Number(body.quota ?? headerRemaining ?? 0),
    remaining: Number(body.remaining ?? headerRemaining ?? 0),
    reset: parseQuotaReset(body.reset || headerReset)
  };
}

function createMailersendProvider(config) {
  if (!config.apiKey) {
    throw new Error("MAILERSEND_API_TOKEN is required for mailersend provider");
  }

  const client = axios.create({
    baseURL: MAILERSEND_API_URL,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  return {
    name: "mailersend",
    dailyLimit: config.dailyLimit,
    async fetchApiQuota() {
      return fetchMailersendApiQuota(config.apiKey);
    },
    async send(mailOptions) {
      const from = parseAddress(mailOptions.from);
      const to = toRecipients(mailOptions.to);

      const payload = {
        from: from.name ? { email: from.email, name: from.name } : { email: from.email },
        to: to.map((recipient) =>
          recipient.name
            ? { email: recipient.email, name: recipient.name }
            : { email: recipient.email }
        ),
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text
      };

      try {
        await client.post("", payload);
      } catch (err) {
        const apiMessage = extractApiMessage(err);
        const status = err.response?.status;
        const wrapped = new Error(`MailerSend API error${status ? ` (${status})` : ""}: ${apiMessage}`);
        wrapped.cause = err;
        throw wrapped;
      }
    }
  };
}

module.exports = {
  createMailersendProvider,
  fetchMailersendApiQuota,
  parseQuotaReset
};
