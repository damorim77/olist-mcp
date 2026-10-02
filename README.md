# olist-mcp — Serverless Data Lakehouse MCP (Olist)

Servidor MCP stateless (Streamable HTTP, SDK v2) que expõe o dataset público
de e-commerce da Olist para agentes LLM, rodando serverless na Vercel com
DuckDB sobre Parquet. Detalhes de arquitetura e decisões em `docs/PLAN.md`;
status executivo em `docs/PROGRESS.md`.

Produção: `https://olist-mcp.vercel.app/api/mcp` (exige
`Authorization: Bearer <MCP_API_KEY>`).

## 7 tools

| Tool | Uso |
|------|-----|
| `list_datasets` | 7 tabelas disponíveis |
| `get_table_schema` | colunas + pk + relacionamentos + notas semânticas (chame antes de JOINs) |
| `execute_sql_query` | SQL DuckDB read-only (`SELECT`/`WITH`, 1 instrução, ≤100 linhas, `truncated` quando corta; `isError` autocorrigível) |
| `analyze_category_sales` | `product_revenue` (=`SUM(price)`) + `freight_total` + `gross_with_freight`; categoria exata ou sugestões |
| `get_order_funnel` | funil `purchased→approved→shipped→delivered` por coorte 2016–2018 (monotônico; 2018 com right-censoring) |
| `get_order_status_distribution` | status final na coorte |
| `analyze_category_reviews` | satisfação de pedidos com a categoria (dedup; comentários = texto não-confiável) |

### Perguntas que ativam cada tool

| Pergunta em linguagem natural | Tool acionada |
|------|-----|
| "Quais dados estão disponíveis?" / "O que posso consultar?" | `list_datasets` |
| "Qual o schema de orders?" / "Como reviews se liga a pedidos?" | `get_table_schema` |
| "Top 5 categorias por receita em 2018?" / "Ticket médio por estado?" | `execute_sql_query` |
| "Vendas de bed_bath_table?" / "Quanto vendeu health_beauty?" | `analyze_category_sales` |
| "Funil de pedidos de 2017?" / "Quantos pedidos de 2018 foram entregues?" | `get_order_funnel` |
| "Distribuição de status em 2018?" / "Quantos cancelados em 2017?" | `get_order_status_distribution` |
| "Satisfação de bed_bath_table?" / "O que reclamam em furniture_decor?" | `analyze_category_reviews` |

Dicas: categoria precisa ser exata (`bed_bath_table`, não "cama e banho") —
com typo a tool sugere valores válidos; ano só 2016–2018; perguntas fora
dessas caixas (pagamentos, vendedores) o agente resolve combinando
`get_table_schema` + `execute_sql_query`; se vier `truncated: true`, peça
para refinar em vez de aceitar os 100 como total.

## Rodar local

```powershell
$env:MCP_API_KEY = "dev-key-123"   # qualquer valor; sem ela tudo dá 401
$env:OLIST_CSV_DIR = "C:\...\olist-csv"  # só p/ ETL
npm install
npm run dev                        # http://localhost:3000/api/mcp
```

Testes/build: `npm test`, `npm run typecheck`, `npm run build`.
Smoke ponta a ponta (precisa do dev rodando):
`$env:MCP_API_KEY="dev-key-123"; node scripts/smoke-mcp.mjs`.
No OpenCode, `opencode.json` já aponta p/ o local com `{env:MCP_API_KEY}`
(nunca `${VAR}` — vira literal e dá 401 falso).

## ETL (Fase 1)

`python scripts/etl_olist.py --csv-dir <9 CSVs do Kaggle olistbr/brazilian-ecommerce>`
gera `data/<tabela>/part-0000.parquet` + `src/generated/manifest.ts` +
`lib/db/categories.ts`. Timestamps naive (sem fuso); serialização ISO sem `Z`.

Dataset origem: [Brazilian E-Commerce Public Dataset by Olist (Kaggle)](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) — CC BY-NC-SA 4.0.

## Deploy (Vercel)

Push na `main` + `vercel deploy --prod` (sem auto-deploy por enquanto: git
nunca foi vinculado no dashboard). Envs: `MCP_API_KEY` (Secret) em Preview e
Production. Parquets vão no bundle (`outputFileTracingIncludes`); catálogo
DuckDB em `/tmp`, `READ_ONLY`, allowlist + config travada. Proteção SSO do
projeto desligada via API (`ssoProtection: null`) — o gate é o Bearer.

## Dados: licença (bloqueante)

`data/*` deriva do Brazilian E-commerce by Olist, **CC BY-NC-SA 4.0**
(ver `data/LICENSE-ATTRIBUTION.md`): atribuição + **uso não-comercial** +
mesma licença. Não usar este deploy/dados em contexto comercial.
