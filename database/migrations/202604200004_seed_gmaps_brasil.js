exports.up = async function up(knex) {
  const niches = [
    { id: "clinicas", term: "clinicas" },
    { id: "contabilidade", term: "escritorios de contabilidade" },
    { id: "restaurantes", term: "restaurantes" },
    { id: "advogados", term: "advogados" },
    { id: "padarias", term: "padarias" },
    { id: "escolas", term: "escolas particulares" },
    { id: "imobiliarias", term: "imobiliarias" },
    { id: "academias", term: "academias" },
    { id: "esteticas", term: "clinicas de estetica" },
    { id: "lojas-roupa", term: "lojas de roupas" },
    { id: "dentistas", term: "dentistas" },
    { id: "veterinarias", term: "clinicas veterinarias" },
    { id: "petshops", term: "petshops" }
  ];

  // Adicionando as maiores capitais do Brasil (São Paulo já foi adicionada anteriormente)
  const capitals = [
    { id: "rj", name: "Rio de Janeiro" },
    { id: "bh", name: "Belo Horizonte" },
    { id: "cwb", name: "Curitiba" },
    { id: "poa", name: "Porto Alegre" },
    { id: "ssa", name: "Salvador" },
    { id: "bsb", name: "Brasilia" },
    { id: "for", name: "Fortaleza" },
    { id: "rec", name: "Recife" },
    { id: "gyn", name: "Goiania" },
    { id: "mao", name: "Manaus" },
    { id: "bel", name: "Belem" },
    { id: "vix", name: "Vitoria" },
    { id: "fln", name: "Florianopolis" },
    { id: "nat", name: "Natal" },
    { id: "slz", name: "Sao Luis" }
  ];

  const sources = [];

  for (const capital of capitals) {
    for (const niche of niches) {
      // Remove acentos e espaços da URL
      const termUrl = encodeURIComponent(niche.term);
      const cityUrl = encodeURIComponent(capital.name);

      sources.push({
        name: `gmaps-${niche.id}-${capital.id}`,
        base_url: `https://www.google.com/maps/search/${termUrl}+em+${cityUrl}`,
        rate_limit_per_hour: 50,
        notes: `Scraping de ${niche.id} via Google Maps em ${capital.name}`,
        is_active: true
      });
    }
  }

  // Como são mais de 100 registros, usamos batchInsert
  await knex.batchInsert("lead_sources", sources, 50);
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .where("name", "regexp", "gmaps-.*-(rj|bh|cwb|poa|ssa|bsb|for|rec|gyn|mao|bel|vix|fln|nat|slz)$")
    .del();
};
