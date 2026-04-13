exports.up = async function up(knex) {
  const existing = await knex("lead_sources")
    .select("id")
    .where({ name: "scraping-manual" })
    .first();

  if (existing) {
    await knex("lead_sources")
      .where({ id: existing.id })
      .update({
        base_url: "https://manual.local",
        field_area: "geral",
        is_active: true,
        notes: "Fonte reservada para leads persistidos via scraping manual",
        updated_at: knex.fn.now()
      });
    return;
  }

  await knex("lead_sources").insert({
    name: "scraping-manual",
    base_url: "https://manual.local",
    rate_limit_per_hour: 100,
    field_area: "geral",
    is_active: true,
    notes: "Fonte reservada para leads persistidos via scraping manual"
  });
};

exports.down = async function down(knex) {
  await knex("lead_sources").where({ name: "scraping-manual" }).del();
};
