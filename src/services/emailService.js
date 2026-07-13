const crypto = require("crypto");
const env = require("../config/env");
const logger = require("../config/logger");
const db = require("../database/knex");
const { recalculateLeadEngagement } = require("./leadScoringService");
const {
  countSentToday,
  logEmailSend,
  listEligibleLeads
} = require("../repositories/emailRepository");
const {
  sendWithFallback,
  getCapacityMap,
  getTotalRemaining,
  getAuthBlockedInfo
} = require("./email/providerRegistry");
const { injectPortfolioUtms, resolveUtmCampaign, extractUtmLinks } = require("../utils/emailUtm");
const {
  getCampaignById,
  markCampaignDispatched
} = require("../repositories/campaignRepository");
const {
  listStepsByCampaignId,
  listEligibleLeadSteps,
  getStepStats
} = require("../repositories/campaignStepRepository");

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

function prepareOutgoingEmail({ from, fromName, to, subject, bodyHtml, token, baseUrl, unsubUrl, utmCampaign }) {
  const bodyWithUtm = injectPortfolioUtms(bodyHtml, subject, utmCampaign);
  const utmCampaignResolved = resolveUtmCampaign(subject, utmCampaign);
  const utmLinks = extractUtmLinks(bodyWithUtm);
  const htmlWithTracking = injectTracking(buildHtmlEmail(bodyWithUtm, unsubUrl), token, baseUrl);
  const text = toPlainText(bodyWithUtm);

  const headers = {};
  if (unsubUrl) {
    headers["List-Unsubscribe"] = `<${unsubUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  return {
    mailOptions: {
      from: `"${fromName}" <${from}>`,
      to,
      subject,
      html: htmlWithTracking,
      text,
      headers
    },
    utmCampaign: utmCampaignResolved,
    utmLinks,
    bodyPreview: text.slice(0, 500)
  };
}

function buildMailOptions(opts) {
  return prepareOutgoingEmail(opts).mailOptions;
}

async function resolveDispatchBudget({ batchLimit, dryRun, preferProvider = null }) {
  const sentToday = await countSentToday();
  const { dailyLimit } = env.email;
  const capacity = await getCapacityMap();
  const providersRemaining = capacity.reduce((sum, row) => sum + row.remaining, 0);
  const activeProviders = capacity.filter((row) => row.remaining > 0);
  const onlyMailersendLeft =
    activeProviders.length === 1 && activeProviders[0].provider.name === "mailersend";
  const effectivePrefer = preferProvider || (onlyMailersendLeft ? "mailersend" : null);
  const wantsMonitor = !dryRun && !!env.email.monitorTo && !onlyMailersendLeft;
  const globalAvailable = Math.max(0, Math.min(dailyLimit - sentToday, providersRemaining));
  const available = batchLimit ? Math.min(globalAvailable, batchLimit) : globalAvailable;
  const leadBatchLimit = wantsMonitor ? Math.max(0, available - 1) : available;

  return {
    sentToday,
    dailyLimit,
    providersRemaining,
    onlyMailersendLeft,
    preferProvider: effectivePrefer,
    wantsMonitor,
    available,
    leadBatchLimit
  };
}

async function sendMonitorCopy({ subject, template, utmCampaign, skipForMailersendReserve = false }) {
  const { monitorTo, monitorName, baseUrl } = env.email;
  if (!monitorTo) return false;

  if (skipForMailersendReserve) {
    logger.info("Skipping monitor copy to preserve MailerSend daily slots for leads");
    return false;
  }

  const token = generateToken();
  const fakeLead = { name: monitorName };
  const bodyHtml = toHtml(applyTemplate(template, fakeLead));
  const personalizedSubject = applyTemplate(subject, fakeLead);
  const unsubUrl = baseUrl ? `${baseUrl}/track/unsub/${token}` : null;

  const mailOptions = buildMailOptions({
    from: env.email.from,
    fromName: env.email.fromName,
    to: monitorTo,
    subject: personalizedSubject,
    bodyHtml,
    token,
    baseUrl,
    unsubUrl,
    utmCampaign
  });

  const { providerName } = await sendWithFallback(mailOptions);
  logger.info({ to: monitorTo, provider: providerName }, "Monitor copy sent");
  return true;
}

async function runEmailCampaign({
  sourceId,
  sourceIds,
  fieldAreas,
  subject,
  template,
  dryRun = false,
  campaignId = null,
  utmCampaign = null,
  batchLimit = null,
  minDaysSinceEmail = null,
  requirePriorEmail = false,
  preferProvider = null
}) {
  const totals = { sent: 0, failed: 0, skipped: 0, remaining: 0, byProvider: {}, monitorSent: false };

  const budget = await resolveDispatchBudget({ batchLimit, dryRun, preferProvider });
  const { dailyLimit, preferProvider: effectivePrefer, wantsMonitor, leadBatchLimit, available } = budget;

  if (leadBatchLimit <= 0 && !wantsMonitor) {
    logger.info(
      { sentToday: budget.sentToday, dailyLimit, providersRemaining: budget.providersRemaining, batchLimit },
      "Email daily capacity reached, skipping campaign"
    );
    totals.remaining = 0;
    return totals;
  }

  const leads = await listEligibleLeads({
    sourceId,
    sourceIds,
    fieldAreas,
    campaignId,
    limit: leadBatchLimit,
    minDaysSinceEmail,
    requirePriorEmail
  });

  if (leads.length === 0 && !wantsMonitor) {
    logger.info({ campaignId }, "No eligible leads found for email campaign");
    totals.remaining = available;
    return totals;
  }

  const { baseUrl } = env.email;

  if (wantsMonitor) {
    try {
      totals.monitorSent = await sendMonitorCopy({ subject, template, utmCampaign });
    } catch (err) {
      logger.error({ err, to: env.email.monitorTo }, "Failed to send monitor copy");
    }
  }

  for (const lead of leads) {
    const currentSentToday = await countSentToday();
    if (currentSentToday >= dailyLimit) {
      totals.skipped += leads.length - totals.sent - totals.failed;
      break;
    }

    const token = generateToken();
    const bodyHtml = toHtml(applyTemplate(template, lead));
    const personalizedSubject = applyTemplate(subject, lead);
    const unsubUrl = baseUrl ? `${baseUrl}/track/unsub/${token}` : null;
    const prepared = prepareOutgoingEmail({
      from: env.email.from,
      fromName: env.email.fromName,
      to: lead.email,
      subject: personalizedSubject,
      bodyHtml,
      token,
      baseUrl,
      unsubUrl,
      utmCampaign
    });

    if (dryRun) {
      logger.info({ leadId: lead.id, email: lead.email, campaignId }, "[dry-run] Would send email");
      totals.skipped += 1;
      continue;
    }

    try {
      const { providerName } = await sendWithFallback(prepared.mailOptions, {
        preferProvider: effectivePrefer
      });

      await logEmailSend(null, {
        leadId: lead.id,
        campaignId,
        subject: personalizedSubject,
        bodyPreview: prepared.bodyPreview,
        status: "sent",
        errorMessage: null,
        sentAt: new Date(),
        trackingToken: token,
        provider: providerName,
        utmCampaign: prepared.utmCampaign,
        utmLinks: prepared.utmLinks
      });

      totals.sent += 1;
      totals.byProvider[providerName] = (totals.byProvider[providerName] || 0) + 1;
      logger.info({ leadId: lead.id, email: lead.email, provider: providerName, campaignId }, "Email sent");

      recalculateLeadEngagement(lead.id).catch((err) =>
        logger.error({ err, leadId: lead.id }, "Failed to recalculate engagement after email send")
      );

      await randomDelay(env.email.delayMinMs, env.email.delayMaxMs);
    } catch (err) {
      await logEmailSend(null, {
        leadId: lead.id,
        campaignId,
        campaignStepId: null,
        subject: personalizedSubject,
        bodyPreview: prepared.bodyPreview,
        status: "failed",
        errorMessage: err.message,
        sentAt: null,
        trackingToken: null,
        provider: null,
        utmCampaign: prepared.utmCampaign,
        utmLinks: prepared.utmLinks
      });
      totals.failed += 1;
      logger.error({ leadId: lead.id, err, campaignId }, "Failed to send email");

      if (err.providersExhausted) {
        totals.skipped += leads.length - totals.sent - totals.failed;
        break;
      }
    }
  }

  if (!dryRun && campaignId && totals.sent > 0) {
    await markCampaignDispatched(campaignId);
  }

  const finalSentToday = await countSentToday();
  const finalProvidersRemaining = await getTotalRemaining();
  totals.remaining = Math.max(0, Math.min(dailyLimit - finalSentToday, finalProvidersRemaining));

  return totals;
}

async function runCampaignSequenceDispatch(campaign, { dryRun = false, preferProvider = null } = {}) {
  const totals = {
    sent: 0,
    failed: 0,
    skipped: 0,
    remaining: 0,
    byProvider: {},
    byStep: {},
    monitorSent: false
  };

  const batchLimit = campaign.daily_batch_size || env.email.defaultBatch;
  const budget = await resolveDispatchBudget({ batchLimit, dryRun, preferProvider });
  const { dailyLimit, preferProvider: effectivePrefer, wantsMonitor, leadBatchLimit } = budget;

  if (leadBatchLimit <= 0 && !wantsMonitor) {
    totals.remaining = 0;
    return totals;
  }

  const queue = await listEligibleLeadSteps(campaign, leadBatchLimit);
  if (queue.length === 0 && !wantsMonitor) {
    totals.remaining = 0;
    return totals;
  }

  const { baseUrl } = env.email;
  const utmCampaign = campaign.slug;

  if (wantsMonitor && queue.length) {
    const first = queue[0].step;
    try {
      totals.monitorSent = await sendMonitorCopy({
        subject: first.subject,
        template: first.template,
        utmCampaign
      });
    } catch (err) {
      logger.error({ err, to: env.email.monitorTo }, "Failed to send monitor copy");
    }
  }

  for (const { lead, step } of queue) {
    const currentSentToday = await countSentToday();
    if (currentSentToday >= dailyLimit) {
      totals.skipped += queue.length - totals.sent - totals.failed;
      break;
    }

    const token = generateToken();
    const bodyHtml = toHtml(applyTemplate(step.template, lead));
    const personalizedSubject = applyTemplate(step.subject, lead);
    const unsubUrl = baseUrl ? `${baseUrl}/track/unsub/${token}` : null;
    const prepared = prepareOutgoingEmail({
      from: env.email.from,
      fromName: env.email.fromName,
      to: lead.email,
      subject: personalizedSubject,
      bodyHtml,
      token,
      baseUrl,
      unsubUrl,
      utmCampaign
    });

    if (dryRun) {
      logger.info(
        { leadId: lead.id, email: lead.email, campaignId: campaign.id, step: step.step_order },
        "[dry-run] Would send campaign step"
      );
      totals.skipped += 1;
      continue;
    }

    try {
      const { providerName } = await sendWithFallback(prepared.mailOptions, {
        preferProvider: effectivePrefer
      });

      await logEmailSend(null, {
        leadId: lead.id,
        campaignId: campaign.id,
        campaignStepId: step.id,
        subject: personalizedSubject,
        bodyPreview: prepared.bodyPreview,
        status: "sent",
        errorMessage: null,
        sentAt: new Date(),
        trackingToken: token,
        provider: providerName,
        utmCampaign: prepared.utmCampaign,
        utmLinks: prepared.utmLinks
      });

      totals.sent += 1;
      totals.byProvider[providerName] = (totals.byProvider[providerName] || 0) + 1;
      totals.byStep[step.step_order] = (totals.byStep[step.step_order] || 0) + 1;
      logger.info(
        { leadId: lead.id, email: lead.email, provider: providerName, campaignId: campaign.id, step: step.step_order },
        "Campaign step sent"
      );

      recalculateLeadEngagement(lead.id).catch((err) =>
        logger.error({ err, leadId: lead.id }, "Failed to recalculate engagement after email send")
      );

      await randomDelay(env.email.delayMinMs, env.email.delayMaxMs);
    } catch (err) {
      await logEmailSend(null, {
        leadId: lead.id,
        campaignId: campaign.id,
        campaignStepId: step.id,
        subject: personalizedSubject,
        bodyPreview: prepared.bodyPreview,
        status: "failed",
        errorMessage: err.message,
        sentAt: null,
        trackingToken: null,
        provider: null,
        utmCampaign: prepared.utmCampaign,
        utmLinks: prepared.utmLinks
      });
      totals.failed += 1;
      logger.error({ leadId: lead.id, err, campaignId: campaign.id, step: step.step_order }, "Failed to send campaign step");

      if (err.providersExhausted) {
        totals.skipped += queue.length - totals.sent - totals.failed;
        break;
      }
    }
  }

  if (!dryRun && totals.sent > 0) {
    await markCampaignDispatched(campaign.id);
  }

  const { countEligibleLeadSteps } = require("../repositories/campaignStepRepository");
  totals.remaining = await countEligibleLeadSteps(campaign);

  return totals;
}

async function dispatchSavedCampaign(campaignId, { dryRun = false, preferProvider = null } = {}) {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    const err = new Error("Campanha não encontrada");
    err.statusCode = 404;
    throw err;
  }
  if (campaign.status !== "active") {
    const err = new Error("Campanha não está ativa");
    err.statusCode = 400;
    throw err;
  }

  const steps = await listStepsByCampaignId(campaign.id);
  if (steps.length) {
    return runCampaignSequenceDispatch(campaign, { dryRun, preferProvider });
  }

  return runEmailCampaign({
    sourceIds: campaign.source_ids,
    fieldAreas: campaign.field_areas,
    subject: campaign.subject,
    template: campaign.template,
    dryRun,
    campaignId: campaign.id,
    utmCampaign: campaign.slug,
    batchLimit: campaign.daily_batch_size || env.email.defaultBatch,
    minDaysSinceEmail: campaign.min_days_since_email,
    requirePriorEmail: campaign.require_prior_email,
    preferProvider
  });
}

async function getEmailStatus() {
  const sentToday = await countSentToday();
  const { dailyLimit } = env.email;
  const capacity = await getCapacityMap();
  const providersRemaining = capacity.reduce((sum, c) => sum + c.remaining, 0);
  const authBlocked = getAuthBlockedInfo();

  const recentMailersendFailure = await db("email_sends")
    .where({ status: "failed" })
    .whereRaw("DATE(created_at) >= CURDATE()")
    .whereRaw("error_message LIKE ?", ["%MailerSend%"])
    .orderBy("id", "desc")
    .select("error_message", "created_at")
    .first();

  const mailersendCapacity = capacity.find((row) => row.provider.name === "mailersend");

  return {
    sentToday,
    dailyLimit,
    remaining: Math.max(0, Math.min(dailyLimit - sentToday, providersRemaining)),
    trackingEnabled: !!env.email.baseUrl,
    monitorTo: env.email.monitorTo || null,
    delayMinMs: env.email.delayMinMs,
    delayMaxMs: env.email.delayMaxMs,
    defaultBatch: env.email.defaultBatch,
    authBlocked,
    mailersend: {
      sentToday: mailersendCapacity?.sent || 0,
      dailyLimit: mailersendCapacity?.provider.dailyLimit || 0,
      remaining: mailersendCapacity?.remaining || 0,
      lastError:
        authBlocked.mailersend?.message ||
        recentMailersendFailure?.error_message ||
        null
    },
    providers: await Promise.all(
      capacity.map(async (c) => {
        const entry = {
          name: c.provider.name,
          sentToday: c.sent,
          dailyLimit: c.provider.dailyLimit,
          remaining: c.remaining
        };

        if (c.provider.name === "mailersend" && c.provider.fetchApiQuota) {
          try {
            const apiQuota = await c.provider.fetchApiQuota();
            entry.apiQuota = {
              quota: apiQuota.quota,
              remaining: apiQuota.remaining,
              reset: apiQuota.reset?.toISOString() || null
            };
          } catch (err) {
            entry.apiQuota = { error: err.message };
          }
        }

        return entry;
      })
    )
  };
}

async function resolveLeadIdForTestEmail(toEmail) {
  const email = String(toEmail || "").trim();
  const emailNormalized = email.toLowerCase();

  const existing = await db("leads").select("id").where({ email_normalized: emailNormalized }).first();
  if (existing) return existing.id;

  const source =
    (await db("lead_sources").select("id").where({ name: "manual-scraping" }).first()) ||
    (await db("lead_sources").select("id").orderBy("id", "asc").first());

  if (!source) {
    throw new Error("Nenhuma fonte cadastrada para vincular email de teste");
  }

  const [insertedId] = await db("leads").insert({
    name: "Teste Email",
    email,
    email_normalized: emailNormalized,
    phone: null,
    phone_normalized: null,
    source_id: source.id,
    raw_data: JSON.stringify({ origin: "email_test" }),
    is_valid: true,
    is_active: true
  });

  return insertedId;
}

async function sendTestEmail({ toEmail, subject, template }) {
  const token = generateToken();
  const fakeLead = { name: "Teste" };
  const bodyHtml = toHtml(applyTemplate(template, fakeLead));
  const personalizedSubject = applyTemplate(subject, fakeLead);
  const { baseUrl } = env.email;
  const unsubUrl = baseUrl ? `${baseUrl}/track/unsub/${token}` : null;
  const leadId = await resolveLeadIdForTestEmail(toEmail);

  const prepared = prepareOutgoingEmail({
    from: env.email.from,
    fromName: env.email.fromName,
    to: toEmail,
    subject: `[TESTE] ${personalizedSubject}`,
    bodyHtml,
    token,
    baseUrl,
    unsubUrl
  });

  const { providerName } = await sendWithFallback(prepared.mailOptions);

  await logEmailSend(null, {
    leadId,
    subject: `[TESTE] ${personalizedSubject}`,
    bodyPreview: prepared.bodyPreview,
    status: "sent",
    errorMessage: null,
    sentAt: new Date(),
    trackingToken: token,
    provider: providerName,
    utmCampaign: prepared.utmCampaign,
    utmLinks: prepared.utmLinks
  });

  recalculateLeadEngagement(leadId).catch((err) =>
    logger.error({ err, leadId }, "Failed to recalculate engagement after test email")
  );

  return { provider: providerName, trackingToken: token, utmCampaign: prepared.utmCampaign, utmLinks: prepared.utmLinks };
}

module.exports = { runEmailCampaign, dispatchSavedCampaign, getEmailStatus, sendTestEmail };
