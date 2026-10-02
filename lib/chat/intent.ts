// Verificador de intenção do chat: só passa o que é do e-commerce Olist.
// Roda ANTES do loop do agente (1 chamada LLM barata, sem tools) para que
// perguntas fora do propósito ("receita de bolo") recebam recusa imediata
// em vez de um turno de ~10s que responde o que não deve.
//
// Implementação: veredito ESTRUTURADO (generateObject + zod). SIM/NAO em texto
// puro não funciona com este modelo: ele raciocina em `reasoning_content` e
// deixa `content` vazio (gate nunca disparava).

import { generateObject, type LanguageModel } from "ai";
import * as z from "zod/v4";
import type { ModelMessage } from "ai";

export const INTENT_SYSTEM = [
  "Classifique a intenção da conversa: ela é sobre o e-commerce brasileiro Olist",
  "(pedidos, vendas, receita, frete, categorias de produto, funil/status de entrega,",
  "pagamentos e parcelas, avaliações e satisfação, clientes e regiões, vendedores,",
  "anos 2016-2018) ou sobre os dados/ferramentas disponíveis ('quais tabelas existem',",
  "'o que posso perguntar', 'que dados você tem')?",
  "Qualquer outro assunto (receitas, código, lição de casa, notícias, piadas,",
  "conselhos gerais, assuntos pessoais) é fora do escopo.",
  "Quando em dúvida, considere dentro do escopo (in_scope=true).",
].join(" ");

export const IntentVerdict = z.object({ in_scope: z.boolean() });

export const OUT_OF_SCOPE_REPLY = [
  "Não consigo ajudar com isso — só respondo sobre o **e-commerce Olist**",
  "(pedidos, vendas, categorias, pagamentos e avaliações de 2016 a 2018).",
  "",
  "Tente, por exemplo: **Funil de pedidos de 2017?**",
].join("\n");

/** true = dentro do escopo (segue para o agente); falso = fora (recusa). */
export async function checkIntent(
  model: LanguageModel,
  messages: ModelMessage[],
): Promise<boolean> {
  const { object } = await generateObject({
    model,
    schema: IntentVerdict,
    system: INTENT_SYSTEM,
    messages,
    temperature: 0,
    maxOutputTokens: 300,
  });
  return object.in_scope;
}

// Gate com retry + fail-open: o gate é otimização (recusa rápida e barata),
// nunca barreira — se falhar 2x (NIM instável), a pergunta segue para o agente
// (o SYSTEM dele também manda recusar fora do escopo). Recusar pergunta
// legítima por flake do gate é pior que responder off-topic raramente.
export async function gateWithFallback(
  check: () => Promise<boolean>,
  onError?: (attempt: number, error: unknown) => void,
): Promise<boolean> {
  let inScope = true;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      inScope = await check();
      break;
    } catch (error) {
      onError?.(attempt, error);
    }
  }
  return inScope;
}
