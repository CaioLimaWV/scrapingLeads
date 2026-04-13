exports.up = async function up(knex) {
  await knex.schema.createTable("scraping_errors", (table) => {
    table.increments("id").primary();
    table
      .integer("execution_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("scraping_executions")
      .onDelete("CASCADE");
    table.string("error_type", 60).notNullable();
    table.string("error_code", 60).nullable();
    table.text("message").notNullable();
    table.string("url_attempted", 600).nullable();
    table.text("html_sample").nullable();
    table.timestamps(true, true);

    table.index(["execution_id"], "idx_errors_execution");
    table.index(["error_type"], "idx_errors_type");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("scraping_errors");
};
