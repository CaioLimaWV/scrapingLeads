const {
  slugifyUtm,
  shouldAppendUtm,
  appendUtmParams,
  injectPortfolioUtms
} = require("../../src/utils/emailUtm");

describe("emailUtm", () => {
  it("slugifies subject with accents", () => {
    expect(slugifyUtm("Site profissional para clínicas")).toBe("site-profissional-para-clinicas");
  });

  it("detects portfolio host only", () => {
    expect(shouldAppendUtm("https://www.izaiasbessa.com.br/")).toBe(true);
    expect(shouldAppendUtm("https://wa.me/5511998110569")).toBe(false);
    expect(shouldAppendUtm("https://calendly.com/izaiasr232/30min")).toBe(false);
  });

  it("appends utm params without overwriting existing ones", () => {
    const url = appendUtmParams("https://www.izaiasbessa.com.br/", {
      campaign: "campanha-a",
      content: "ver-portfolio"
    });
    expect(url).toContain("utm_source=scraping_leads");
    expect(url).toContain("utm_medium=email");
    expect(url).toContain("utm_campaign=campanha-a");
    expect(url).toContain("utm_content=ver-portfolio");

    const preset = appendUtmParams(
      "https://www.izaiasbessa.com.br/?utm_source=newsletter",
      { campaign: "x", content: "y" }
    );
    expect(preset).toContain("utm_source=newsletter");
    expect(preset).not.toContain("utm_source=scraping_leads");
  });

  it("injects utms into anchor tags in html body", () => {
    const html =
      'Olá! <a href="https://www.izaiasbessa.com.br/">Ver portfólio</a> e ' +
      '<a href="https://wa.me/5511998110569">WhatsApp</a>';
    const out = injectPortfolioUtms(html, "Primeiro contato saúde");

    expect(out).toContain("utm_campaign=primeiro-contato-saude");
    expect(out).toMatch(/utm_content=ver-portfolio/);
    expect(out).toContain('href="https://wa.me/5511998110569"');
    expect(out).not.toContain("wa.me?utm_");
  });

  it("uses utmCampaign override when provided", () => {
    const out = injectPortfolioUtms(
      '<a href="https://www.izaiasbessa.com.br/">Link</a>',
      "Assunto qualquer",
      "clinicas-sp-primeiro-contato"
    );
    expect(out).toContain("utm_campaign=clinicas-sp-primeiro-contato");
    expect(out).not.toContain("assunto-qualquer");
  });
});
