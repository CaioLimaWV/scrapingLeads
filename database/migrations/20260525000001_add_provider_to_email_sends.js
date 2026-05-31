exports.up = async function (knex) {
  await knex.schema.alterTable("email_sends", (table) => {
    table.string("provider", 32).nullable();
    table.index(["provider", "sent_at"], "idx_email_sends_provider_sent_at");
  });

  await knex("email_sends").where("status", "sent").update({ provider: "brevo" });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("email_sends", (table) => {
    table.dropIndex(["provider", "sent_at"], "idx_email_sends_provider_sent_at");
    table.dropColumn("provider");
  });
};
