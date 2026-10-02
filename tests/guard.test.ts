import { describe, expect, it } from "vitest";
import { guardQuery } from "@/lib/db/guard";

describe("guardQuery (UX; barreira real é a engine)", () => {
  it("aceita SELECT simples e embrulha com LIMIT 101", () => {
    const r = guardQuery("SELECT * FROM orders");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.wrapped).toBe(
        "SELECT * FROM (\nSELECT * FROM orders\n) AS __mcp_result LIMIT 101",
      );
    }
  });

  it("aceita WITH e remove ; final", () => {
    const r = guardQuery("WITH a AS (SELECT 1 AS x) SELECT * FROM a;");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.wrapped.endsWith(") AS __mcp_result LIMIT 101")).toBe(true);
      expect(r.wrapped).not.toContain(";;");
    }
  });

  it("rejeita DDL/DML e I/O externo com isError legível", () => {
    for (const q of [
      "DROP TABLE orders",
      "INSERT INTO orders SELECT 1",
      "SELECT * FROM read_parquet('https://evil/x.parquet')",
      "COPY orders TO '/tmp/x.csv'",
      "ATTACH '/tmp/a.db'",
      "SELECT * FROM orders; DROP TABLE orders",
      "DELETE FROM orders",
    ]) {
      const r = guardQuery(q);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.hint.length).toBeGreaterThan(0);
    }
  });

  it("trailing -- não engole o fecha-parêntese (\\n protetor)", () => {
    const r = guardQuery("SELECT 1 -- total");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.wrapped).toContain("\n) AS __mcp_result");
  });

  it("não deixa string 'r2d2' inocente passar batida? (documenta limite da UX)", () => {
    // Substring em literal é removida antes da checagem — UX, engine decide.
    const r = guardQuery("SELECT 'r2d2' AS robot FROM orders");
    expect(r.ok).toBe(true);
  });
});
