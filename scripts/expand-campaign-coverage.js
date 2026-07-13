#!/usr/bin/env node
/**
 * Expande cobertura de campanhas para 100% dos leads.
 * - Anexa nichos compatíveis em campanhas existentes
 * - Cria campanhas dedicadas para o restante
 * - Prioridade por id: campanha com id menor "ganha" o lead (ver campaignExclusive.js)
 *
 * Uso: node scripts/expand-campaign-coverage.js
 *      node scripts/expand-campaign-coverage.js --dry-run
 */
require("dotenv").config();

const db = require("../src/database/knex");
const { getCampaignById, updateCampaign, createCampaign, countEligibleForCampaign } = require("../src/repositories/campaignRepository");
const { replaceAllSteps } = require("../src/repositories/campaignStepRepository");
const { parseJsonArray } = require("../src/repositories/campaignRepository");

const PORTFOLIO = "https://www.izaiasbessa.com.br/";
const BLOG_PRECO = "https://www.izaiasbessa.com.br/blog/site-profissional-quanto-custa/";

const FOLLOW_UPS = [
  {
    subject: "Quanto custa um site profissional? (artigo rápido)",
    minDaysSincePrevious: 3,
    template: (label) => `Olá {{nome}},

Escrevi há alguns dias sobre sites para ${label}. Sem pressão — só deixo um artigo que ajuda a comparar opções:
<a href="${BLOG_PRECO}">Quanto custa um site profissional?</a>

Portfólio: <a href="${PORTFOLIO}">izaiasbessa.com.br</a>
<a href="https://wa.me/5511998110569">WhatsApp — Izaias Ramos</a>`
  },
  {
    subject: "Só passando para deixar meu contato",
    minDaysSincePrevious: 3,
    template: () => `Olá {{nome}},

Entrei em contato nos últimos dias sobre desenvolvimento web. Deixo meu portfólio e WhatsApp caso precise no futuro:
<a href="${PORTFOLIO}">izaiasbessa.com.br</a>
<a href="https://wa.me/5511998110569">(11) 99811-0569</a>

Abraço,
Izaias`
  }
];

const EXPANSIONS = {
  comercio: {
    matchName: "Comércio local — lojas e restaurantes",
    addFieldAreas: ["hotelaria"]
  },
  b2b: {
    matchName: "B2B — contabilidade, advocacia, imobiliárias",
    addFieldAreas: ["tecnologia", "engenharia", "energia"]
  }
};

const NEW_CAMPAIGNS = [
  {
    name: "Institucional — setores variados",
    subject: "Presença digital profissional para {{nome}}",
    fieldAreas: [
      "politica",
      "economia",
      "demografia",
      "religioso",
      "governo",
      "consumidor",
      "transporte",
      "rh_trabalho",
      "inovacao"
    ],
    segmentLabel: "organizações e setores institucionais",
    template: `Olá {{nome}},

Sou Izaias Ramos, desenvolvedor fullstack em São Paulo. Trabalho com sites institucionais, landing pages e sistemas web para organizações que precisam transmitir credibilidade online.

Veja projetos e cases no portfólio:
<a href="${PORTFOLIO}">izaiasbessa.com.br</a>

Posso montar uma proposta enxuta em 48h. Me chame no <a href="https://wa.me/5511998110569">WhatsApp</a>.

Izaias Ramos`
  },
  {
    name: "Geral — negócios diversos",
    subject: "Site profissional para o seu negócio",
    fieldAreas: ["geral"],
    segmentLabel: "negócios locais",
    template: `Olá {{nome}},

Sou desenvolvedor fullstack e crio sites, landing pages e sistemas web para empresas — com design moderno, performance e integração com WhatsApp.

Portfólio e cases:
<a href="${PORTFOLIO}">izaiasbessa.com.br</a>

Quer conversar sobre um site para o seu negócio?
<a href="https://wa.me/5511998110569">WhatsApp — Izaias Ramos</a>

Abraço,
Izaias Ramos`
  }
];

function mergeAreas(existing, toAdd) {
  const set = new Set([...(existing || []), ...toAdd].map((a) => String(a).toLowerCase()));
  return [...set];
}

async function ensureSteps(campaign, segmentLabel) {
  const steps = [
    {
      subject: campaign.subject,
      template: campaign.template,
      minDaysSincePrevious: null
    },
    ...FOLLOW_UPS.map((fu) => ({
      subject: fu.subject,
      template: fu.template(segmentLabel),
      minDaysSincePrevious: fu.minDaysSincePrevious
    }))
  ];
  await replaceAllSteps(campaign.id, steps);
}

async function expandExisting(dryRun) {
  const results = [];
  for (const cfg of Object.values(EXPANSIONS)) {
    const row = await db("email_campaigns").where({ name: cfg.matchName, status: "active" }).first();
    if (!row) {
      results.push({ action: "not_found", name: cfg.matchName });
      continue;
    }
    const current = parseJsonArray(row.field_areas);
    const next = mergeAreas(current, cfg.addFieldAreas);
    if (next.length === current.length) {
      results.push({ action: "unchanged", id: row.id, name: row.name, field_areas: next });
      continue;
    }
    if (!dryRun) {
      await updateCampaign(row.id, { fieldAreas: next });
    }
    results.push({ action: dryRun ? "would_update" : "updated", id: row.id, name: row.name, field_areas: next });
  }
  return results;
}

async function createMissing(dryRun) {
  const results = [];
  for (const cfg of NEW_CAMPAIGNS) {
    const existing = await db("email_campaigns").where({ name: cfg.name }).first();
    if (existing) {
      results.push({ action: "exists", id: existing.id, name: cfg.name });
      continue;
    }
    if (dryRun) {
      results.push({ action: "would_create", name: cfg.name, fieldAreas: cfg.fieldAreas });
      continue;
    }
    const campaign = await createCampaign({
      name: cfg.name,
      subject: cfg.subject,
      template: cfg.template,
      sourceIds: [],
      fieldAreas: cfg.fieldAreas,
      dailyBatchSize: 50,
      status: "active",
      notes: `Cobertura automática: ${cfg.fieldAreas.join(", ")}`
    });
    await ensureSteps(
      { id: campaign.id, subject: cfg.subject, template: cfg.template },
      cfg.segmentLabel
    );
    const eligible = await countEligibleForCampaign(campaign);
    results.push({ action: "created", id: campaign.id, name: cfg.name, eligible });
  }
  return results;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "=== DRY RUN ===\n" : "=== Expandindo campanhas ===\n");

  const expanded = await expandExisting(dryRun);
  console.log("Campanhas existentes:", JSON.stringify(expanded, null, 2));

  const created = await createMissing(dryRun);
  console.log("\nNovas campanhas:", JSON.stringify(created, null, 2));

  if (!dryRun) {
    console.log("\n=== Cobertura após expansão ===");
    const { getActiveCampaignsOrdered } = require("../src/services/email/campaignExclusive");
    const active = await getActiveCampaignsOrdered();

    for (const campaign of active) {
      const full = await getCampaignById(campaign.id);
      const eligible = await countEligibleForCampaign(full);
      console.log(`  #${campaign.id} ${campaign.name}: ${eligible} elegíveis`);
    }

    const [total] = await db("leads").where({ is_valid: true, is_active: true }).count("id as c");
    const seen = new Set();
    for (const campaign of active) {
      const full = await getCampaignById(campaign.id);
      const batch = await require("../src/repositories/campaignStepRepository").listEligibleLeadSteps(
        full,
        50000
      );
      for (const { lead } of batch) seen.add(lead.id);
    }
    console.log(`\nLeads totais: ${total.c}`);
    console.log(`Leads com campanha exclusiva: ${seen.size}`);
    console.log(`Fora de campanha: ${Number(total.c) - seen.size}`);
  }

  await db.destroy();
}

main().catch(async (err) => {
  console.error(err);
  await db.destroy();
  process.exit(1);
});
