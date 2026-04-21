exports.up = async function up(knex) {
  await knex("lead_sources").insert([
    {
      name: "gmaps-advogados-sp",
      base_url: "https://www.google.com/maps/search/advogados+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de advogados via Google Maps"
    },
    {
      name: "gmaps-padarias-sp",
      base_url: "https://www.google.com/maps/search/padarias+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de padarias via Google Maps"
    },
    {
      name: "gmaps-escolas-sp",
      base_url: "https://www.google.com/maps/search/escolas+particulares+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de escolas particulares via Google Maps"
    },
    {
      name: "gmaps-imobiliarias-sp",
      base_url: "https://www.google.com/maps/search/imobiliarias+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de imobiliarias via Google Maps"
    },
    {
      name: "gmaps-academias-sp",
      base_url: "https://www.google.com/maps/search/academias+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de academias via Google Maps"
    },
    {
      name: "gmaps-esteticas-sp",
      base_url: "https://www.google.com/maps/search/clinicas+de+estetica+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de clinicas de estetica via Google Maps"
    },
    {
      name: "gmaps-lojas-roupa-sp",
      base_url: "https://www.google.com/maps/search/lojas+de+roupas+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de lojas de roupas via Google Maps"
    },
    {
      name: "gmaps-dentistas-sp",
      base_url: "https://www.google.com/maps/search/dentistas+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de dentistas via Google Maps"
    },
    {
      name: "gmaps-veterinarias-sp",
      base_url: "https://www.google.com/maps/search/clinicas+veterinarias+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de clinicas veterinarias via Google Maps"
    },
    {
      name: "gmaps-petshops-sp",
      base_url: "https://www.google.com/maps/search/petshops+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de petshops via Google Maps"
    }
  ]);
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .where("name", "like", "gmaps-%")
    .whereNotIn("name", ["gmaps-clinicas-sp", "gmaps-contabilidade-sp", "gmaps-restaurantes-sp"])
    .del();
};
