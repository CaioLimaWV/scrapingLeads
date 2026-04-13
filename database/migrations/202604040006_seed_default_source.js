exports.up = async function up(knex) {
  const exists = await knex("lead_sources").where({ name: "sample-static" }).first();
  if (!exists) {
    await knex("lead_sources").insert({
      name: "sample-static",
      base_url: "https://example.com/leads",
      rate_limit_per_hour: 60,
      is_active: true,
      notes: "Replace this URL and scraper selectors with your real source"
    });
  }
};

exports.down = async function down(knex) {
  await knex("lead_sources").where({ name: "sample-static" }).del();
};
