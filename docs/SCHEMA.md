# Schema de Banco

## Tabelas

## lead_sources
Cadastro de fontes de scraping.

Campos principais:
- id
- name (unico)
- base_url
- rate_limit_per_hour
- last_scraped_at
- is_active

## leads
Tabela principal de leads.

Campos principais:
- id
- name
- email
- email_normalized
- phone (opcional)
- phone_normalized (opcional)
- source_id
- raw_data (json)
- is_duplicate_of
- is_valid
- is_active

Regras importantes:
- `UNIQUE(email_normalized, source_id)`
- `UNIQUE(phone_normalized, source_id)`

## scraping_executions
Historico de execucoes de scraping por fonte.

Campos principais:
- id
- source_id
- status (running, completed, failed, partial)
- total_scraped
- total_saved
- duplicates_found
- errors_count

## scraping_errors
Registro de erros detalhados por execucao.

## lead_deduplication_log
Auditoria das duplicidades identificadas.

## Relacionamentos

- `lead_sources (1) -> (N) leads`
- `lead_sources (1) -> (N) scraping_executions`
- `scraping_executions (1) -> (N) scraping_errors`
- `leads (1) -> (N) lead_deduplication_log`
