import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { createOlistServer } from "@/lib/mcp/server";

type TextContent = { type: "text"; text: string };
type CallResult = { content: TextContent[]; isError?: boolean };

async function setup() {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createOlistServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "tools-test", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}

function json(result: CallResult) {
  return JSON.parse(result.content[0]!.text) as Record<string, never>;
}

describe("7 tools MVP (Fases 3–4, dados reais)", () => {
  it("lista as 7 tools", async () => {
    const { client, server } = await setup();
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toEqual([
        "list_datasets",
        "get_table_schema",
        "execute_sql_query",
        "analyze_category_sales",
        "get_order_funnel",
        "get_order_status_distribution",
        "analyze_category_reviews",
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("get_table_schema orders → pk + relationships + notes", async () => {
    const { client, server } = await setup();
    try {
      const res = (await client.callTool({
        name: "get_table_schema",
        arguments: { table_name: "orders" },
      })) as unknown as CallResult;
      const s = json(res) as unknown as {
        primary_key: string[];
        relationships: { to: string }[];
        semantic_notes: string[];
        columns: { column_name: string }[];
      };
      expect(s.primary_key).toEqual(["order_id"]);
      expect(s.relationships.map((r) => r.to)).toContain("customers");
      expect(s.columns.map((c) => c.column_name)).toContain(
        "order_approved_at",
      );
      expect(s.semantic_notes.join(" ")).toContain("customer_unique_id");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("execute_sql_query: válido, truncado e isError (DROP + coluna ruim)", async () => {
    const { client, server } = await setup();
    try {
      const full = (await client.callTool({
        name: "execute_sql_query",
        arguments: { query: "SELECT * FROM orders" },
      })) as unknown as CallResult;
      const env = json(full) as unknown as {
        rows: unknown[];
        row_count: number;
        truncated: boolean;
      };
      expect(env.row_count).toBe(100);
      expect(env.truncated).toBe(true);

      const drop = (await client.callTool({
        name: "execute_sql_query",
        arguments: { query: "DROP TABLE orders" },
      })) as unknown as CallResult;
      expect(drop.isError).toBe(true);

      const bad = (await client.callTool({
        name: "execute_sql_query",
        arguments: { query: "SELECT nope FROM orders" },
      })) as unknown as CallResult;
      expect(bad.isError).toBe(true);
      expect(JSON.stringify(bad)).toContain("get_table_schema");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("analyze_category_sales: tripla consistente + sugestão no typo", async () => {
    const { client, server } = await setup();
    try {
      const res = (await client.callTool({
        name: "analyze_category_sales",
        arguments: { category: "bed_bath_table" },
      })) as unknown as CallResult;
      const s = json(res) as unknown as {
        rows: {
          order_count: number;
          product_revenue: number;
          freight_total: number;
          gross_with_freight: number;
        }[];
      };
      const row = s.rows[0]!;
      expect(row.order_count).toBeGreaterThan(0);
      expect(
        Math.abs(
          row.product_revenue + row.freight_total - row.gross_with_freight,
        ),
      ).toBeLessThan(0.01);

      const typo = (await client.callTool({
        name: "analyze_category_sales",
        arguments: { category: "bed-bath" },
      })) as unknown as CallResult;
      expect(typo.isError).toBe(true);
      expect(JSON.stringify(typo)).toContain("bed_bath_table");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("get_order_funnel 2017 monotônico; ano inválido explica", async () => {
    const { client, server } = await setup();
    try {
      const res = (await client.callTool({
        name: "get_order_funnel",
        arguments: { year: "2017" },
      })) as unknown as CallResult;
      const row = (
        json(res) as unknown as {
          rows: {
            purchased: number;
            approved: number;
            shipped: number;
            delivered: number;
          }[];
        }
      ).rows[0]!;
      expect(row.purchased).toBe(45101);
      expect(
        row.purchased >= row.approved &&
          row.approved >= row.shipped &&
          row.shipped >= row.delivered,
      ).toBe(true);

      const bad = (await client.callTool({
        name: "get_order_funnel",
        arguments: { year: "2020" },
      })) as unknown as CallResult;
      expect(bad.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("status_distribution + category_reviews (dedup, comentários seguros)", async () => {
    const { client, server } = await setup();
    try {
      const dist = (await client.callTool({
        name: "get_order_status_distribution",
        arguments: { year: "2018" },
      })) as unknown as CallResult;
      const rows = (
        json(dist) as unknown as { rows: { order_status: string }[] }
      ).rows;
      expect(rows[0]!.order_status).toBe("delivered");

      const rev = (await client.callTool({
        name: "analyze_category_reviews",
        arguments: { category: "bed_bath_table" },
      })) as unknown as CallResult;
      expect(rev.isError).toBeFalsy();
      const r = json(rev) as unknown as {
        rows: { avg_score: number }[];
        recent_comments: { comment: string }[];
        warning: string;
      };
      expect(r.rows[0]!.avg_score).toBeGreaterThan(1);
      expect(r.rows[0]!.avg_score).toBeLessThanOrEqual(5);
      expect(r.warning).toContain("não-confiável");
      for (const c of r.recent_comments) {
        expect(c.comment.length).toBeLessThanOrEqual(200);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
