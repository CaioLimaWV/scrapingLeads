exports.up = async function up(knex) {
  const sources = [
    {
      name: "senado-dados-abertos-api",
      base_url: "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json",
      rate_limit_per_hour: 180,
      is_active: true,
      field_area: "politica",
      notes: "Fonte aberta do Senado para dados legislativos"
    },
    {
      name: "banco-central-sgs-api",
      base_url: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados?formato=json",
      rate_limit_per_hour: 180,
      is_active: true,
      field_area: "economia",
      notes: "Fonte aberta do Banco Central (series temporais economicas)"
    },
    {
      name: "tesouro-siconfi-api",
      base_url: "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo",
      rate_limit_per_hour: 180,
      is_active: true,
      field_area: "economia",
      notes: "Fonte aberta do Tesouro Nacional (dados fiscais)"
    },
    {
      name: "ibge-estados-api",
      base_url: "https://servicodados.ibge.gov.br/api/v1/localidades/estados",
      rate_limit_per_hour: 180,
      is_active: true,
      field_area: "demografia",
      notes: "Fonte aberta IBGE para recortes territoriais"
    },
    {
      name: "capes-dados-abertos-api",
      base_url: "https://dadosabertos.capes.gov.br/api/3/action/status_show",
      rate_limit_per_hour: 180,
      is_active: true,
      field_area: "educacao",
      notes: "Fonte aberta CAPES para dados de educacao e pesquisa"
    },
    {
      name: "aneel-dados-abertos-api",
      base_url: "https://dadosabertos.aneel.gov.br/api/3/action/status_show",
      rate_limit_per_hour: 180,
      is_active: true,
      field_area: "energia",
      notes: "Fonte aberta ANEEL para dados de energia"
    }
  ];

  for (const source of sources) {
    const exists = await knex("lead_sources").where({ name: source.name }).first();
    if (!exists) {
      await knex("lead_sources").insert(source);
    }
  }
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .whereIn("name", [
      "senado-dados-abertos-api",
      "banco-central-sgs-api",
      "tesouro-siconfi-api",
      "ibge-estados-api",
      "capes-dados-abertos-api",
      "aneel-dados-abertos-api"
    ])
    .del();
};
