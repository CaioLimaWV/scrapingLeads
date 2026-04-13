exports.up = async function up(knex) {
  await knex.schema.createTable("scraping_executions", (table) => {
    table.increments("id").primary();
    table
      .integer("source_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("lead_sources")
      .onDelete("CASCADE");
    table.timestamp("started_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("finished_at").nullable();
    table.enu("status", ["running", "completed", "failed", "partial"]).notNullable().defaultTo("running");
    table.integer("total_scraped").notNullable().defaultTo(0);
    table.integer("total_saved").notNullable().defaultTo(0);
    table.integer("duplicates_found").notNullable().defaultTo(0);
    table.integer("errors_count").notNullable().defaultTo(0);
    table.json("error_log").nullable();
    table.timestamps(true, true);

    table.index(["source_id", "finished_at"], "idx_exec_source_finished");
    table.index(["status", "finished_at"], "idx_exec_status_finished");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("scraping_executions");
};
