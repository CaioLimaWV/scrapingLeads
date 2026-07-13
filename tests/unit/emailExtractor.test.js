const {
  isBlockedEmail,
  pickBestEmail,
  extractEmailsFromHtml,
  buildContactUrls
} = require("../../src/scrapers/sources/emailExtractor");

describe("emailExtractor", () => {
  test("blocks noreply and wixpress emails", () => {
    expect(isBlockedEmail("noreply@empresa.com.br")).toBe(true);
    expect(isBlockedEmail("contato@empresa.com.br")).toBe(false);
    expect(isBlockedEmail("x@users.wixpress.com")).toBe(true);
  });

  test("extracts mailto from html", () => {
    const html = '<a href="mailto:contato@empresa.com.br">Email</a>';
    const emails = extractEmailsFromHtml(html);
    expect(emails).toContain("contato@empresa.com.br");
  });

  test("prefers email matching website domain", () => {
    const best = pickBestEmail(
      ["vendas@gmail.com", "contato@empresa.com.br"],
      "https://www.empresa.com.br"
    );
    expect(best).toBe("contato@empresa.com.br");
  });

  test("builds contact page urls", () => {
    const urls = buildContactUrls("https://empresa.com.br/sobre");
    expect(urls).toContain("https://empresa.com.br/contato");
    expect(urls).toContain("https://empresa.com.br/fale-conosco");
  });
});
