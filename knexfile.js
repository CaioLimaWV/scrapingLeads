const path = require("path");
require("dotenv").config();

const sslEnabled = (process.env.DB_SSL || "false").toLowerCase() === "true";

const baseConfig = {
  client: process.env.DB_CLIENT || "mysql2",
  connection: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "leads_db",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "wv123",
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  },
  migrations: {
    directory: path.join(__dirname, "database", "migrations"),
    tableName: "knex_migrations"
  },
  pool: {
    min: 2,
    max: 10
  }
};

module.exports = {
  development: baseConfig,
  production: baseConfig
};
