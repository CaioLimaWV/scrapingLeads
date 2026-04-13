exports.up = async function up(knex) {
  await knex.schema.createTable("leads", (table) => {
    table.increments("id").primary();
    table.string("name", 255).notNullable();
    table.string("email", 255).notNullable();
    table.string("email_normalized", 255).notNullable();
    table.string("phone", 25).nullable();
    table.string("phone_normalized", 25).nullable();
    table
      .integer("source_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("lead_sources")
      .onDelete("CASCADE");
    table.json("raw_data").nullable();
    table.boolean("is_valid").notNullable().defaultTo(true);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.integer("is_duplicate_of").unsigned().nullable();
    table.timestamps(true, true);

    table.unique(["email_normalized", "source_id"], "uq_leads_email_source");
    table.unique(["phone_normalized", "source_id"], "uq_leads_phone_source");
    table.index(["email_normalized"], "idx_leads_email");
    table.index(["phone_normalized"], "idx_leads_phone");
    table.index(["source_id", "created_at"], "idx_leads_source_created");
    table.index(["is_valid", "is_active"], "idx_leads_valid_active");
  });

  await knex.schema.alterTable("leads", (table) => {
    table
      .foreign("is_duplicate_of")
      .references("id")
      .inTable("leads")
      .onDelete("SET NULL");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("leads");
};
