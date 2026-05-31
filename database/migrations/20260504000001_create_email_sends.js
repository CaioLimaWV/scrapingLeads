exports.up = async function (knex) {
  await knex.schema.createTable("email_sends", (table) => {
    table.increments("id").primary();
    table
      .integer("lead_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("leads")
      .onDelete("CASCADE");
    table.string("subject", 255).notNullable();
    table.string("body_preview", 500).nullable();
    table.enum("status", ["sent", "failed", "skipped"]).notNullable().defaultTo("sent");
    table.text("error_message").nullable();
    table.timestamp("sent_at").nullable();
    table.timestamps(true, true);

    table.index("lead_id", "idx_email_sends_lead_id");
    table.index(["status", "sent_at"], "idx_email_sends_status_sent_at");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("email_sends");
};
