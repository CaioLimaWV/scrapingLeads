const { parsePhoneNumberFromString } = require("libphonenumber-js");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function normalizePhone(phone, defaultCountry = "BR") {
  const raw = String(phone || "").trim();
  if (!raw) {
    return null;
  }

  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    return null;
  }

  return parsed.number;
}

function normalizeLead(lead) {
  const emailNormalized = normalizeEmail(lead.email);
  const phoneNormalized = normalizePhone(lead.phone);

  return {
    name: normalizeName(lead.name),
    email: String(lead.email || "").trim(),
    email_normalized: emailNormalized,
    phone: String(lead.phone || "").trim() || null,
    phone_normalized: phoneNormalized,
    source_id: lead.source_id,
    raw_data: lead.raw_data || null
  };
}

module.exports = {
  normalizeLead,
  normalizePhone,
  normalizeEmail
};
