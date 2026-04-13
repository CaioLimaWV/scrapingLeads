exports.up = async function up(knex) {
  await knex.schema.createTable("lead_deduplication_log", (table) => {
    table.increments("id").primary();
    table
      .integer("lead_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("leads")
      .onDelete("CASCADE");
    table
      .integer("duplicate_of_lead_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("leads")
      .onDelete("CASCADE");
    table.string("reason", 100).notNullable();
    table.float("confidence").nullable();
    table.timestamps(true, true);

    table.index(["lead_id"], "idx_dedupe_lead_id");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("lead_deduplication_log");
};
