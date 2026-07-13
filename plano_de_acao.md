# Plano de Ação: Coleta em Massa de Leads (Frios)

Documento atualizado para refletir o **estado real do projeto** (jul/2026).  
Stack atual: **Node.js + Puppeteer + MySQL**, painel em `/panel/`.

---

## Situação atual (resumo)

| Métrica | Valor aprox. |
|---------|----------------|
| Leads salvos | ~23.300 |
| E-mail real (campanhas) | ~18% (~4.200) |
| Placeholder (sem e-mail) | ~82% |
| Fontes GMaps ativas | 208 (nichos × cidades) |
| Fontes CNPJ ativas | 5 |
| Fontes Overpass (OSM) | 13 cadastradas, **inativas** |

**Canal principal hoje:** Google Maps (telefone + site → e-mail quando possível).  
**Canal B2B com e-mail:** CNPJ via Minha Receita + OpenCNPJ.  
**Canal complementar (telefone):** OpenStreetMap / Overpass — ver seção abaixo.

Comandos operacionais: **http://localhost:3000/panel/ops**

---

## Passo 1: CNPJ / Receita Federal — **implementado, em operação**

**Objetivo:** Leads B2B com razão social, telefone e **e-mail real** quando a Receita/OpenCNPJ tiver o dado.

**O que já existe no código:**
- Scraper `cnpjSource.js`: lista CNPJs por CNAE (`minhareceita.org/?cnae=...`) → detalhes com e-mail (`api.opencnpj.org/{cnpj}`).
- Fontes ativas: `cnpj-contabilidade`, `cnpj-advocacia`, `cnpj-desenvolvimento-web`, `cnpj-receita-comercio`, `cnpj-receita-vestuario`.
- Só salva lead se tiver e-mail válido (não usa placeholder).

**Próximas ações:**
- [ ] Rodar scraping dessas fontes pelo painel ou `npm run scrape:manual -- --sourceId=...`
- [ ] Adicionar mais CNAEs alinhados às campanhas (ex.: marketing, arquitetura, clínicas PJ).
- [ ] (Opcional) Filtro por UF/município quando a API/listagem permitir.
- [ ] (Opcional) Base Receita completa (dump CSV) para volume massivo — hoje limitado a ~30–50 CNPJs por execução.

---

## Passo 2: Google Maps — **implementado, principal fonte de volume**

**Objetivo:** Negócios locais com nome, telefone, site e e-mail (quando o site/Maps expõe).

**O que já existe:**
- 208 fontes `gmaps-*` (restaurantes, advogados, contabilidade, etc. × SP, RJ, BH, …).
- Scraper Puppeteer com extração melhorada: e-mail no Maps, homepage, páginas `/contato`, cheerio + blocklist.
- Leads sem e-mail recebem placeholder `@mapscraper.local` (telefone salvo → **WhatsApp**).

**Taxa típica de e-mail real por nicho (GMaps):**
- Contabilidade / advogados / escolas: **30–37%**
- Restaurantes / padarias / petshops: **9–14%**

**Próximas ações:**
- [ ] **Re-enriquecimento:** `npm run enrich:email -- --limit=2000` nos ~13k leads com site mas placeholder.
- [ ] Re-executar scrapes GMaps (código novo gera mais e-mail em coletas futuras).
- [ ] Campanhas de e-mail só para quem tem e-mail real; WhatsApp para o restante.

---

## Passo 3: Conselhos e fontes especializadas — **parcial / baixa prioridade**

**Objetivo:** Profissionais ou nichos que CNPJ/GMaps não cobrem bem.

| Fonte | Status | E-mail? | Nota |
|-------|--------|---------|------|
| Câmara / Senado (dados abertos) | Inativa, ~164 leads | Sim | Políticos, não B2B |
| OAB CNA | Sem scraper em massa | Não na API pública | Consulta unitária; SOAP com chave |
| CFM (médicos) | — | Não (só CRM/nome) | API paga, sem e-mail |
| CREA / Confea | Plano dados abertos | Incipiente | Sem API pública de profissionais |

**Próximas ações (se fizer sentido):**
- [ ] Manter foco em GMaps + CNPJ antes de investir aqui.
- [ ] OAB/CRM só com API oficial ou prospecção manual por nicho.

---

## Complemento: OpenStreetMap (Overpass) — o que é “reativar Overpass”?

### O que é

**OpenStreetMap (OSM)** é um mapa colaborativo (como um “Wikipedia de mapas”).  
**Overpass** é a API que consulta esses dados por tipo de estabelecimento (farmácia, escola, restaurante, etc.) numa região (hoje: bbox de São Paulo no código).

No projeto existem **13 fontes** `osm-*-overpass`, por exemplo:
- `osm-dentistas-overpass`, `osm-restaurantes-overpass`, `osm-igrejas-overpass`, …

O scraper `overpassSource.js` busca nós OSM com tags como `amenity=restaurant`, `shop`, `amenity=clinic`, etc.

### O que cada lead traz

| Campo | Frequência |
|-------|------------|
| Nome | Quase sempre |
| Telefone | Às vezes (`phone` / `contact:phone` na tag OSM) |
| E-mail real | **Raro** (~5–15% nos dados históricos) |
| E-mail no sistema | Na maioria, placeholder `@lead.local` |

Ou seja: **Overpass não é boa fonte de e-mail para campanhas.** Serve como **complemento de telefone/nome** para abordagem **WhatsApp**, principalmente onde o GMaps já não trouxe duplicata.

### Por que está desativado

As fontes OSM foram **substituídas em volume** pelas 208 fontes GMaps (mais completas: site, telefone, e-mail via site). Manter OSM ativo:
- Aumenta duplicatas (mesmo negócio no Maps e no OSM).
- Quase não aumenta e-mails reais.
- Consome cota da API Overpass (pública, mas com limites).

### Quando “reativar” faria sentido

- Você quer **mais telefones** para WhatsApp em nichos específicos (ex.: igrejas, escolas OSM).
- GMaps bloqueou ou ficou instável para algum nicho.
- Você aceita deduplicação por telefone/e-mail e sabe que **campanha de e-mail** quase não ganha leads novos.

**Como reativar (operacional):** no banco, `UPDATE lead_sources SET is_active = 1 WHERE name LIKE 'osm-%'` ou migration dedicada; depois rodar scraping manual por fonte.

**Recomendação atual:** **prioridade baixa** — terminar `enrich:email` e rodar CNPJ/GMaps antes de reativar OSM.

---

## Passo operacional imediato (prioridade)

1. **Enriquecer e-mails** — `npm run enrich:email -- --limit=2000` (repetir até esgotar fila).
2. **Scraping CNPJ** — fontes contabilidade/advocacia/TI no painel.
3. **Campanhas** — ~1.100+ leads com e-mail ainda na fila; disparos respeitam limite diário (`.env`).
4. **WhatsApp** — ~19k leads só com telefone (placeholders GMaps).

---

## Referências no repositório

| Item | Caminho |
|------|---------|
| Scraper GMaps | `src/scrapers/sources/googleMapsSource.js` |
| Extrator de e-mail | `src/scrapers/sources/emailExtractor.js` |
| Scraper CNPJ | `src/scrapers/sources/cnpjSource.js` |
| Scraper Overpass | `src/scrapers/sources/overpassSource.js` |
| Re-enriquecimento | `scripts/enrich-leads-email.js` |
| Comandos (painel) | `src/public/ops.html` |
