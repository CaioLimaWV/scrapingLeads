exports.up = async function up(knex) {
  await knex("lead_sources").insert([
    {
      name: "cnpj-receita-comercio",
      base_url: "https://minhareceita.org/list/cnae/4712100",
      rate_limit_per_hour: 300,
      notes: "Dados publicos CNPJ - Minimercados"
    },
    {
      name: "cnpj-receita-vestuario",
      base_url: "https://minhareceita.org/list/cnae/4781400",
      rate_limit_per_hour: 300,
      notes: "Dados publicos CNPJ - Vestuario"
    }
  ]);
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .whereIn("name", ["cnpj-receita-comercio", "cnpj-receita-vestuario"])
    .del();
};
