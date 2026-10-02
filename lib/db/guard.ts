// Policy layer UX (fail-fast legível). A barreira real é a engine
// (allowed_directories + enable_external_access=false + lock). Nunca confiar
// só neste validador: SQL não-confiável = código arbitrário (docs DuckDB).

const LEADING = new RegExp(
  "^\\s*(--[^\\n]*\\n|\\s|" + "/\\*[\\s\\S]*?\\*/" + ")*\\s*(select|with)\\b",
  "i",
);

// DDL/DML de catálogo e efeitos de filesystem/rede. Inclui mecanismos de
// leitura externa (read_* / replacement scan é barrado na engine pelo
// allowlist; aqui dá erro legível antes de instanciar o DuckDB).
// Nota: checagem por substring tem falso-positivo (ex. alias "r2d2");
// por isso é só UX — a engine decide.
const BLOCKLIST = [
  "insert",
  "update",
  "delete",
  "drop",
  "create",
  "alter",
  "truncate",
  "copy",
  "attach",
  "detach",
  "install",
  "load",
  "set",
  "pragma",
  "call",
  "read_parquet",
  "read_csv",
  "read_json",
  "parquet_scan",
  "read_text",
  "glob",
];

const EXTERNAL_HINT = /https?:\/\/|s3:\/\/|gcs:\/\/|r2:\/\//i;

export type GuardOk = { ok: true; wrapped: string };
export type GuardFail = {
  ok: false;
  message: string;
  hint: string;
};

function stripTrailingSemicolon(sql: string): string {
  return sql.replace(/[\s;]+$/, "");
}

function containsBlockedWord(sql: string): string | null {
  // Remove string literals e comentários para reduzir falso-positivo/negativo
  // na camada UX (a engine continua sendo a barreira).
  const code = sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/--[^\n]*/g, " ")
    .replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), " ");
  const words = code.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [];
  const set = new Set(words);
  for (const w of BLOCKLIST) {
    if (set.has(w)) return w;
  }
  return null;
}

// Valida single-statement SELECT/WITH e embrulha com limite explícito:
// busca 101 linhas; a 101ª é só flag (devolve 100 + truncated=true).
export function guardQuery(input: string): GuardOk | GuardFail {
  const query = input.trim();
  if (!query) {
    return {
      ok: false,
      message: "Query vazia.",
      hint: "Envie uma única consulta SELECT ou WITH sobre as views disponíveis.",
    };
  }
  if (!LEADING.test(query)) {
    return {
      ok: false,
      message: "Apenas consultas SELECT ou WITH são aceitas.",
      hint: "Use get_table_schema para descobrir colunas e monte um SELECT sobre as views.",
    };
  }
  // Multi-statement: ; fora de string, exceto trailing — suficiente p/ UX.
  const codeOnly = query.replace(/'(?:[^']|'')*'/g, "''");
  if (stripTrailingSemicolon(codeOnly).includes(";")) {
    return {
      ok: false,
      message: "Apenas uma instrução por chamada.",
      hint: "Remova o ; intermediário e envie uma única query.",
    };
  }
  const blocked = containsBlockedWord(query);
  if (blocked) {
    return {
      ok: false,
      message: `Construção bloqueada: ${blocked}.`,
      hint: "Consulte apenas as views (orders, order_items, products, customers, reviews, order_payments, sellers); sem read_*/URLs/COPY/ATTACH/DDL.",
    };
  }
  if (EXTERNAL_HINT.test(query)) {
    return {
      ok: false,
      message: "Acesso externo bloqueado.",
      hint: "As views já apontam para os Parquets; não use URLs nem prefixos s3/http.",
    };
  }
  const stripped = stripTrailingSemicolon(query);
  // \n antes do fecha-parêntese: neutraliza trailing `-- comentário`.
  const wrapped = `SELECT * FROM (\n${stripped}\n) AS __mcp_result LIMIT 101`;
  return { ok: true, wrapped };
}
