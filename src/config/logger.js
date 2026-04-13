const pino = require("pino");

const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: ["req.headers.authorization", "lead.email", "lead.phone"],
    remove: true
  }
});

module.exports = logger;
