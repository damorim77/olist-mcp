import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  // Estratégia bundle-local (Plano B como padrão do v1): Parquets vão junto
  // na Function; em runtime resolve via process.cwd()/data.
  outputFileTracingIncludes: {
    "/api/mcp": [
      "./data/**/*",
      // libduckdb.so entra via dlopen (não rastreável) — incluir explícito.
      // Avaliado no build da Vercel (linux-x64); local só tem win32-x64.
      "./node_modules/@duckdb/node-bindings-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
