const axios = require("axios");
const { isValidEmail, safePhone } = require("./scraperSanitizers");

const OPENCNPJ_BASE = process.env.OPENCNPJ_BASE_URL || "https://api.opencnpj.org";
const CNPJA_BASE = process.env.CNPJA_BASE_URL || "https://open.cnpja.com";
const MINHA_RECEITA_BASE = process.env.MINHA_RECEITA_BASE_URL || "https://minhareceita.org";
const DEFAULT_UF = String(process.env.CNPJ_DEFAULT_UF || "SP").trim().toUpperCase() || null;

const DETAIL_DELAY_MS = Math.max(200, Number(process.env.CNPJ_DETAIL_DELAY_MS || 350));

function parseCnaeFromSource(source) {
  const url = String(source.base_url || "");
  const fromQuery = url.match(/[?&]cnae=(\d+)/i);
  if (fromQuery) return fromQuery[1];

  const fromPath = url.match(/cnae\/(\d+)/i);
  if (fromPath) return fromPath[1];

  const fromNotes = String(source.notes || "").match(/cnae[:\s]+(\d+)/i);
  if (fromNotes) return fromNotes[1];

  return null;
}

function parseUfFromSource(source) {
  const url = String(source.base_url || "");
  const fromQuery = url.match(/[?&]uf=([A-Z]{2})/i);
  if (fromQuery) return fromQuery[1].toUpperCase();

  const fromNotes = String(source.notes || "").match(/\buf[=:\s]+([A-Z]{2})\b/i);
  if (fromNotes) return fromNotes[1].toUpperCase();

  return DEFAULT_UF;
}

function normalizeCnpj(value) {
  return String(value || "").replace(/\D/g, "");
}

function pickEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  return isValidEmail(email) ? email : null;
}

function extractEmailFromMinhaReceitaRow(row) {
  return pickEmail(row?.email);
}

function formatPhoneFromMinhaReceitaRow(row) {
  const ddd = String(row?.ddd_telefone_1 || "").replace(/\D/g, "");
  const tel = String(row?.ddd_telefone_2 || "").replace(/\D/g, "");
  return safePhone(ddd && tel ? `${ddd}${tel}` : ddd || tel || null);
}

function formatPhoneFromOpenCnpj(data) {
  const phones = Array.isArray(data?.telefones) ? data.telefones : [];
  const first = phones.find((p) => p && !p.is_fax) || phones[0];
  if (!first) {
    return safePhone(data?.ddd_telefone_1 || data?.telefone);
  }
  const digits = `${first.ddd || ""}${first.numero || ""}`.replace(/\D/g, "");
  return safePhone(digits);
}

function formatPhoneFromCnpja(data) {
  const phones = Array.isArray(data?.phones) ? data.phones : [];
  const first = phones.find((p) => p && p.type !== "FAX") || phones[0];
  if (!first) return null;
  return safePhone(`${first.area || ""}${first.number || ""}`);
}

function extractEmailFromOpenCnpj(data) {
  return pickEmail(data?.email);
}

function extractEmailFromCnpja(data) {
  const emails = Array.isArray(data?.emails) ? data.emails : [];
  for (const entry of emails) {
    const candidate = typeof entry === "string" ? entry : entry?.address;
    const email = pickEmail(candidate);
    if (email) return email;
  }
  return null;
}

async function fetchCnpjListByCnae(cnae, { uf = null, cursor = null, logger, sourceId }) {
  const params = { cnae };
  if (uf) params.uf = uf;
  if (cursor) params.cursor = cursor;

  try {
    const response = await axios.get(`${MINHA_RECEITA_BASE}/`, {
      params,
      timeout: 45000,
      validateStatus: () => true,
      headers: { Accept: "application/json" }
    });

    if (response.status >= 400) {
      logger.warn({ sourceId, cnae, uf, status: response.status }, "Minha Receita CNAE list failed");
      return { rows: [], nextCursor: null };
    }

    const rows = Array.isArray(response.data?.data) ? response.data.data : [];
    return {
      rows: rows.filter((row) => normalizeCnpj(row?.cnpj).length === 14),
      nextCursor: response.data?.cursor || null
    };
  } catch (err) {
    logger.warn(
      { sourceId, cnae, uf, error: err.message, code: err.code },
      "Minha Receita CNAE list request failed"
    );
    return { rows: [], nextCursor: null };
  }
}

async function fetchOpenCnpj(cnpj) {
  const response = await axios.get(`${OPENCNPJ_BASE}/${cnpj}`, {
    timeout: 15000,
    validateStatus: () => true,
    headers: { Accept: "application/json" }
  });
  if (response.status >= 400) return null;
  return response.data;
}

async function fetchCnpja(cnpj) {
  const response = await axios.get(`${CNPJA_BASE}/office/${cnpj}`, {
    timeout: 15000,
    validateStatus: () => true,
    headers: { Accept: "application/json" }
  });
  if (response.status >= 400) return null;
  return response.data;
}

async function resolveCnpjContact(cnpj, listRow = null) {
  let email = listRow ? extractEmailFromMinhaReceitaRow(listRow) : null;
  let phone = listRow ? formatPhoneFromMinhaReceitaRow(listRow) : null;
  let name = listRow?.razao_social || listRow?.nome_fantasia || null;
  let provider = email ? "minhareceita" : null;
  let opencnpj = null;
  let cnpja = null;

  if (!email) {
    opencnpj = await fetchOpenCnpj(cnpj);
    email = extractEmailFromOpenCnpj(opencnpj);
    if (email) provider = "opencnpj";
    if (opencnpj) {
      name = opencnpj.razao_social || opencnpj.nome_fantasia || name;
      phone = formatPhoneFromOpenCnpj(opencnpj) || phone;
    }
  }

  if (!email) {
    cnpja = await fetchCnpja(cnpj);
    email = extractEmailFromCnpja(cnpja);
    if (email) provider = "cnpja";
    if (cnpja) {
      name = cnpja.company?.name || cnpja.alias || name;
      phone = formatPhoneFromCnpja(cnpja) || phone;
    }
  }

  if (!email) return null;

  return {
    email,
    phone,
    name: name || "EMPRESA SEM NOME",
    provider,
    opencnpj,
    cnpja,
    listRow
  };
}

async function scrapeCnpj(source, config, logger) {
  const leads = [];
  const cnae = parseCnaeFromSource(source);
  const uf = parseUfFromSource(source);

  if (!cnae) {
    logger.error({ sourceId: source.id, baseUrl: source.base_url }, "CNPJ source missing CNAE in base_url or notes");
    return leads;
  }

  const batchLimit = Math.max(1, Math.min(Number(config.maxItems || 30), 50));
  logger.info({ cnae, uf, batchLimit }, "Buscando CNPJs por CNAE (Minha Receita + OpenCNPJ/CNPJA)");

  let cursor = null;
  let pages = 0;
  const maxPages = 3;

  while (leads.length < batchLimit && pages < maxPages) {
    const { rows, nextCursor } = await fetchCnpjListByCnae(cnae, {
      uf,
      cursor,
      logger,
      sourceId: source.id
    });

    pages += 1;
    if (!rows.length) break;

    for (const row of rows) {
      if (leads.length >= batchLimit) break;

      const cnpj = normalizeCnpj(row.cnpj);
      try {
        const contact = await resolveCnpjContact(cnpj, row);
        if (!contact) continue;

        leads.push({
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          raw_data: {
            source: contact.provider,
            cnpj,
            cnae,
            uf: row.uf || uf || contact.opencnpj?.uf || null,
            municipio: row.municipio || contact.opencnpj?.municipio || null,
            situacao_cadastral: row.situacao_cadastral || contact.opencnpj?.situacao_cadastral || null,
            detail_provider: contact.provider
          }
        });

        await new Promise((resolve) => setTimeout(resolve, DETAIL_DELAY_MS));
      } catch (err) {
        logger.warn({ cnpj, error: err.message }, "Erro ao buscar detalhes do CNPJ");
      }
    }

    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  logger.info({ sourceId: source.id, cnae, uf, saved: leads.length, pagesScanned: pages }, "CNPJ source scraped");
  return leads;
}

module.exports = {
  scrapeCnpj,
  parseCnaeFromSource,
  parseUfFromSource,
  resolveCnpjContact
};
