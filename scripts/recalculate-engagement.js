#!/usr/bin/env node
require("dotenv").config();

const { recalculateAllLeads } = require("../src/services/leadScoringService");
const db = require("../src/database/knex");

(async () => {
  try {
    const result = await recalculateAllLeads();
    console.log(`Recalculated engagement for ${result.processed} leads.`);
  } catch (err) {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
