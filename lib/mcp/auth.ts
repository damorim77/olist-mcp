// Gate E — Bearer estático como gate anti-abuso (não OAuth).
// Decisão Spike A: requireBearerAuth oficial exige verifier com expiração/scopes
// (retornou 401 até para token válido de teste) — overkill para MCP_API_KEY
// estática. Checagem de igualdade em tempo constante + 401 idêntico é suficiente.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)!;
  }
  return diff === 0;
}

export function checkBearer(request: Request): Response | null {
  const expected = process.env.MCP_API_KEY;
  // Sem chave configurada: negar tudo (evita endpoint aberto por engano).
  // Em dev local, defina MCP_API_KEY (ex.: .env.local) — nunca commitar.
  if (!expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token ||
    !timingSafeEqual(token, expected)
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
