const axios = require("axios");
const { safeEmail, safePhone } = require("./scraperSanitizers");

function subtractYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - years);
  return d;
}

function formatBrDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function buildRequestUrl(source) {
  if (source.name === "banco-central-sgs-api") {
    const now = new Date();
    const start = subtractYears(now, 10);
    const url = new URL(source.base_url);
    url.searchParams.set("dataInicial", formatBrDate(start));
    url.searchParams.set("dataFinal", formatBrDate(now));
    return url.toString();
  }

  return source.base_url;
}

function findFirstArrayDeep(payload, depth = 0) {
  if (depth > 5 || payload === null || payload === undefined) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (typeof payload !== "object") {
    return null;
  }

  for (const value of Object.values(payload)) {
    const found = findFirstArrayDeep(value, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function pickArray(payload) {
  if (typeof payload === "string") {
    try {
      return pickArray(JSON.parse(payload));
    } catch (error) {
      return [];
    }
  }

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.dados)) return payload.dados;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.result?.records)) return payload.result.records;
  if (Array.isArray(payload?.value)) return payload.value;
  const deepArray = findFirstArrayDeep(payload);
  if (deepArray) return deepArray;
  return [];
}

function deepGet(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function stringOrNull(v) {
  if (v === undefined || v === null) return null;
  const text = String(v).trim();
  return text || null;
}

function mapRowToLead(source, row, index) {
  const name = stringOrNull(
    row.name
    || row.nome
    || row.razao_social
    || row.fantasia
    || row.titulo
    || row.title
    || deepGet(row, "IdentificacaoParlamentar.NomeParlamentar")
    || deepGet(row, "IdentificacaoParlamentar.NomeCompletoParlamentar")
    || row.data
  ) || `${source.name} item ${index + 1}`;

  const email = stringOrNull(
    row.email
    || row.mail
    || row["contact:email"]
    || row.contato_email
    || deepGet(row, "IdentificacaoParlamentar.EmailParlamentar")
  );

  const safeMappedEmail = safeEmail(email, `${source.name}-${index + 1}@lead.local`);

  const phone = safePhone(stringOrNull(
    row.phone
    || row.telefone
    || row.fone
    || row.celular
    || row["contact:phone"]
    || deepGet(row, "IdentificacaoParlamentar.TelefoneParlamentar")
  ));

  return {
    name,
    email: safeMappedEmail,
    phone,
    raw_data: {
      source_name: source.name,
      source_url: buildRequestUrl(source),
      dataset_row: row
    }
  };
}

async function scrapeGenericApiSource(source, config, logger) {
  const maxItems = Math.max(1, Number(config.maxItems || 80));
  const requestUrl = buildRequestUrl(source);

  let response;
  try {
    response = await axios.get(requestUrl, {
      timeout: config.timeoutMs,
      validateStatus: () => true,
      headers: {
        "User-Agent": "LeadScraperBot/1.0 (+contato@empresa.com)",
        Accept: "application/json,text/plain,*/*"
      }
    });
  } catch (error) {
    logger.warn({ sourceId: source.id, requestUrl, message: error.message }, "Generic API request exception, returning empty result");
    return [];
  }

  if (response.status >= 400) {
    logger.warn({ sourceId: source.id, status: response.status, requestUrl }, "Generic API request failed, returning empty result");
    return [];
  }

  const rows = pickArray(response.data);
  const leads = [];

  for (let index = 0; index < rows.length && leads.length < maxItems; index += 1) {
    const row = rows[index] || {};
    leads.push(mapRowToLead(source, row, index));
  }

  logger.info({ sourceId: source.id, totalFound: leads.length }, "Generic API source scraped");
  return leads;
}

module.exports = {
  scrapeGenericApiSource
};
