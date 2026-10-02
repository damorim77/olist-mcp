# AGENTS.md — olist-mcp

Repo ainda sem código (só `docs/`). Verdade executiva: `docs/PLAN.md` (37 itens) > `docs/PROGRESS.md` (status; atualizar a cada gate/fase) > `docs/SPEC.md` (desatualizada: diz SSE/5 tabelas/`duckdb-node`).

## Decisões travadas (não reabrir sem motivo)
- Transporte: Streamable HTTP stateless `POST /api/mcp`, SDK v2 oficial (`@modelcontextprotocol/server` + `requireBearerAuth`/`toNodeHandler`). SSE é legado (`server-legacy`). Sem `Map<sessionId,transport>` — fresh `McpServer` por request; `GET/DELETE` → 405.
- `inputSchema` é `z.object({...})` full (não `ZodRawShape`); `zod@^4`, Node 20+; `pnpm/npm why zod` na Spike A (mismatch quebra silencioso). `mcp-handler` comunitário só se o oficial não cobrir.
- MVP 7 tools: `list_datasets, get_table_schema, execute_sql_query, analyze_category_sales, get_order_funnel` (rename), `get_order_status_distribution, analyze_category_reviews` (dedup). Extensão: `analyze_reviews_for_order`. 7 tabelas (`+order_payments, +sellers`; `geolocation` fora).
- Gates 0A: qualquer FAIL → parar (ver `docs/PROGRESS.md`).

## Segurança (fronteira = engine, regex = UX)
- Init DuckDB nesta ordem: `LOAD httpfs` + criar views → `SET allowed_directories=['<PARQUET_BASE_URL>']` → `SET enable_external_access=false` → `SET lock_configuration=true` (+ desabilitar autoinstall/autoload/community). Bloquear também replacement scan (`FROM '/x'`, `read_text`, glob, aspas) — blocklist de substring tem falso-positivo (`r2/s3/http`) e é burlável.
- `READ_ONLY` + `catalog.duckdb` de build (views com URL pinada por SHA) aberto direto; `/tmp` é caminho principal (assert `:memory:` READ_ONLY na Spike B). `LOAD/SET` devem funcionar em read-only — confirmar.
- `execute_sql_query`: nunca `read_parquet`/URL (só `VIEWs`); wrapping `SELECT * FROM (<q sem ; final>\n) AS __mcp_result LIMIT 101` (`\n` anti-`--`); retornar `{rows:100, row_count, truncated}` (101ª linha = flag); erros parser/binder/policy/timeout → `isError:true` sanitizado (autocorreção), só falha interna → 500.
- Timeout real: `setTimeout(() => conn.interrupt(), 25_000)` + `finally` (nunca só `Promise.race`); lifecycle = singleton lazy + conexão/request + semáforo 1–2. `memory_limit='512MB'`, `threads=1` (Hobby é 2GB/1vCPU; `512MB` é escolha). Segunda query rápida após timeout = prova de instância livre.
- Auth: `Authorization: Bearer MCP_API_KEY` sempre (abuso de CPU, não confidencialidade); sem/inválido → 401 idênticos. Rate-limit distribuído é follow-up.

## Dados/serialização (erros clássicos Olist)
- `data/<table>/part-0000.parquet` (arquivo único; glob `*.parquet` via HTTPS falha — sem listing; crescimento via `src/generated/manifest.ts` explícito). `PARQUET_BASE_URL` pinado `@<sha>` (nunca `@main`), fallback documentado. `orders` com todas as colunas (sem `invoiced_at`; `approved≈invoiced`).
- Funil: predicado sargable por intervalo + validação ano 2016–2018 (`strftime(...)=?` ignora stats Parquet); filtros aninhados (monotônico por construção); right-censoring ~out/2018 em notes. `category_sales` = tripla explícita (`product_revenue=SUM(price)`, `freight_total`, `gross`).
- `get_table_schema` retorna `{columns, primary_key, relationships, semantic_notes}` com: `customer_id`≠pessoa (`customer_unique_id` sim), `order_item_id`=linha, categoria NULL, N reviews/pedido, cobertura 2016-esparso/2017–ago2018. `category` = `z.enum` (~71, gerado pelo ETL) + sugestões no miss.
- Serialização: `BIGINT→number/string`, `TIMESTAMP` naive Olist como ISO **sem `Z`** (com `Z` desloca horas), `NaN/Infinity→null`. Comentários de review = texto não-confiável (truncar/sanitizar).
- Licença bloqueante: Olist é CC BY-NC-SA 4.0 — `data/LICENSE-ATTRIBUTION.md` + checar NC **antes** do push.

## Operação
- Env atual: Node 24, npm; pnpm ausente. `opencode.json` usa `{env:VAR}` (nunca `${VAR}` — vira literal → 401 falso). Modelo NIM canônico `meta/...` (avaliar 3.3+ p/ tool-calling).
- `next.config`: `serverExternalPackages` top-level (Next 15+; confirmar versão instalada).
- Comandos quando existirem: preferir `npm run build/test`; teste único via vitest focado; ordem `lint → typecheck → test`.
