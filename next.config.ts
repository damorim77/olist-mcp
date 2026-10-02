import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  // Estratégia bundle-local (Plano B como padrão do v1): Parquets vão junto
  // na Function; em runtime resolve via process.cwd()/data.
  outputFileTracingIncludes: {
    "/api/mcp": ["./data/**/*"],
  },
};

export default nextConfig;
