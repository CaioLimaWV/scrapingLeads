exports.up = async function up(knex) {
  await knex.schema.alterTable("lead_sources", (table) => {
    table.string("field_area", 60).notNullable().defaultTo("geral");
  });

  await knex("lead_sources")
    .where({ name: "camara-deputados-api" })
    .update({ field_area: "politica", updated_at: knex.fn.now() });

  await knex("lead_sources")
    .where({ name: "sample-static" })
    .update({ field_area: "geral", updated_at: knex.fn.now() });

  const advocaciaSources = [
    {
      name: "camara-proposicoes-api",
      base_url: "https://dadosabertos.camara.leg.br/api/v2/proposicoes",
      rate_limit_per_hour: 180,
      is_active: false,
      field_area: "advocacia",
      notes: "API legislativa aberta da Camara para monitoramento juridico e normativo"
    },
    {
      name: "senado-dados-abertos-api",
      base_url: "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json",
      rate_limit_per_hour: 180,
      is_active: false,
      field_area: "advocacia",
      notes: "API aberta do Senado para dados legislativos com aplicacao em inteligencia juridica"
    }
  ];

  for (const source of advocaciaSources) {
    const exists = await knex("lead_sources").where({ name: source.name }).first();
    if (!exists) {
      await knex("lead_sources").insert(source);
    }
  }
};

exports.down = async function down(knex) {
  await knex("lead_sources").whereIn("name", ["camara-proposicoes-api", "senado-dados-abertos-api"]).del();

  await knex.schema.alterTable("lead_sources", (table) => {
    table.dropColumn("field_area");
  });
};
