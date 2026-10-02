import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { CATEGORY_ENTRIES } from "@/lib/db/category-labels";
import { PRODUCT_CATEGORIES } from "@/lib/db/categories";
import { createOlistServer } from "@/lib/mcp/server";

type TextContent = { type: "text"; text: string };
type CallResult = { content: TextContent[]; isError?: boolean };

async function setup() {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createOlistServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "category-labels-test", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}

async function sales(client: Client, category: string) {
  return (await client.callTool({
    name: "analyze_category_sales",
    arguments: { category },
  })) as unknown as CallResult;
}

describe("de-para de categorias (rótulo amigável -> slug)", () => {
  it("cobre exatamente as 73 categorias, sem duplicatas", () => {
    const slugs = CATEGORY_ENTRIES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(slugs)).toEqual(new Set(PRODUCT_CATEGORIES));
    const labels = CATEGORY_ENTRIES.map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const e of CATEGORY_ENTRIES) {
      expect(e.label.trim().length).toBeGreaterThan(0);
      expect(e.label).not.toContain("_");
      expect(e.pt.trim().length).toBeGreaterThan(0);
    }
  });

  it("rótulo amigável resolve igual ao slug (dados reais)", async () => {
    const { client, server } = await setup();
    try {
      const bySlug = await sales(client, "bed_bath_table");
      const byLabel = await sales(client, "Cama, Mesa e Banho");
      expect(byLabel.isError).toBeFalsy();
      expect(byLabel.content[0]!.text).toBe(bySlug.content[0]!.text);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("nome PT e variação sem acento/maiúsculas resolvem", async () => {
    const { client, server } = await setup();
    try {
      for (const input of ["cama_mesa_banho", "BELEZA E SAUDE", "beleza_saude"]) {
        const res = await sales(client, input);
        expect(res.isError, input).toBeFalsy();
        const rows = (
          JSON.parse(res.content[0]!.text) as {
            rows: { order_count: number }[];
          }
        ).rows;
        expect(rows[0]!.order_count).toBeGreaterThan(0);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("typo sugere 'Rótulo (slug)' amigável", async () => {
    const { client, server } = await setup();
    try {
      const typo = await sales(client, "bed-bath");
      expect(typo.isError).toBe(true);
      const text = JSON.stringify(typo);
      expect(text).toContain("bed_bath_table");
      expect(text).toContain("Cama, Mesa e Banho");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
