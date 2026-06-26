exports.up = async function (knex) {
  await knex.schema.alterTable("email_campaigns", (table) => {
    table.integer("min_days_since_email").unsigned().nullable();
    table.boolean("require_prior_email").notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("email_campaigns", (table) => {
    table.dropColumn("min_days_since_email");
    table.dropColumn("require_prior_email");
  });
};
