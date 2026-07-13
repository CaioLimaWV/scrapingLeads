#!/usr/bin/env node
require("dotenv").config();

const env = require("../src/config/env");
const { createMailersendProvider } = require("../src/services/email/providers/mailersendProvider");
const { fetchMailersendApiQuota } = require("../src/services/email/providers/mailersendProvider");

function parseArgs() {
  const args = process.argv.slice(2);
  let to = process.env.EMAIL_MONITOR_TO || process.env.EMAIL_FROM;
  let count = 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--to" && args[i + 1]) {
      to = args[++i];
    } else if (args[i] === "--count" && args[i + 1]) {
      count = Math.max(1, Math.min(10, Number(args[++i]) || 1));
    }
  }

  return { to, count };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { to, count } = parseArgs();
  const cfg = env.email.providers.find((p) => p.name === "mailersend");

  if (!cfg?.apiKey) {
    console.error("MAILERSEND_API_TOKEN não configurado.");
    process.exit(1);
  }

  if (!to || !to.includes("@")) {
    console.error("Destino inválido. Use --to seu@email.com ou EMAIL_MONITOR_TO no .env");
    process.exit(1);
  }

  const quota = await fetchMailersendApiQuota(cfg.apiKey);
  console.log(`MailerSend: cota API restante=${quota.remaining}, limite local/dia=${cfg.dailyLimit}`);
  console.log(`Enviando ${count} teste(s) para ${to}...\n`);

  const provider = createMailersendProvider(cfg);
  const from = `"${process.env.EMAIL_FROM_NAME || "Teste"}" <${process.env.EMAIL_FROM}>`;

  for (let i = 1; i <= count; i++) {
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const subject = `[TESTE MailerSend ${i}/${count}] ${stamp}`;

    try {
      await provider.send({
        from,
        to,
        subject,
        html: `<p>Teste ${i}/${count} via MailerSend para validar entrega e reputação.</p><p>${stamp}</p>`,
        text: `Teste ${i}/${count} via MailerSend — ${stamp}`
      });
      console.log(`  OK ${i}/${count}: ${subject}`);
    } catch (err) {
      console.error(`  FALHA ${i}/${count}:`, err.message);
      process.exit(1);
    }

    if (i < count) await sleep(8000);
  }

  console.log("\nConcluído. Confira em MailerSend → Análises.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
