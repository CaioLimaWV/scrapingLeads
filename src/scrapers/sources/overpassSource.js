const axios = require("axios");
const { safeEmail, safePhone } = require("./scraperSanitizers");

const SAO_PAULO_BBOX = "-23.8,-46.9,-23.3,-46.3";

function buildOverpassQuery(sourceName, maxItems) {
  const map = {
    "osm-engenharia-overpass": '["office"="engineer"]',
    "osm-lojas-overpass": '["shop"]',
    "osm-shopping-overpass": '["shop"="mall"]',
    "osm-dentistas-overpass": '["amenity"="dentist"]',
    "osm-veterinarias-overpass": '["amenity"="veterinary"]',
    "osm-clinicas-overpass": '["amenity"="clinic"]',
    "osm-farmacias-overpass": '["amenity"="pharmacy"]',
    "osm-escolas-overpass": '["amenity"="school"]',
    "osm-restaurantes-overpass": '["amenity"="restaurant"]',
    "osm-hoteis-overpass": '["tourism"="hotel"]',
    "osm-academias-overpass": '["leisure"="fitness_centre"]',
    "osm-condominios-overpass": '["building"="apartments"]',
    "osm-igrejas-overpass": '["amenity"="place_of_worship"]'
  };

  const filter = map[sourceName] || '["shop"]';
  return `[out:json][timeout:35];\n(\n  nwr${filter}(${SAO_PAULO_BBOX});\n);\nout center qt;`;
}

function toSafeEmail(sourceName, osmId) {
  return `${sourceName}-${osmId}@lead.local`;
}

function normalizePhone(tags) {
  return safePhone(tags.phone || tags["contact:phone"] || null);
}

function getOverpassEndpoints(baseUrl) {
  const defaults = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter"
  ];

  return Array.from(new Set([baseUrl, ...defaults]));
}

async function scrapeOverpassSource(source, config, logger) {
  const maxItems = Math.max(1, Number(config.maxItems || 80));
  const query = buildOverpassQuery(source.name, maxItems);

  const endpoints = getOverpassEndpoints(source.base_url);
  let elements = [];

  for (const endpoint of endpoints) {
    let response;
    try {
      response = await axios.post(endpoint, query, {
        timeout: config.timeoutMs,
        validateStatus: () => true,
        headers: {
          "User-Agent": "LeadScraperBot/1.0 (+contato@empresa.com)",
          Accept: "application/json",
          "Content-Type": "text/plain"
        }
      });
    } catch (error) {
      logger.warn({ sourceId: source.id, endpoint, message: error.message }, "Overpass endpoint exception");
      continue;
    }

    if (response.status >= 400) {
      logger.warn({ sourceId: source.id, endpoint, status: response.status }, "Overpass endpoint failed");
      continue;
    }

    const current = Array.isArray(response.data?.elements) ? response.data.elements : [];
    if (current.length > 0) {
      elements = current;
      break;
    }
  }

  if (elements.length === 0) {
    logger.warn({ sourceId: source.id }, "Overpass returned no elements after endpoint failover");
    return [];
  }
  const leads = [];

  for (const el of elements) {
    if (leads.length >= maxItems) {
      break;
    }

    const tags = el.tags || {};
    const osmId = `${el.type || "node"}-${el.id}`;
    const name = tags.name || `${source.name} ${osmId}`;
    const rawEmail = tags.email || tags["contact:email"] || null;
    const email = safeEmail(rawEmail, toSafeEmail(source.name, osmId));
    const phone = normalizePhone(tags);

    leads.push({
      name,
      email,
      phone,
      raw_data: {
        source_name: source.name,
        source_url: source.base_url,
        osm_id: osmId,
        tags,
        lat: el.lat || el.center?.lat || null,
        lon: el.lon || el.center?.lon || null
      }
    });
  }

  logger.info({ sourceId: source.id, totalFound: leads.length }, "Overpass source scraped");
  return leads;
}

module.exports = {
  scrapeOverpassSource
};
