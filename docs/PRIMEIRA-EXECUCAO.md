# Primeira execucao completa com fonte publica real

Este guia executa o fluxo real usando dados publicos oficiais da Camara dos Deputados.

## 1) Preparar ambiente

1. Entre na pasta backend:
   - cd backend
2. Garanta o arquivo de ambiente:
   - cp .env.example .env
3. Confira as credenciais MySQL locais no .env:
   - DB_HOST=127.0.0.1
   - DB_PORT=3306
   - DB_NAME=leads_db
   - DB_USER=root
   - DB_PASSWORD=wv123
4. Defina limite de coleta inicial:
   - SCRAPE_MAX_ITEMS=80

## 2) Garantir banco no MySQL local

Execute:

mysql -h127.0.0.1 -P3306 -uroot -pwv123 -e "CREATE DATABASE IF NOT EXISTS leads_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

## 3) Instalar dependencias

npm install

## 4) Aplicar migrations

npm run migrate:latest

Resultado esperado:
- Tabelas criadas: lead_sources, leads, scraping_executions, scraping_errors, lead_deduplication_log
- Fonte ativa configurada: camara-deputados-api

## 5) Executar scraping real

npm run scrape:manual

O que acontece internamente:
1. O sistema carrega fontes ativas em lead_sources.
2. Cria registro de execucao em scraping_executions com status running.
3. Chama API publica da Camara para listar deputados.
4. Para cada deputado, busca detalhes para tentar extrair telefone de gabinete.
5. Coleta leads sem restringir genero no scraping.
6. Valida nome e email (obrigatorios) e normaliza telefone quando possivel.
7. Deduplica por email_normalized + source_id (duplicados sao ignorados).
8. Salva apenas leads novos em leads e finaliza execucao com metricas.

## 6) Subir API para consulta

npm run dev

Endpoints:
- GET http://127.0.0.1:3000/health
- GET http://127.0.0.1:3000/api/leads?limit=20&offset=0
- GET http://127.0.0.1:3000/api/executions?limit=20&offset=0

## 7) Validar dados no banco

Exemplos SQL:

mysql -h127.0.0.1 -P3306 -uroot -pwv123 leads_db -e "SELECT id,name,email,phone,source_id,is_duplicate_of,created_at FROM leads ORDER BY id DESC LIMIT 10;"

mysql -h127.0.0.1 -P3306 -uroot -pwv123 leads_db -e "SELECT id,source_id,status,total_scraped,total_saved,duplicates_found,errors_count,started_at,finished_at FROM scraping_executions ORDER BY id DESC LIMIT 5;"

## 8) Como interpretar resultados

- total_scraped: total bruto coletado da fonte
- total_saved: leads novos persistidos
- duplicates_found: contatos repetidos por email na mesma fonte
- errors_count: itens rejeitados por validacao ou falhas de coleta

## 9) Boas praticas operacionais

- Comece com limite baixo em SCRAPE_MAX_ITEMS e aumente gradualmente.
- Mantenha logs e revise scraping_errors apos cada execucao.
- Respeite termos de uso da fonte e regras de privacidade aplicaveis.
