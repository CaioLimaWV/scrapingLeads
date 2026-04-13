const express = require("express");
const path = require("path");
const helmet = require("helmet");
const pinoHttp = require("pino-http");
const logger = require("./config/logger");
const env = require("./config/env");
const leadsRoutes = require("./routes/leadsRoutes");
const executionRoutes = require("./routes/executionsRoutes");
const sourcesRoutes = require("./routes/sourcesRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const scrapeRoutes = require("./routes/scrapeRoutes");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "lead-scraper-backend" });
  });

  app.use("/api/leads", leadsRoutes);
  app.use("/api/executions", executionRoutes);
  app.use("/api/sources", sourcesRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/scrape", scrapeRoutes);

  app.use("/panel", express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

  app.get("/", (req, res) => {
    res.redirect("/panel/");
  });

  app.use((err, req, res, next) => {
    req.log.error({ err }, "Unhandled error");
    res.status(500).json({ message: "Internal server error" });
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  app.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "Server started");
  });
}

module.exports = app;
