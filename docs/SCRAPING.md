# Fluxo de Scraping

## Pipeline

1. Carrega fontes ativas (`lead_sources`)
2. Abre uma execucao (`scraping_executions`)
3. Faz coleta da fonte
4. Valida lead (nome e email obrigatorios)
5. Normaliza:
   - email para lowercase
   - telefone para E.164 quando valido
6. Deduplica por email normalizado e fonte
7. Persiste no banco
8. Fecha execucao com metricas

## Politica de dados incompletos

- Sem nome: rejeita
- Sem email: rejeita
- Sem telefone: aceita (null)
- Telefone invalido: aceita com telefone null

## Fonte inicial

Foi criada uma fonte publica real:
- camara-deputados-api
- URL: https://dadosabertos.camara.leg.br/api/v2/deputados

Implementacao em:
- backend/src/scrapers/sources/camaraDeputadosSource.js

O scraper busca deputados na API publica oficial, coleta nome e email, e tenta coletar telefone do gabinete quando disponivel.

Regra de genero atual:
- o scraping coleta registros de todos os generos
- o filtro por genero e aplicado no painel (tela de Leads)

## Execucao manual

- Todas as fontes ativas:
  - `npm run scrape:manual`
- Fonte especifica:
  - `node scripts/scrape.js --sourceId=1`

## Limite de primeira coleta

Para controlar a primeira execucao, ajuste no .env:
- SCRAPE_MAX_ITEMS=80

Esse limite reduz risco de bloqueio e acelera seu primeiro ciclo de validacao.
