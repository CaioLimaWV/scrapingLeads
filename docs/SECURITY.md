# Seguranca

## SQL Injection

- Todas as operacoes de banco usam Knex Query Builder (queries parametrizadas).
- Nao concatenar input de usuario em SQL.

## Validacao

- Todo lead passa por schema Joi allowlist.
- Campos esperados: nome, email, telefone opcional, source_id.

## XSS

- API retorna JSON e nao renderiza HTML.
- Em painel futuro, escapar output por contexto.

## Dados sensiveis

- Logger com redaction para email e telefone em payloads sensiveis.
- Nao versionar `.env`.

## Operacao

- Use HTTPS em producao.
- Restrinja acesso ao banco por rede/IP.
- Ajuste rate limit por fonte para evitar bloqueios e problemas legais.
- Verifique ToS/robots e conformidade LGPD das fontes.

## Painel Web

- O painel fica em `/panel/` e consome APIs locais.
- Para proteger o disparo manual de scraping, configure `PANEL_RUN_TOKEN` no `.env`.
- Com token configurado, o endpoint `POST /api/scrape/run` exige header `x-panel-token`.
