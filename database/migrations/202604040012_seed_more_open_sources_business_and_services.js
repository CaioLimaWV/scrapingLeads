exports.up = async function up(knex) {
  const sources = [
    {
      name: "osm-engenharia-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "engenharia",
      notes: "OpenStreetMap Overpass. Exemplo de query: nwr[\"office\"=\"engineer\"]"
    },
    {
      name: "osm-lojas-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "lojas",
      notes: "OpenStreetMap Overpass. Exemplo de query: nwr[\"shop\"]"
    },
    {
      name: "osm-shopping-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "shopping",
      notes: "OpenStreetMap Overpass. Exemplo de query: nwr[\"shop\"=\"mall\"]"
    },
    {
      name: "osm-dentistas-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "odontologia",
      notes: "OpenStreetMap Overpass. Exemplo de query: nwr[\"amenity\"=\"dentist\"]"
    },
    {
      name: "osm-veterinarias-overpass",
      base_url: "https://overpass-api.de/api/interpreter",
      rate_limit_per_hour: 120,
      is_active: true,
      field_area: "veterinaria",
      notes: "OpenStreetMap Overpass. Exemplo de query: nwr[\"amenity\"=\"veterinary\"]"
    }
  ];

  for (const source of sources) {
    const exists = await knex("lead_sources").where({ name: source.name }).first();
    if (!exists) {
      await knex("lead_sources").insert(source);
    }
  }
};

exports.down = async function down(knex) {
  await knex("lead_sources")
    .whereIn("name", [
      "osm-engenharia-overpass",
      "osm-lojas-overpass",
      "osm-shopping-overpass",
      "osm-dentistas-overpass",
      "osm-veterinarias-overpass"
    ])
    .del();
};
