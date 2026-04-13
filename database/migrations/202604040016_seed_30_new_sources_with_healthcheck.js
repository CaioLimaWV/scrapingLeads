exports.up = async function up(knex) {
  const sources = [
    {
      name: "cfm-medicos-api",
      base_url: "https://portal.cfm.org.br/utilidades/busca-medicos/",
      rate_limit_per_hour: 60,
      is_active: false,
      field_area: "saude",
      notes: "Healthcheck 2026-04-04: HTTP 404. Manter inativa ate URL publica valida."
    },
    {
      name: "cfo-dentistas-consulta",
      base_url: "https://website.cfo.org.br/servicos/consulta-de-cirurgiao-dentista/",
      rate_limit_per_hour: 60,
      is_active: false,
      field_area: "saude",
      notes: "Healthcheck 2026-04-04: HTTP 404. Manter inativa ate URL publica valida."
    },
    {
      name: "ans-operadoras-saude",
      base_url: "https://dadosabertos.ans.gov.br/api/3/",
      rate_limit_per_hour: 120,
      is_active: false,
      field_area: "saude",
      notes: "Healthcheck 2026-04-04: HTTP 404. Manter inativa ate endpoint CKAN confirmado."
    },
    {
      name: "anvisa-empresas-autorizadas",
      base_url: "https://consultas.anvisa.gov.br/",
      rate_limit_per_hour: 60,
      is_active: false,
      field_area: "saude",
      notes: "Healthcheck 2026-04-04: HTTP 403 sem autenticacao/cabecalhos especificos."
    },
    {
      name: "osm-clinicas-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "saude",
      notes: "Overpass acessivel (HTTP 400 sem query). Exemplo: nwr[\"amenity\"=\"clinic\"]."
    },
    {
      name: "osm-farmacias-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "saude",
      notes: "Overpass acessivel (HTTP 400 sem query). Exemplo: nwr[\"amenity\"=\"pharmacy\"]."
    },
    {
      name: "oab-advogados-api",
      base_url: "https://cna.oab.org.br/",
      rate_limit_per_hour: 60,
      is_active: true,
      field_area: "juridico",
      notes: "Portal publico OAB (HTTP 200)."
    },
    {
      name: "cvm-empresas-abertas",
      base_url: "https://dados.cvm.gov.br/dados/CIA_ABERTA/",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "financeiro",
      notes: "Dados abertos CVM (HTTP 200)."
    },
    {
      name: "b3-empresas-listadas",
      base_url: "https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/empresas-listadas.htm",
      rate_limit_per_hour: 60,
      is_active: true,
      field_area: "financeiro",
      notes: "Pagina publica B3 (HTTP 200)."
    },
    {
      name: "inpi-marcas-api",
      base_url: "https://dadosabertos.inpi.gov.br/",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "inovacao",
      notes: "Dados abertos INPI (HTTP 200)."
    },
    {
      name: "startups-conecta-api",
      base_url: "https://startups.mctic.gov.br/",
      rate_limit_per_hour: 60,
      is_active: false,
      field_area: "inovacao",
      notes: "Healthcheck 2026-04-04: sem resposta (HTTP 000)."
    },
    {
      name: "licitacoes-comprasnet-api",
      base_url: "https://dados.gov.br/dados/conjuntos-dados/compras-governamentais",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "governo",
      notes: "Catalogo dados.gov.br (HTTP 200)."
    },
    {
      name: "pncp-contratos-api",
      base_url: "https://pncp.gov.br/api/pncp/v1/contratos",
      rate_limit_per_hour: 120,
      is_active: false,
      field_area: "governo",
      notes: "Healthcheck 2026-04-04: HTTP 404. Validar endpoint de contratos PNCP."
    },
    {
      name: "siconv-convenios-api",
      base_url: "https://plataformamaisbrasil.gov.br/dados-abertos",
      rate_limit_per_hour: 60,
      is_active: false,
      field_area: "governo",
      notes: "Healthcheck 2026-04-04: sem resposta (HTTP 000)."
    },
    {
      name: "mec-ies-cadastro",
      base_url: "https://emec.mec.gov.br/emec/open-digital-services/opendigitalservices",
      rate_limit_per_hour: 60,
      is_active: false,
      field_area: "educacao",
      notes: "Healthcheck 2026-04-04: HTTP 403 (acesso restrito/anti-bot)."
    },
    {
      name: "inep-censo-escolar",
      base_url: "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "educacao",
      notes: "Pagina publica INEP (HTTP 200)."
    },
    {
      name: "osm-escolas-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "educacao",
      notes: "Overpass acessivel (HTTP 400 sem query). Exemplo: nwr[\"amenity\"=\"school\"]."
    },
    {
      name: "crea-engenheiros-consulta",
      base_url: "https://www.crea.org.br/consulta-de-profissionais/",
      rate_limit_per_hour: 60,
      is_active: false,
      field_area: "engenharia",
      notes: "Healthcheck 2026-04-04: sem resposta (HTTP 000)."
    },
    {
      name: "detran-veiculos-stats",
      base_url: "https://dados.gov.br/dados/conjuntos-dados/frota-de-veiculos",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "transporte",
      notes: "Catalogo dados.gov.br (HTTP 200)."
    },
    {
      name: "antt-transportadoras",
      base_url: "https://dados.gov.br/dados/conjuntos-dados/rntrc",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "transporte",
      notes: "Catalogo dados.gov.br (HTTP 200)."
    },
    {
      name: "rais-empregos-mte",
      base_url: "https://dados.gov.br/dados/conjuntos-dados/relacao-anual-de-informacoes-sociais-rais",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "rh_trabalho",
      notes: "Catalogo dados.gov.br (HTTP 200)."
    },
    {
      name: "caged-contratacoes",
      base_url: "https://dados.gov.br/dados/conjuntos-dados/novo-caged",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "rh_trabalho",
      notes: "Catalogo dados.gov.br (HTTP 200)."
    },
    {
      name: "procon-reclamacoes-api",
      base_url: "https://dados.gov.br/dados/conjuntos-dados/cadastro-de-reclamacoes-fundamentadas-procon",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "consumidor",
      notes: "Catalogo dados.gov.br (HTTP 200)."
    },
    {
      name: "osm-restaurantes-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "alimentacao",
      notes: "Overpass acessivel (HTTP 400 sem query). Exemplo: nwr[\"amenity\"=\"restaurant\"]."
    },
    {
      name: "osm-hoteis-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "hotelaria",
      notes: "Overpass acessivel (HTTP 400 sem query). Exemplo: nwr[\"tourism\"=\"hotel\"]."
    },
    {
      name: "osm-academias-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "esporte",
      notes: "Overpass acessivel (HTTP 400 sem query). Exemplo: nwr[\"leisure\"=\"fitness_centre\"]."
    },
    {
      name: "osm-condominios-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "imobiliario",
      notes: "Overpass acessivel (HTTP 400 sem query). Exemplo: way[\"landuse\"=\"residential\"]."
    },
    {
      name: "osm-igrejas-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "religioso",
      notes: "Overpass acessivel (HTTP 400 sem query). Exemplo: nwr[\"amenity\"=\"place_of_worship\"]."
    },
    {
      name: "github-empresas-br",
      base_url: "https://api.github.com/search/users?q=type:org+location:Brazil",
      rate_limit_per_hour: 60,
      is_active: true,
      field_area: "tecnologia",
      notes: "API publica GitHub Search (HTTP 200, sujeito a rate limit)."
    },
    {
      name: "linkedin-company-scraping",
      base_url: "https://www.linkedin.com/company/",
      rate_limit_per_hour: 20,
      is_active: false,
      field_area: "tecnologia",
      notes: "Healthcheck 2026-04-04: HTTP 404 na URL base; scraping automatizado pode violar ToS."
    }
  ];

  for (const source of sources) {
    const exists = await knex("lead_sources").where({ name: source.name }).first();
    if (!exists) {
      await knex("lead_sources").insert(source);
      continue;
    }

    await knex("lead_sources")
      .where({ id: exists.id })
      .update({
        base_url: source.base_url,
        rate_limit_per_hour: source.rate_limit_per_hour,
        is_active: source.is_active,
        field_area: source.field_area,
        notes: source.notes,
        updated_at: knex.fn.now()
      });
  }
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .whereIn("name", [
      "cfm-medicos-api",
      "cfo-dentistas-consulta",
      "ans-operadoras-saude",
      "anvisa-empresas-autorizadas",
      "osm-clinicas-overpass",
      "osm-farmacias-overpass",
      "oab-advogados-api",
      "cvm-empresas-abertas",
      "b3-empresas-listadas",
      "inpi-marcas-api",
      "startups-conecta-api",
      "licitacoes-comprasnet-api",
      "pncp-contratos-api",
      "siconv-convenios-api",
      "mec-ies-cadastro",
      "inep-censo-escolar",
      "osm-escolas-overpass",
      "crea-engenheiros-consulta",
      "detran-veiculos-stats",
      "antt-transportadoras",
      "rais-empregos-mte",
      "caged-contratacoes",
      "procon-reclamacoes-api",
      "osm-restaurantes-overpass",
      "osm-hoteis-overpass",
      "osm-academias-overpass",
      "osm-condominios-overpass",
      "osm-igrejas-overpass",
      "github-empresas-br",
      "linkedin-company-scraping"
    ])
    .del();
};
