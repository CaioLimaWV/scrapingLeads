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

async function logEmailSend(trx, { leadId, subject, bodyPreview, status, errorMessage, sentAt, trackingToken, provider }) {
  const rows = await (trx || db)("email_sends").insert({
    lead_id: leadId,
    subject,
    body_preview: bodyPreview ? String(bodyPreview).slice(0, 500) : null,
    status,
    error_message: errorMessage || null,
    sent_at: sentAt || null,
    tracking_token: trackingToken || null,
    provider: provider || null
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
}

async function listEligibleLeads({ sourceId, limit }) {
  let query = db("leads")
    .select("id", "name", "email", "email_normalized")
    .where("is_valid", true)
    .where("is_active", true)
    .where("email_unsubscribed", false)
    .whereRaw("email_normalized NOT LIKE ?", ["%@mapscraper.local"])
    .whereRaw("email_normalized NOT LIKE ?", ["%@lead.local"])
    .whereNotExists(function () {
      this.select("id")
        .from("email_sends")
        .whereRaw("email_sends.lead_id = leads.id")
        .where("email_sends.status", "sent");
    })
    .limit(limit);

  if (sourceId) {
    query = query.where("source_id", sourceId);
  }

  return query;
}

async function listEmailSends({ limit = 50, offset = 0 }) {
  const rows = await db("email_sends as es")
    .join("leads as l", "es.lead_id", "l.id")
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
      "es.created_at"
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

  return rows.map((r) => ({
    ...r,
    opens: eventMap[r.id]?.open || 0,
    clicks: eventMap[r.id]?.click || 0
  }));
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
    days_map[s.day] = { day: s.day, sent: Number(s.total_sent), opens: 0, clicks: 0, unsubscribes: 0 };
  }
  for (const e of events) {
    if (!days_map[e.day]) days_map[e.day] = { day: e.day, sent: 0, opens: 0, clicks: 0, unsubscribes: 0 };
    if (e.event_type === "open") days_map[e.day].opens = Number(e.cnt);
    if (e.event_type === "click") days_map[e.day].clicks = Number(e.cnt);
    if (e.event_type === "unsubscribe") days_map[e.day].unsubscribes = Number(e.cnt);
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

async function markLeadUnsubscribed(leadId) {
  await db("leads").where("id", leadId).update({ email_unsubscribed: true });
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
  markLeadUnsubscribed
};
