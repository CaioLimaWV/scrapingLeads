const express = require("express");
const { listSources } = require("../repositories/sourceRepository");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const rawFieldArea = req.query.field_area ? String(req.query.field_area).toLowerCase() : null;
    const fieldArea = rawFieldArea && [
      "politica",
      "economia",
      "demografia",
      "educacao",
      "energia",
      "engenharia",
      "lojas",
      "shopping",
      "odontologia",
      "veterinaria",
      "cnpj",
      "saude",
      "juridico",
      "financeiro",
      "inovacao",
      "governo",
      "transporte",
      "rh_trabalho",
      "consumidor",
      "alimentacao",
      "hotelaria",
      "esporte",
      "imobiliario",
      "religioso",
      "tecnologia",
      "manual"
    ].includes(rawFieldArea)
      ? rawFieldArea
      : null;

    const sources = await listSources({ fieldArea });
    res.json({ data: sources });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
