/**
 * Expande fontes CNPJ: filtro UF=SP + novos CNAEs B2B com e-mail via Receita.
 */
exports.up = async function up(knex) {
  const ufSuffix = "&uf=SP";

  const existingUpdates = [
    { name: "cnpj-receita-comercio", cnae: "4712100", field_area: "lojas" },
    { name: "cnpj-receita-vestuario", cnae: "4781400", field_area: "lojas" },
    { name: "cnpj-contabilidade", cnae: "6920601", field_area: "financeiro" },
    { name: "cnpj-advocacia", cnae: "6911701", field_area: "juridico" },
    { name: "cnpj-desenvolvimento-web", cnae: "6201501", field_area: "tecnologia" }
  ];

  for (const item of existingUpdates) {
    await knex("lead_sources")
      .where({ name: item.name })
      .update({
        is_active: true,
        base_url: `https://minhareceita.org/?cnae=${item.cnae}${ufSuffix}`,
        field_area: item.field_area,
        notes: `CNPJ CNAE ${item.cnae} — UF SP — Minha Receita + OpenCNPJ/CNPJA`
      });
  }

  const newSources = [
    {
      name: "cnpj-consultoria-ti",
      base_url: `https://minhareceita.org/?cnae=6202300${ufSuffix}`,
      field_area: "tecnologia",
      notes: "Consultoria em TI — CNAE 6202300 — UF SP"
    },
    {
      name: "cnpj-marketing",
      base_url: `https://minhareceita.org/?cnae=7319002${ufSuffix}`,
      field_area: "inovacao",
      notes: "Marketing e publicidade — CNAE 7319002 — UF SP"
    },
    {
      name: "cnpj-arquitetura",
      base_url: `https://minhareceita.org/?cnae=7111100${ufSuffix}`,
      field_area: "engenharia",
      notes: "Serviços de arquitetura — CNAE 7111100 — UF SP"
    },
    {
      name: "cnpj-treinamento",
      base_url: `https://minhareceita.org/?cnae=8599604${ufSuffix}`,
      field_area: "educacao",
      notes: "Treinamento profissional — CNAE 8599604 — UF SP"
    },
    {
      name: "cnpj-clinicas-pj",
      base_url: `https://minhareceita.org/?cnae=8630503${ufSuffix}`,
      field_area: "saude",
      notes: "Atividade médica ambulatorial (PJ) — CNAE 8630503 — UF SP"
    },
    {
      name: "cnpj-consultoria-gestao",
      base_url: `https://minhareceita.org/?cnae=7020400${ufSuffix}`,
      field_area: "financeiro",
      notes: "Consultoria em gestão empresarial — CNAE 7020400 — UF SP"
    },
    {
      name: "cnpj-restaurantes-pj",
      base_url: `https://minhareceita.org/?cnae=5611201${ufSuffix}`,
      field_area: "alimentacao",
      notes: "Restaurantes e similares — CNAE 5611201 — UF SP"
    },
    {
      name: "cnpj-imobiliarias-pj",
      base_url: `https://minhareceita.org/?cnae=6821801${ufSuffix}`,
      field_area: "financeiro",
      notes: "Corretagem de imóveis — CNAE 6821801 — UF SP"
    }
  ];

  for (const source of newSources) {
    const exists = await knex("lead_sources").where({ name: source.name }).first();
    const payload = {
      ...source,
      rate_limit_per_hour: 120,
      is_active: true
    };
    if (exists) {
      await knex("lead_sources").where({ id: exists.id }).update(payload);
    } else {
      await knex("lead_sources").insert(payload);
    }
  }
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .whereIn("name", [
      "cnpj-consultoria-ti",
      "cnpj-marketing",
      "cnpj-arquitetura",
      "cnpj-treinamento",
      "cnpj-clinicas-pj",
      "cnpj-consultoria-gestao",
      "cnpj-restaurantes-pj",
      "cnpj-imobiliarias-pj"
    ])
    .del();
};
