exports.up = async function up(knex) {
  await knex.schema.alterTable("leads", (table) => {
    table.dropUnique(["email_normalized", "source_id"], "uq_leads_email_source");
    table.dropUnique(["phone_normalized", "source_id"], "uq_leads_phone_source");
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("leads", (table) => {
    table.unique(["email_normalized", "source_id"], "uq_leads_email_source");
    table.unique(["phone_normalized", "source_id"], "uq_leads_phone_source");
  });
};