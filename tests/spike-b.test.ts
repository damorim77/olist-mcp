import { DuckDBInstance } from "@duckdb/node-api";
import { describe, expect, it } from "vitest";

// Spike B — Gate B (DuckDB). Sinais locais; Vercel (linux-x64) fica p/ deploy.
// Cada teste registra o comportamento real em vez de assumir (PLAN §0A).
describe("Spike B — Gate B (DuckDB)", () => {
  it("binding carrega e SELECT básico funciona", async () => {
    const instance = await DuckDBInstance.create(":memory:");
    const conn = await instance.connect();
    try {
      const result = await conn.runAndReadAll("SELECT 1 AS one;");
      const rows = result.getRows();
      expect(rows).toEqual([[1]]);
    } finally {
      conn.disconnectSync();
    }
  });

  it("assert :memory: + READ_ONLY (pode falhar — resultado é o dado)", async () => {
    let opened: string;
    try {
      const instance = await DuckDBInstance.create(":memory:", {
        access_mode: "READ_ONLY",
      } as never);
      const conn = await instance.connect();
      try {
        await conn.runAndReadAll("SELECT 1;");
        opened = "opened-ok";
      } finally {
        conn.disconnectSync();
      }
    } catch (error) {
      opened = `failed: ${(error as Error).message.slice(0, 200)}`;
    }
    console.log("READ_ONLY :memory: =>", opened);
    // Sem assert de sucesso: o valor observado decide /tmp vs :memory:.
    expect(typeof opened).toBe("string");
  });

  it("CREATE VIEW em instância READ_WRITE + SELECT na view", async () => {
    const instance = await DuckDBInstance.create(":memory:");
    const conn = await instance.connect();
    try {
      await conn.runAndReadAll(
        "CREATE VIEW v_spike AS SELECT 42 AS answer;",
      );
      const result = await conn.runAndReadAll("SELECT * FROM v_spike;");
      expect(result.getRows()).toEqual([[42]]);
    } finally {
      conn.disconnectSync();
    }
  });

  it("CREATE VIEW em instância READ_ONLY (decide fallback /tmp+catalog)", async () => {
    let outcome: string;
    try {
      const instance = await DuckDBInstance.create(":memory:", {
        access_mode: "READ_ONLY",
      } as never);
      const conn = await instance.connect();
      try {
        await conn.runAndReadAll(
          "CREATE VIEW v_ro AS SELECT 1 AS one;",
        );
        outcome = "create-view-ok";
      } finally {
        conn.disconnectSync();
      }
    } catch (error) {
      outcome = `failed: ${(error as Error).message.slice(0, 200)}`;
    }
    console.log("CREATE VIEW em READ_ONLY =>", outcome);
    expect(typeof outcome).toBe("string");
  });

  it("LOAD httpfs + SETs de segurança aceitos (Spike D adiantado)", async () => {
    const instance = await DuckDBInstance.create(":memory:");
    const conn = await instance.connect();
    try {
      // LOAD pode exigir INSTALL prévio (rede) — registra, não trava gate local.
      try {
        await conn.runAndReadAll("LOAD httpfs;");
        console.log("LOAD httpfs => ok");
      } catch (error) {
        console.log(
          "LOAD httpfs =>",
          (error as Error).message.slice(0, 200),
        );
      }
      await conn.runAndReadAll("SET memory_limit='512MB';");
      await conn.runAndReadAll("SET threads=1;");
      const res = await conn.runAndReadAll(
        "SELECT current_setting('memory_limit') AS m;",
      );
      expect(res.getRows().length).toBe(1);
    } finally {
      conn.disconnectSync();
    }
  });

  it("/tmp: RW cria views → fecha → reabre READ_ONLY e lê (padrão principal)", async () => {
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dbPath = join(tmpdir(), `spike-b-${Date.now()}.duckdb`);
    {
      const instance = await DuckDBInstance.create(dbPath);
      const conn = await instance.connect();
      try {
        await conn.runAndReadAll(
          "CREATE VIEW v_cat AS SELECT 7 AS seven;",
        );
      } finally {
        conn.disconnectSync();
        instance.closeSync();
      }
    }
    const ro = await DuckDBInstance.create(dbPath, {
      access_mode: "READ_ONLY",
    } as never);
    const conn = await ro.connect();
    try {
      const res = await conn.runAndReadAll("SELECT * FROM v_cat;");
      expect(res.getRows()).toEqual([[7]]);
      // Escrita de catálogo deve falhar em READ_ONLY:
      await expect(
        conn.runAndReadAll("CREATE VIEW v_no AS SELECT 1 AS one;"),
      ).rejects.toThrow();
      // Leitura externa além do allowlist será travada na Fase 2
      // (allowed_directories + enable_external_access=false + lock).
    } finally {
      conn.disconnectSync();
      ro.closeSync();
    }
    const { unlink } = await import("node:fs/promises");
    await unlink(dbPath);
  });

  it("INSTALL httpfs baixa a extensão (mede custo do cold-start)", async () => {
    const instance = await DuckDBInstance.create(":memory:");
    const conn = await instance.connect();
    try {
      await conn.runAndReadAll("INSTALL httpfs;");
      await conn.runAndReadAll("LOAD httpfs;");
      console.log("INSTALL+LOAD httpfs => ok");
    } finally {
      conn.disconnectSync();
    }
  }, 120_000);

  it("conn.interrupt existe (base do timeout real N3)", async () => {
    const instance = await DuckDBInstance.create(":memory:");
    const conn = await instance.connect();
    try {
      expect(typeof conn.interrupt).toBe("function");
    } finally {
      conn.disconnectSync();
    }
  });
});
