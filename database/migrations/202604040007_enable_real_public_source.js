exports.up = async function up(knex) {
  await knex("lead_sources").where({ name: "sample-static" }).update({ is_active: false, updated_at: knex.fn.now() });

  const exists = await knex("lead_sources").where({ name: "camara-deputados-api" }).first();

  if (!exists) {
    await knex("lead_sources").insert({
      name: "camara-deputados-api",
      base_url: "https://dadosabertos.camara.leg.br/api/v2/deputados",
      rate_limit_per_hour: 350,
      is_active: true,
      notes: "Fonte oficial de dados publicos da Camara dos Deputados"
    });
  } else {
    await knex("lead_sources")
      .where({ name: "camara-deputados-api" })
      .update({
        base_url: "https://dadosabertos.camara.leg.br/api/v2/deputados",
        rate_limit_per_hour: 350,
        is_active: true,
        notes: "Fonte oficial de dados publicos da Camara dos Deputados",
        updated_at: knex.fn.now()
      });
  }
};

exports.down = async function down(knex) {
  await knex("lead_sources").where({ name: "camara-deputados-api" }).del();
  await knex("lead_sources").where({ name: "sample-static" }).update({ is_active: true, updated_at: knex.fn.now() });
};
