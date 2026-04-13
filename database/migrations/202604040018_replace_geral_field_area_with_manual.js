exports.up = async function up(knex) {
  await knex("lead_sources")
    .where({ field_area: "geral" })
    .update({ field_area: "manual", updated_at: knex.fn.now() });
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .where({ field_area: "manual", name: "scraping-manual" })
    .update({ field_area: "geral", updated_at: knex.fn.now() });
};
