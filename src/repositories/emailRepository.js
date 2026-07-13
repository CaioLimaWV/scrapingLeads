const db = require("../database/knex");

async function countSentToday() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const result = await db("email_sends")
    .where("status", "sent")
    .where("sent_at", ">=", todayStart)
    .count("id as count")
    .first();
  return Number(result.count);
}

async function hasBeenEmailed(leadId) {
  const row = await db("email_sends")
    .where("lead_id", leadId)
    .where("status", "sent")
    .first();
  return !!row;
}

async function logEmailSend(trx, {
  leadId,
  subject,
  bodyPreview,
  status,
  errorMessage,
  sentAt,
  trackingToken,
  provider,
  campaignId,
  campaignStepId,
  utmCampaign,
  utmLinks
}) {
  const utmLinksJson =
    utmLinks && utmLinks.length ? JSON.stringify(utmLinks) : null;

  const rows = await (trx || db)("email_sends").insert({
    lead_id: leadId,
    campaign_id: campaignId || null,
    campaign_step_id: campaignStepId || null,
    subject,
    body_preview: bodyPreview ? String(bodyPreview).slice(0, 500) : null,
    status,
    error_message: errorMessage || null,
    sent_at: sentAt || null,
    tracking_token: trackingToken || null,
    provider: provider || null,
    utm_campaign: utmCampaign || null,
    utm_links: utmLinksJson
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function countSentTodayByProvider() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const rows = await db("email_sends")
    .where("status", "sent")
    .where("sent_at", ">=", todayStart)
    .whereNotNull("provider")
    .select("provider")
    .count("id as count")
    .groupBy("provider");
  return rows.map((r) => ({ provider: r.provider, count: Number(r.count) }));
}

async function findSendByToken(token) {
  return db("email_sends").where("tracking_token", token).first();
}

async function recordEvent(emailSendId, { eventType, urlClicked, ip }) {
  await db("email_events").insert({
    email_send_id: emailSendId,
    event_type: eventType,
    url_clicked: urlClicked || null,
    ip: ip || null,
    occurred_at: new Date()
  });
  return emailSendId;
}

const { applyFollowUpFilters } = require("./campaignRepository");

async function listEligibleLeads({
  sourceId,
  sourceIds,
  fieldAreas,
  campaignId,
  limit,
  minDaysSinceEmail,
  requirePriorEmail
}) {
  const ids = [
    ...(sourceIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0),
    ...(sourceId ? [Number(sourceId)] : [])
  ];
  const areas = (fieldAreas || []).map((a) => String(a).trim().toLowerCase()).filter(Boolean);

  let query = db("leads")
    .select("leads.id", "leads.name", "leads.email", "leads.email_normalized")
    .where("leads.is_valid", true)
    .where("leads.is_active", true)
    .where("leads.email_unsubscribed", false)
    .whereRaw("leads.email_normalized NOT LIKE ?", ["%@mapscraper.local"])
    .whereRaw("leads.email_normalized NOT LIKE ?", ["%@lead.local"]);

  if (ids.length || areas.length) {
    query = query.join("lead_sources as ls", "ls.id", "leads.source_id");
    query.andWhere(function segmentWhere() {
      if (ids.length) this.whereIn("leads.source_id", ids);
      if (areas.length) {
        if (ids.length) this.orWhereIn("ls.field_area", areas);
        else this.whereIn("ls.field_area", areas);
      }
    });
  }

  if (campaignId) {
    query.whereNotExists(function () {
      this.select("id")
        .from("email_sends")
        .whereRaw("email_sends.lead_id = leads.id")
        .where("email_sends.campaign_id", campaignId)
        .where("email_sends.status", "sent");
    });
  } else {
    query.whereNotExists(function () {
      this.select("id")
        .from("email_sends")
        .whereRaw("email_sends.lead_id = leads.id")
        .where("email_sends.status", "sent");
    });
  }

  applyFollowUpFilters(query, { minDaysSinceEmail, requirePriorEmail });

  return query.limit(limit);
}

async function listEmailSends({ limit = 50, offset = 0 }) {
  const rows = await db("email_sends as es")
    .join("leads as l", "es.lead_id", "l.id")
    .leftJoin("email_campaigns as ec", "ec.id", "es.campaign_id")
    .select(
      "es.id",
      "es.lead_id",
      "l.name as lead_name",
      "l.email as lead_email",
      "es.subject",
      "es.status",
      "es.error_message",
      "es.sent_at",
      "es.tracking_token",
      "es.created_at",
      "es.provider",
      "es.utm_campaign",
      "es.utm_links",
      "ec.slug as campaign_slug",
      "ec.name as campaign_name"
    )
    .orderBy("es.created_at", "desc")
    .limit(limit)
    .offset(offset);

  if (!rows.length) return rows;

  // agregar contadores de eventos por send
  const ids = rows.map((r) => r.id);
  const events = await db("email_events")
    .whereIn("email_send_id", ids)
    .select("email_send_id", "event_type")
    .count("id as cnt")
    .groupBy("email_send_id", "event_type");

  const eventMap = {};
  for (const e of events) {
    if (!eventMap[e.email_send_id]) eventMap[e.email_send_id] = {};
    eventMap[e.email_send_id][e.event_type] = Number(e.cnt);
  }

  return rows.map((r) => {
    let utmLinks = [];
    if (r.utm_links) {
      try {
        utmLinks = JSON.parse(r.utm_links);
      } catch {
        utmLinks = [];
      }
    }
    return {
      ...r,
      utm_campaign: r.utm_campaign || r.campaign_slug || null,
      utm_links: utmLinks,
      opens: eventMap[r.id]?.open || 0,
      clicks: eventMap[r.id]?.click || 0
    };
  });
}

function normalizeDayKey(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function getAnalyticsByDay(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const sends = await db("email_sends")
    .where("status", "sent")
    .where("sent_at", ">=", since)
    .select(db.raw("DATE(sent_at) as day"), db.raw("COUNT(*) as total_sent"))
    .groupByRaw("DATE(sent_at)")
    .orderBy("day", "asc");

  const events = await db("email_events")
    .where("occurred_at", ">=", since)
    .select(
      db.raw("DATE(occurred_at) as day"),
      "event_type",
      db.raw("COUNT(*) as cnt")
    )
    .groupByRaw("DATE(occurred_at), event_type");

  const days_map = {};
  for (const s of sends) {
    const day = normalizeDayKey(s.day);
    days_map[day] = { day, sent: Number(s.total_sent), opens: 0, clicks: 0, unsubscribes: 0 };
  }
  for (const e of events) {
    const day = normalizeDayKey(e.day);
    if (!days_map[day]) days_map[day] = { day, sent: 0, opens: 0, clicks: 0, unsubscribes: 0 };
    if (e.event_type === "open") days_map[day].opens = Number(e.cnt);
    if (e.event_type === "click") days_map[day].clicks = Number(e.cnt);
    if (e.event_type === "unsubscribe") days_map[day].unsubscribes = Number(e.cnt);
  }

  return Object.values(days_map).sort((a, b) => a.day.localeCompare(b.day));
}

async function getClickStats(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return db("email_events")
    .where("event_type", "click")
    .where("occurred_at", ">=", since)
    .whereNotNull("url_clicked")
    .select("url_clicked", db.raw("COUNT(*) as cnt"))
    .groupBy("url_clicked")
    .orderBy("cnt", "desc")
    .limit(20);
}

async function getUtmCampaignStats(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const sentRows = await db("email_sends as es")
    .leftJoin("email_campaigns as ec", "ec.id", "es.campaign_id")
    .where("es.status", "sent")
    .where("es.sent_at", ">=", since)
    .select(db.raw("COALESCE(es.utm_campaign, ec.slug, 'sem-campanha') as utm_campaign"))
    .count("es.id as sent")
    .groupByRaw("COALESCE(es.utm_campaign, ec.slug, 'sem-campanha')")
    .orderBy("sent", "desc");

  const failedRows = await db("email_sends as es")
    .leftJoin("email_campaigns as ec", "ec.id", "es.campaign_id")
    .where("es.status", "failed")
    .where("es.created_at", ">=", since)
    .select(db.raw("COALESCE(es.utm_campaign, ec.slug, 'sem-campanha') as utm_campaign"))
    .count("es.id as failed")
    .groupByRaw("COALESCE(es.utm_campaign, ec.slug, 'sem-campanha')");

  const failedMap = Object.fromEntries(
    failedRows.map((r) => [r.utm_campaign, Number(r.failed)])
  );

  return sentRows.map((r) => ({
    utm_campaign: r.utm_campaign,
    sent: Number(r.sent),
    failed: failedMap[r.utm_campaign] || 0
  }));
}

async function markLeadUnsubscribed(leadId) {
  await db("leads").where("id", leadId).update({
    email_unsubscribed: true,
    suppressed_at: db.fn.now(),
    updated_at: db.fn.now()
  });
}

const VALID_EVENT_TYPES = new Set(["open", "click", "unsubscribe"]);

async function listLeadEmailEvents(leadId, { limit = 50, offset = 0, eventType = null } = {}) {
  const lead = await db("leads")
    .select("id", "name", "email")
    .where({ id: leadId })
    .first();

  if (!lead) return null;

  let countQuery = db("email_events as ee")
    .join("email_sends as es", "es.id", "ee.email_send_id")
    .where("es.lead_id", leadId);

  if (eventType) {
    countQuery = countQuery.where("ee.event_type", eventType);
  }

  const totalRow = await countQuery.clone().count("ee.id as count").first();
  const total = Number(totalRow?.count || 0);

  let eventsQuery = db("email_events as ee")
    .join("email_sends as es", "es.id", "ee.email_send_id")
    .leftJoin("email_campaigns as ec", "ec.id", "es.campaign_id")
    .where("es.lead_id", leadId)
    .select(
      "ee.id",
      "ee.event_type",
      "ee.url_clicked",
      "ee.ip",
      "ee.occurred_at",
      "es.id as email_send_id",
      "es.subject as email_subject",
      "es.sent_at as email_sent_at",
      "es.provider",
      "es.utm_campaign",
      "ec.name as campaign_name",
      "ec.slug as campaign_slug"
    )
    .orderBy("ee.occurred_at", "desc")
    .limit(limit)
    .offset(offset);

  if (eventType) {
    eventsQuery = eventsQuery.where("ee.event_type", eventType);
  }

  const events = await eventsQuery;

  return {
    lead,
    events: events.map((e) => ({
      ...e,
      utm_campaign: e.utm_campaign || e.campaign_slug || null
    })),
    total
  };
}

module.exports = {
  countSentToday,
  countSentTodayByProvider,
  hasBeenEmailed,
  logEmailSend,
  findSendByToken,
  recordEvent,
  listEligibleLeads,
  listEmailSends,
  getAnalyticsByDay,
  getClickStats,
  getUtmCampaignStats,
  markLeadUnsubscribed,
  listLeadEmailEvents,
  VALID_EVENT_TYPES
};
