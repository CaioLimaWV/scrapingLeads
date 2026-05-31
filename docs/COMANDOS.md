# Comandos do sistema

Guia de referência de todos os comandos usados para operar, debugar e estender este projeto. Cada comando tem uma explicação curta pensada para um dev júnior — o que ele faz, quando usar, e o que esperar de retorno.

---

## 1. Setup inicial e dependências

### `npm install`
Instala todas as bibliotecas listadas em [package.json](../package.json) (Express, Knex, MySQL2, Nodemailer, Puppeteer, etc) na pasta `node_modules/`. Rode uma vez ao clonar o projeto, e novamente sempre que alguém alterar o `package.json` (adicionar/remover lib).

### `cp .env.example .env`
Cria seu arquivo de variáveis de ambiente local copiando o template. O `.env` contém senhas/tokens (banco, Brevo, etc) e **não vai pro git**. Depois de copiar, abra o arquivo e preencha os valores.

### `docker-compose up -d`
Sobe o MySQL em container Docker em background (a flag `-d` = "detached"). Use no setup inicial se você não tem um MySQL local rodando. O `-d` mantém o terminal livre. Para derrubar: `docker-compose down`.

---

## 2. Banco de dados (Knex migrations)

### `npm run migrate:latest`
Roda **todas as migrations pendentes** em [database/migrations/](../database/migrations/) na ordem cronológica. Cada migration cria/altera tabelas no MySQL. Rode após clonar o projeto, ou quando alguém adicionou novas migrations no git e você puxou as mudanças.

### `npm run migrate:rollback`
Desfaz o **último batch** de migrations executado (chama o `exports.down` de cada uma). Útil se você acabou de rodar uma migration e percebeu que ela quebrou algo. Cuidado: se a migration removeu dados, o rollback não traz de volta.

### `npm run migrate:make nome_da_migration`
Cria um arquivo de migration em branco em `database/migrations/` com timestamp. Exemplo: `npm run migrate:make add_phone_to_leads` gera `20260525XXXXXX_add_phone_to_leads.js`. Você abre o arquivo e implementa `exports.up` (mudança) e `exports.down` (reverter).

### `npx knex migrate:status`
Mostra quais migrations já foram aplicadas e quais ainda estão pendentes. Use pra entender o estado atual do banco antes de rodar `migrate:latest` ou `migrate:rollback`.

---

## 3. Rodando a aplicação

### `npm run dev`
Inicia o servidor Express em modo desenvolvimento na porta definida por `APP_PORT` (default 3000). Logs vão pro stdout via Pino. Use no dia a dia enquanto está codando. Para parar: `Ctrl+C`.

### `npm start`
Inicia o servidor em modo produção (`NODE_ENV=production`). A diferença é que o Pino emite logs em formato JSON cru (sem cores), e algumas libs ajustam comportamento (ex: cache, error stacktraces ocultos). Use em servidor real, não no seu PC.

### `npm run scrape:manual -- --sourceId=123`
Executa o scraper para uma fonte específica fora do servidor HTTP — útil pra testar um scraper novo ou rodar via cron sem subir a API. O `--` separa argumentos do npm dos argumentos do script. Sem `--sourceId`, processa todas as fontes ativas. Ver [scripts/scrape.js](../scripts/scrape.js).

---

## 4. Endpoints da API (via curl)

> Todos os endpoints sensíveis (executar scraping, disparar email) exigem o header `x-panel-token: $PANEL_RUN_TOKEN` quando essa env var está definida.

### `curl http://localhost:3000/api/dashboard/summary`
Retorna o resumo geral: total de leads, leads válidos, fontes ativas, scrapes recentes. É o que alimenta a tela inicial do painel em `/panel`. Sem autenticação — endpoint de leitura.

### `curl http://localhost:3000/api/sources`
Lista todas as fontes (`lead_sources`) cadastradas — site, scraper associado, status ativo/inativo. Use para conferir que ID corresponde a qual fonte antes de disparar um scraping específico.

### `curl http://localhost:3000/api/leads?limit=20&offset=0`
Lista os leads paginados, com filtros opcionais (`?valid=true`, `?source=X`). Use durante debug pra inspecionar o que o scraper extraiu sem precisar abrir o MySQL direto.

### `curl http://localhost:3000/api/leads/uncontacted`
Lista leads que ainda não foram contatados (campo `contacted_at IS NULL`). Alimenta a UI de fila WhatsApp e dá visibilidade do "estoque" disponível pra outreach.

### `curl -X POST http://localhost:3000/api/leads/:id/contact`
Marca um lead como contatado, gravando `contacted_at = NOW()`. Chamado quando você clica "marcar como contatado" no painel — evita reaparecer na fila.

### `curl http://localhost:3000/api/executions`
Lista o histórico de execuções de scraping (sucesso/falha, leads encontrados, duração). Use pra investigar "por que não saiu nenhum lead novo nas últimas horas?".

### `curl -X POST -H "x-panel-token: SEU_TOKEN" -H "Content-Type: application/json" -d '{"sourceId": 123}' http://localhost:3000/api/scrape/run`
Dispara o scraping de uma fonte específica de forma assíncrona. Retorna imediatamente com `executionId`; o trabalho roda em background. Use pra forçar uma rodada manual fora do agendamento.

### `curl -X POST -H "x-panel-token: SEU_TOKEN" -H "Content-Type: application/json" -d '{"name":"João","email":"x@y.com"}' http://localhost:3000/api/scrape/manual`
Insere um lead manualmente no banco (sem scraping). Usado quando você consegue um contato fora do fluxo automatizado e quer registrar no mesmo lugar para depois enviar email/whatsapp.

---

## 5. Sistema de email

### `curl http://localhost:3000/api/email/status`
Retorna quanto já foi enviado hoje, o limite diário global, capacidade restante, e **detalhamento por provedor** (após a refatoração multi-provedor). Use antes de disparar uma campanha pra saber se ainda tem "saldo" no tier gratuito.

Resposta exemplo:
```json
{
  "sentToday": 5,
  "dailyLimit": 50,
  "remaining": 45,
  "providers": [
    { "name": "brevo", "sentToday": 5, "dailyLimit": 300, "remaining": 295 }
  ]
}
```

### `curl -X POST -H "x-panel-token: SEU_TOKEN" -H "Content-Type: application/json" -d '{"toEmail":"voce@gmail.com","subject":"Teste","template":"Olá {{nome}}"}' http://localhost:3000/api/email/test`
Envia **um único** email de teste pro endereço informado. Não toca a tabela de leads — usa um nome falso ("Teste") na substituição de `{{nome}}`. Use sempre antes de uma campanha real pra conferir formatação, tracking pixel e domínio remetente. Resposta inclui qual provedor enviou.

### `curl -X POST -H "x-panel-token: SEU_TOKEN" -H "Content-Type: application/json" -d '{"subject":"Oi","template":"Olá {{nome}}","dryRun":true}' http://localhost:3000/api/email/run`
Executa uma campanha em **dry-run** — passa por todos os leads elegíveis, monta o email, mas não envia nem grava no provedor. Apenas registra `status='skipped'` no histórico com `error_message='dry-run'`. Use pra ver quantos leads seriam atingidos.

### `curl -X POST -H "x-panel-token: SEU_TOKEN" -H "Content-Type: application/json" -d '{"subject":"Oi","template":"Olá {{nome}}"}' http://localhost:3000/api/email/run`
Dispara a campanha **de verdade**. Respeita o limite diário, faz delay aleatório entre envios (`EMAIL_DELAY_MIN_MS`/`MAX_MS`), e usa estratégia capacity-based: o provedor com mais saldo restante envia primeiro; se falhar, tenta o próximo provedor. Retorna `{sent, failed, skipped, remaining, byProvider}`.

### `curl http://localhost:3000/api/email/history?limit=50`
Lista os envios mais recentes com agregação de eventos (aberturas, cliques) por email. É o que alimenta a aba "histórico" do painel — mostra status, erro (se houve), e engajamento.

### `curl http://localhost:3000/api/email/analytics?days=7`
Retorna métricas agregadas dos últimos N dias: envios/abertas/cliques por dia + top 20 URLs mais clicadas. Use pra avaliar performance da campanha (taxa de abertura saudável é >20%; <5% indica que está caindo em spam).

### `curl -X POST http://localhost:3000/api/email/unsubscribe/:leadId`
Marca um lead específico como `email_unsubscribed=true`, removendo-o de campanhas futuras. Normalmente acionado pelo link de descadastro no rodapé do email, mas você pode chamar manualmente se alguém pediu por outro canal.

---

## 6. Tracking de email (pixel + cliques)

> Esses endpoints são acessados **pelos destinatários do email**, não por você. Estão aqui pra você entender o fluxo e debugar.

### `GET /track/open/:token.gif`
Retorna um GIF transparente 1x1. Cada vez que o cliente de email do destinatário carrega imagens, esse pixel é requisitado e gravamos um evento `open` em `email_events`. **Limitação:** muitos clientes (Gmail, Outlook) fazem proxy de imagens, o que infla a contagem; outros bloqueiam, o que subestima.

### `GET /track/click/:token?url=ENCODED_URL`
Quando o destinatário clica em um link no email, ele bate aqui primeiro: gravamos evento `click` com a URL clicada e o IP, depois redirecionamos pra URL original. A reescrita dos links acontece em `injectTracking()` no [emailService.js:62](../src/services/emailService.js#L66).

### `GET /track/unsub/:token`
Link de descadastro do rodapé. Grava evento `unsubscribe` e marca `leads.email_unsubscribed=true`. Também é o destino do header `List-Unsubscribe` (one-click), respeitado pelo Gmail.

---

## 7. Testes e qualidade

### `npm test`
Roda a suíte Jest com `--runInBand` (sequencial, um teste por vez). O `runInBand` é importante porque os testes tocam o banco — paralelismo causaria condições de corrida. Use antes de cada commit relevante.

### `npm run lint`
Roda ESLint em `src/` e `scripts/`. **Atualmente quebrado** — o projeto usa ESLint 9 mas não tem `eslint.config.js` (precisa de migração da config antiga `.eslintrc`). Não é bloqueante.

---

## 8. Comandos úteis de debug (Bash diretos)

### `npx knex migrate:latest 2>&1 | tail -20`
Variação manual do `npm run migrate:latest` que mostra só as últimas 20 linhas do log. Útil quando você quer ver só o resultado final ("Batch X run: N migrations") sem scroll.

### `node -e "const db = require('./src/database/knex'); (async()=>{const r = await db.raw('SHOW COLUMNS FROM email_sends'); console.log(r[0]); await db.destroy();})();"`
Inspeciona o schema de uma tabela direto pelo Node, sem abrir cliente MySQL. Substitua `email_sends` pela tabela que você quer ver. O `await db.destroy()` no final é **obrigatório** — sem isso o pool de conexão segura o processo aberto.

### `node -e "const {getEmailStatus} = require('./src/services/emailService'); const db = require('./src/database/knex'); (async()=>{console.log(await getEmailStatus()); await db.destroy();})();"`
Smoke test: chama uma função do service direto, sem subir o servidor HTTP. Use pra validar que sua refatoração não quebrou imports/conexões antes de fazer um curl.

### `tail -f scrape.log`
Acompanha o log do scraper em tempo real. O `-f` ("follow") faz o terminal ficar pendurado mostrando linhas novas conforme aparecem. Saia com `Ctrl+C`.

### `grep -rn "padrão" src/`
Busca recursiva (`-r`) com número de linha (`-n`) por um texto/regex em `src/`. Use pra achar onde uma função é chamada, ou todas as ocorrências de um nome de variável antes de renomear.

---

## 9. Git — fluxo do projeto

### `git status`
Mostra arquivos modificados, novos (untracked) e prontos pra commit. Primeiro comando que você roda antes de qualquer operação git, sempre.

### `git diff` / `git diff --staged`
`git diff` mostra mudanças que **ainda não estão** no stage. `git diff --staged` mostra o que **já foi adicionado** com `git add` e está esperando o commit. Revise sempre antes de commitar.

### `git add caminho/do/arquivo.js`
Adiciona um arquivo específico ao stage (área de preparação do próximo commit). **Evite** `git add .` ou `git add -A` — eles podem incluir `.env`, logs ou binários sem querer.

### `git log --oneline -20`
Mostra os últimos 20 commits em formato compacto (hash curto + mensagem). Use pra entender o histórico recente da branch ou achar um commit pra reverter.

### `git checkout -b nome-da-feature`
Cria uma branch nova baseada na atual e já muda pra ela. Padrão pra começar qualquer feature/fix sem mexer na `JavaScript` (branch principal deste repo).

---

## 10. Variáveis de ambiente (.env) relevantes

| Variável | O que faz |
|----------|-----------|
| `APP_PORT` | Porta HTTP do Express (default 3000) |
| `PANEL_RUN_TOKEN` | Token que protege endpoints sensíveis (header `x-panel-token`). Vazio = sem proteção. |
| `APP_BASE_URL` | URL pública do app (ex: `https://meusite.com`). Sem isso, tracking de email é desabilitado porque os links injetados precisam apontar pra URL acessível externamente. |
| `BREVO_API_KEY` | Chave da **HTTP API** do Brevo (formato `xkeysib-...`). Pega em [app.brevo.com](https://app.brevo.com) → SMTP & API → aba **Chaves de API**. **Não confundir** com a "SMTP key" (`xsmtpsib-...`), que serve só pra SMTP e não funciona aqui. |
| `BREVO_DAILY_LIMIT` | Teto específico do Brevo (default 300, conforme tier free). |
| `MAILJET_API_KEY` | API Key do Mailjet (32 chars, hex). Pega em [app.mailjet.com/account/apikeys](https://app.mailjet.com/account/apikeys). |
| `MAILJET_SECRET_KEY` | Secret Key do Mailjet (32 chars, hex). Aparece **uma única vez** quando você cria a key — se perder, tem que regenerar. |
| `MAILJET_DAILY_LIMIT` | Teto específico do Mailjet (default 200, conforme tier free: 6.000/mês ≈ 200/dia). |
| `EMAIL_FROM/FROM_NAME` | Remetente que aparece pro destinatário. `EMAIL_FROM` precisa ser autorizado em **todos** os provedores em uso (no Brevo: Settings → Senders; no Mailjet: Account Settings → Sender domains & addresses) e ter SPF/DKIM configurados no DNS. |
| `EMAIL_DAILY_LIMIT` | Teto **global** de envios/dia somando todos os provedores. Evita estourar tudo num dia ruim. |
| `EMAIL_DELAY_MIN_MS / MAX_MS` | Delay aleatório entre envios (default 120s–300s). Evita parecer bot e melhora entregabilidade. |

### Como o sistema escolhe entre provedores
O [src/services/email/providerRegistry.js](../src/services/email/providerRegistry.js) só registra um provedor se as credenciais dele estão presentes no `.env`. Então:
- Só `BREVO_API_KEY` definida → só Brevo é usado.
- `BREVO_API_KEY` + `MAILJET_API_KEY`/`SECRET_KEY` definidas → ambos são usados, com estratégia **capacity-based**: cada email vai pro provedor com mais saldo restante hoje. Se ele falhar, o sistema tenta o próximo.

Pra desativar um provedor temporariamente, comenta a env key dele no `.env` e reinicia o servidor.

---

## 11. Comandos de troubleshooting comuns

### "Migration falhou no meio"
```bash
npm run migrate:rollback        # desfaz o último batch
# corrija o arquivo de migration
npm run migrate:latest          # tenta de novo
```

### "Endpoint retorna 401 Unauthorized"
Falta o header de autenticação. Adicione `-H "x-panel-token: $PANEL_RUN_TOKEN"` no curl, ou desative temporariamente removendo a env var.

### "Email não está sendo enviado, sem erro"
1. Confirma que `EMAIL_DAILY_LIMIT` não foi atingido: `curl /api/email/status`
2. Confirma que existem leads elegíveis: query direta `SELECT COUNT(*) FROM leads WHERE is_valid=1 AND email_unsubscribed=0 AND id NOT IN (SELECT lead_id FROM email_sends WHERE status='sent')`
3. Tenta um `/api/email/test` pra isolar problema de provedor vs problema de campanha

### "Erro Brevo `525 5.7.1 Unauthorized IP address`"
Acontecia quando o adapter falava SMTP. O Brevo só aceita SMTP de IPs explicitamente autorizados, e **o plano free não permite autorizar IPs**. Solução adotada: o adapter usa **HTTP API** (`api.brevo.com/v3/smtp/email`), que não tem essa restrição. Se você ver esse erro de novo, é porque alguém reverteu o adapter pra SMTP — confere [src/services/email/providers/brevoProvider.js](../src/services/email/providers/brevoProvider.js).

### "Erro Brevo `535 5.7.8 Authentication failed`"
Login/senha do Brevo errados. Causas comuns:
1. **Tipo errado de chave:** SMTP precisa de `xsmtpsib-...`; HTTP API precisa de `xkeysib-...`. Trocar = falha de auth.
2. **Usuário SMTP errado:** o user do SMTP é gerado pelo Brevo (`XXXXXXXXX@smtp-brevo.com`), não é seu Gmail/email pessoal.
3. **Chave revogada/regenerada:** se alguém regenerou a chave no painel, a antiga para de funcionar imediatamente. Pega a nova em [app.brevo.com](https://app.brevo.com) → SMTP & API.

### "Mudei o `.env` e o servidor não pegou as novas variáveis"
O `dotenv` lê o `.env` **só uma vez**, na inicialização do Node. Sempre reinicia o servidor após editar:
```bash
pkill -f "node src/app.js"      # mata o processo atual
npm run dev                     # sobe de novo
```

### "Como descobrir meu IP público (pra autorizar em qualquer serviço)"
```bash
curl -s https://api.ipify.org
```
⚠️ Em IP residencial dinâmico, ele muda quando o roteador reinicia. Pra produção, use IP fixo de VPS.

### "Servidor não sobe — porta 3000 ocupada"
```bash
lsof -i :3000                   # descobre o PID que está usando a porta
kill -9 PID                     # mata o processo
npm run dev                     # tenta de novo
```

---

## 12. Histórico de decisões importantes

### Por que Brevo via HTTP API e não SMTP?
**Decisão:** o adapter do Brevo usa `https://api.brevo.com/v3/smtp/email` em vez do SMTP `smtp-relay.brevo.com:587`.

**Por quê:** o Brevo bloqueia SMTP de IPs não autorizados (erro `525 5.7.1 Unauthorized IP address`). Autorizar IPs **não está disponível no plano free** — é feature paga. A HTTP API funciona em qualquer IP.

**Trade-off:** SMTP é o "padrão" da indústria e ofereceria fallback fácil pra outros provedores SMTP genéricos. A API é específica do Brevo. Mas como cada provedor tem características próprias (limite, reputação, headers), ter um adapter dedicado por provedor é melhor mesmo. Ver [src/services/email/providers/brevoProvider.js](../src/services/email/providers/brevoProvider.js).

### Por que Mailjet também via HTTP API?
**Decisão:** segundo provedor (Mailjet) também usa HTTP API (`api.mailjet.com/v3.1/send`) em vez de SMTP.

**Por quê:** mesma lógica do Brevo. Mailjet SMTP em IP residencial dinâmico tende a esbarrar em rate limit / autenticação por IP. HTTP API é stateless, autentica via API key + secret, funciona em qualquer rede. Ver [src/services/email/providers/mailjetProvider.js](../src/services/email/providers/mailjetProvider.js).

**Atenção:** o `EMAIL_FROM` precisa estar autorizado **em cada provedor separadamente** (cada um tem seu cadastro de Senders), e o domínio precisa ter **DKIM configurado pra cada um** — caso contrário o Gmail rejeita por falha de DMARC. Esse é o trade-off real de somar provedores: setup de DNS por domínio cresce.

### Por que coluna `provider` em `email_sends`?
**Decisão:** cada envio registra qual provedor o entregou.

**Por quê:** quando entregabilidade cair (vai cair em algum momento), você precisa saber **qual provedor** está degradado pra rotear pro outro. Sem essa coluna, todo email vira indistinguível e debug fica adivinhação. Ver migration [database/migrations/20260525000001_add_provider_to_email_sends.js](../database/migrations/20260525000001_add_provider_to_email_sends.js).

### Por que estratégia capacity-based (não round-robin)?
**Decisão:** `pickProvider()` escolhe o provedor com **mais saldo restante hoje**.

**Por quê:** maximiza uso do tier gratuito de cada provedor. Round-robin distribuiria igualmente, mas se Brevo tem 300/dia e Resend tem 100/dia, alternar 1-1 desperdiça 200 envios do Brevo. Capacity-based esgota Brevo primeiro, depois cai pra Resend. Ver [src/services/email/providerRegistry.js](../src/services/email/providerRegistry.js).
