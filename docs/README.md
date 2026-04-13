# Plataforma de Scraping de Leads

Projeto base para coleta de leads com Node.js, persistencia em MySQL e API de consulta.

## Objetivo

Coletar possiveis leads com os campos:
- nome (obrigatorio)
- email (obrigatorio)
- telefone (opcional)

## Stack

- Node.js 20+
- Express
- Knex + MySQL
- Axios + Cheerio (com ponto de extensao para Puppeteer)
- Joi (validacao)

## Setup rapido

1. Entrar no backend:
   - `cd backend`
2. Instalar dependencias:
   - `npm install`
3. Criar arquivo de ambiente:
   - `cp .env.example .env`
4. Garantir banco no MySQL local (`root` / `wv123`):
   - `mysql -h127.0.0.1 -P3306 -uroot -pwv123 -e "CREATE DATABASE IF NOT EXISTS leads_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`
5. Rodar migrations:
   - `npm run migrate:latest`
6. Iniciar API:
   - `npm run dev`
7. Rodar scraping manual:
   - `npm run scrape:manual`

## Opcional: MySQL em Docker

Se preferir container ao inves de MySQL local:
- no root do projeto: `docker compose up -d`
- use `DB_PORT=3307` no `.env`

## Estrutura principal

- `src/services/scrapeService.js`: orquestra pipeline de scraping
- `src/scrapers/`: coletores por fonte
- `src/repositories/`: acesso ao banco
- `database/migrations/`: schema do banco

## Endpoints

- `GET /health`
- `GET /api/leads`
- `GET /api/executions`
- `GET /api/sources`
- `GET /api/dashboard/summary`
- `POST /api/scrape/run`

## Painel Web

Com o backend rodando (`npm run dev`), abra:
- `http://127.0.0.1:3000/panel/`

No painel voce consegue:
- disparar scraping manual por fonte ou em todas as fontes ativas
- escolher o Campo Atuacao para filtrar quais APIs aparecem no campo Fonte
- visualizar metricas gerais
- acompanhar execucoes recentes
- consultar leads recentes

Seguranca opcional do botao executar:
- configure `PANEL_RUN_TOKEN` no `.env`
- no painel, preencha o campo Token para enviar o header `x-panel-token`

Consulte os demais detalhes em `docs/API.md`, `docs/SCHEMA.md`, `docs/SCRAPING.md` e `docs/SECURITY.md`.
