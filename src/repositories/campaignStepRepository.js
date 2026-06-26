const db = require("../database/knex");

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

function buildStepEligibleQuery(campaign) {
  const campaignId = campaign.id;

  let query = db("leads")
    .select(
      "leads.id",
      "leads.name",
      "leads.email",
      "leads.email_normalized",
      db.raw("COALESCE(prog.last_step, 0) + 1 AS next_step_order"),
      "prog.last_sent_at",
      "next_step.id AS step_id",
      "next_step.subject AS step_subject",
      "next_step.template AS step_template",
      "next_step.step_order AS step_order",
      "next_step.min_days_since_previous"
    )
    .leftJoin(
      db.raw(
        `(SELECT es.lead_id,
                 MAX(ecs.step_order) AS last_step,
                 MAX(es.sent_at) AS last_sent_at
          FROM email_sends es
          INNER JOIN email_campaign_steps ecs ON ecs.id = es.campaign_step_id
          WHERE es.campaign_id = ? AND es.status = 'sent'
          GROUP BY es.lead_id) AS prog`,
        [campaignId]
      ),
      "prog.lead_id",
      "leads.id"
    )
    .innerJoin("email_campaign_steps as next_step", function () {
      this.on("next_step.campaign_id", "=", db.raw("?", [campaignId])).andOn(
        "next_step.step_order",
        "=",
        db.raw("COALESCE(prog.last_step, 0) + 1")
      );
    })
    .where("leads.is_valid", true)
    .where("leads.is_active", true)
    .where("leads.email_unsubscribed", false)
    .whereRaw("leads.email_normalized NOT LIKE ?", ["%@mapscraper.local"])
    .whereRaw("leads.email_normalized NOT LIKE ?", ["%@lead.local"])
    .whereRaw(
      `(COALESCE(prog.last_step, 0) = 0
        OR prog.last_sent_at IS NULL
        OR prog.last_sent_at < DATE_SUB(NOW(), INTERVAL COALESCE(next_step.min_days_since_previous, 0) DAY))`
    );

  query = applySegmentFilters(query, {
    sourceIds: campaign.source_ids,
    fieldAreas: campaign.field_areas
  });

  return query;
}

async function listEligibleLeadSteps(campaign, limit = 50) {
  const rows = await buildStepEligibleQuery(campaign).limit(limit);
  return rows.map((row) => ({
    lead: {
      id: row.id,
      name: row.name,
      email: row.email,
      email_normalized: row.email_normalized
    },
    step: {
      id: row.step_id,
      step_order: row.step_order,
      subject: row.step_subject,
      template: row.step_template,
      min_days_since_previous: row.min_days_since_previous
    }
  }));
}

async function countEligibleLeadSteps(campaign) {
  const row = await buildStepEligibleQuery(campaign).clearSelect().count("leads.id as count").first();
  return Number(row?.count || 0);
}

async function listStepsByCampaignId(campaignId) {
  return db("email_campaign_steps")
    .where({ campaign_id: campaignId })
    .orderBy("step_order", "asc");
}

async function getStepById(id) {
  return db("email_campaign_steps").where({ id }).first();
}

async function createStep(campaignId, { subject, template, minDaysSincePrevious = null }) {
  const maxRow = await db("email_campaign_steps")
    .where({ campaign_id: campaignId })
    .max("step_order as max_order")
    .first();
  const stepOrder = Number(maxRow?.max_order || 0) + 1;

  const [id] = await db("email_campaign_steps").insert({
    campaign_id: campaignId,
    step_order: stepOrder,
    subject: subject.trim(),
    template: template.trim(),
    min_days_since_previous: stepOrder > 1 ? minDaysSincePrevious ?? 3 : null
  });
  return getStepById(id);
}

async function updateStep(id, { subject, template, minDaysSincePrevious }) {
  const existing = await getStepById(id);
  if (!existing) return null;

  const updates = {};
  if (subject !== undefined) updates.subject = subject.trim();
  if (template !== undefined) updates.template = template.trim();
  if (minDaysSincePrevious !== undefined) {
    updates.min_days_since_previous =
      existing.step_order > 1 ? minDaysSincePrevious || null : null;
  }

  if (Object.keys(updates).length) {
    updates.updated_at = new Date();
    await db("email_campaign_steps").where({ id }).update(updates);
  }
  return getStepById(id);
}

async function deleteStep(id) {
  const step = await getStepById(id);
  if (!step) return false;

  const sentCount = await db("email_sends")
    .where({ campaign_step_id: id, status: "sent" })
    .count("id as count")
    .first();

  if (Number(sentCount?.count || 0) > 0) {
    const err = new Error("Não é possível excluir um email que já foi disparado");
    err.statusCode = 400;
    throw err;
  }

  await db("email_campaign_steps").where({ id }).delete();

  const later = await db("email_campaign_steps")
    .where("campaign_id", step.campaign_id)
    .where("step_order", ">", step.step_order)
    .orderBy("step_order", "asc");

  for (let i = 0; i < later.length; i += 1) {
    await db("email_campaign_steps")
      .where({ id: later[i].id })
      .update({ step_order: step.step_order + i, updated_at: new Date() });
  }

  return true;
}

async function replaceAllSteps(campaignId, steps) {
  const sentStepIds = await db("email_sends")
    .where({ campaign_id: campaignId, status: "sent" })
    .whereNotNull("campaign_step_id")
    .distinct("campaign_step_id")
    .pluck("campaign_step_id");

  const lockedOrders = new Set();
  if (sentStepIds.length) {
    const sentSteps = await db("email_campaign_steps").whereIn("id", sentStepIds).select("step_order");
    sentSteps.forEach((s) => lockedOrders.add(s.step_order));
  }

  await db.transaction(async (trx) => {
    const existing = await trx("email_campaign_steps")
      .where({ campaign_id: campaignId })
      .orderBy("step_order", "asc");

    for (let i = 0; i < steps.length; i += 1) {
      const order = i + 1;
      const payload = steps[i];
      const existingStep = existing.find((s) => s.step_order === order);

      if (lockedOrders.has(order)) {
        continue;
      }

      if (existingStep) {
        await trx("email_campaign_steps").where({ id: existingStep.id }).update({
          step_order: order,
          subject: payload.subject.trim(),
          template: payload.template.trim(),
          min_days_since_previous: order > 1 ? payload.minDaysSincePrevious ?? 3 : null,
          updated_at: new Date()
        });
      } else {
        await trx("email_campaign_steps").insert({
          campaign_id: campaignId,
          step_order: order,
          subject: payload.subject.trim(),
          template: payload.template.trim(),
          min_days_since_previous: order > 1 ? payload.minDaysSincePrevious ?? 3 : null
        });
      }
    }

    const toRemove = existing.filter(
      (s) => s.step_order > steps.length && !lockedOrders.has(s.step_order)
    );
    if (toRemove.length) {
      await trx("email_campaign_steps")
        .whereIn(
          "id",
          toRemove.map((s) => s.id)
        )
        .delete();
    }
  });

  return listStepsByCampaignId(campaignId);
}

async function getStepStats(campaignId) {
  const steps = await listStepsByCampaignId(campaignId);
  if (!steps.length) return [];

  const counts = await db("email_sends")
    .where({ campaign_id: campaignId, status: "sent" })
    .whereNotNull("campaign_step_id")
    .select("campaign_step_id")
    .count("id as sent")
    .groupBy("campaign_step_id");

  const countMap = Object.fromEntries(counts.map((r) => [r.campaign_step_id, Number(r.sent)]));

  const lastSends = await db("email_sends")
    .where({ campaign_id: campaignId, status: "sent" })
    .whereNotNull("campaign_step_id")
    .select("campaign_step_id")
    .max("sent_at as last_sent_at")
    .groupBy("campaign_step_id");

  const lastMap = Object.fromEntries(lastSends.map((r) => [r.campaign_step_id, r.last_sent_at]));

  return steps.map((step) => ({
    ...step,
    sent: countMap[step.id] || 0,
    lastSentAt: lastMap[step.id] || null,
    locked: (countMap[step.id] || 0) > 0
  }));
}

module.exports = {
  listStepsByCampaignId,
  getStepById,
  createStep,
  updateStep,
  deleteStep,
  replaceAllSteps,
  getStepStats,
  listEligibleLeadSteps,
  countEligibleLeadSteps
};
