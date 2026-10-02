// Resolução de arquivos Parquet + DDL das views.
// Sem glob em runtime (glob HTTPS não tem directory listing — N1).
// Lista explícita via src/generated/manifest.ts (emitido pelo ETL).
import path from "node:path";
import { PARQUET_FILES } from "@/src/generated/manifest";
import { TABLES, type TableName } from "@/lib/db/metadata";

function isHttp(base: string): boolean {
  return /^https?:\/\//i.test(base);
}

// Base default: diretório local `data/` (dev/teste + contingência bundle).
// Produção remota: PARQUET_BASE_URL pinado `@<sha>` (nunca `@main`).
export function resolveBaseUrl(): string {
  const env = process.env.PARQUET_BASE_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  return path.resolve(process.cwd(), "data");
}

export function tableFiles(table: TableName, base = resolveBaseUrl()): string[] {
  const files = PARQUET_FILES[table];
  if (!files || files.length === 0) {
    throw new Error(`Manifest sem arquivos para tabela ${table}`);
  }
  return files.map((f) =>
    isHttp(base) ? `${base}/${table}/${f}` : path.join(base, table, f),
  );
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Identificador inválido: ${name}`);
  }
  return `"${name}"`;
}

// Uma view por tabela sobre a lista explícita de arquivos.
export function buildViewDDL(
  table: TableName,
  base = resolveBaseUrl(),
): string {
  const list = tableFiles(table, base).map(quoteLiteral).join(", ");
  return `CREATE VIEW ${quoteIdentifier(table)} AS SELECT * FROM read_parquet([${list}]);`;
}

export function allTables(): readonly TableName[] {
  return TABLES;
}
