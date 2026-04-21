exports.up = async function up(knex) {
  // Desativar todas as fontes que não são do Google Maps para focar apenas nas prospecções reais
  await knex("lead_sources")
    .whereNot("name", "like", "gmaps-%")
    .update({ is_active: false });
};

exports.down = async function down(knex) {
  // Opcional: Reativar todas caso façamos rollback
  await knex("lead_sources")
    .update({ is_active: true });
};
