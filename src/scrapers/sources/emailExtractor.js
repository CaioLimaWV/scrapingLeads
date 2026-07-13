const axios = require("axios");
const cheerio = require("cheerio");
const { isValidEmail } = require("./scraperSanitizers");

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const BLOCKLIST_DOMAINS = new Set([
  "wixpress.com",
  "sentry.io",
  "example.com",
  "email.com",
  "domain.com",
  "yoursite.com",
  "google.com",
  "googleapis.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "whatsapp.com",
  "schema.org",
  "w3.org",
  "cloudflare.com",
  "github.com",
  "jquery.com",
  "bootstrapcdn.com",
  "gstatic.com",
  "googleusercontent.com"
]);

const BLOCKLIST_LOCALS = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "webmaster",
  "admin",
  "root",
  "suporte",
  "support",
  "newsletter",
  "marketing",
  "bounce",
  "mailer"
]);

const CONTACT_PATHS = [
  "/contato",
  "/contact",
  "/fale-conosco",
  "/contact-us",
  "/contato.html",
  "/contact.html",
  "/about/contact",
  "/sobre/contato",
  "/empresa/contato"
];

const DEFAULT_HEADERS = {
  "User-Agent": "LeadScraperBot/1.0 (+contato@izaiasbessa.com.br)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"
};

function normalizeCandidate(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^mailto:/i, "")
    .split("?")[0]
    .split("#")[0];
}

function domainFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

const NON_SCRAPABLE_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "wa.me",
  "whatsapp.com",
  "contate.me",
  "linktr.ee",
  "bit.ly",
  "youtube.com",
  "tiktok.com",
  "twitter.com",
  "x.com"
]);

function isScrapableWebsite(url) {
  const domain = domainFromUrl(url);
  if (!domain) return false;
  for (const blocked of NON_SCRAPABLE_HOSTS) {
    if (domain === blocked || domain.endsWith(`.${blocked}`)) return false;
  }
  return true;
}

function emailDomain(email) {
  const parts = normalizeCandidate(email).split("@");
  return parts.length === 2 ? parts[1] : null;
}

function isBlockedEmail(email) {
  const normalized = normalizeCandidate(email);
  if (!isValidEmail(normalized)) return true;
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(normalized)) return true;

  const [local, domain] = normalized.split("@");
  if (!local || !domain) return true;
  if (BLOCKLIST_LOCALS.has(local)) return true;

  const domainParts = domain.split(".");
  for (let i = 0; i < domainParts.length; i += 1) {
    const suffix = domainParts.slice(i).join(".");
    if (BLOCKLIST_DOMAINS.has(suffix)) return true;
  }

  return false;
}

function uniqueValidEmails(candidates) {
  const seen = new Set();
  const result = [];

  for (const raw of candidates || []) {
    const email = normalizeCandidate(raw);
    if (!email || seen.has(email) || isBlockedEmail(email)) continue;
    seen.add(email);
    result.push(email);
  }

  return result;
}

function extractEmailsFromHtml(html, pageUrl = null) {
  if (!html) return [];

  const found = [];
  const $ = cheerio.load(html);

  $('a[href^="mailto:"]').each((_, el) => {
    found.push($(el).attr("href"));
  });

  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "");
      const stack = [json];
      while (stack.length) {
        const node = stack.pop();
        if (!node) continue;
        if (typeof node === "string") {
          const matches = node.match(EMAIL_REGEX);
          if (matches) found.push(...matches);
          continue;
        }
        if (Array.isArray(node)) {
          stack.push(...node);
          continue;
        }
        if (typeof node === "object") {
          if (node.email) found.push(node.email);
          stack.push(...Object.values(node));
        }
      }
    } catch {
      // JSON-LD inválido
    }
  });

  const htmlMatches = String(html).match(EMAIL_REGEX) || [];
  found.push(...htmlMatches);

  if (pageUrl) {
    const textMatches = $.root().text().match(EMAIL_REGEX) || [];
    found.push(...textMatches);
  }

  return uniqueValidEmails(found);
}

function pickBestEmail(candidates, websiteUrl = null) {
  const valid = uniqueValidEmails(candidates);
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];

  const siteDomain = websiteUrl ? domainFromUrl(websiteUrl) : null;
  if (siteDomain) {
    const domainMatch = valid.find((email) => {
      const emailDom = emailDomain(email);
      return emailDom === siteDomain || emailDom?.endsWith(`.${siteDomain}`) || siteDomain.endsWith(emailDom);
    });
    if (domainMatch) return domainMatch;
  }

  const preferredLocals = ["contato", "contact", "comercial", "vendas", "atendimento", "info", "hello", "oi"];
  for (const local of preferredLocals) {
    const match = valid.find((email) => email.startsWith(`${local}@`));
    if (match) return match;
  }

  return valid[0];
}

function buildContactUrls(websiteUrl) {
  let origin;
  try {
    origin = new URL(websiteUrl).origin;
  } catch {
    return [];
  }
  return CONTACT_PATHS.map((path) => `${origin}${path}`);
}

async function fetchPageHtml(url, timeoutMs = 12000) {
  const response = await axios.get(url, {
    timeout: timeoutMs,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
    headers: DEFAULT_HEADERS,
    responseType: "text"
  });
  return String(response.data || "");
}

async function extractEmailFromWebsite(websiteUrl, options = {}) {
  if (!isScrapableWebsite(websiteUrl)) {
    return null;
  }

  const timeoutMs = options.timeoutMs || 12000;
  const tryContactPages = options.tryContactPages !== false;
  const urls = [websiteUrl];

  if (tryContactPages) {
    urls.push(...buildContactUrls(websiteUrl));
  }

  const candidates = [];
  const maxPages = Math.min(urls.length, options.maxPages || 4);

  for (let i = 0; i < maxPages; i += 1) {
    try {
      const html = await fetchPageHtml(urls[i], timeoutMs);
      candidates.push(...extractEmailsFromHtml(html, urls[i]));
      const best = pickBestEmail(candidates, websiteUrl);
      if (best && emailDomain(best) === domainFromUrl(websiteUrl)) {
        return best;
      }
    } catch {
      // próxima URL
    }
  }

  return pickBestEmail(candidates, websiteUrl);
}

function pickBestEmailFromMapsProfile(mapsEmails, websiteUrl = null) {
  return pickBestEmail(mapsEmails, websiteUrl);
}

module.exports = {
  isBlockedEmail,
  extractEmailsFromHtml,
  pickBestEmail,
  pickBestEmailFromMapsProfile,
  extractEmailFromWebsite,
  buildContactUrls,
  domainFromUrl,
  isScrapableWebsite
};
