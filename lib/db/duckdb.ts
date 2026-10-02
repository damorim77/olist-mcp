// Camada DuckDB (Fase 2). Padrão decidido nas Spikes B/D:
// - Catálogo em arquivo (só VIEWs) criado uma vez RW → servido READ_ONLY.
//   (`:memory:` não abre READ_ONLY — erro de catálogo comprovado na Spike B.)
// - Conexão por request + semáforo (Fluid compartilha a instância).
// - Timeout real via conn.interrupt() (Promise.race sozinho não cancela).
// - Fronteira engine: allowed_directories + enable_external_access=false +
//   lock_configuration (regex do guard é só UX).
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { allTables, buildViewDDL } from "@/lib/db/parquet";
import { resolveBaseUrl } from "@/lib/db/parquet";

export const MEMORY_LIMIT = "512MB"; // escolha (Hobby tem 2GB/1vCPU)
export const THREADS = 1; // 1 vCPU — threads=2 não ajuda
export const STATEMENT_TIMEOUT_MS = 25_000; // < 60s Function < 300s plataforma
export const MAX_CONCURRENT_QUERIES = 2;

export class QueryTimeoutError extends Error {
  constructor() {
    super(
      "Query excedeu o tempo limite (25s). Refine com filtros mais seletivos ou agregação menor.",
    );
    this.name = "QueryTimeoutError";
  }
}

function baseKey(base: string): string {
  return createHash("sha1").update(base).digest("hex").slice(0, 12);
}

function catalogPath(base: string): string {
  return join(tmpdir(), `olist-catalog-${baseKey(base)}.duckdb`);
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function exec(conn: DuckDBConnection, sql: string): Promise<void> {
  await conn.runAndReadAll(sql);
}

function extensionDir(base: string): string {
  return join(tmpdir(), `duckdb-ext-${baseKey(base)}`);
}

// httpfs precisa estar PRESENTE (INSTALL = rede + dir gravável) antes do LOAD.
// Só INSTALL quando LOAD falha (extensão já cacheada no warm: custo ~0).
async function ensureHttpfs(conn: DuckDBConnection, base: string): Promise<void> {
  try {
    await exec(conn, "LOAD httpfs;");
    return;
  } catch {
    await exec(
      conn,
      `SET extension_directory=${quoteLiteral(extensionDir(base))};`,
    );
    await exec(conn, "INSTALL httpfs;");
    await exec(conn, "LOAD httpfs;");
  }
}

// Catálogo RW (uma vez por base): LOAD httpfs + CREATE VIEWs.
async function buildCatalog(dbPath: string, base: string): Promise<void> {
  const instance = await DuckDBInstance.create(dbPath);
  const conn = await instance.connect();
  try {
    await ensureHttpfs(conn, base);
    for (const table of allTables()) {
      await exec(conn, buildViewDDL(table, base));
    }
  } finally {
    conn.disconnectSync();
    instance.closeSync();
  }
}

let servingInstance: DuckDBInstance | null = null;
let servingBase = "";

async function getInstance(base: string): Promise<DuckDBInstance> {
  if (servingInstance && servingBase === base) return servingInstance;
  const dbPath = catalogPath(base);
  const { existsSync } = await import("node:fs");
  if (!existsSync(dbPath)) {
    await buildCatalog(dbPath, base);
  }
  const instance = await DuckDBInstance.create(dbPath, {
    access_mode: "READ_ONLY",
  } as never);
  // Endurece a instância de leitura (Spike D): allowlist primeiro, depois
  // trava. LOAD/SET aqui — confirmar em RO na Spike B/Vercel.
  const conn = await instance.connect();
  try {
    await ensureHttpfs(conn, base);
    await exec(conn, `SET memory_limit='${MEMORY_LIMIT}';`);
    await exec(conn, `SET threads=${THREADS};`);
    await exec(conn, `SET allowed_directories=[${quoteLiteral(base)}];`);
    await exec(conn, "SET enable_external_access=false;");
    await exec(conn, "SET autoinstall_known_extensions=false;");
    await exec(conn, "SET autoload_known_extensions=false;");
    await exec(conn, "SET allow_community_extensions=false;");
    await exec(conn, "SET lock_configuration=true;");
  } finally {
    conn.disconnectSync();
  }
  servingInstance = instance;
  servingBase = base;
  return instance;
}

// Semáforo simples (limite por instância no Fluid).
class Semaphore {
  private running = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<() => void> {
    if (this.running < this.max) {
      this.running++;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.running++;
    return () => this.release();
  }
  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const semaphore = new Semaphore(MAX_CONCURRENT_QUERIES);

export type QueryResult = {
  columnNames: string[];
  rows: unknown[][];
};

// Query já validada + embrulhada pelo guard (LIMIT 101).
export async function runReadQuery(
  wrappedSql: string,
  timeoutMs = STATEMENT_TIMEOUT_MS,
): Promise<QueryResult> {
  const base = resolveBaseUrl();
  const instance = await getInstance(base);
  const release = await semaphore.acquire();
  const conn = await instance.connect();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    timer = setTimeout(() => {
      try {
        conn.interrupt();
      } catch {
        // instância pode já ter encerrado — o erro original prevalece
      }
    }, timeoutMs);
    const result = await conn.runAndReadAll(wrappedSql);
    return { columnNames: result.columnNames(), rows: result.getRows() };
  } catch (error) {
    throw mapError(error);
  } finally {
    if (timer) clearTimeout(timer);
    conn.disconnectSync();
    release();
  }
}

function mapError(error: unknown): Error {
  const message = (error as Error)?.message ?? String(error);
  if (/interrupt/i.test(message)) return new QueryTimeoutError();
  return error instanceof Error ? error : new Error(message);
}

export async function describeView(table: string): Promise<
  { column_name: string; column_type: string }[]
> {
  const base = resolveBaseUrl();
  const instance = await getInstance(base);
  const conn = await instance.connect();
  try {
    const result = await conn.runAndReadAll(
      `DESCRIBE SELECT * FROM "${table}";`,
    );
    return result.getRows().map((row) => ({
      column_name: String(row[0]),
      column_type: String(row[1]),
    }));
  } finally {
    conn.disconnectSync();
  }
}
