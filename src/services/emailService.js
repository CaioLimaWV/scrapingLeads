const crypto = require("crypto");
const env = require("../config/env");
const logger = require("../config/logger");
const {
  countSentToday,
  logEmailSend,
  listEligibleLeads
} = require("../repositories/emailRepository");
const {
  sendWithFallback,
  getCapacityMap,
  getTotalRemaining
} = require("./email/providerRegistry");

function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function applyTemplate(template, lead) {
  const firstName = (lead.name || "").split(" ")[0] || "você";
  return template.replace(/\{\{nome\}\}/gi, firstName);
}

// converte template de texto/HTML misto para HTML final com <br>
function toHtml(text) {
  return text.replace(/\n/g, "<br>");
}

// versão texto puro: remove tags HTML e decodifica entidades básicas
function toPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, "$2 ( $1 )")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function buildHtmlEmail(bodyHtml, unsubUrl) {
  const footer = unsubUrl
    ? `<br><br><hr style="border:none;border-top:1px solid #eee;margin:24px 0">
       <p style="font-size:12px;color:#999;text-align:center">
         Você recebeu este email pois seu contato está em nossa base de dados.<br>
         Para não receber mais mensagens,
         <a href="${unsubUrl}" style="color:#999">clique aqui para se descadastrar</a>.
       </p>`
    : `<br><br><p style="font-size:12px;color:#999">Para não receber mais este tipo de email, responda com "Descadastrar".</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:600px;margin:0 auto;padding:20px">
${bodyHtml}${footer}
</body>
</html>`;
}

function injectTracking(html, token, baseUrl) {
  if (!baseUrl) return html;

  const tracked = html.replace(
    /<a\s+([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>/gi,
    (_, pre, url, post) => {
      const encoded = encodeURIComponent(url);
      const trackUrl = `${baseUrl}/track/click/${token}?url=${encoded}`;
      return `<a ${pre}href="${trackUrl}"${post}>`;
    }
  );

  const pixel = `<img src="${baseUrl}/track/open/${token}.gif" width="1" height="1" style="display:none" alt="" />`;
  return tracked.replace(/<\/body>/i, `${pixel}</body>`) + (tracked.includes("</body>") ? "" : pixel);
}

function buildMailOptions({ from, fromName, to, subject, bodyHtml, token, baseUrl, unsubUrl }) {
  const htmlWithTracking = injectTracking(buildHtmlEmail(bodyHtml, unsubUrl), token, baseUrl);
  const text = toPlainText(bodyHtml);

  const headers = {};
  if (unsubUrl) {
    headers["List-Unsubscribe"] = `<${unsubUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  return {
    from: `"${fromName}" <${from}>`,
    to,
    subject,
    html: htmlWithTracking,
    text,
    headers
  };
}

async function runEmailCampaign({ sourceId, subject, template, dryRun = false }) {
  const totals = { sent: 0, failed: 0, skipped: 0, remaining: 0, byProvider: {} };

  const sentToday = await countSentToday();
  const { dailyLimit } = env.email;
  const providersRemaining = await getTotalRemaining();
  const available = Math.max(0, Math.min(dailyLimit - sentToday, providersRemaining));

  if (available <= 0) {
    logger.info(
      { sentToday, dailyLimit, providersRemaining },
      "Email daily capacity reached, skipping campaign"
    );
    totals.remaining = 0;
    return totals;
  }

  const leads = await listEligibleLeads({ sourceId, limit: available });

  if (leads.length === 0) {
    logger.info("No eligible leads found for email campaign");
    totals.remaining = available;
    return totals;
  }

  const { baseUrl } = env.email;

  for (const lead of leads) {
    const currentSentToday = await countSentToday();
    if (currentSentToday >= dailyLimit) {
      totals.skipped += leads.length - totals.sent - totals.failed;
      break;
    }

    const token = generateToken();
    const bodyHtml = toHtml(applyTemplate(template, lead));
    const unsubUrl = baseUrl ? `${baseUrl}/track/unsub/${token}` : null;
    const bodyPreview = toPlainText(bodyHtml).slice(0, 500);

    if (dryRun) {
      logger.info({ leadId: lead.id, email: lead.email }, "[dry-run] Would send email");
      await logEmailSend(null, {
        leadId: lead.id,
        subject,
        bodyPreview,
        status: "skipped",
        errorMessage: "dry-run",
        sentAt: null,
        trackingToken: null,
        provider: null
      });
      totals.skipped += 1;
      continue;
    }

    const mailOptions = buildMailOptions({
      from: env.email.from,
      fromName: env.email.fromName,
      to: lead.email,
      subject,
      bodyHtml,
      token,
      baseUrl,
      unsubUrl
    });

    try {
      const { providerName } = await sendWithFallback(mailOptions);

      await logEmailSend(null, {
        leadId: lead.id,
        subject,
        bodyPreview,
        status: "sent",
        errorMessage: null,
        sentAt: new Date(),
        trackingToken: token,
        provider: providerName
      });

      totals.sent += 1;
      totals.byProvider[providerName] = (totals.byProvider[providerName] || 0) + 1;
      logger.info({ leadId: lead.id, email: lead.email, provider: providerName }, "Email sent");

      await randomDelay(env.email.delayMinMs, env.email.delayMaxMs);
    } catch (err) {
      await logEmailSend(null, {
        leadId: lead.id,
        subject,
        bodyPreview,
        status: "failed",
        errorMessage: err.message,
        sentAt: null,
        trackingToken: null,
        provider: null
      });
      totals.failed += 1;
      logger.error({ leadId: lead.id, err }, "Failed to send email");

      if (err.providersExhausted) {
        totals.skipped += leads.length - totals.sent - totals.failed;
        break;
      }
    }
  }

  const finalSentToday = await countSentToday();
  const finalProvidersRemaining = await getTotalRemaining();
  totals.remaining = Math.max(0, Math.min(dailyLimit - finalSentToday, finalProvidersRemaining));

  return totals;
}

async function getEmailStatus() {
  const sentToday = await countSentToday();
  const { dailyLimit } = env.email;
  const capacity = await getCapacityMap();
  const providersRemaining = capacity.reduce((sum, c) => sum + c.remaining, 0);

  return {
    sentToday,
    dailyLimit,
    remaining: Math.max(0, Math.min(dailyLimit - sentToday, providersRemaining)),
    trackingEnabled: !!env.email.baseUrl,
    providers: capacity.map((c) => ({
      name: c.provider.name,
      sentToday: c.sent,
      dailyLimit: c.provider.dailyLimit,
      remaining: c.remaining
    }))
  };
}

async function sendTestEmail({ toEmail, subject, template }) {
  const token = generateToken();
  const fakeLead = { name: "Teste" };
  const bodyHtml = toHtml(applyTemplate(template, fakeLead));
  const { baseUrl } = env.email;
  const unsubUrl = baseUrl ? `${baseUrl}/track/unsub/${token}` : null;

  const mailOptions = buildMailOptions({
    from: env.email.from,
    fromName: env.email.fromName,
    to: toEmail,
    subject: `[TESTE] ${subject}`,
    bodyHtml,
    token,
    baseUrl,
    unsubUrl
  });

  const { providerName } = await sendWithFallback(mailOptions);
  return { provider: providerName };
}

module.exports = { runEmailCampaign, getEmailStatus, sendTestEmail };
