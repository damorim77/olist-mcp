# Plano de Implementação — Serverless Data Lakehouse MCP (Olist)

Fonte: `docs/SPEC.md`. Estado do repo: vazio (só continha `docs/SPEC.md`).

Decisões travadas:
1. CSV origem = Kaggle oficial `olistbr/brazilian-ecommerce`
2. Transporte = **Streamable HTTP stateless (`POST /api/mcp`, SDK v2)** — diverge da `SPEC.md §2` (SSE). `SSEServerTransport` está em `@modelcontextprotocol/server-legacy` como deprecated; `Map<sessionId, transport>` em memória conflita com serverless.
3. Cliente inicial = OpenCode local + NVIDIA NIM (avaliar `meta/llama-3.3-70b-instruct` com tool-calling melhor que 3.1; ID canônico é `meta/...`, não `nvidia/...`)
4. Escopo MVP = **7 tools**: `list_datasets, get_table_schema, execute_sql_query, analyze_category_sales, get_order_funnel` (rename de `get_sales_funnel`), `get_order_status_distribution, analyze_category_reviews` (dedup, texto não-confiável). Extensão Fase 2: `analyze_reviews_for_order`.
5. Tabelas = 7 (`orders, order_items, products, customers, reviews` + `order_payments, sellers`; `geolocation` fora).
6. Auth MVP = `Authorization: Bearer <MCP_API_KEY>` via módulo oficial (`requireBearerAuth`); dataset público, risco é abuso de computação. Sem OAuth no MVP.
7. Licença (bloqueante): dataset Olist é **CC BY-NC-SA 4.0** — republicar exige atribuição + NC + ShareAlike. Resolver antes do `push data/` (ver §Fase 1).

Sugestões incorporadas (37):
S1–S15, N1–N4, S20–S21 (base anterior) + 22 fronteira engine-level + 23 runtime `/tmp`+catalog + 24 bundle local (sem Cloudflare) + 25 truncamento 101 + 26 `isError` + 27 memória/concorrência + 28 `opencode.json`/`{env}`+modelo + 29 `serverExternalPackages` + 30 stack oficial + 31 timestamps naive + 32 reviews de volta (7 tools) + 33 payments/sellers + 34 category enum + 35 armadilhas Olist + 36 funil sargable + 37 licença.

Divergências explícitas da SPEC: transporte (SSE→Streamable HTTP), `analyze_product_reviews` original removida (substituída por versão com dedup), `get_sales_funnel` redefinida como funil temporal (rename `get_order_funnel`), `maxDuration` como SLO, +2 tabelas além das 5.

---

## 1. Objetivo e Arquitetura Alvo

Expor dataset Olist via MCP Serverless (Next.js + DuckDB + Parquet) para agentes LLM.

```
                    ┌─────────────────────────┐
                    │       OpenCode + LLM     │
                    └────────────┬────────────┘
                                 │
                         Streamable HTTP
                          + Bearer auth
                                 │
                    ┌────────────▼────────────┐
                    │    Next.js / Vercel     │
                    │    stateless MCP        │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │       MCP Server        │
                    │ discovery + semânticas  │
                    │ + safe SQL tool          │
                    └────────────┬────────────┘
                                 │
                    SQL policy (UX) + engine
                                 │
                    ┌────────────▼────────────┐
                    │         DuckDB           │
                    │ READ_ONLY + allowlist    │
                    │ + locked config          │
                    └────────────┬────────────┘
                                 │
                          HTTP Range / HTTPS
                          (ou bundle local)
                                 │
                    ┌────────────▼────────────┐
                    │   Parquet dataset       │
                    │ GitHub / CDN (R2 fora)  │
                    └─────────────────────────┘
```

Princípios: stateless por request (fresh `McpServer`, sem `Map`); LLM só vê `VIEWs`; `description` é prompt, nunca boundary; **fronteira real é engine** (`allowed_directories` + `enable_external_access=false` + `lock_configuration`), regex é UX; endpoint sempre exige Bearer.

---

## 2. Fases

### Fase 0A — Architecture Spikes (poucas horas, go/no-go)

| Gate | Go quando |
|------|-----------|
| A MCP | Inspector + OpenCode fazem `list_tools` e `call_tool` em `POST /api/mcp` |
| B DuckDB | native binding + `VIEW` + `httpfs` + `READ_ONLY` funcionam na Vercel |
| B2 WASM | benchmark registrado; caminho de fallback conhecido |
| C Data | `Range` funciona e latência fica dentro do SLO |
| D Security | matriz de ataques passa (catálogo + filesystem/rede; engine-level) |
| E Auth | sem token → 401, inválido → 401, sem executar tool |

Regra: **qualquer Gate = FAIL → não seguir** (pivot ou abort).

- **Spike A — MCP + stack (N4 + item 30):** checklist — (1) preferir **SDK v2 oficial** (`createMcpHandler` em `@modelcontextprotocol/server` + `requireBearerAuth`/`toNodeHandler` em `@modelcontextprotocol/express|node`); `mcp-handler` comunitário só se faltar algo (dual 2025/2026, conveniência Next) — resolve bus-factor; (2) `inputSchema` é `z.object({...})` full Standard Schema (não `ZodRawShape`); confirmar com `list→call` real; (3) `pnpm why zod` + pin exato (mismatch quebra silenciosamente); Node 20+.
- **Spike B — DuckDB + runtime (22/23):** `vercel build` (tamanho, `linux-x64`, `serverExternalPackages` top-level — Next 15+, confirmar versão instalada); assert de 1 min: `:memory:` abre `READ_ONLY`? (suspeito que não — por isso **`/tmp` é caminho principal, não fallback**); gerar `catalog.duckdb` no build só com views (URLs pinadas por SHA) → bundle → abrir `READ_ONLY` direto (elimina `CREATE VIEW`/cold-start); `INSTALL httpfs` em Lambda = `/tmp` + rede no cold-start — medir no Gate B ou embutir extensão; confirmar `LOAD httpfs`/`SET` funcionam em read-only. Lifecycle (N3): **singleton lazy por lambda + conexão por request**.
- **Spike B2 — WASM 30–60min:** nativo x `@duckdb/duckdb-wasm` (latência p50, bytes/full-download #2153, memória, bundle, CORS). Contingência passa a ser: **A remoto → B bundle local (item 24) → C WASM**.
- **Spike C — data path (N1 + 24):** `raw` x jsDelivr pinado (`@<sha>`, nunca `@main`); teste `read_parquet('https://.../orders/*.parquet')` — **assumir falha** (sem listing); default **arquivo único por tabela** (`data/<table>/part-0000.parquet`, Olist ~3–12MB); crescimento via `src/generated/manifest.ts` (lista explícita, sem glob). Medir **bundle local x remoto** (latência, bundle, cold-start) — bundle local (`allowed_directories=['/var/task/data']`) é o Plano B antes do WASM (elimina CDN/httpfs/SSRF; perde storage desacoplado).
- **Spike D — security engine-level (22):** ordem de init: `LOAD httpfs` + criar views → `SET allowed_directories=['<PARQUET_BASE_URL>']` → `SET enable_external_access=false` → `SET lock_configuration=true` (+ `autoinstall/autoload_known_extensions=false`, `allow_community_extensions=false`). Testar se prefixo `https://` funciona em `allowed_directories`; matriz 2 categorias; replacement scan (`FROM '/path'`, `read_text`, aspas) deve falhar na engine mesmo burlando regex.
- **Spike E — Auth:** `requireBearerAuth` oficial; 401/401 sem oracle; SQL policy mantida mesmo autenticado. Rate-limit distribuído = follow-up.

### Fase 0B — Scaffolding
1. `create-next-app --typescript --app`; `strict + noUncheckedIndexedAccess`.
2. Deps pinadas na Spike A (oficial primeiro).
3. Estrutura:
```
app/api/mcp/route.ts          # POST /api/mcp — createMcpHandler oficial + requireBearerAuth, maxDuration=60 (SLO)
lib/mcp/server.ts             # factory + 7 tools MVP
lib/mcp/descriptions.ts       # versionadas
lib/mcp/auth.ts               # wrapper requireBearerAuth(MCP_API_KEY)
lib/db/duckdb.ts              # singleton lazy READ_ONLY (/tmp+catalog), LOAD, allowlist+lock, interrupt, semáforo
lib/db/parquet.ts             # PARQUET_BASE_URL + VIEW_DDL(explícito) + manifest
lib/db/metadata.ts            # pk + relationships + semantic_notes (itens 35)
lib/db/guard.ts               # UX fail-fast + wrapping LIMIT 101
lib/db/serialize.ts           # BIGINT/DECIMAL/DATE/NaN + TIMESTAMP naive sem Z (item 31)
lib/db/categories.ts          # z.enum ~71 categorias gerado pelo ETL (item 34)
src/generated/manifest.ts     # emitido pelo ETL
data/<table>/part-0000.parquet# + data/LICENSE-ATTRIBUTION.md (item 37)
scripts/etl_olist.py
opencode.json                 # Streamable + {env:MCP_API_KEY} + meta/llama-3.3-70b-instruct (avaliar)
```
4. `export const maxDuration = 60; dynamic='force-dynamic'; runtime='nodejs';` (SLO; teto Hobby 300s).
5. `next.config`: `serverExternalPackages: ['@duckdb/node-api','@duckdb/node-bindings']` top-level (confirmar versão).

### Fase 1 — Pipeline de Dados (Kaggle → Parquet + licença)
1. Auth Kaggle → `olistbr/brazilian-ecommerce` → 9 CSVs → **7 tabelas**: 5 originais + `order_payments` (`payment_value` = receita real, `payment_installments`, `payment_type`) + `sellers`; `geolocation` fora. **Mapear todas as colunas de `orders`** (não podar; incluir `order_approved_at`).
2. `data/<table>/part-0000.parquet` (`TIMESTAMP` naive, `UTINYINT`, `snappy`, `ORDER BY` PK) + `manifest.ts` + `categories.ts` (~71 traduzidas). Log counts + MB; cada arquivo <=20MB.
3. **Licença (bloqueante, item 37):** `data/LICENSE-ATTRIBUTION.md` (CC BY-NC-SA 4.0, atribuição Olist, NC, ShareAlike) + nota `README`; checar NC antes do push (se comercial, repo de dados separado com mesma licença).
4. Critérios: counts ok; glob HTTPS falha como esperado; manifest explícito ok.

### Fase 2 — DuckDB Serverless
1. `parquet.ts`: `PARQUET_BASE_URL` (jsDelivr pinado default, fallback raw; bundle local como Plano B); `VIEW_DDL(manifest)` com lista explícita.
2. `duckdb.ts` (itens 22/23/27/N3): singleton lazy + conexão/request + **semáforo de concorrência (1–2)** (Fluid compartilha instância; limite por instância); `catalog.duckdb` de build aberto `READ_ONLY` (ou `/tmp` RW→RO); `LOAD httpfs`; views; `SET allowed_directories → enable_external_access=false → lock_configuration=true`; `SET memory_limit='512MB'` (**escolha**, Hobby tem 2GB/1vCPU — não obrigação) + `threads=1` (1 vCPU); timeout real `setTimeout(() => conn.interrupt(), 25_000)` + `finally`; teto de bytes.
3. `serialize.ts`: `BIGINT→number/string; DECIMAL→number; DATE→ISO; TIMESTAMP naive→ISO sem Z nem offset (horário local Olist); NaN/Infinity→null`.

### Fase 3 — Servidor MCP (7 tools MVP + 1 extensão)
`registerTool(name, {description, inputSchema: z.object(...)}, handler)`; `createMcpHandler` oficial + Bearer; fresh por request (`GET/DELETE` → 405).
1. `list_datasets` — 7 tabelas, sem DB.
2. `get_table_schema(table)` — `DESCRIBE` + `{columns, primary_key, relationships, semantic_notes}` com armadilhas (item 35): `customer_id`≠pessoa (`customer_unique_id` sim); `order_item_id`=linha; categoria NULL; N reviews/pedido; cobertura 2016-esparso/2017–ago2018; right-censoring; `approved≈invoiced`; `product_revenue` vs `gross`.
3. `execute_sql_query(query)` — dialeto + tabelas + exemplos; handler: auth → guard(UX) → wrapping 101 → engine allowlist.
4. `analyze_category_sales(category: CategoryEnum)` — `{order_count, item_count, product_revenue: SUM(price), freight_total, gross_with_freight}` com binding; sem match → sugestões.
5. `get_order_funnel(year)` — 4 estágios aninhados (monotônico por construção), **predicado sargable** (item 36): `purchase >= 'YYYY-01-01' AND < 'YYYY+1-01-01'` + validação 2016–2018 com `isError` útil:
```sql
SELECT COUNT(*) AS purchased,
 COUNT(*) FILTER (WHERE order_approved_at IS NOT NULL) AS approved,
 COUNT(*) FILTER (WHERE order_approved_at IS NOT NULL AND order_delivered_carrier_date IS NOT NULL) AS shipped,
 COUNT(*) FILTER (WHERE order_approved_at IS NOT NULL AND order_delivered_carrier_date IS NOT NULL AND order_delivered_customer_date IS NOT NULL) AS delivered
FROM orders WHERE order_purchase_timestamp >= ? AND order_purchase_timestamp < ?;
```
6. `get_order_status_distribution(year)` — `GROUP BY order_status` mesma coorte (sargable).
7. `analyze_category_reviews(category: CategoryEnum)` (item 32) — dedup `DISTINCT (order_id, categoria)` antes do `AVG` + comentários como **texto não-confiável** (truncar/sanitizar, nunca instrução).
- Extensão Fase 2: `analyze_reviews_for_order(order_id)`.

### Fase 4 — Policy + Engine + Auth + Erros
1. Auth (`requireBearerAuth`) → 401/401.
2. Guard UX: single `SELECT|WITH` + blocklists (DDL + I/O) + `;` extra → `isError` legível (não barreira).
3. Wrapping (item 25): strip `;`/espaço + `SELECT * FROM (<q>\n) AS __mcp_result LIMIT 101` (`\n` anti-`--`); buscar 101 → devolver `{rows:100, row_count, truncated}`; description instrui não totalizar se `truncated`.
4. Engine: allowlist+lock+`READ_ONLY` como barreira; `512MB/threads=1/interrupt/semáforo/teto`.
5. Matriz de erros (item 26): parser/binder (`Did you mean`), policy, timeout → `isError:true` sanitizado (autocorreção via `get_table_schema`); só falha interna → protocolo/500 sem vazar URLs/paths.

### Fase 5 — Integração OpenCode + NIM
1. `opencode.json`: Streamable `http://localhost:3000/api/mcp`, header `Bearer {env:MCP_API_KEY}` (**nunca `${VAR}`**), modelo `meta/llama-3.3-70b-instruct` (ou mais novo com tool-calling; validar).
2. Roteiro: 401 sem token; `${VAR}` literal → 401 (distinguir no teste); tabelas→`list` (7); schema com relationships/notes; vendas (tripla); funil monotônico + right-censoring; reviews dedup; categoria typo → sugestões; ano fora de 2016–18 → `isError` útil.

### Fase 6 — Testes, Deploy, Docs
1. `vitest`: guard/UX, engine allowlist (replacement scan, `read_text`, aspas, substrings `r2/s3/http` sem falso-positivo em uso legítimo), `READ_ONLY`/lock, glob falha, manifest, serialização naive, auth, truncamento 101, `isError` (binder/timeout+segunda query rápida), funnel sargable, `revenue+freight==gross`, licença presente.
2. Deploy: `git tag data-v1`, pin SHA, `vercel --prod`, OpenCode remoto com Bearer.
3. `README.md`: arquitetura, ETL, MCP local, `PARQUET_BASE_URL`/pin, `MCP_API_KEY` + `{env}`, sales/funil/reviews/right-censoring, licença CC BY-NC-SA.

---

## 3. Riscos
Transporte/stack oficial; binding/`vercel build`; CDN/Range/glob; `READ_ONLY`/allowlist/lock; `/tmp`+catalog; memória 512MB+semáforo (Hobby 2GB); interrupt real; LLM/SQL+metadata+enum; abuso Bearer (rate-limit Fase 2); custo SLO 60s; jurídico NC.

---

## 4. Critérios de Aceite
- [ ] `pnpm build && pnpm test` verdes (gates A–E + matriz engine)
- [ ] 7 tools via Inspector + OpenCode/NIM com Bearer; sem/inválido → 401; `GET/DELETE` → 405
- [ ] `read_csv('/etc/passwd')`, `FROM 'https://evil'`, `COPY/ATTACH` falham na engine mesmo burlando regex
- [ ] Wrapping com `;`/`--` ok; `{rows,row_count,truncated}`; `isError` autocorrige
- [ ] Arquivo único + manifest; glob HTTPS falha esperado; `512MB/threads=1`; interrupt + 2ª query rápida
- [ ] Funil sargable monotônico <=60s; `revenue+freight==gross`; categoria typo sugere; ano inválido explica
- [ ] Timestamps sem `Z`; `{env}` (não `${}`); modelo `meta/...` com tool-calling; licença presente
