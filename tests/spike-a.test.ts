import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/mcp/route";
import { createOlistServer } from "@/lib/mcp/server";

// HTTP-level: legado continua rejeitado no protocolo moderno; o envelope
// 2026-07-28 exige chaves por-request que só o client oficial monta.
// Qualquer POST malformado deve ao menos NÃO executar tool e NÃO vazar 500.
const INIT_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {},
});

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        ...headers,
      },
      body,
    }),
  );
}

describe("Spike A — Gates A (MCP) e E (Auth)", () => {
  it("sem token → 401 e não executa tool", async () => {
    const res = await post(INIT_BODY);
    expect(res.status).toBe(401);
  });

  it("token inválido → 401 idêntico", async () => {
    const res = await post(INIT_BODY, {
      authorization: "Bearer chave-errada",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("Gate A: client oficial lista e chama tools (in-memory)", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createOlistServer();
    await server.connect(serverTransport);
    const client = new Client({ name: "spike-a", version: "0.0.0" });
    await client.connect(clientTransport);

    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name);
    expect(names).toEqual([
      "list_datasets",
      "get_table_schema",
      "execute_sql_query",
      "analyze_category_sales",
      "get_order_funnel",
      "get_order_status_distribution",
      "analyze_category_reviews",
    ]);

    const datasets = await client.callTool({
      name: "list_datasets",
      arguments: {},
    });
    const text = JSON.stringify(datasets);
    for (const t of [
      "orders",
      "order_items",
      "products",
      "customers",
      "reviews",
      "order_payments",
      "sellers",
    ]) {
      expect(text).toContain(t);
    }
    await client.close();
    await server.close();
  });

  it("GET/DELETE → 405 (stateless, sem SSE)", async () => {
    expect((await GET()).status).toBe(405);
    const { DELETE } = await import("@/app/api/mcp/route");
    expect((await DELETE()).status).toBe(405);
  });
});
