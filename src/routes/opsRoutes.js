const express = require("express");
const env = require("../config/env");
const {
  countLeads,
  countEmailContactBreakdown,
  countLeadsForEmailEnrichment,
  countUncontactedLeadsWithPhone
} = require("../repositories/leadRepository");
const {
  getExecutionStats,
  listExecutions,
  countRunningExecutions
} = require("../repositories/executionRepository");
const { listSources } = require("../repositories/sourceRepository");
const { getEmailStatus } = require("../services/emailService");

const router = express.Router();

router.get("/snapshot", async (req, res, next) => {
  try {
    const [
      totalLeads,
      emailBreakdown,
      enrichable,
      uncontacted,
      executionStats,
      recentExecutions,
      sources,
      emailStatus,
      runningScrapes
    ] = await Promise.all([
      countLeads(),
      countEmailContactBreakdown(),
      countLeadsForEmailEnrichment(),
      countUncontactedLeadsWithPhone(),
      getExecutionStats(),
      listExecutions(5, 0),
      listSources(),
      getEmailStatus(),
      countRunningExecutions()
    ]);

    res.json({
      data: {
        generatedAt: new Date().toISOString(),
        config: {
          panelTokenRequired: Boolean(env.panel.runToken),
          trackingEnabled: Boolean(env.email.baseUrl),
          appPort: env.appPort
        },
        leads: {
          total: totalLeads,
          emailBreakdown,
          enrichableWithWebsite: enrichable,
          uncontactedWhatsApp: uncontacted
        },
        scraping: {
          activeSources: sources.filter((source) => source.is_active).length,
          cnpjSources: sources.filter((source) => source.is_active && source.name.startsWith("cnpj")).length,
          runningExecutions: runningScrapes,
          statusTotals: executionStats.statusTotals,
          latestExecution: executionStats.latestExecution,
          recentExecutions
        },
        email: emailStatus
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
