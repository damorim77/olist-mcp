# AGENTS.md — olist-mcp

Implementado e em prod (`https://olist-mcp.vercel.app/api/mcp`, 33 testes verdes).
Verdade executiva: `docs/PLAN.md` (37 itens) > `docs/PROGRESS.md` (atualizar a cada gate/fase) > `docs/SPEC.md` (desatualizada: SSE/5 tabelas).

## Decisões travadas (não reabrir sem motivo)
- Streamable HTTP stateless `POST /api/mcp`, SDK v2 **oficial puro** (`createMcpHandler` de `@modelcontextprotocol/server`; `mcp-handler` avaliado e descartado; `requireBearerAuth` descartado — exige exp/scopes, usamos Bearer simples em `lib/mcp/auth.ts`). `GET/DELETE` → 405. Era moderna 2026-07-28 sem handshake.
- `inputSchema` é `z.object({...})` full (não `ZodRawShape`); `zod@4.6.5` pinado, Node 20+ (env: Node 24, npm; sem pnpm).
- 7 tools / 7 tabelas (`+order_payments, +sellers`; `geolocation` fora). `category` é `z.string` + `resolveCategory` manual (enum rejeitaria no SDK sem dar sugestões).
- `opencode.json`: prod habilitado + `olist-local` desabilitado; sempre `{env:VAR}` (nunca `${VAR}` — vira literal → 401 falso). Modelo `meta/llama-3.3-70b-instruct`.

## Segurança (fronteira = engine, regex = UX)
- Init: `LOAD httpfs` → views → `SET allowed_directories=[base]` → `SET enable_external_access=false` → `SET lock_configuration=true` (+ sem autoinstall/autoload/community). Substring-blocklist tem falso-positivo (`r2/s3/http`) — engine decide.
- Catálogo em arquivo sob `/tmp` (criado RW uma vez por base, servido `READ_ONLY`): **`:memory:` não abre READ_ONLY** (erro de catálogo comprovado). `LOAD/SET` funcionam em read-only (confirmado na Lambda).
- `execute_sql_query`: só `VIEWs`; wrapping `SELECT * FROM (<q sem ;>\n) AS __mcp_result LIMIT 101`; envelope `{rows:100, row_count, truncated}`; parser/binder/policy/timeout → `isError:true` sanitizado, só falha interna → 500.
- Timeout: `setTimeout(() => conn.interrupt(), 25_000)` + `finally`; singleton lazy + conexão/request + semáforo 2; `memory_limit='512MB'`, `threads=1`; 2ª query rápida pós-timeout prova instância livre. `instance.closeSync()` obrigatório antes de reabrir arquivo.
- Auth Bearer sempre (anti-abuso, não confidencialidade); 401 idênticos. Secrets Vercel **não podem ser lidos de volta** (`[SENSITIVE]`) — perdeu a chave, rotacione (`vercel env add` nos dois envs + redeploy).

## Dados/serialização (armadilhas Olist verificadas)
- `data/<table>/part-0000.parquet` (glob HTTPS não lista; crescimento via `src/generated/manifest.ts`). `orders` completa (sem `invoiced_at`; `approved≈invoiced`). reviews=99224 (contagem por linhas dá 104719 errado — quebras em comentários); 610 categorias NULL; 2 PT sem tradução.
- Funil sargable por intervalo + ano 2016–2018; filtros aninhados; right-censoring ~out/2018. `category_sales` = tripla (`product_revenue`, `freight_total`, `gross`).
- Schema retorna `{columns, primary_key, relationships, semantic_notes}` (`customer_id`≠pessoa, `order_item_id`=linha, N reviews/pedido, cobertura).
- `COUNT(*)` volta `BigInt` (`JSON.stringify` lança — por isso `serialize.ts`); `TIMESTAMP` naive como ISO **sem `Z`**; `NaN/Infinity→null`. Reviews = texto não-confiável (truncar/sanitizar ≤200).
- ETL: `open(..., encoding="utf-8")` obrigatório (cp1252 gera bytes inválidos que quebram o build Turbopack). Licença CC BY-NC-SA 4.0 (`data/LICENSE-ATTRIBUTION.md`, NC confirmado p/ este projeto).

## Deploy Vercel (aprendido na marra)
- `outputFileTracingIncludes` em `/api/mcp`: `./data/**/*` **e** `./node_modules/@duckdb/node-bindings-linux-x64/**/*` (`libduckdb.so` entra via dlopen, sem isso dá 500 até no 401).
- Lambda sem `HOME`: `SET home_directory='/tmp'` + `extension_directory` em `/tmp` antes de `INSTALL/LOAD httpfs` (INSTALL ~680ms no cold start, depois cache).
- `ssoProtection: null` via `vercel api` (dashboard/CLI não expõem); **sem auto-deploy** (git nunca vinculado — deploy é `vercel deploy --prod` manual). `.vercelignore` precisa deixar `data/` subir.
- Smoke: `node scripts/smoke-mcp.mjs [url]` (usa o client oficial no caminho HTTP real).
- Inspector v2.9.0: Add Servers → `streamable-http` → Settings: era **Modern** (default Legacy falha) + Custom Header `Authorization`.

## Comandos
- `npm test` (todos), `npx vitest run tests/<arquivo>` (focado), `npm run typecheck`, `npm run build`. TS tem `noUncheckedIndexedAccess` — indexação exige `!` ou guarda.
- Testes MCP usam `InMemoryTransport.createLinkedPair()` + `Client` oficial (envelope moderno é verboso demais na mão). Rede real só via `scripts/smoke-mcp.mjs` com dev rodando.
- Shell aqui é PowerShell 5.1: sem `SkipHttpErrorCheck`, sem heredoc `<<`; servidor em background via `Start-Job`, nunca `Start-Process npm`.
