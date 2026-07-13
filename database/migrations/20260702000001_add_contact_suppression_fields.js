exports.up = async function (knex) {
  await knex.schema.alterTable("leads", (table) => {
    table.boolean("whatsapp_opt_out").notNullable().defaultTo(false);
    table.text("contact_notes").nullable();
    table.string("alternate_email", 255).nullable();
    table.timestamp("suppressed_at").nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("leads", (table) => {
    table.dropColumn("whatsapp_opt_out");
    table.dropColumn("contact_notes");
    table.dropColumn("alternate_email");
    table.dropColumn("suppressed_at");
  });
};
