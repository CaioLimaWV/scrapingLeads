#!/usr/bin/env node
require("dotenv").config();

const { getCapacityMap } = require("../src/services/email/providerRegistry");
const { fetchMailersendApiQuota } = require("../src/services/email/providers/mailersendProvider");

async function main() {
  console.log("=== Email providers diagnostics ===\n");

  const token = process.env.MAILERSEND_API_TOKEN;
  if (token) {
    try {
      const quota = await fetchMailersendApiQuota(token);
      console.log("MailerSend API quota (GET /v1/api-quota — não consome cota):");
      console.log(`  quota/dia:     ${quota.quota} requisições`);
      console.log(`  restante hoje: ${quota.remaining}`);
      console.log(`  reset UTC:     ${quota.reset?.toISOString() || "?"}`);
      console.log("");
      console.log("Nota: no Trial, a cota diária de API é 100 req/dia.");
      console.log("      O email de 120/min é taxa por minuto (velocidade), não cota diária.");
      console.log("");
    } catch (err) {
      console.error("MailerSend quota check failed:", err.message);
    }
  } else {
    console.log("MAILERSEND_API_TOKEN não configurado.\n");
  }

  const capacity = await getCapacityMap();
  console.log("Capacidade por provider (após checagens locais + API):");
  for (const row of capacity) {
    console.log(
      `  ${row.provider.name}: enviados hoje=${row.sent}, limite local=${row.provider.dailyLimit}, restante=${row.remaining}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
