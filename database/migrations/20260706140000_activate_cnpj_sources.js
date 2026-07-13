/**
 * Reativa fontes CNPJ e adiciona nichos B2B com e-mail via OpenCNPJ.
 */
exports.up = async function up(knex) {
  await knex("lead_sources")
    .where({ name: "cnpj-receita-comercio" })
    .update({
      is_active: true,
      base_url: "https://minhareceita.org/?cnae=4712100",
      notes: "CNPJ por CNAE via Minha Receita + OpenCNPJ (email quando disponível)"
    });

  await knex("lead_sources")
    .where({ name: "cnpj-receita-vestuario" })
    .update({
      is_active: true,
      base_url: "https://minhareceita.org/?cnae=4781400",
      notes: "CNPJ por CNAE via Minha Receita + OpenCNPJ (email quando disponível)"
    });

  const newSources = [
    {
      name: "cnpj-contabilidade",
      base_url: "https://minhareceita.org/?cnae=6920601",
      field_area: "financeiro",
      rate_limit_per_hour: 120,
      is_active: true,
      notes: "Escritórios de contabilidade — CNAE 6920601"
    },
    {
      name: "cnpj-advocacia",
      base_url: "https://minhareceita.org/?cnae=6911701",
      field_area: "juridico",
      rate_limit_per_hour: 120,
      is_active: true,
      notes: "Serviços advocatícios — CNAE 6911701"
    },
    {
      name: "cnpj-desenvolvimento-web",
      base_url: "https://minhareceita.org/?cnae=6201501",
      field_area: "tecnologia",
      rate_limit_per_hour: 120,
      is_active: true,
      notes: "Desenvolvimento de software — CNAE 6201501"
    }
  ];

  for (const source of newSources) {
    const exists = await knex("lead_sources").where({ name: source.name }).first();
    if (exists) {
      await knex("lead_sources").where({ id: exists.id }).update({
        base_url: source.base_url,
        field_area: source.field_area,
        is_active: true,
        notes: source.notes
      });
    } else {
      await knex("lead_sources").insert(source);
    }
  }
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .whereIn("name", ["cnpj-contabilidade", "cnpj-advocacia", "cnpj-desenvolvimento-web"])
    .del();

  await knex("lead_sources")
    .whereIn("name", ["cnpj-receita-comercio", "cnpj-receita-vestuario"])
    .update({ is_active: false });
};
