const db = require("../database/knex");
const { normalizeEmail, normalizePhone } = require("../utils/normalizeLead");
const { recalculateLeadEngagement } = require("./leadScoringService");
const {
  findLeadsByIdentity,
  searchLeads,
  listSuppressedLeads,
  insertLead
} = require("../repositories/leadRepository");
const { leadSchema } = require("../validation/leadSchema");
const { normalizeLead } = require("../utils/normalizeLead");

const VALID_SCOPES = new Set(["email", "whatsapp", "all"]);

function normalizeScope(scope) {
  const value = String(scope || "all").trim().toLowerCase();
  return VALID_SCOPES.has(value) ? value : "all";
}

function buildSuppressionUpdate(scope, { reason, alternateEmail } = {}) {
  const updates = {
    suppressed_at: db.fn.now(),
    updated_at: db.fn.now()
  };

  if (reason) {
    updates.contact_notes = String(reason).trim().slice(0, 2000);
  }

  if (alternateEmail) {
    updates.alternate_email = normalizeEmail(alternateEmail);
  }

  if (scope === "email" || scope === "all") {
    updates.email_unsubscribed = true;
  }

  if (scope === "whatsapp" || scope === "all") {
    updates.whatsapp_opt_out = true;
  }

  if (scope === "all") {
    updates.is_active = false;
    updates.email_unsubscribed = true;
    updates.whatsapp_opt_out = true;
  }

  return updates;
}

async function suppressLeadById(leadId, options = {}) {
  return suppressLeadIds([leadId], options);
}

async function suppressLeadIds(leadIds, options = {}) {
  const ids = [...new Set(
    (Array.isArray(leadIds) ? leadIds : [leadIds])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];

  if (ids.length === 0) {
    return { ok: false, error: "Nenhum leadId valido", matched: 0 };
  }

  const normalizedScope = normalizeScope(options.scope);
  const updates = buildSuppressionUpdate(normalizedScope, options);
  const updatedIds = [];

  for (const leadId of ids) {
    const lead = await db("leads").select("id").where({ id: leadId }).first();
    if (!lead) {
      continue;
    }

    await db("leads").where({ id: leadId }).update(updates);
    await recalculateLeadEngagement(leadId);
    updatedIds.push(leadId);
  }

  if (updatedIds.length === 0) {
    return { ok: false, error: "Nenhum lead encontrado", matched: 0 };
  }

  return {
    ok: true,
    matched: updatedIds.length,
    scope: normalizedScope,
    leadIds: updatedIds
  };
}

async function suppressByIdentity({ email, phone, scope, reason, alternateEmail }) {
  const matches = await findLeadsByIdentity({ email, phone });
  if (matches.length === 0) {
    return { ok: false, error: "Nenhum lead encontrado para email/telefone informado", matched: 0 };
  }

  const normalizedScope = normalizeScope(scope);
  const updates = buildSuppressionUpdate(normalizedScope, { reason, alternateEmail });

  for (const lead of matches) {
    await db("leads").where({ id: lead.id }).update(updates);
    await recalculateLeadEngagement(lead.id);
  }

  return { ok: true, matched: matches.length, scope: normalizedScope, leadIds: matches.map((row) => row.id) };
}

async function suppressContact(payload = {}) {
  const leadIds = Array.isArray(payload.leadIds)
    ? payload.leadIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : payload.leadId
      ? [Number(payload.leadId)]
      : [];

  if (leadIds.length > 0) {
    return suppressLeadIds(leadIds, payload);
  }

  const email = payload.email ? normalizeEmail(payload.email) : null;
  const phone = payload.phone ? normalizePhone(payload.phone) : null;

  if (!email && !phone) {
    return { ok: false, error: "Selecione contatos na busca ou informe email/telefone", matched: 0 };
  }

  return suppressByIdentity({ email, phone, scope: payload.scope, reason: payload.reason, alternateEmail: payload.alternateEmail });
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const rows = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row);
  }

  return rows;
}

async function importSuppressions(rows = []) {
  const results = { processed: 0, matched: 0, notFound: 0, errors: [] };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const email = row.email ? normalizeEmail(row.email) : null;
    const phone = row.phone || row.telefone ? normalizePhone(row.phone || row.telefone) : null;
    const scope = normalizeScope(row.scope || row.canal || "all");
    const reason = row.reason || row.motivo || row.notes || row.observacao || "";
    const alternateEmail = row.alternate_email || row.alternateemail || row.novo_email || row.redirect || "";

    if (!email && !phone) {
      results.errors.push({ line: index + 2, message: "Linha sem email ou telefone" });
      continue;
    }

    results.processed += 1;
    const outcome = await suppressByIdentity({ email, phone, scope, reason, alternateEmail });

    if (!outcome.ok) {
      results.notFound += 1;
      results.errors.push({ line: index + 2, message: outcome.error });
      continue;
    }

    results.matched += outcome.matched;
  }

  return results;
}

async function importContacts(rows = [], { sourceId } = {}) {
  if (!sourceId) {
    return { ok: false, error: "sourceId is required for import" };
  }

  const results = { processed: 0, saved: 0, duplicates: 0, errors: [] };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const name = String(row.name || row.nome || "").trim();
    const email = String(row.email || "").trim();
    const phone = String(row.phone || row.telefone || "").trim();

    if (!name || !email) {
      results.errors.push({ line: index + 2, message: "Nome e email sao obrigatorios" });
      continue;
    }

    results.processed += 1;

    const { error, value } = leadSchema.validate({
      name,
      email,
      phone: phone || null,
      source_id: sourceId
    });

    if (error) {
      results.errors.push({ line: index + 2, message: error.message });
      continue;
    }

    const normalized = normalizeLead(value);
    const duplicate = await db("leads")
      .select("id")
      .where({ email_normalized: normalized.email_normalized, source_id: sourceId })
      .first();

    if (duplicate) {
      results.duplicates += 1;
      continue;
    }

    await db.transaction(async (trx) => {
      await insertLead(trx, normalized);
    });

    results.saved += 1;
  }

  return { ok: true, ...results };
}

async function processImport({ mode, rows, csvText, sourceId }) {
  const parsedRows = rows && rows.length > 0 ? rows : parseCsvText(csvText);
  if (parsedRows.length === 0) {
    return { ok: false, error: "Nenhuma linha valida para importar" };
  }

  if (mode === "suppress") {
    return { ok: true, mode, ...(await importSuppressions(parsedRows)) };
  }

  if (mode === "leads") {
    return importContacts(parsedRows, { sourceId: Number(sourceId) });
  }

  return { ok: false, error: "mode invalido. Use suppress ou leads" };
}

module.exports = {
  VALID_SCOPES,
  normalizeScope,
  suppressContact,
  suppressLeadById,
  searchLeads,
  listSuppressedLeads,
  processImport,
  parseCsvText
};
