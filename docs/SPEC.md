# Especificação Técnica e Funcional: Serverless Data Lakehouse MCP

## 1. Visão Geral do Projeto
Este documento detalha a arquitetura, o design funcional e os requisitos técnicos para a construção de um **Servidor Analítico MCP (Model Context Protocol) Serverless**. O sistema expõe o dataset público de e-commerce da Olist para Agentes de Inteligência Artificial (LLMs), permitindo consultas analíticas autônomas em linguagem natural. 

A arquitetura foi desenhada com foco em custo zero de infraestrutura, alta performance e design *Cloud-Native*, separando completamente a camada de armazenamento da camada de computação.

---

## 2. Arquitetura da Solução

A solução opera em quatro camadas desacopladas:

1. **Camada de Dados (Storage):** Arquivos colunares `.parquet` altamente compactados hospedados estaticamente em um repositório público do GitHub.
2. **Camada de Computação (Compute):** *Serverless Functions* na Vercel (Node.js) instanciando o DuckDB em memória sob demanda. O DuckDB utiliza a extensão `httpfs` para ler os arquivos Parquet via rede, processar as agregações e liberar a memória imediatamente após a resposta.
3. **Camada de Integração (API):** Endpoint construído em Next.js (TypeScript) implementando o SDK oficial do protocolo MCP. A comunicação com o cliente é feita via **SSE (Server-Sent Events)**.
4. **Camada Cliente (Orquestração LLM):** Aplicação consumidora (OpenCode no ambiente local ou Vercel AI SDK na nuvem) conectada aos modelos otimizados da **NVIDIA NIM** (ex: Llama 3.1 70B).

---

## 3. Especificação de Dados (Olist Parquet)

O dataset relacional será normalizado e convertido para `.parquet` no diretório `/data` do repositório:

* `orders.parquet`: IDs, status do pedido, timestamps de compra e entrega.
* `order_items.parquet`: Relação de itens por pedido, preço, valor do frete.
* `products.parquet`: Categoria do produto, dimensões físicas.
* `customers.parquet`: Localização geográfica do comprador (cidade, estado, CEP).
* `reviews.parquet`: Notas de satisfação (1-5) e comentários textuais.

---

## 4. Especificação Funcional (MCP Tools)

O servidor expõe ferramentas (Tools) padronizadas. A descrição de cada ferramenta serve como instrução (prompt) para o LLM.

### 4.1. Ferramentas de Descoberta (Discovery)
Permitem que o LLM entenda o ambiente antes de agir.

* **Tool:** `list_datasets`
  * **Parâmetros:** Nenhum
  * **Descrição para o LLM:** "Lista todas as tabelas de e-commerce disponíveis para consulta no banco de dados."
  * **Retorno:** Array JSON com nomes e propósitos das tabelas.

* **Tool:** `get_table_schema`
  * **Parâmetros:** `table_name` (string)
  * **Descrição para o LLM:** "Retorna o schema detalhado de uma tabela específica, incluindo nomes das colunas e tipos de dados. Use antes de escrever queries SQL."
  * **Retorno:** JSON estrutural (resultado do comando DESCRIBE do DuckDB).

### 4.2. Ferramenta de Execução (Core)
O motor principal de processamento de dados.

* **Tool:** `execute_sql_query`
  * **Parâmetros:** `query` (string)
  * **Descrição para o LLM:** "Executa uma instrução SQL analítica. O resultado é limitado automaticamente a 100 linhas."
  * **Retorno:** Array de objetos JSON (linhas resultantes).

### 4.3. Ferramentas Semânticas (Business Logic)
Abstrações de regras de negócio complexas.

* **Tool:** `analyze_product_reviews`
  * **Parâmetros:** `category` (string)
  * **Descrição para o LLM:** "Retorna a média de satisfação (1 a 5) e um sumário das avaliações recentes para uma categoria de produto específica."
  * **Retorno:** JSON com `avg_score` numérico e array `recent_comments`.

* **Tool:** `get_sales_funnel`
  * **Parâmetros:** `year` (string)
  * **Descrição para o LLM:** "Calcula as métricas do funil logístico, mostrando o volume de pedidos por status (criado, faturado, enviado, entregue) no ano especificado."
  * **Retorno:** JSON contendo contagem agregada por `order_status`.

---

## 5. Stack Tecnológico

* **Linguagem:** TypeScript (Strict mode) / Python (apenas para pipeline de dados)
* **Framework:** Next.js (App Router)
* **Protocolo:** `@modelcontextprotocol/sdk` (Transporte SSE)
* **Engine Analítica:** `duckdb-node`
* **LLM Provider:** API da NVIDIA NIM

---

## 6. Requisitos Não Funcionais e Segurança

1. **Prevenção contra Mutação (Read-Only):** O servidor deve validar via Regex se a `query` inicia obrigatoriamente com a cláusula `SELECT` ou `WITH`. Qualquer tentativa de injeção (`INSERT`, `DROP`, `UPDATE`) deve ser interceptada antes de atingir o DuckDB.
2. **Proteção de Contexto:** Injeção obrigatória e silenciosa da cláusula `LIMIT 100` em queries abertas para evitar estouro de tokens na resposta.
3. **Resiliência Serverless:** Configuração de `export const maxDuration = 60;` na rota da API para prevenir timeouts precoces no plano Hobby da Vercel durante agregações complexas.
