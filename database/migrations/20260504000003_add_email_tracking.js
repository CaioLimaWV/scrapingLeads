exports.up = async function (knex) {
  // token único por envio para rastreio
  await knex.schema.alterTable("email_sends", (table) => {
    table.string("tracking_token", 64).nullable().unique();
  });

  // cada evento rastreado (open, click, unsubscribe)
  await knex.schema.createTable("email_events", (table) => {
    table.increments("id").primary();
    table
      .integer("email_send_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("email_sends")
      .onDelete("CASCADE");
    table.enum("event_type", ["open", "click", "unsubscribe"]).notNullable();
    table.string("url_clicked", 1000).nullable();
    table.string("ip", 45).nullable();
    table.timestamp("occurred_at").notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.index(["email_send_id", "event_type"], "idx_email_events_send_type");
    table.index("occurred_at", "idx_email_events_occurred_at");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("email_events");
  await knex.schema.alterTable("email_sends", (table) => {
    table.dropColumn("tracking_token");
  });
};
