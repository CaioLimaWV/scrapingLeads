const UTM_PORTFOLIO_HOST = "izaiasbessa.com.br";
const UTM_SKIP_HOSTS = new Set(["wa.me", "api.whatsapp.com", "calendly.com", "www.calendly.com"]);

function slugifyUtm(value, fallback = "link") {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function normalizeUtmCampaign(subject) {
  return String(subject || "")
    .replace(/^\[TESTE\]\s*/i, "")
    .trim();
}

function shouldAppendUtm(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (UTM_SKIP_HOSTS.has(host)) return false;
    return host === UTM_PORTFOLIO_HOST || host.endsWith(`.${UTM_PORTFOLIO_HOST}`);
  } catch {
    return false;
  }
}

function utmContentFromPath(rawUrl) {
  try {
    const path = new URL(rawUrl).pathname.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
    return slugifyUtm(path, "link");
  } catch {
    return "link";
  }
}

function appendUtmParams(rawUrl, { campaign, content }) {
  if (!shouldAppendUtm(rawUrl)) return rawUrl;
  const url = new URL(rawUrl);
  if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "scraping_leads");
  if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "email");
  if (!url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", campaign);
  if (!url.searchParams.has("utm_content")) url.searchParams.set("utm_content", content);
  return url.toString();
}

function injectPortfolioUtms(html, subject, utmCampaign) {
  const campaign = slugifyUtm(
    utmCampaign || normalizeUtmCampaign(subject),
    "cold-outreach"
  );

  return html.replace(
    /<a\s+([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>([\s\S]*?)<\/a>/gi,
    (full, pre, url, post, innerHtml) => {
      const textContent = innerHtml.replace(/<[^>]+>/g, "").trim();
      const content = slugifyUtm(textContent || utmContentFromPath(url), "link");
      const trackedUrl = appendUtmParams(url, { campaign, content });
      if (trackedUrl === url) return full;
      return `<a ${pre}href="${trackedUrl}"${post}>${innerHtml}</a>`;
    }
  );
}

function resolveUtmCampaign(subject, utmCampaign) {
  return slugifyUtm(utmCampaign || normalizeUtmCampaign(subject), "cold-outreach");
}

function extractUtmLinks(html) {
  const links = [];
  const seen = new Set();
  const re = /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match = re.exec(html);
  while (match) {
    const url = match[1];
    try {
      const parsed = new URL(url);
      const campaign = parsed.searchParams.get("utm_campaign");
      if (!campaign) {
        match = re.exec(html);
        continue;
      }
      const content = parsed.searchParams.get("utm_content") || "";
      const label = match[2].replace(/<[^>]+>/g, "").trim() || parsed.pathname || url;
      const key = `${campaign}|${content}|${url}`;
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ label, url, content, campaign });
      }
    } catch {
      // skip invalid URLs
    }
    match = re.exec(html);
  }
  return links;
}

module.exports = {
  slugifyUtm,
  normalizeUtmCampaign,
  shouldAppendUtm,
  appendUtmParams,
  injectPortfolioUtms,
  resolveUtmCampaign,
  extractUtmLinks
};
