const axios = require("axios");
const cheerio = require("cheerio");
const { safeEmail } = require("./scraperSanitizers");

async function scrapeSampleStaticSource(source, config, logger) {
  let response;
  try {
    response = await axios.get(source.base_url, {
      timeout: config.timeoutMs,
      validateStatus: () => true,
      headers: {
        "User-Agent": "LeadScraperBot/1.0 (+contact@yourcompany.com)",
        Accept: "text/html,application/xhtml+xml"
      }
    });
  } catch (error) {
    logger.warn({ sourceId: source.id, message: error.message }, "Static source request exception, returning empty result");
    return [];
  }

  if (response.status >= 400) {
    logger.warn({ sourceId: source.id, status: response.status }, "Static source request failed, returning empty result");
    return [];
  }

  const $ = cheerio.load(response.data);
  const leads = [];

  $(".lead-card").each((_, element) => {
    const name = $(element).find(".lead-name").text().trim();
    const email = $(element).find(".lead-email").text().trim();
    const phone = $(element).find(".lead-phone").text().trim();

    if (!name && !email) {
      return;
    }

    leads.push({
      name,
      email: safeEmail(email, `${source.name}-${leads.length + 1}@lead.local`),
      phone,
      raw_data: {
        source_name: source.name,
        source_url: source.base_url
      }
    });
  });

  if (leads.length === 0) {
    const bodyText = $("body").text().replace(/\s+/g, " ");
    const emails = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const phones = bodyText.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}/g) || [];
    const pageTitle = $("title").text().trim() || source.name;
    const max = Math.max(emails.length, phones.length, 1);

    for (let i = 0; i < max; i += 1) {
      const mappedEmail = safeEmail(emails[i], `${source.name}-${i + 1}@lead.local`);
      const mappedPhone = phones[i] ? String(phones[i]).trim() : null;
      leads.push({
        name: `${pageTitle} ${i + 1}`,
        email: mappedEmail,
        phone: mappedPhone,
        raw_data: {
          source_name: source.name,
          source_url: source.base_url,
          extracted_from_body: true
        }
      });
    }
  }

  logger.info({ sourceId: source.id, totalFound: leads.length }, "Static source scraped");
  return leads;
}

module.exports = {
  scrapeSampleStaticSource
};
