const {
  isDailyQuotaError,
  isRateLimitError,
  isQuotaError,
  parseRetryAfterSeconds
} = require("../../src/services/email/quotaErrors");

describe("quotaErrors", () => {
  test("detects MailerSend daily quota error MS42901", () => {
    const err = new Error("MailerSend API error (429): Your account reached its API daily quota limit. #MS42901");
    err.cause = { response: { status: 429 } };
    expect(isDailyQuotaError(err)).toBe(true);
    expect(isRateLimitError(err)).toBe(false);
    expect(isQuotaError(err)).toBe(true);
  });

  test("detects MailerSend per-minute rate limit MS42903", () => {
    const err = new Error("MailerSend API error (429): Your account reached its rate limit of 10 requests/min. #MS42903");
    err.cause = { response: { status: 429 } };
    expect(isDailyQuotaError(err)).toBe(false);
    expect(isRateLimitError(err)).toBe(true);
    expect(isQuotaError(err)).toBe(true);
  });

  test("parses retry-after header", () => {
    const err = new Error("rate limit");
    err.cause = { response: { status: 429, headers: { "retry-after": "15" } } };
    expect(parseRetryAfterSeconds(err)).toBe(15);
  });
});
