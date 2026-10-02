"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";

const EXAMPLES = [
  "Quais tabelas estão disponíveis?",
  "Funil de pedidos de 2017?",
  "Vendas de bed_bath_table?",
  "Formas de pagamento mais comuns em 2018?",
  "Satisfação de health_beauty?",
];

function PartView({ part }: { part: { type: string } & Record<string, unknown> }) {
  if (part.type === "text" && typeof part.text === "string") {
    return <p style={{ whiteSpace: "pre-wrap", margin: "0.25rem 0" }}>{part.text}</p>;
  }
  if (part.type === "reasoning") return null;
  if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
    const name =
      part.type === "dynamic-tool"
        ? String((part as { toolName?: unknown }).toolName ?? "tool")
        : part.type.replace(/^tool-/, "");
    const state = String(
      (part as { state?: unknown }).state ?? "done",
    );
    return (
      <details style={{ fontSize: "0.8rem", color: "#666" }}>
        <summary>
          🔧 {name} ({state})
        </summary>
        <pre style={{ overflowX: "auto" }}>
          {JSON.stringify(
            {
              input: (part as { input?: unknown }).input,
              output: (part as { output?: unknown }).output,
              errorText: (part as { errorText?: unknown }).errorText,
            },
            null,
            1,
          ).slice(0, 2000)}
        </pre>
      </details>
    );
  }
  return (
    <pre style={{ fontSize: "0.75rem", overflowX: "auto" }}>
      {JSON.stringify(part).slice(0, 500)}
    </pre>
  );
}

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const busy = status === "streaming" || status === "submitted";

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <h1>Olist Chat</h1>
      <p>Pergunte sobre o e-commerce brasileiro (pedidos 2016–2018).</p>
      <div>
        {messages.map((m) => (
          <div key={m.id} style={{ margin: "0.75rem 0" }}>
            <strong>{m.role === "user" ? "Você" : "Assistente"}:</strong>
            {m.parts.map((part, i) => (
              <PartView
                key={i}
                part={part as { type: string } & Record<string, unknown>}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ margin: "0.5rem 0" }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={busy}
            onClick={() => sendMessage({ text: ex })}
            style={{ margin: "0.2rem" }}
          >
            {ex}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex.: funil de 2018?"
          style={{ width: "80%" }}
        />
        <button type="submit" disabled={busy}>
          Enviar
        </button>
      </form>
      <p>
        <a href="/">← início</a> · Demo pública do MCP em{" "}
        <a href="/api/mcp">/api/mcp</a>
      </p>
    </main>
  );
}
