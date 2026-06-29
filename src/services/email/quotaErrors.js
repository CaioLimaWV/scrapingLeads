function getErrorResponse(err) {
  return err?.cause?.response || err?.response || null;
}

function getErrorMessage(err) {
  return String(err?.message || "").toLowerCase();
}

function isDailyQuotaError(err) {
  const msg = getErrorMessage(err);
  const status = getErrorResponse(err)?.status;
  return (
    msg.includes("ms42901") ||
    msg.includes("daily quota") ||
    msg.includes("daily api quota") ||
    (status === 429 && msg.includes("quota limit"))
  );
}

function isRateLimitError(err) {
  const msg = getErrorMessage(err);
  const status = getErrorResponse(err)?.status;
  return status === 429 && (msg.includes("ms42903") || msg.includes("rate limit"));
}

function isQuotaError(err) {
  return isDailyQuotaError(err) || isRateLimitError(err) || getErrorMessage(err).includes("too many mails");
}

function parseResetHeader(err) {
  const headers = getErrorResponse(err)?.headers || {};
  const reset = headers["x-apiquota-reset"] || headers["X-Apiquota-Reset"];
  if (!reset) return null;
  const date = new Date(reset);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseRetryAfterSeconds(err) {
  const headers = getErrorResponse(err)?.headers || {};
  const raw = headers["retry-after"] || headers["Retry-After"];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

module.exports = {
  getErrorResponse,
  getErrorMessage,
  isDailyQuotaError,
  isRateLimitError,
  isQuotaError,
  parseResetHeader,
  parseRetryAfterSeconds
};
