const axios = require("axios");

async function scrapeCnpj(source, config, logger) {
  const leads = [];
  try {
    logger.info({ url: source.base_url }, "Buscando lista de CNPJs no CNAE (Minha Receita)");
    const listResponse = await axios.get(source.base_url, { timeout: 15000 });
    const cnpjs = listResponse.data || [];
    
    // Limitamos para evitar que o scraper demore muito em uma única execução
    const limit = 30;
    const selectedCnpjs = cnpjs.slice(0, limit);
    logger.info({ count: selectedCnpjs.length }, "CNPJs selecionados para enriquecimento");

    for (const cnpj of selectedCnpjs) {
      try {
        const detailUrl = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
        const detailResponse = await axios.get(detailUrl, { timeout: 10000 });
        const dados = detailResponse.data;

        const email = dados.email || "";
        const telefone = dados.ddd_telefone_1 || "";
        
        // Exige email válido segundo o schema (e que contenha '@')
        if (email && email.includes("@")) {
          leads.push({
            name: dados.razao_social || dados.nome_fantasia || "EMPRESA SEM NOME",
            email: email.toLowerCase().trim(),
            phone: telefone || null,
            raw_data: dados
          });
        }
        
        // Pausa para não tomar block da BrasilAPI (rate limit)
        await new Promise(res => setTimeout(res, 800));
      } catch (err) {
        logger.warn({ cnpj, error: err.message }, "Erro ao buscar detalhes do CNPJ");
      }
    }
  } catch (error) {
    logger.error({ error: error.message }, "Erro ao buscar lista principal de CNPJs");
    throw error;
  }

  return leads;
}

module.exports = {
  scrapeCnpj
};
