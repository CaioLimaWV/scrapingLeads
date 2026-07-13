const db = require("../database/knex");
const logger = require("../config/logger");

const PORTFOLIO_HOSTS = ["izaiasbessa.com.br", "www.izaiasbessa.com.br", "izaiasramos.dev", "www.izaiasramos.dev"];
const SCHEDULE_HOSTS = ["calendly.com", "cal.com", "calendar.google.com"];

function classifyClickUrl(url) {
  if (!url) return "generic";
  const lower = String(url).toLowerCase();
  if (lower.includes("wa.me") || lower.includes("whatsapp.com")) return "whatsapp";
  if (SCHEDULE_HOSTS.some((h) => lower.includes(h))) return "schedule";
  if (PORTFOLIO_HOSTS.some((h) => lower.includes(h))) return "portfolio";
  if (lower.includes("ansiedadepsicologa.com.br") || lower.includes("brubspsi.com.br")) return "portfolio";
  return "generic";
}

function deriveTemperature(score, emailUnsubscribed, isActive = true) {
  if (!isActive || emailUnsubscribed) return "lost";
  if (score >= 5) return "hot";
  if (score >= 1) return "warm";
  return "cold";
}

function deriveFunnelStage({ score, emailUnsubscribed, isActive = true, emailsSent, hasWhatsappClick, hasScheduleClick, contacted }) {
  if (!isActive || emailUnsubscribed) return "lost";
  if (hasScheduleClick || contacted || (score >= 8) || (score >= 5 && hasWhatsappClick)) {
    return "bottom";
  }
  if (emailsSent >= 2 || score >= 2) return "middle";
  return "top";
}

function deriveNextAction({ temperature, funnelStage, emailUnsubscribed, isActive = true, whatsappOptOut = false, emailsSent, opens, clicks, contacted, deepCold }) {
  if (!isActive) return "Contato inativado — nao abordar";
  if (emailUnsubscribed) return "Fora do funil — descadastrado de email";
  if (whatsappOptOut) return "WhatsApp bloqueado — nao contatar por telefone";
  if (deepCold) return "Pausar campanha — 3+ emails sem interação";
  if (temperature === "hot" && funnelStage === "bottom") return "WhatsApp urgente — lead pronto";
  if (temperature === "hot") return "WhatsApp prioritário hoje";
  if (contacted) return "Aguardar resposta / fechar orçamento";
  if (funnelStage === "bottom") return "Contato 1:1 — orçamento";
  if (funnelStage === "middle" && clicks > 0) return "WhatsApp ou email 3 (CTA final)";
  if (funnelStage === "middle") return "Enviar email 2 ou 3 da sequência";
  if (emailsSent === 0) return "Enviar email 1 (campanha)";
  if (emailsSent >= 1 && opens === 0) return "Aguardar ou email 2 (dia 3)";
  return "Monitorar — sequência em andamento";
}

function computeScore(signals) {
  if (!signals.isActive || signals.emailUnsubscribed) return -100;

  let score = 0;
  const opensBySend = signals.opensBySend || {};
  const sendIdsWithOpen = new Set();
  let firstOpenCounted = false;

  for (const [sendId, count] of Object.entries(opensBySend)) {
    if (count > 0) {
      sendIdsWithOpen.add(sendId);
      if (!firstOpenCounted) {
        score += 1;
        firstOpenCounted = true;
      }
      if (count >= 4) {
        score += 1;
      }
    }
  }

  if (sendIdsWithOpen.size >= 2) {
    score += 2;
  }

  const clickBonus = { whatsapp: 0, schedule: 0, portfolio: 0, generic: 0 };
  for (const clickType of signals.clickTypes || []) {
    clickBonus[clickType] = (clickBonus[clickType] || 0) + 1;
  }
  if (clickBonus.whatsapp > 0) score += 3;
  if (clickBonus.schedule > 0) score += 5;
  if (clickBonus.portfolio > 0) score += 2;
  if (clickBonus.generic > 0) score += 2;

  if (signals.contacted) {
    score += 1;
  }

  return score;
}

async function fetchLeadSignals(leadId) {
  const lead = await db("leads")
    .select("id", "email_unsubscribed", "whatsapp_opt_out", "is_active", "contacted", "contacted_at")
    .where({ id: leadId })
    .first();

  if (!lead) return null;

  const sends = await db("email_sends")
    .select("id", "sent_at")
    .where({ lead_id: leadId, status: "sent" })
    .orderBy("sent_at", "asc");

  const sendIds = sends.map((s) => s.id);
  let events = [];

  if (sendIds.length) {
    events = await db("email_events")
      .whereIn("email_send_id", sendIds)
      .select("email_send_id", "event_type", "url_clicked", "occurred_at");
  }

  const opensBySend = {};
  const clickTypes = [];
  let lastEngagementAt = lead.contacted_at ? new Date(lead.contacted_at) : null;

  for (const ev of events) {
    const at = ev.occurred_at ? new Date(ev.occurred_at) : null;
    if (at && (!lastEngagementAt || at > lastEngagementAt)) {
      lastEngagementAt = at;
    }

    if (ev.event_type === "open") {
      opensBySend[ev.email_send_id] = (opensBySend[ev.email_send_id] || 0) + 1;
    }
    if (ev.event_type === "click") {
      clickTypes.push(classifyClickUrl(ev.url_clicked));
    }
  }

  const totalOpens = Object.values(opensBySend).reduce((a, b) => a + b, 0);
  const hasWhatsappClick = clickTypes.includes("whatsapp");
  const hasScheduleClick = clickTypes.includes("schedule");
  const deepCold = sends.length >= 3 && totalOpens === 0 && clickTypes.length === 0;

  return {
    leadId,
    emailUnsubscribed: !!lead.email_unsubscribed,
    whatsappOptOut: !!lead.whatsapp_opt_out,
    isActive: !!lead.is_active,
    contacted: !!lead.contacted,
    emailsSent: sends.length,
    opensBySend,
    clickTypes,
    totalOpens,
    totalClicks: clickTypes.length,
    hasWhatsappClick,
    hasScheduleClick,
    deepCold,
    lastEngagementAt
  };
}

function buildEngagementFromSignals(signals) {
  const score = computeScore(signals);
  const temperature = deriveTemperature(score, signals.emailUnsubscribed, signals.isActive);
  const funnelStage = deriveFunnelStage({
    score,
    emailUnsubscribed: signals.emailUnsubscribed,
    isActive: signals.isActive,
    emailsSent: signals.emailsSent,
    hasWhatsappClick: signals.hasWhatsappClick,
    hasScheduleClick: signals.hasScheduleClick,
    contacted: signals.contacted
  });
  const nextAction = deriveNextAction({
    temperature,
    funnelStage,
    emailUnsubscribed: signals.emailUnsubscribed,
    isActive: signals.isActive,
    whatsappOptOut: signals.whatsappOptOut,
    emailsSent: signals.emailsSent,
    opens: signals.totalOpens,
    clicks: signals.totalClicks,
    contacted: signals.contacted,
    deepCold: signals.deepCold
  });

  return {
    engagement_score: score,
    temperature,
    funnel_stage: funnelStage,
    last_engagement_at: signals.lastEngagementAt,
    next_action: nextAction,
    emails_sent: signals.emailsSent,
    total_opens: signals.totalOpens,
    total_clicks: signals.totalClicks
  };
}

async function recalculateLeadEngagement(leadId) {
  const signals = await fetchLeadSignals(leadId);
  if (!signals) return null;

  const engagement = buildEngagementFromSignals(signals);

  await db("leads")
    .where({ id: leadId })
    .update({
      engagement_score: engagement.engagement_score,
      temperature: engagement.temperature,
      funnel_stage: engagement.funnel_stage,
      last_engagement_at: engagement.last_engagement_at,
      next_action: engagement.next_action
    });

  return engagement;
}

async function recalculateLeadEngagementBySendId(emailSendId) {
  const send = await db("email_sends").select("lead_id").where({ id: emailSendId }).first();
  if (!send) return null;
  return recalculateLeadEngagement(send.lead_id);
}

async function recalculateAllLeads({ batchSize = 500 } = {}) {
  let offset = 0;
  let processed = 0;

  while (true) {
    const rows = await db("leads").select("id").orderBy("id", "asc").limit(batchSize).offset(offset);
    if (!rows.length) break;

    for (const row of rows) {
      await recalculateLeadEngagement(row.id);
      processed += 1;
    }

    offset += rows.length;
    if (rows.length < batchSize) break;
  }

  logger.info({ processed }, "Lead engagement recalculated for all leads");
  return { processed };
}

async function getEngagementSummary() {
  const rows = await db("leads")
    .select("temperature", "funnel_stage")
    .count("id as count")
    .groupBy("temperature", "funnel_stage");

  const summary = {
    byTemperature: { cold: 0, warm: 0, hot: 0, lost: 0 },
    byFunnel: { top: 0, middle: 0, bottom: 0, lost: 0 },
    matrix: {}
  };

  for (const row of rows) {
    const count = Number(row.count);
    summary.byTemperature[row.temperature] = (summary.byTemperature[row.temperature] || 0) + count;
    summary.byFunnel[row.funnel_stage] = (summary.byFunnel[row.funnel_stage] || 0) + count;
    const key = `${row.temperature}:${row.funnel_stage}`;
    summary.matrix[key] = count;
  }

  return summary;
}

module.exports = {
  classifyClickUrl,
  computeScore,
  deriveTemperature,
  deriveFunnelStage,
  deriveNextAction,
  fetchLeadSignals,
  buildEngagementFromSignals,
  recalculateLeadEngagement,
  recalculateLeadEngagementBySendId,
  recalculateAllLeads,
  getEngagementSummary
};
