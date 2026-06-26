exports.up = async function up(knex) {
  await knex.schema.alterTable("email_sends", (table) => {
    table.string("utm_campaign", 120).nullable();
    table.text("utm_links").nullable();
    table.index("utm_campaign", "idx_email_sends_utm_campaign");
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("email_sends", (table) => {
    table.dropIndex("utm_campaign", "idx_email_sends_utm_campaign");
    table.dropColumn("utm_links");
    table.dropColumn("utm_campaign");
  });
};
