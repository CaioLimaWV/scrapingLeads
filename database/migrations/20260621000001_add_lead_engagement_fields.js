exports.up = async function (knex) {
  await knex.schema.alterTable("leads", (table) => {
    table.integer("engagement_score").notNullable().defaultTo(0);
    table
      .enum("funnel_stage", ["top", "middle", "bottom", "lost"])
      .notNullable()
      .defaultTo("top");
    table
      .enum("temperature", ["cold", "warm", "hot", "lost"])
      .notNullable()
      .defaultTo("cold");
    table.timestamp("last_engagement_at").nullable();
    table.string("next_action", 255).nullable();
  });

  await knex.schema.alterTable("leads", (table) => {
    table.index(["temperature", "funnel_stage"], "idx_leads_engagement");
    table.index("engagement_score", "idx_leads_engagement_score");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("leads", (table) => {
    table.dropIndex(["temperature", "funnel_stage"], "idx_leads_engagement");
    table.dropIndex(["engagement_score"], "idx_leads_engagement_score");
    table.dropColumn("next_action");
    table.dropColumn("last_engagement_at");
    table.dropColumn("temperature");
    table.dropColumn("funnel_stage");
    table.dropColumn("engagement_score");
  });
};
