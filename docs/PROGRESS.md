# Progresso da Implementação — Serverless Data Lakehouse MCP (Olist)

Fonte de verdade do escopo: `docs/PLAN.md` (37 itens). Este arquivo é o **status executivo** — atualizar a cada fase/gate.

Última atualização: 2026-10-02 — deploy em produção validado (smoke verde na linux-x64).

## Legenda
- `[ ]` pendente · `[~]` em andamento · `[x]` concluído · `[!]` bloqueado/FAIL (não avançar sem pivot)

## Gates 0A (regra: qualquer FAIL → não seguir)
| Gate | Critério | Status | Evidência |
|------|----------|--------|-----------|
| A MCP | Inspector + OpenCode fazem `list_tools`/`call_tool` em `POST /api/mcp` | [~] | HTTP real GO (`scripts/smoke-mcp.mjs`) + **Inspector v2.9.0 GO**: servidor `olist-local` (streamable-http, era Modern, Bearer) conectado em 94ms, 7 tools listadas, `get_order_funnel(2017)` → 45101→45029→43943→43411. Achado: Inspector usa era Legacy por padrão — setar Modern p/ spec 2026-07-28. Falta: OpenCode |
| B DuckDB | binding + `VIEW` + `httpfs` + `READ_ONLY` na Vercel (`serverExternalPackages`, `/tmp`/`catalog.duckdb`, `512MB/threads=1`) | [x] | Local + Vercel GO. Achados prod: `libduckdb.so` exige `outputFileTracingIncludes` do binding linux-x64; Lambda sem HOME → `home_directory`+`extension_directory` em `/tmp`; `LOAD/SET` funcionam em RO; `INSTALL` com rede ok no cold start |
| B2 WASM | benchmark registrado; fallback conhecido | [ ] | Contingência reordenada: B=bundle local antes de C=WASM |
| C Data | `Range` ok, latência no SLO; glob HTTPS falha como esperado; manifest explícito | [x] | Estratégia bundle-local no v1 (Parquets no bundle, sem CDN): funil <2s em prod. Spike jsDelivr/`Range` remoto fica p/ evolução |
| D Security | matriz 2 categorias passa na engine (`allowed_directories` + `enable_external_access=false` + `lock`) | [x] | Local GO + prod GO (`DROP`→`isError` no smoke; allowlist cobre `data/` do bundle) |
| E Auth | sem/inválido → 401, sem executar tool (`{env}` não `${}`) | [x] | Local + prod GO (401/401 idênticos, GET/DELETE 405). `MCP_API_KEY` como Secret em Preview e Production |

## Fases
- [x] **0B Scaffolding** — Next.js 16.3.8 + TS strict (`strict` + `noUncheckedIndexedAccess` preservados pós-build), deps oficiais pinadas (`@modelcontextprotocol/server@2.2.0`, `zod@4.6.5`, `@duckdb/node-api@1.5.6-r.1`), `POST /api/mcp` + Bearer simples (oficial `requireBearerAuth` avaliado e descartado: exige exp/scopes), `serverExternalPackages` top-level, `maxDuration=60` (SLO)
- [x] **0A Spike A + Gate A** — HTTP real GO (smoke) + Inspector v2.9.0 GO (`olist-local`, era Modern, Bearer; funil 2017 ok). Falta: OpenCode
- [x] **5–6 Deploy + docs** — GitHub (`damorim77/olist-mcp`, público NC ok) + Vercel prod `https://olist-mcp.vercel.app/api/mcp` (smoke verde: 401, 7 tools, funil, DROP→isError); `ssoProtection` desligada via API; sem auto-deploy (vincular git no dashboard); `README.md` criado
- [x] **1 ETL** — Kaggle → 7 tabelas em `data/<table>/part-0000.parquet` (todos ≤10.2MB; counts validados via DuckDB; funil 2017 monotônico 45101→45029→43943→43411) + `src/generated/manifest.ts` + `lib/db/categories.ts` (73 valores: 71 EN + 2 PT sem tradução) + `data/LICENSE-ATTRIBUTION.md` (CC BY-NC-SA 4.0; NC ainda p/ checar antes do push)
- [x] **2 DuckDB** — `lib/db/duckdb.ts` (singleton lazy `/tmp`+catalog por base, conexão/request + semáforo 2, `LOAD`→`512MB/threads=1`→allowlist→`external_access=false`→`lock`, `interrupt()` 25s + 2ª query rápida) + `lib/db/parquet.ts` (lista explícita do manifest, sem glob). Validado contra Parquet real.
- [x] **3 MCP (7 tools MVP)** — `lib/mcp/server.ts` (`list, schema, execute, category_sales (tripla), order_funnel (sargable aninhado), status_distribution, category_reviews (dedup + comentários sanitizados ≤200 + warning)`; `category` com sugestões; ano 2016–18 com `isError` útil. `tests/tools.test.ts` 6/6 em dados reais (funil 2017=45101 monotônico, `revenue+freight==gross`, typo sugere, truncamento 100+flag). Ext. Fase 2 pendente: `reviews_for_order`
- [x] **4 Policy/Erros** — guard UX + engine barreira; `isError:true` sanitizado (binder c/ hint `get_table_schema`, policy, timeout) vs protocolo/500; erro de spread `table` corrigido. Bug de encoding do ETL (cp1252→UTF-8) encontrado pelo build e corrigido (ETL re-rodado).
- [ ] **5 Integração** — OpenCode Streamable + Bearer `{env:MCP_API_KEY}`, modelo `meta/...` (avaliar 3.3+ tool-calling); roteiro + armadilhas Olist
- [ ] **6 Testes/Deploy/Docs** — `vitest` (matriz, 101, interrupt+2ª query, funnel monotônico, `revenue+freight==gross`, licença) → `git tag data-v1` → `vercel --prod` → `README.md`

## Riscos abertos
- `:memory:` READ_ONLY (assert Spike B) · prefixo `https://` em `allowed_directories` (Spike D) · `INSTALL httpfs` em Lambda (medir/embutir) · `mcp-handler` vs oficial (Spike A) · NC da licença · `${VAR}` vs `{env}` · `z.object` vs raw shape + `pnpm/npm why zod`

## GitHub
- [x] Repo `damorim77/olist-mcp` (público, NC confirmado) com push da main (`9fce0ff` + `6cb9c52`); Parquets + `data/LICENSE-ATTRIBUTION.md` publicados.

## Log (acrescentar por data)
- 2026-10-02: documento criado; nenhuma fase iniciada. Próximo: 0B scaffolding + Spike A.
- 2026-10-02: 0B concluída (`npm run typecheck` + `npm run build` verdes); Spike A implementada (`lib/mcp/server.ts`, `lib/mcp/auth.ts`, `app/api/mcp/route.ts`, `tests/spike-a.test.ts` 4/4 verdes). Decisões registradas: Bearer simples em vez de `requireBearerAuth`; `@modelcontextprotocol/client@2.2.0` como devDep de teste; teste HTTP usa envelope legado rejeitado corretamente (400) — Gate A via in-memory. Próximo: Spike B (DuckDB binding + READ_ONLY/VIEW + httpfs).
- 2026-10-02: Spike B local verde (`tests/spike-b.test.ts` 8/8; total 12/12). Achados registrados no teste: `:memory:` READ_ONLY impossível (erro de catálogo) → `/tmp`+`catalog.duckdb` vira caminho principal; `INSTALL httpfs` funciona (~680ms, depois cache em `~/.duckdb`); `conn.interrupt` existe; `instance.closeSync()` obrigatório antes de reabrir arquivo. Próximo: `lib/db/*` (guard + serialize + metadata + duckdb layer) com testes; Fase 1 ETL aguardando credenciais Kaggle.
- 2026-10-02: núcleo `lib/db` pronto e verde (total 22/22 + typecheck + build): `guard.ts` (fail-fast UX + wrapping `LIMIT 101` com `\n` anti-`--`, strip `;`), `serialize.ts` (BIGINT/NaN/Date, TIMESTAMP naive sem `Z`, envelope `{rows,row_count,truncated}`), `metadata.ts` (7 tabelas: pk + relationships + armadilhas Olist). Próximo: `lib/db/duckdb.ts` + `parquet.ts` (precisam de Parquet real → Fase 1 ETL com credenciais Kaggle) ou synthetic-parquet primeiro.
- 2026-10-02: Fase 1 concluída (`scripts/etl_olist.py` + `requirements.txt`; `data/*/part-0000.parquet` 7 tabelas, max 10.2MB; reviews=99224 — contagem ingênua por linhas dava 104719 por quebras em comentários; multi-review=547; 610 categorias NULL; 2 categorias sem tradução PT mantidas; `COUNT(*)` volta BigInt — confirma `serialize.ts`). Próximo: Fase 2 (`duckdb.ts` singleton `/tmp`+catalog + allowlist/lock + `parquet.ts` manifest) e Fase 3 (7 tools).
- 2026-10-02: chat `/chat` redesenhado (2 colunas: apresentação + chat; loading com dots/`aria-busy`; resposta só-texto) + toggle dark/light (`data-theme`, `localStorage`, `prefers-color-scheme`) + de-para de categorias (`lib/db/category-labels.ts`: 73 entradas slug/PT/rótulo, pares PT validados contra o Parquet real; `resolveCategory` aceita slug, PT e rótulo sem acento; sugestões no formato `Rótulo (slug)`; SYSTEM do chat orienta repassar e responder com nome amigável). Total 37/37 + typecheck + build verdes.
