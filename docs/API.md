# API

## GET /health

Resposta:

```json
{
  "status": "ok",
  "service": "lead-scraper-backend"
}
```

## GET /api/leads

Query params:
- `limit` (max 100, default 50)
- `offset` (default 0)
- `source_id` (opcional)
- `gender` (opcional: `F` ou `M`)

Resposta:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Joao da Silva",
      "email": "joao@email.com",
      "phone": "+5511999999999",
      "source_id": 1,
      "created_at": "2026-04-04T10:00:00.000Z",
      "is_duplicate_of": null
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0
  }
}
```

## GET /api/executions

Query params:
- `limit` (max 100, default 50)
- `offset` (default 0)

Retorna historico das execucoes de scraping e metricas.

## GET /api/sources

Retorna todas as fontes cadastradas com status ativo/inativo e metadados de coleta.

Query params:
- `field_area` (opcional: `politica`, `economia`, `demografia`, `educacao`, `energia`, `engenharia`, `lojas`, `shopping`, `odontologia`, `veterinaria`, `cnpj`, `saude`, `juridico`, `financeiro`, `inovacao`, `governo`, `transporte`, `rh_trabalho`, `consumidor`, `alimentacao`, `hotelaria`, `esporte`, `imobiliario`, `religioso`, `tecnologia`, `manual`)

## GET /api/dashboard/summary

Resposta:

```json
{
  "data": {
    "totalLeads": 147,
    "femaleLeads": 147,
    "activeSources": 1,
    "statuses": {
      "running": 0,
      "completed": 2,
      "partial": 0,
      "failed": 1
    },
    "latestExecution": {
      "id": 3,
      "source_id": 2,
      "status": "completed",
      "total_scraped": 80,
      "total_saved": 66,
      "duplicates_found": 14,
      "errors_count": 0,
      "started_at": "2026-04-04T15:53:01.000Z",
      "finished_at": "2026-04-04T15:53:58.000Z"
    }
  }
}
```

## POST /api/scrape/run

Body:

```json
{
  "sourceId": 2
}
```

`sourceId` e opcional; se omitido, processa todas as fontes ativas.

Header opcional de seguranca (quando `PANEL_RUN_TOKEN` estiver configurado):
- `x-panel-token: <valor-do-token>`

Resposta:

```json
{
  "data": {
    "processedSources": 1,
    "totals": {
      "scraped": 80,
      "saved": 66,
      "duplicates": 14,
      "errors": 0
    }
  }
}
```

## POST /api/scrape/manual

Executa scraping manual em uma URL publica e retorna um preview dos campos extraidos.

Body:

```json
{
  "url": "https://example.com",
  "fields": ["nome", "email", "telefone"],
  "page": 1,
  "pageSize": 20,
  "persist": false,
  "consent": false,
  "sourceId": 2
}
```

Parametros opcionais:
- `page` (default `1`, min `1`)
- `pageSize` (default `20`, max `100`)
- `persist` (default `false`): quando `true`, tenta salvar leads no banco
- `consent` (obrigatorio quando `persist=true`): deve ser `true`
- `sourceId` (obrigatorio quando `persist=true`): fonte ativa para associar os leads

Campos permitidos em `fields`:
- `nome`
- `email`
- `telefone`
- `cpf`
- `cnpj`

Header opcional de seguranca (quando `PANEL_RUN_TOKEN` estiver configurado):
- `x-panel-token: <valor-do-token>`

Regras de seguranca:
- Apenas `http`/`https`.
- Hosts locais/privados sao bloqueados (protege contra SSRF basico).
- Endpoint retorna preview e nao persiste leads no banco.

Resposta:

```json
{
  "data": {
    "url": "https://example.com/",
    "requestedFields": ["nome", "email", "telefone"],
    "counts": {
      "nome": 1,
      "email": 0,
      "telefone": 0
    },
    "extracted": {
      "nome": ["Example Domain"],
      "email": [],
      "telefone": []
    },
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalPages": 1,
      "maxItems": 1
    },
    "persist": {
      "enabled": false,
      "consent": false,
      "sourceId": null,
      "result": null
    }
  }
}
```
