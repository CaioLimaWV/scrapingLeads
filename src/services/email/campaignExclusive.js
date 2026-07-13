const db = require("../../database/knex");

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

function normalizeCampaign(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    source_ids: parseJsonArray(row.source_ids),
    field_areas: parseJsonArray(row.field_areas)
  };
}

function applySegmentMatch(query, { sourceIds, fieldAreas }) {
  const ids = (sourceIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const areas = (fieldAreas || []).map((a) => String(a).trim().toLowerCase()).filter(Boolean);

  if (!ids.length && !areas.length) return query;

  return query.whereExists(function () {
    this.select(1)
      .from("lead_sources as ls_ex")
      .whereRaw("ls_ex.id = leads.source_id")
      .andWhere(function segmentWhere() {
        if (ids.length) this.whereIn("leads.source_id", ids);
        if (areas.length) {
          if (ids.length) this.orWhereIn("ls_ex.field_area", areas);
          else this.whereIn("ls_ex.field_area", areas);
        }
      });
  });
}

/**
 * Garante que cada lead pertence a no máximo uma campanha ativa:
 * vence a campanha de menor id (maior prioridade) cujo segmento o lead atende.
 */
function applyHigherPriorityExclusion(query, campaign, activeCampaigns) {
  const higher = activeCampaigns.filter((c) => c.id < campaign.id);
  for (const other of higher) {
    query.whereNot(function () {
      applySegmentMatch(this, {
        sourceIds: other.source_ids,
        fieldAreas: other.field_areas
      });
    });
  }
  return query;
}

async function getActiveCampaignsOrdered() {
  const rows = await db("email_campaigns")
    .whereNot({ status: "archived" })
    .where({ status: "active" })
    .orderBy("id", "asc");
  return rows.map(normalizeCampaign);
}

module.exports = {
  applySegmentMatch,
  applyHigherPriorityExclusion,
  getActiveCampaignsOrdered,
  normalizeCampaign,
  parseJsonArray
};
