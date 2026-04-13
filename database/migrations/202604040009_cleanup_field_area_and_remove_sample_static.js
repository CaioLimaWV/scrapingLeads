exports.up = async function up(knex) {
  await knex("lead_sources")
    .where({ field_area: "advocacia" })
    .update({ field_area: "politica", updated_at: knex.fn.now() });

  await knex("lead_sources")
    .where({ name: "sample-static" })
    .del();
};

exports.down = async function down(knex) {
  const exists = await knex("lead_sources").where({ name: "sample-static" }).first();
  if (!exists) {
    await knex("lead_sources").insert({
      name: "sample-static",
      base_url: "https://example.com/leads",
      rate_limit_per_hour: 60,
      is_active: false,
      field_area: "geral",
      notes: "Legacy static source restored by rollback"
    });
  }

  await knex("lead_sources")
    .whereIn("name", ["camara-proposicoes-api", "senado-dados-abertos-api"])
    .update({ field_area: "advocacia", updated_at: knex.fn.now() });
};
