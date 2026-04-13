const Joi = require("joi");

const leadSchema = Joi.object({
  name: Joi.string().trim().min(2).max(255).required(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(255).required(),
  phone: Joi.string().trim().max(25).allow(null, ""),
  source_id: Joi.number().integer().positive().required(),
  raw_data: Joi.object().optional()
});

module.exports = {
  leadSchema
};
