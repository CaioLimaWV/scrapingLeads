#!/usr/bin/env node
/**
 * Cria campanhas B/C/D segmentadas por listas (lead_sources).
 * Campanha A ("clinicas de saude") deve já existir — não sobrescreve.
 *
 * Uso:
 *   node scripts/seed-email-campaigns.js
 *   node scripts/seed-email-campaigns.js --sync-templates
 *   node scripts/seed-email-campaigns.js --consolidate-sequences
 *   node scripts/seed-email-campaigns.js --archive-duplicate-followups
 *
 * Sequências ficam DENTRO de cada campanha (email 1, 2, 3…). Não crie campanhas separadas por dia.
 */
require("dotenv").config();

const db = require("../src/database/knex");
const { createCampaign, getCampaignById, countEligibleForCampaign } = require("../src/repositories/campaignRepository");
const { replaceAllSteps, listStepsByCampaignId } = require("../src/repositories/campaignStepRepository");

const SEGMENTS = {
  comercio: /^gmaps-(restaurantes|padarias|lojas-roupa|petshops)-/,
  b2b: /^gmaps-(contabilidade|advogados|imobiliarias|escolas)-/,
  fitness: /^gmaps-academias-/
};

const PORTFOLIO = "https://www.izaiasbessa.com.br/";
const CASE_JESSICA = "https://www.izaiasbessa.com.br/cases/jessica-lopes/";
const BLOG_PRECO = "https://www.izaiasbessa.com.br/blog/site-profissional-quanto-custa/";

const PARENT_CAMPAIGNS = [
  { key: "saude", name: "clinicas de saude" },
  { key: "comercio", name: "Comércio local — lojas e restaurantes" },
  { key: "b2b", name: "B2B — contabilidade, advocacia, imobiliárias" },
  { key: "fitness", name: "Academias e fitness" }
];

const FOLLOW_UPS = [
  {
    suffix: "2º toque (dia 3)",
    subject: "Quanto custa um site profissional? (artigo rápido)",
    minDaysSinceEmail: 3,
    template: (segmentLabel) => `Olá {{nome}},

Escrevi há alguns dias sobre sites para ${segmentLabel}. Sei que timing é importante — sem pressão.

Deixo um artigo objetivo que ajuda a comparar opções antes de contratar:
<a href="${BLOG_PRECO}">Quanto custa um site profissional?</a>

Cases e projetos reais: <a href="${PORTFOLIO}">izaiasbessa.com.br</a>

Se quiser conversar sem compromisso:
<a href="https://wa.me/5511998110569">WhatsApp — Izaias Ramos</a>`
  },
  {
    suffix: "3º toque (dia 7)",
    subject: "Só passando para deixar meu contato",
    minDaysSinceEmail: 3,
    template: () => `Olá {{nome}},

Entrei em contato nos últimos dias sobre desenvolvimento web. Imagino que a caixa de entrada pode estar cheia — acontece.

Deixo meu portfólio e WhatsApp caso precise no futuro:
<a href="${PORTFOLIO}">izaiasbessa.com.br</a>
<a href="https://wa.me/5511998110569">(11) 99811-0569</a>

Abraço,
Izaias`
  }
];

const SEGMENT_LABELS = {
  saude: "clínicas e consultórios",
  comercio: "lojas e restaurantes",
  b2b: "escritórios e empresas",
  fitness: "academias"
};

const TEMPLATES = {
  saude: {
    name: "clinicas de saude",
    template: `Olá {{nome}},

Sou desenvolvedor fullstack e recentemente entreguei sites para profissionais de saúde em São Paulo.

Um exemplo é o case da psicóloga Jéssica Lopes — hoje o site aparece no Google e traz novos pacientes pelo próprio consultório online:

<a href="${CASE_JESSICA}">Ver case no portfólio</a>

Para clínicas e consultórios, um site bem feito funciona 24h: apresenta serviços, transmite confiança e facilita o contato.

Mais projetos e cases em <a href="${PORTFOLIO}">izaiasbessa.com.br</a>.

Se quiser conversar sobre uma solução para o seu negócio, me chame no <a href="https://wa.me/5511998110569">WhatsApp</a>.

Abraço,
Izaias Ramos`
  },
  comercio: {
    name: "Comércio local — lojas e restaurantes",
    subject: "Site e sistemas profissionais para o seu negócio",
    template: `Olá {{nome}},

Sou desenvolvedor fullstack em São Paulo. Desenvolvo sites, landing pages e sistemas web para empresas — do projeto enxuto ao sistema com regras de negócio, integrações e painéis administrativos.

Entrego com design moderno, performance e integração com WhatsApp para captar clientes direto pelo celular.

Veja exemplos de trabalhos no meu portfólio:
<a href="${PORTFOLIO}">izaiasbessa.com.br</a>

Posso montar uma proposta para você esta semana?
<a href="https://wa.me/5511998110569">Responder pelo WhatsApp</a>

Izaias Ramos
Desenvolvedor Fullstack`,
    fieldAreas: ["lojas", "shopping", "alimentacao"],
    notes: "Campanha B — gmaps restaurantes, padarias, lojas, petshops + field_area comércio"
  },
  b2b: {
    name: "B2B — contabilidade, advocacia, imobiliárias",
    subject: "Antes de ligar, seu próximo cliente pesquisa {{nome}} no Google",
    template: `Olá {{nome}},

Quem precisa de contador, advogado ou corretor hoje compara opções online antes de marcar a primeira reunião. Se o site não passa confiança — ou nem existe — o lead escolhe quem parece mais profissional.

Sou Izaias Ramos, desenvolvedor fullstack em São Paulo. Trabalho de forma independente com escritórios e empresas B2B que precisam transformar visita em contato: site institucional, landing page e integração com WhatsApp ou formulário.

Referências que posso mostrar:
• Landing pages de campanha para Smart Fit (performance, deploy e analytics)
• Case de site para profissional de saúde — <a href="${CASE_JESSICA}">ver resultado no portfólio</a>

Em 48h monto uma proposta enxuta (escopo + investimento), sem compromisso. Responda este e-mail ou clique abaixo:

<a href="https://wa.me/5511998110569?text=Ol%C3%A1%20Izaias%2C%20vi%20seu%20email%20sobre%20site%20profissional%20para%20escrit%C3%B3rios">Quero conversar no WhatsApp</a>

Portfólio: <a href="${PORTFOLIO}">izaiasbessa.com.br</a>

Izaias Ramos
Desenvolvedor Fullstack · São Paulo`,
    fieldAreas: ["juridico", "financeiro", "imobiliario", "educacao"],
    notes: "Campanha C — gmaps contabilidade, advogados, imobiliárias, escolas"
  },
  fitness: {
    name: "Academias e fitness",
    subject: "Site profissional para a sua academia",
    template: `Olá {{nome}},

Sou desenvolvedor fullstack e desenvolvo sites, landing pages e sistemas para academias e negócios de fitness — com horários, planos, área do aluno e botão direto para WhatsApp.

Veja trabalhos recentes no portfólio:
<a href="${PORTFOLIO}">izaiasbessa.com.br</a>

Se quiser modernizar a presença online da academia e captar alunos pelo Google, me chame:
<a href="https://wa.me/5511998110569">WhatsApp — Izaias Ramos</a>

Abraço,
Izaias Ramos`,
    fieldAreas: ["esporte"],
    notes: "Campanha fitness — gmaps academias + field_area esporte"
  }
};

async function sourceIdsForPattern(re) {
  const rows = await db("lead_sources").select("id", "name").where("is_active", true);
  return rows.filter((s) => re.test(s.name)).map((s) => s.id);
}

async function slugExists(slug) {
  const row = await db("email_campaigns").where({ slug }).first();
  return !!row;
}

async function syncTemplates() {
  const results = [];

  for (const [key, cfg] of Object.entries(TEMPLATES)) {
    if (!cfg.template) continue;
    const existing = await db("email_campaigns").where("name", cfg.name).first();
    if (!existing) {
      results.push({ key, action: "not_found", name: cfg.name });
      continue;
    }
    const updates = {
      template: cfg.template.trim(),
      updated_at: new Date()
    };
    if (cfg.subject) updates.subject = cfg.subject;

    await db("email_campaigns").where({ id: existing.id }).update(updates);

    const step1 = await db("email_campaign_steps")
      .where({ campaign_id: existing.id, step_order: 1 })
      .first();
    if (step1) {
      const stepUpdates = {
        template: cfg.template.trim(),
        updated_at: new Date()
      };
      if (cfg.subject) stepUpdates.subject = cfg.subject;
      await db("email_campaign_steps").where({ id: step1.id }).update(stepUpdates);
    }

    results.push({
      key,
      action: step1 ? "template_and_step1_updated" : "template_updated",
      id: existing.id,
      name: cfg.name
    });
  }

  return results;
}

async function seedFollowUps() {
  console.warn("DEPRECATED: use --consolidate-sequences (emails dentro da mesma campanha).");
  return consolidateSequences();
}

async function archiveDuplicateFollowups() {
  const rows = await db("email_campaigns")
    .where("name", "like", "%— 2º toque%")
    .orWhere("name", "like", "%— 3º toque%");
  const ids = rows.map((r) => r.id);
  if (!ids.length) return { archived: 0, ids: [] };
  await db("email_campaigns").whereIn("id", ids).update({ status: "archived", updated_at: new Date() });
  return { archived: ids.length, ids };
}

async function consolidateSequences() {
  const results = [];

  for (const parent of PARENT_CAMPAIGNS) {
    const base = await getCampaignById(
      (await db("email_campaigns").where({ name: parent.name }).first())?.id
    );
    if (!base) {
      results.push({ parent: parent.name, action: "not_found" });
      continue;
    }

    const existing = await listStepsByCampaignId(base.id);
    if (existing.length >= 1 + FOLLOW_UPS.length) {
      results.push({ parent: parent.name, action: "skipped", steps: existing.length });
      continue;
    }

    const allSteps = [
      {
        subject: existing[0]?.subject || base.subject,
        template: existing[0]?.template || base.template,
        minDaysSincePrevious: null
      },
      ...FOLLOW_UPS.map((step) => ({
        subject: step.subject,
        template: step.template(SEGMENT_LABELS[parent.key] || "seu negócio"),
        minDaysSincePrevious: step.minDaysSinceEmail
      }))
    ];

    await replaceAllSteps(base.id, allSteps);
    results.push({ parent: parent.name, action: "consolidated", steps: allSteps.length });
  }

  return results;
}

async function main() {
  const syncOnly = process.argv.includes("--sync-templates");
  const followUpsOnly = process.argv.includes("--seed-followups");
  const consolidateOnly = process.argv.includes("--consolidate-sequences");
  const archiveDupes = process.argv.includes("--archive-duplicate-followups");
  const results = [];

  if (archiveDupes) {
    console.log(JSON.stringify(await archiveDuplicateFollowups(), null, 2));
    await db.destroy();
    return;
  }

  if (consolidateOnly) {
    console.log(JSON.stringify(await consolidateSequences(), null, 2));
    await db.destroy();
    return;
  }

  if (followUpsOnly) {
    console.log(JSON.stringify(await seedFollowUps(), null, 2));
    await db.destroy();
    return;
  }

  if (syncOnly) {
    console.log(JSON.stringify(await syncTemplates(), null, 2));
    await db.destroy();
    return;
  }

  for (const [key, cfg] of Object.entries(TEMPLATES)) {
    if (key === "saude") continue;
    const sourceIds = await sourceIdsForPattern(SEGMENTS[key]);
    const slugGuess = cfg.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

    const existing = await db("email_campaigns").where("name", cfg.name).first();
    if (existing) {
      results.push({ key, action: "skipped", id: existing.id, name: cfg.name });
      continue;
    }

    const campaign = await createCampaign({
      name: cfg.name,
      subject: cfg.subject,
      template: cfg.template,
      sourceIds,
      fieldAreas: cfg.fieldAreas,
      dailyBatchSize: 50,
      status: "active",
      notes: `${cfg.notes}. ${sourceIds.length} fontes gmaps.`
    });

    const eligible = await countEligibleForCampaign(campaign);
    results.push({
      key,
      action: "created",
      id: campaign.id,
      slug: campaign.slug,
      name: campaign.name,
      sources: sourceIds.length,
      eligible
    });
  }

  const campA = await getCampaignById(1);
  if (campA) {
    const eligibleA = await countEligibleForCampaign(campA);
    results.unshift({
      key: "saude",
      action: "existing",
      id: campA.id,
      name: campA.name,
      sources: campA.source_ids.length,
      field_areas: campA.field_areas,
      eligible: eligibleA
    });
  }

  console.log(JSON.stringify(results, null, 2));
  await db.destroy();
}

main().catch(async (err) => {
  console.error(err);
  await db.destroy();
  process.exit(1);
});
