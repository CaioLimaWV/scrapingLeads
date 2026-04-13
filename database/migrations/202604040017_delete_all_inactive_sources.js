exports.up = async function up(knex) {
  await knex("lead_sources")
    .where({ is_active: false })
    .del();
};

exports.down = async function down() {
  // Irreversible data cleanup migration.
};
