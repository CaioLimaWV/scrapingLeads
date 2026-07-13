const db = require("../database/knex");
const { slugifyUtm } = require("../utils/emailUtm");
const { applyHigherPriorityExclusion } = require("../services/email/campaignExclusive");

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeCampaignRow(row) {
  if (!row) return row;
  return {
    ...row,
    source_ids: parseJsonArray(row.source_ids),
    field_areas: parseJsonArray(row.field_areas),
    min_days_since_email:
      row.min_days_since_email != null ? Number(row.min_days_since_email) : null,
    require_prior_email: !!row.require_prior_email
  };
}

function applyFollowUpFilters(query, { minDaysSinceEmail, requirePriorEmail } = {}) {
  if (requirePriorEmail) {
    query.whereExists(function () {
      this.select("id")
        .from("email_sends")
        .whereRaw("email_sends.lead_id = leads.id")
        .where("email_sends.status", "sent");
    });
  }

  if (minDaysSinceEmail && minDaysSinceEmail > 0) {
    const since = new Date();
    since.setDate(since.getDate() - minDaysSinceEmail);
    query.whereNotExists(function () {
      this.select("id")
        .from("email_sends")
        .whereRaw("email_sends.lead_id = leads.id")
        .where("email_sends.status", "sent")
        .where("email_sends.sent_at", ">=", since);
    });
  }

  return query;
}

function buildUniqueSlug(name, existingId = null) {
  let slug = slugifyUtm(name, "campanha");
  return slug;
}

async function ensureUniqueSlug(slug, excludeId = null) {
  let candidate = slug;
  let suffix = 2;
  while (true) {
    const query = db("email_campaigns").where({ slug: candidate }).first();
    const existing = await query;
    if (!existing || (excludeId && existing.id === excludeId)) return candidate;
    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
}

function applySegmentFilters(query, { sourceIds, fieldAreas }) {
  const ids = (sourceIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const areas = (fieldAreas || []).map((a) => String(a).trim().toLowerCase()).filter(Boolean);

  if (!ids.length && !areas.length) return query;

  query.join("lead_sources as ls", "ls.id", "leads.source_id");
  query.andWhere(function segmentWhere() {
    if (ids.length) this.whereIn("leads.source_id", ids);
    if (areas.length) {
      if (ids.length) this.orWhereIn("ls.field_area", areas);
      else this.whereIn("ls.field_area", areas);
    }
  });

  return query;
}

async function baseEligibleQuery({
  sourceIds,
  fieldAreas,
  campaignId,
  minDaysSinceEmail,
  requirePriorEmail,
  campaign = null,
  activeCampaigns = []
}) {
  let query = db("leads")
    .where("leads.is_valid", true)
    .where("leads.is_active", true)
    .where("leads.email_unsubscribed", false)
    .whereRaw("leads.email_normalized NOT LIKE ?", ["%@mapscraper.local"])
    .whereRaw("leads.email_normalized NOT LIKE ?", ["%@lead.local"]);

  query = applySegmentFilters(query, { sourceIds, fieldAreas });

  if (campaign && activeCampaigns.length) {
    applyHigherPriorityExclusion(query, campaign, activeCampaigns);
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

  return query;
}

async function countEligibleForCampaign(campaign) {
  const stepRow = await db("email_campaign_steps")
    .where({ campaign_id: campaign.id })
    .count("id as count")
    .first();

  if (Number(stepRow?.count || 0) > 0) {
    const { countEligibleLeadSteps } = require("./campaignStepRepository");
    return countEligibleLeadSteps(campaign);
  }

  const { getActiveCampaignsOrdered } = require("../services/email/campaignExclusive");
  const activeCampaigns = await getActiveCampaignsOrdered();

  const row = await baseEligibleQuery({
    sourceIds: campaign.source_ids,
    fieldAreas: campaign.field_areas,
    campaignId: campaign.id,
    minDaysSinceEmail: campaign.min_days_since_email,
    requirePriorEmail: campaign.require_prior_email,
    campaign,
    activeCampaigns
  })
    .count("leads.id as count")
    .first();
  return Number(row?.count || 0);
}

async function listCampaigns({ includeArchived = false } = {}) {
  let query = db("email_campaigns").select("*").orderBy("updated_at", "desc");
  if (!includeArchived) {
    query = query.whereNot({ status: "archived" });
  }
  const rows = await query;
  return rows.map(normalizeCampaignRow);
}

async function getCampaignById(id) {
  const row = await db("email_campaigns").where({ id }).first();
  return normalizeCampaignRow(row);
}

async function createCampaign(payload) {
  const slug = await ensureUniqueSlug(buildUniqueSlug(payload.name));
  const [id] = await db("email_campaigns").insert({
    name: payload.name.trim(),
    slug,
    subject: payload.subject.trim(),
    template: payload.template.trim(),
    source_ids: JSON.stringify(payload.sourceIds || []),
    field_areas: JSON.stringify(payload.fieldAreas || []),
    daily_batch_size: payload.dailyBatchSize || null,
    min_days_since_email: payload.minDaysSinceEmail || null,
    require_prior_email: payload.requirePriorEmail === true,
    status: payload.status || "active",
    notes: payload.notes || null
  });

  const { createStep, replaceAllSteps } = require("./campaignStepRepository");
  if (Array.isArray(payload.steps) && payload.steps.length) {
    await replaceAllSteps(id, payload.steps);
  } else {
    await createStep(id, {
      subject: payload.subject,
      template: payload.template,
      minDaysSincePrevious: null
    });
  }

  return getCampaignById(id);
}

async function updateCampaign(id, payload) {
  const existing = await getCampaignById(id);
  if (!existing) return null;

  const updates = {};
  if (payload.name !== undefined) {
    updates.name = payload.name.trim();
    if (payload.name.trim() !== existing.name) {
      updates.slug = await ensureUniqueSlug(buildUniqueSlug(payload.name), id);
    }
  }
  if (payload.subject !== undefined) updates.subject = payload.subject.trim();
  if (payload.template !== undefined) updates.template = payload.template.trim();
  if (payload.sourceIds !== undefined) updates.source_ids = JSON.stringify(payload.sourceIds || []);
  if (payload.fieldAreas !== undefined) updates.field_areas = JSON.stringify(payload.fieldAreas || []);
  if (payload.dailyBatchSize !== undefined) updates.daily_batch_size = payload.dailyBatchSize || null;
  if (payload.minDaysSinceEmail !== undefined) {
    updates.min_days_since_email = payload.minDaysSinceEmail || null;
  }
  if (payload.requirePriorEmail !== undefined) {
    updates.require_prior_email = payload.requirePriorEmail === true;
  }
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.notes !== undefined) updates.notes = payload.notes || null;

  if (Object.keys(updates).length) {
    await db("email_campaigns").where({ id }).update(updates);
  }
  return getCampaignById(id);
}

async function markCampaignDispatched(id) {
  await db("email_campaigns").where({ id }).update({ last_dispatched_at: new Date() });
}

async function getCampaignStats(campaignId) {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return null;

  const [sentRow, failedRow, eligible] = await Promise.all([
    db("email_sends").where({ campaign_id: campaignId, status: "sent" }).count("id as count").first(),
    db("email_sends").where({ campaign_id: campaignId, status: "failed" }).count("id as count").first(),
    countEligibleForCampaign(campaign)
  ]);

  const sent = Number(sentRow?.count || 0);
  const failed = Number(failedRow?.count || 0);

  const eventRows = await db("email_events as ee")
    .join("email_sends as es", "es.id", "ee.email_send_id")
    .where("es.campaign_id", campaignId)
    .select("ee.event_type")
    .count("ee.id as cnt")
    .groupBy("ee.event_type");

  const events = { open: 0, click: 0, unsubscribe: 0 };
  for (const row of eventRows) {
    events[row.event_type] = Number(row.cnt);
  }

  const lastSend = await db("email_sends")
    .where({ campaign_id: campaignId, status: "sent" })
    .max("sent_at as last_sent_at")
    .first();

  const { getStepStats } = require("./campaignStepRepository");
  const steps = await getStepStats(campaignId);

  return {
    campaignId,
    sent,
    failed,
    eligible,
    steps,
    stepCount: steps.length,
    opens: events.open,
    clicks: events.click,
    unsubscribes: events.unsubscribe,
    openRate: sent ? Math.round((events.open / sent) * 1000) / 10 : 0,
    clickRate: sent ? Math.round((events.click / sent) * 1000) / 10 : 0,
    lastSentAt: lastSend?.last_sent_at || null
  };
}

async function listCampaignsWithStats({ includeArchived = false } = {}) {
  const campaigns = await listCampaigns({ includeArchived });
  const stats = await Promise.all(campaigns.map((c) => getCampaignStats(c.id)));
  return campaigns.map((campaign, index) => ({
    ...campaign,
    stats: stats[index]
  }));
}

module.exports = {
  listCampaigns,
  listCampaignsWithStats,
  getCampaignById,
  createCampaign,
  updateCampaign,
  markCampaignDispatched,
  getCampaignStats,
  countEligibleForCampaign,
  parseJsonArray,
  applyFollowUpFilters
};
