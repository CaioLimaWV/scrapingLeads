const express = require("express");
const {
  countLeads,
  countInferredGenderLeads,
  countEmailContactBreakdown
} = require("../repositories/leadRepository");
const { getExecutionStats } = require("../repositories/executionRepository");
const { listSources } = require("../repositories/sourceRepository");

const router = express.Router();

router.get("/summary", async (req, res, next) => {
  try {
    const [totalLeads, inferredGender, emailBreakdown, executionStats, sources] = await Promise.all([
      countLeads(),
      countInferredGenderLeads(),
      countEmailContactBreakdown(),
      getExecutionStats(),
      listSources()
    ]);

    const activeSources = sources.filter((source) => source.is_active).length;

    res.json({
      data: {
        totalLeads,
        femaleLeads: inferredGender.female,
        maleLeads: inferredGender.male,
        emailBreakdown,
        activeSources,
        statuses: executionStats.statusTotals,
        latestExecution: executionStats.latestExecution
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
