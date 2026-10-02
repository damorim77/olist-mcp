// Smoke test manual do caminho HTTP real (Streamable HTTP + Bearer).
// Uso: deixe `npm run dev` rodando e execute:
//   MCP_API_KEY=dev-key-123 node scripts/smoke-mcp.mjs [url]
// (No PowerShell: $env:MCP_API_KEY="dev-key-123"; node scripts/smoke-mcp.mjs)
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.argv[2] ?? "http://localhost:3000/api/mcp";
const key = process.env.MCP_API_KEY;
if (!key) {
  console.error("Defina MCP_API_KEY (a mesma do terminal do `npm run dev`).");
  process.exit(1);
}

// 1. Sem token → 401 (não executa nada).
const anon = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
console.log("sem token:", anon.status, anon.status === 401 ? "OK" : "FALHOU");

// 2. Com Bearer → client oficial no caminho HTTP real.
const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { authorization: `Bearer ${key}` } },
});
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const tools = (await client.listTools()).tools.map((t) => t.name);
console.log("tools:", tools.join(","));

const datasets = await client.callTool({ name: "list_datasets", arguments: {} });
console.log("list_datasets:", datasets.content[0].text.slice(0, 120), "...");

const funnel = await client.callTool({
  name: "get_order_funnel",
  arguments: { year: "2017" },
});
console.log("funnel2017:", funnel.content[0].text);

const drop = await client.callTool({
  name: "execute_sql_query",
  arguments: { query: "DROP TABLE orders" },
});
console.log("DROP isError:", drop.isError === true ? "OK" : "FALHOU");

await client.close();
console.log("SMOKE OK");
