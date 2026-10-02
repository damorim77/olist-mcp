import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { describe, expect, it } from "vitest";
import {
  QueryTimeoutError,
  describeView,
  runReadQuery,
} from "@/lib/db/duckdb";
import { guardQuery } from "@/lib/db/guard";
import { toEnvelope } from "@/lib/db/serialize";

// Fase 2 — camada DuckDB contra Parquet real. Estes testes PULAM o guard de
// propósito onde indicado: provam que a engine barra sozinha (Spike D).
describe("duckdb layer (Fase 2)", () => {
  it("views leem counts reais via caminho completo guard→engine→envelope", async () => {
    const g = guardQuery("SELECT count(*) AS n FROM orders");
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const res = await runReadQuery(g.wrapped);
    const env = toEnvelope(res.columnNames, res.rows);
    expect(env.truncated).toBe(false);
    // COUNT(*) volta BigInt → serialize converte p/ number (seguro aqui)
    expect(env.rows).toEqual([{ n: 99441 }]);
  });

  it("allowlist: arquivo DENTRO de data/ lê; FORA é bloqueado (Spike D)", async () => {
    const decoy = join(tmpdir(), `decoy-${Date.now()}.parquet`);
    const setup = await DuckDBInstance.create(":memory:");
    const sc = await setup.connect();
    try {
      await sc.runAndReadAll(
        `COPY (SELECT 1 AS x) TO '${decoy}' (FORMAT PARQUET);`,
      );
    } finally {
      sc.disconnectSync();
      setup.closeSync();
    }
    // Dentro do allowlist (bypass guard p/ testar só a engine):
    const { resolve } = await import("node:path");
    const insidePath = resolve(
      process.cwd(),
      "data",
      "orders",
      "part-0000.parquet",
    );
    const inside = await runReadQuery(
      `SELECT * FROM read_parquet('${insidePath}') LIMIT 1;`,
    );
    expect(inside.rows.length).toBe(1);
    // Fora do allowlist → engine recusa:
    await expect(
      runReadQuery(`SELECT * FROM read_parquet('${decoy}');`),
    ).rejects.toThrow();
    const { unlink } = await import("node:fs/promises");
    await unlink(decoy);
  });

  it("catálogo READ_ONLY: CREATE/DROP falham", async () => {
    await expect(
      runReadQuery("CREATE VIEW v_x AS SELECT 1 AS one;"),
    ).rejects.toThrow();
    await expect(runReadQuery("DROP VIEW orders;")).rejects.toThrow();
  });

  it("timeout real: cartesiana interrompe + 2ª query rápida (N3)", async () => {
    await expect(
      runReadQuery(
        "SELECT count(*) FROM range(200000000) a, range(200000000) b;",
        300,
      ),
    ).rejects.toBeInstanceOf(QueryTimeoutError);
    // Prova de instância livre:
    const fast = await runReadQuery("SELECT 1 AS one;");
    expect(fast.rows).toEqual([[1]]);
  }, 60_000);

  it("describeView orders → 8 colunas", async () => {
    const cols = await describeView("orders");
    expect(cols.map((c) => c.column_name)).toEqual([
      "order_id",
      "customer_id",
      "order_status",
      "order_purchase_timestamp",
      "order_approved_at",
      "order_delivered_carrier_date",
      "order_delivered_customer_date",
      "order_estimated_delivery_date",
    ]);
  });
});
