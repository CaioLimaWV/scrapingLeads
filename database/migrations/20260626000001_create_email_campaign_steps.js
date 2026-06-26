exports.up = async function (knex) {
  await knex.schema.createTable("email_campaign_steps", (table) => {
    table.increments("id").primary();
    table
      .integer("campaign_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("email_campaigns")
      .onDelete("CASCADE");
    table.integer("step_order").unsigned().notNullable();
    table.string("subject", 255).notNullable();
    table.text("template").notNullable();
    table.integer("min_days_since_previous").unsigned().nullable();
    table.timestamps(true, true);

    table.unique(["campaign_id", "step_order"], "uq_campaign_step_order");
    table.index("campaign_id", "idx_campaign_steps_campaign_id");
  });

  await knex.schema.alterTable("email_sends", (table) => {
    table
      .integer("campaign_step_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("email_campaign_steps")
      .onDelete("SET NULL");
    table.index("campaign_step_id", "idx_email_sends_campaign_step_id");
  });

  const campaigns = await knex("email_campaigns").select("id", "subject", "template");
  for (const campaign of campaigns) {
    const [stepId] = await knex("email_campaign_steps").insert({
      campaign_id: campaign.id,
      step_order: 1,
      subject: campaign.subject,
      template: campaign.template,
      min_days_since_previous: null,
      created_at: new Date(),
      updated_at: new Date()
    });

    await knex("email_sends")
      .where({ campaign_id: campaign.id, status: "sent" })
      .whereNull("campaign_step_id")
      .update({ campaign_step_id: stepId });
  }
};

exports.down = async function (knex) {
  await knex.schema.alterTable("email_sends", (table) => {
    table.dropIndex("campaign_step_id", "idx_email_sends_campaign_step_id");
    table.dropColumn("campaign_step_id");
  });
  await knex.schema.dropTableIfExists("email_campaign_steps");
};
