exports.up = async function up(knex) {
  await knex("lead_sources").insert([
    {
      name: "gmaps-clinicas-sp",
      base_url: "https://www.google.com/maps/search/clinicas+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de clinicas via Google Maps em SP"
    },
    {
      name: "gmaps-contabilidade-sp",
      base_url: "https://www.google.com/maps/search/escritorios+de+contabilidade+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de contabilidade via Google Maps em SP"
    },
    {
      name: "gmaps-restaurantes-sp",
      base_url: "https://www.google.com/maps/search/restaurantes+em+sao+paulo",
      rate_limit_per_hour: 50,
      notes: "Scraping de restaurantes via Google Maps em SP"
    }
  ]);
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .whereIn("name", ["gmaps-clinicas-sp", "gmaps-contabilidade-sp", "gmaps-restaurantes-sp"])
    .del();
};
