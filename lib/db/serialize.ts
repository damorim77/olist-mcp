// Fronteira DuckDB → JSON → LLM. JSON.stringify(10n) lança; NaN/Infinity não
// existem em JSON; TIMESTAMP Olist é naive local — serializar SEM `Z`
// (com `Z` o LLM raciocina com horas deslocadas).

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// ISO naive local: YYYY-MM-DDTHH:mm:ss (sem Z, sem offset).
function formatNaive(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function serializeValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) &&
      value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) return formatNaive(value);
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeValue(v);
    return out;
  }
  return String(value);
}

export type QueryEnvelope = {
  rows: Record<string, JsonValue>[];
  row_count: number;
  truncated: boolean;
};

// rows cruas (101 buscadas) → envelope (100 + flag). Colunas via nomes.
export function toEnvelope(
  columnNames: string[],
  rawRows: unknown[][],
): QueryEnvelope {
  const truncated = rawRows.length > 100;
  const rows = rawRows.slice(0, 100).map((r) => {
    const obj: Record<string, JsonValue> = {};
    columnNames.forEach((name, i) => {
      obj[name] = serializeValue(r[i]);
    });
    return obj;
  });
  return { rows, row_count: rows.length, truncated };
}
