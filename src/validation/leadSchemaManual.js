const Joi = require("joi");

// Permite qualquer um dos campos principais, desde que pelo menos um esteja presente
const leadSchemaManual = Joi.object({
  name: Joi.string().trim().min(2).max(255).allow(null, ""),
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(255).allow(null, ""),
  phone: Joi.string().trim().max(25).allow(null, ""),
  source_id: Joi.number().integer().positive().required(),
  raw_data: Joi.object().optional()
}).or("name", "email", "phone");

module.exports = {
  leadSchemaManual
};
