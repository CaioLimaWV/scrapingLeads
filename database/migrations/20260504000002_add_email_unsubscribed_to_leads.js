exports.up = async function (knex) {
  await knex.schema.alterTable("leads", (table) => {
    table.boolean("email_unsubscribed").notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("leads", (table) => {
    table.dropColumn("email_unsubscribed");
  });
};
