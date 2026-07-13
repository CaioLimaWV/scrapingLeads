const {
  parseCnaeFromSource,
  parseUfFromSource
} = require("../../src/scrapers/sources/cnpjSource");

describe("cnpjSource", () => {
  test("parse CNAE and UF from base_url", () => {
    const source = {
      base_url: "https://minhareceita.org/?cnae=6920601&uf=SP",
      notes: ""
    };
    expect(parseCnaeFromSource(source)).toBe("6920601");
    expect(parseUfFromSource(source)).toBe("SP");
  });

  test("parse CNAE from notes fallback", () => {
    const source = {
      base_url: "https://minhareceita.org/",
      notes: "CNAE 6201501 — UF RJ"
    };
    expect(parseCnaeFromSource(source)).toBe("6201501");
    expect(parseUfFromSource(source)).toBe("RJ");
  });
});
