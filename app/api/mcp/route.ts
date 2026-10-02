import { createMcpHandler } from "@modelcontextprotocol/server";
import { checkBearer } from "@/lib/mcp/auth";
import { createOlistServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // SLO do sistema (teto Hobby é 300s)

const handler = createMcpHandler(() => createOlistServer());

export async function POST(request: Request) {
  const unauthorized = checkBearer(request);
  if (unauthorized) return unauthorized;
  return handler.fetch(request);
}

// Stateless: sem stream SSE persistente nem sessão — 405 explícito.
export async function GET() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function DELETE() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}
