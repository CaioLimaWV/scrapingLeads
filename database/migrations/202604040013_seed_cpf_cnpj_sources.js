exports.up = async function up(knex) {
  const sources = [
    {
      name: "receita-cnpj-dados-abertos",
      base_url: "https://dadosabertos.rfb.gov.br/CNPJ/",
      rate_limit_per_hour: 60,
      is_active: true,
      field_area: "cnpj",
      notes: "Base aberta oficial da Receita Federal para CNPJ (arquivos publicos)"
    },
    {
      name: "brasilapi-cnpj-v1",
      base_url: "https://brasilapi.com.br/api/cnpj/v1",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "cnpj",
      notes: "API publica para consulta de CNPJ por numero"
    },
    {
      name: "receita-meu-cpf-orientacoes",
      base_url: "https://www.gov.br/receitafederal/pt-br/assuntos/meu-cpf",
      rate_limit_per_hour: 30,
      is_active: false,
      field_area: "cpf",
      notes: "Nao ha base aberta massiva de CPF por LGPD; referencia oficial de orientacoes"
    }
  ];

  for (const source of sources) {
    const exists = await knex("lead_sources").where({ name: source.name }).first();
    if (!exists) {
      await knex("lead_sources").insert(source);
    }
  }
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .whereIn("name", [
      "receita-cnpj-dados-abertos",
      "brasilapi-cnpj-v1",
      "receita-meu-cpf-orientacoes"
    ])
    .del();
};
