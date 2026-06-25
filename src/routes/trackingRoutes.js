const { Router } = require("express");
const { findSendByToken, recordEvent, markLeadUnsubscribed } = require("../repositories/emailRepository");
const { recalculateLeadEngagement } = require("../services/leadScoringService");
const logger = require("../config/logger");

const router = Router();

// pixel 1x1 GIF transparente
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

function clientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

// GET /track/open/:token.gif  — pixel de abertura
router.get("/open/:token", async (req, res) => {
  const token = req.params.token.replace(/\.gif$/i, "");
  try {
    const send = await findSendByToken(token);
    if (send) {
      await recordEvent(send.id, { eventType: "open", ip: clientIp(req) });
      recalculateLeadEngagement(send.lead_id).catch((err) =>
        logger.error({ err, leadId: send.lead_id }, "Failed to recalculate engagement after open")
      );
    }
  } catch (err) {
    logger.error({ err, token }, "Error recording open event");
  }
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(PIXEL);
});

// GET /track/click/:token?url=...  — redirect rastreado
router.get("/click/:token", async (req, res) => {
  const { token } = req.params;
  const url = req.query.url;

  try {
    const send = await findSendByToken(token);
    if (send) {
      await recordEvent(send.id, { eventType: "click", urlClicked: url, ip: clientIp(req) });
      recalculateLeadEngagement(send.lead_id).catch((err) =>
        logger.error({ err, leadId: send.lead_id }, "Failed to recalculate engagement after click")
      );
    }
  } catch (err) {
    logger.error({ err, token }, "Error recording click event");
  }

  if (url && /^https?:\/\//i.test(url)) {
    return res.redirect(302, url);
  }
  res.status(400).send("URL inválida");
});

// GET /track/unsub/:token  — link de descadastro no email
router.get("/unsub/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const send = await findSendByToken(token);
    if (send) {
      await recordEvent(send.id, { eventType: "unsubscribe", ip: clientIp(req) });
      await markLeadUnsubscribed(send.lead_id);
      recalculateLeadEngagement(send.lead_id).catch((err) =>
        logger.error({ err, leadId: send.lead_id }, "Failed to recalculate engagement after unsubscribe")
      );
      logger.info({ token, leadId: send.lead_id }, "Lead unsubscribed via email link");
    }
  } catch (err) {
    logger.error({ err, token }, "Error recording unsubscribe event");
  }
  res.send(`
    <!doctype html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>Descadastro</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;}
    .box{background:#fff;padding:2rem 3rem;border-radius:8px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.1);}
    h2{color:#333}p{color:#666}</style>
    </head>
    <body><div class="box"><h2>Descadastro realizado</h2>
    <p>Você não receberá mais emails desta lista.</p></div></body>
    </html>
  `);
});

module.exports = router;
