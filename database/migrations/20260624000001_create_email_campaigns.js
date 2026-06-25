exports.up = async function (knex) {
  await knex.schema.createTable("email_campaigns", (table) => {
    table.increments("id").primary();
    table.string("name", 120).notNullable();
    table.string("slug", 80).notNullable().unique();
    table.string("subject", 255).notNullable();
    table.text("template").notNullable();
    table.json("source_ids").nullable();
    table.json("field_areas").nullable();
    table.integer("daily_batch_size").unsigned().nullable();
    table.enum("status", ["active", "paused", "archived"]).notNullable().defaultTo("active");
    table.text("notes").nullable();
    table.timestamp("last_dispatched_at").nullable();
    table.timestamps(true, true);

    table.index("status", "idx_email_campaigns_status");
  });

  await knex.schema.alterTable("email_sends", (table) => {
    table
      .integer("campaign_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("email_campaigns")
      .onDelete("SET NULL");
    table.index("campaign_id", "idx_email_sends_campaign_id");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("email_sends", (table) => {
    table.dropIndex("campaign_id", "idx_email_sends_campaign_id");
    table.dropColumn("campaign_id");
  });
  await knex.schema.dropTableIfExists("email_campaigns");
};
