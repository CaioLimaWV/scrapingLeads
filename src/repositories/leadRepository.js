const db = require("../database/knex");

const FEMALE_HINTS = new Set([
  "maria", "ana", "beatriz", "bianca", "bruna", "camila", "carla", "carolina", "claudia",
  "daniela", "debora", "eduarda", "elaine", "fernanda", "gabriela", "isabela", "jessica",
  "juliana", "larissa", "leticia", "luana", "luciana", "mariana", "patricia", "paula",
  "raquel", "renata", "sabrina", "simone", "tatiana", "vanessa", "vitoria"
]);

const MALE_HINTS = new Set([
  "joao", "jose", "antonio", "carlos", "daniel", "diego", "douglas", "eduardo", "fabio",
  "felipe", "fernando", "francisco", "gabriel", "gustavo", "henrique", "jair", "jean",
  "jorge", "leandro", "leo", "leonardo", "lucas", "luiz", "marcos", "mateus", "paulo",
  "pedro", "rafael", "ricardo", "rodrigo", "thiago", "vinicius", "wesley", "william"
]);

function tokenizeIdentity(name, email) {
  const nameTokens = String(name || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const emailLocal = String(email || "").toLowerCase().split("@")[0] || "";
  const emailTokens = emailLocal
    .replace(/[^a-z]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: nameTokens[0] || "",
    emailFirst: emailTokens[0] || ""
  };
}

function inferGenderByIdentity(name, email, explicitGender) {
  if (explicitGender === "F" || explicitGender === "M") {
    return explicitGender;
  }

  const { firstName, emailFirst } = tokenizeIdentity(name, email);
  const candidates = [firstName, emailFirst].filter(Boolean);

  for (const token of candidates) {
    if (FEMALE_HINTS.has(token)) return "F";
    if (MALE_HINTS.has(token)) return "M";
  }

  if (firstName.endsWith("a") && !firstName.endsWith("ia")) {
    return "F";
  }

  if (firstName.endsWith("o") || firstName.endsWith("r")) {
    return "M";
  }

  return null;
}

async function findLeadByEmailAndSource(emailNormalized, sourceId) {
  return db("leads")
    .select("id", "email_normalized", "source_id")
    .where({ email_normalized: emailNormalized, source_id: sourceId })
    .first();
}

async function findLeadByFullIdentity({ sourceId, name, emailNormalized, phoneNormalized }) {
  const query = db("leads")
    .select("id", "source_id", "name", "email_normalized", "phone_normalized")
    .where({ source_id: sourceId, name, email_normalized: emailNormalized });

  if (phoneNormalized) {
    query.where({ phone_normalized: phoneNormalized });
  } else {
    query.whereNull("phone_normalized");
  }

  return query.first();
}

async function insertLead(trx, lead) {
  const insertedIds = await trx("leads").insert({
    name: lead.name,
    email: lead.email,
    email_normalized: lead.email_normalized,
    phone: lead.phone,
    phone_normalized: lead.phone_normalized,
    source_id: lead.source_id,
    raw_data: lead.raw_data,
    is_valid: true,
    is_active: true,
    is_duplicate_of: lead.is_duplicate_of || null
  });

  const insertedId = Array.isArray(insertedIds) ? insertedIds[0] : insertedIds;

  return trx("leads")
    .select("id", "name", "email", "phone", "source_id", "created_at")
    .where({ id: insertedId })
    .first();
}

async function insertDeduplicationLog(trx, payload) {
  await trx("lead_deduplication_log").insert({
    lead_id: payload.lead_id,
    duplicate_of_lead_id: payload.duplicate_of_lead_id,
    reason: payload.reason,
    confidence: payload.confidence || null
  });
}

async function listLeads({ limit = 50, offset = 0, sourceId = null, gender = null }) {
  const query = db("leads")
    .select(
      "id",
      "name",
      "email",
      "phone",
      "source_id",
      "created_at",
      "is_duplicate_of",
      db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.gender')) as gender")
    )
    .orderBy("id", "desc")
    .limit(limit)
    .offset(offset);

  if (sourceId) {
    query.where({ source_id: sourceId });
  }

  if (gender) {
    query.whereRaw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.gender')) = ?", [gender]);
  }

  return query;
}

async function countLeads() {
  const row = await db("leads").count("* as total").first();
  return Number(row?.total || 0);
}

async function countFemaleLeads() {
  const row = await db("leads")
    .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.gender')) = ?", ["F"])
    .count({ total: "id" })
    .first();

  return Number(row?.total || 0);
}

async function countMaleLeads() {
  const row = await db("leads")
    .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.gender')) = ?", ["M"])
    .count({ total: "id" })
    .first();

  return Number(row?.total || 0);
}

async function countInferredGenderLeads() {
  const rows = await db("leads")
    .select(
      "name",
      "email",
      db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.gender')) as gender")
    )
    .where({ is_active: true });

  let female = 0;
  let male = 0;

  for (const row of rows) {
    const inferred = inferGenderByIdentity(row.name, row.email, row.gender);
    if (inferred === "F") female += 1;
    if (inferred === "M") male += 1;
  }

  return { female, male };
}

async function listUncontactedLeadsWithPhone(limit = 100) {
  return db("leads")
    .select("id", "name", "phone", "phone_normalized")
    .where("contacted", false)
    .whereNotNull("phone_normalized")
    .where("phone_normalized", "!=", "")
    .orderBy("id", "desc")
    .limit(limit);
}

async function markLeadAsContacted(id) {
  return db("leads")
    .where({ id })
    .update({
      contacted: true,
      contacted_at: db.fn.now()
    });
}

module.exports = {
  findLeadByEmailAndSource,
  findLeadByFullIdentity,
  insertLead,
  insertDeduplicationLog,
  listLeads,
  countLeads,
  countFemaleLeads,
  countMaleLeads,
  countInferredGenderLeads,
  listUncontactedLeadsWithPhone,
  markLeadAsContacted
};
