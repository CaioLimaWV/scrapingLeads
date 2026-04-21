exports.up = async function (knex) {
  await knex.schema.alterTable("leads", (table) => {
    table.boolean("contacted").notNullable().defaultTo(false);
    table.timestamp("contacted_at").nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("leads", (table) => {
    table.dropColumn("contacted");
    table.dropColumn("contacted_at");
  });
};