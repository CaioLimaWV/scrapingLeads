const axios = require("axios");

async function fetchDeputadosPage(baseUrl, page, timeoutMs) {
  const response = await axios.get(baseUrl, {
    timeout: timeoutMs,
    params: {
      ordem: "ASC",
      ordenarPor: "nome",
      itens: 100,
      pagina: page
    },
    headers: {
      Accept: "application/json",
      "User-Agent": "LeadScraperBot/1.0 (+contato@empresa.com)"
    }
  });

  return response.data;
}

async function fetchDeputadoDetail(id, timeoutMs) {
  const response = await axios.get(`https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`, {
    timeout: timeoutMs,
    headers: {
      Accept: "application/json",
      "User-Agent": "LeadScraperBot/1.0 (+contato@empresa.com)"
    }
  });

  return response.data?.dados || null;
}

async function scrapeCamaraDeputados(source, config, logger) {
  const maxItems = Math.max(1, Number(config.maxItems || 80));
  const leads = [];
  let page = 1;

  while (leads.length < maxItems) {
    const payload = await fetchDeputadosPage(source.base_url, page, config.timeoutMs);
    const rows = Array.isArray(payload?.dados) ? payload.dados : [];

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      if (leads.length >= maxItems) {
        break;
      }

      const detail = await fetchDeputadoDetail(row.id, config.timeoutMs);
      const gender = detail?.sexo || null;

      const phone = detail?.ultimoStatus?.gabinete?.telefone || null;
      const email = row.email || detail?.ultimoStatus?.email || null;
      const name = row.nome || detail?.ultimoStatus?.nome || null;

      if (!name || !email) {
        continue;
      }

      leads.push({
        name,
        email,
        phone,
        raw_data: {
          source_name: source.name,
          source_url: source.base_url,
          deputado_id: row.id,
          gender,
          uf: row.siglaUf,
          partido: row.siglaPartido
        }
      });
    }

    page += 1;
  }

  logger.info({ sourceId: source.id, totalFound: leads.length }, "Camara source scraped");
  return leads;
}

module.exports = {
  scrapeCamaraDeputados
};
