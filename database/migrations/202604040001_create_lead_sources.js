exports.up = async function up(knex) {
  await knex.schema.createTable("lead_sources", (table) => {
    table.increments("id").primary();
    table.string("name", 100).notNullable().unique();
    table.string("base_url", 500).notNullable();
    table.integer("rate_limit_per_hour").notNullable().defaultTo(100);
    table.timestamp("last_scraped_at").nullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.text("notes").nullable();
    table.timestamps(true, true);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("lead_sources");
};
