const db = require("../src/database/knex");
const logger = require("../src/config/logger");
const { runScraping } = require("../src/services/scrapeService");

function parseArg(name) {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (!arg) {
    return null;
  }
  return arg.split("=")[1];
}

async function main() {
  const sourceId = parseArg("--sourceId");
  const result = await runScraping({ sourceId });
  logger.info({ result }, "Scraping finished");
}

main()
  .catch((error) => {
    logger.error({ err: error }, "Scraping failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
