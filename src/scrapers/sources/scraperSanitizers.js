function isValidEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return false;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
}

function safeEmail(value, fallback) {
  const email = String(value || "").trim().toLowerCase();
  if (isValidEmail(email)) {
    return email;
  }
  return fallback;
}

function safePhone(value) {
  const phone = String(value || "").trim();
  if (!phone) return null;

  if (phone.length > 25) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) {
    return null;
  }

  return phone;
}

module.exports = {
  isValidEmail,
  safeEmail,
  safePhone
};