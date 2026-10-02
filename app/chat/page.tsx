"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./chat.css";

const EXAMPLES = [
  "Quais tabelas estão disponíveis?",
  "Funil de pedidos de 2017?",
  "Vendas de Cama, Mesa e Banho?",
  "Formas de pagamento mais comuns em 2018?",
  "Satisfação de Beleza e Saúde?",
];

type Part = { type: string } & Record<string, unknown>;

/** Resposta do agente renderizada como Markdown (GFM: tabelas, listas, código).
 *  HTML cru nunca é interpretado; URLs perigosas (javascript:/data:) são
 *  neutralizadas (reviews contêm texto não-confiável de terceiros). */
function AssistantText({ parts }: { parts: unknown[] }) {
  const texts = (parts as Part[]).filter(
    (p): p is Part & { text: string } =>
      p.type === "text" && typeof p.text === "string" && (p.text as string).trim() !== "",
  );
  const toolCalls = (parts as Part[]).filter(
    (p) => p.type.startsWith("tool-") || p.type === "dynamic-tool",
  ).length;
  if (texts.length === 0) return null;
  return (
    <>
      <div className="md">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url) =>
            /^(https?:|mailto:|#|\/)/i.test(url.trim()) ? url : ""
          }
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {texts.map((p) => p.text).join("\n\n")}
        </ReactMarkdown>
      </div>
      {toolCalls > 0 && (
        <span className="tool-hint" title="Consultas executadas no banco via MCP">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <ellipse cx="8" cy="3.5" rx="5.5" ry="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2.5 3.5v9c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2v-9" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2.5 8c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {toolCalls === 1 ? "1 consulta ao banco" : `${toolCalls} consultas ao banco`}
        </span>
      )}
    </>
  );
}

export default function ChatPage() {
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [elapsed, setElapsed] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Tema inicial: preferência salva > prefers-color-scheme (sem flash: aplica no efeito).
  useEffect(() => {
    const saved = window.localStorage.getItem("olist-chat-theme");
    const initial =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("olist-chat-theme", next);
  };

  const busy = status === "streaming" || status === "submitted";
  const streaming = status === "streaming";

  // Cronômetro da espera (respostas levam ~30s: Parquet consultado remotamente).
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  // Auto-scroll para a última mensagem (inclusive durante streaming).
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, status]);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    sendMessage({ text: value });
    setInput("");
  };

  return (
    <div className="chat-shell">
      {/* ── Esquerda: apresentação do projeto ── */}
      <aside className="intro-panel" aria-label="Sobre o projeto Olist">
        <span className="intro-badge">
          <span className="pulse" aria-hidden="true" />
          MCP · DuckDB · ao vivo
        </span>
        <h1>
          Olist <span>Analytics</span>
        </h1>
        <p className="intro-lead">
          Explore o e-commerce brasileiro em linguagem natural. O assistente consulta
          pedidos reais de 2016 a 2018 e responde com números.
        </p>

        <div>
          <p className="intro-section-title">Como funciona</p>
          <p className="intro-text">
            Suas perguntas vão para um agente que escolhe entre 7 ferramentas
            MCP e consulta os dados (arquivos Parquet via DuckDB) — a resposta
            volta em texto, com interpretação dos números.
          </p>
          <ol className="steps" style={{ marginTop: 12 }}>
            <li>
              <span className="step-num" aria-hidden="true">1</span>
              Você pergunta em português, como “funil de 2017”.
            </li>
            <li>
              <span className="step-num" aria-hidden="true">2</span>
              O agente escolhe a ferramenta certa e consulta o DuckDB.
            </li>
            <li>
              <span className="step-num" aria-hidden="true">3</span>
              Você recebe a resposta em texto, com interpretação.
            </li>
          </ol>
        </div>

        <div>
          <p className="intro-section-title">Ferramentas MCP</p>
          <ul className="tool-list" aria-label="Ferramentas disponíveis">
            {[
              "list_datasets",
              "get_table_schema",
              "execute_sql_query",
              "analyze_category_sales",
              "get_order_funnel",
              "status_distribution",
              "category_reviews",
            ].map((t) => (
              <li key={t}>
                <code>{t}</code>
              </li>
            ))}
          </ul>
        </div>

        <div className="intro-footer">
          <span>
            Endpoint público: <a href="/api/mcp">POST /api/mcp</a>
          </span>
          <a
            className="github-link"
            href="https://github.com/damorim77/olist-mcp"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            Código-fonte no GitHub
          </a>
          <span>Dataset Olist · CC BY-NC-SA 4.0</span>
        </div>
      </aside>

      {/* ── Direita: chat ── */}
      <section className="chat-panel" aria-label="Chat com o assistente">
        <header className="chat-header">
          <span className="avatar" aria-hidden="true">O</span>
          <div>
            <h2>Assistente Olist</h2>
            <p>Pedidos 2016–2018 · responde em português</p>
          </div>
          <span
            className={`status-pill${busy ? " is-busy" : ""}`}
            role="status"
            aria-live="polite"
          >
            <span className="dot" aria-hidden="true" />
            {busy ? (streaming ? "Escrevendo…" : `Analisando… ${elapsed}s`) : "Online"}
          </span>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </header>

        <div className="messages" ref={listRef} aria-live="polite" aria-label="Mensagens">
          {messages.length === 0 && (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"
                  stroke="#1e40af"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="12" r="1" fill="#1e40af" />
                <circle cx="13" cy="12" r="1" fill="#1e40af" />
                <circle cx="17" cy="12" r="1" fill="#1e40af" />
              </svg>
              <h3>Comece com uma pergunta</h3>
              <p>
                Experimente um exemplo abaixo ou digite a sua.
                <br />
                Ex.: “Quais categorias mais venderam em 2018?”
              </p>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="msg-row user">
                <span className="msg-avatar" aria-hidden="true">V</span>
                <div className="bubble">
                  {(m.parts as Part[])
                    .filter((p) => p.type === "text" && typeof p.text === "string")
                    .map((p, i) => (
                      <p key={i}>{String(p.text)}</p>
                    ))}
                </div>
              </div>
            ) : (
              <div key={m.id} className="msg-row assistant">
                <span className="msg-avatar" aria-hidden="true">A</span>
                <div className={`bubble${streaming && m.id === messages[messages.length - 1]?.id ? " caret" : ""}`}>
                  <AssistantText parts={m.parts as unknown[]} />
                </div>
              </div>
            ),
          )}

          {/* Estado de loading após enviar, antes do primeiro token */}
          {status === "submitted" && (
            <div className="msg-row assistant" role="status" aria-label="Assistente está analisando">
              <span className="msg-avatar" aria-hidden="true">A</span>
              <div className="bubble" aria-busy="true">
                <span className="typing" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="typing-label">Analisando e consultando os arquivos (~30s em média)… {elapsed}s</span>
                <span className="sr-only">Aguarde, o assistente está processando sua pergunta. Respostas levam cerca de 30 segundos.</span>
              </div>
            </div>
          )}
        </div>

        <div className="suggestions" aria-label="Perguntas de exemplo">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => submit(ex)}
            >
              {ex}
            </button>
          ))}
        </div>

        <div className="composer-wrap">
          {error && (
            <div className="error-bar" role="alert">
              Falha ao responder. Tente novamente em instantes.
            </div>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Digite sua pergunta
            </label>
            <textarea
              id="chat-input"
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              placeholder="Ex.: funil de pedidos de 2018?"
              disabled={busy}
              aria-busy={busy}
            />
            <button type="submit" className="send-btn" disabled={busy || !input.trim()}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  <span className="sr-only">Enviando</span>
                  …
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M14.5 1.5 7 9M14.5 1.5 10 14.5l-3-5.5-5.5-3 13-4.5Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Enviar
                </>
              )}
            </button>
          </form>
          <p className="latency-note">
            Respostas podem levar ~30s em média — os dados são consultados em arquivos Parquet hospedados.
          </p>
        </div>
      </section>
    </div>
  );
}
