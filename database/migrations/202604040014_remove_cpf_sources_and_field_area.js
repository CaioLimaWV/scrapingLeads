exports.up = async function up(knex) {
  await knex("lead_sources")
    .where({ field_area: "cpf" })
    .del();
};

exports.down = async function down(knex) {
  const exists = await knex("lead_sources").where({ name: "receita-meu-cpf-orientacoes" }).first();
  if (!exists) {
    await knex("lead_sources").insert({
      name: "receita-meu-cpf-orientacoes",
      base_url: "https://www.gov.br/receitafederal/pt-br/assuntos/meu-cpf",
      rate_limit_per_hour: 30,
      is_active: false,
      field_area: "cpf",
      notes: "Nao ha base aberta massiva de CPF por LGPD; referencia oficial de orientacoes"
    });
  }
};
