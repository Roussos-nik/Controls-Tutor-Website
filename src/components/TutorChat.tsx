"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSimStateForAI } from "@/lib/aiState";
import { useControlsStore } from "@/lib/controlsStore";
import { getExercise } from "@/lib/exercises";

// ─────────────────────────────────────────────────────────────────────────────
// TutorChat — streaming Socratic-tutor chat with tool use (apply_gains).
// Parses the NDJSON event stream from /api/tutor, interleaving streamed text
// with an "Apply gains" card. Applying updates the Zustand store and sends a
// follow-up message so the tutor can react to the change.
// ─────────────────────────────────────────────────────────────────────────────

interface GainSuggestion {
  Kp?: number;
  Ki?: number;
  Kd?: number;
  reasoning: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  tool?: GainSuggestion;     // present if the assistant proposed gains
  toolApplied?: boolean;
  error?: boolean;
}

const MD = {
  p: (p: any) => <p className="mb-2 last:mb-0 leading-relaxed" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-slate-900" {...p} />,
  em: (p: any) => <em className="italic" {...p} />,
  ul: (p: any) => <ul className="mb-2 ml-4 list-disc space-y-1" {...p} />,
  ol: (p: any) => <ol className="mb-2 ml-4 list-decimal space-y-1" {...p} />,
  li: (p: any) => <li className="leading-relaxed" {...p} />,
  h3: (p: any) => <h3 className="mb-1 mt-2 text-[13px] font-semibold text-slate-800" {...p} />,
  h4: (p: any) => <h4 className="mb-1 mt-2 text-[13px] font-semibold text-slate-700" {...p} />,
  a: (p: any) => <a className="text-blue-600 underline" target="_blank" rel="noreferrer" {...p} />,
  blockquote: (p: any) => <blockquote className="border-l-2 border-slate-200 pl-3 italic text-slate-500" {...p} />,
  pre: (p: any) => <pre className="mb-2 overflow-x-auto" {...p} />,
  code: ({ className, children, ...rest }: any) => {
    const fenced = typeof className === "string" && className.startsWith("language-");
    return (
      <code
        className={
          fenced
            ? "block rounded-md bg-slate-100 p-2 font-mono text-[12px] text-slate-800"
            : "rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-800"
        }
        {...rest}
      >
        {children}
      </code>
    );
  },
};

const GAIN_KEYS: (keyof GainSuggestion)[] = ["Kp", "Ki", "Kd"];

function formatGains(s: GainSuggestion): string {
  return GAIN_KEYS.filter((k) => typeof s[k] === "number")
    .map((k) => `${k}=${s[k]}`)
    .join(", ");
}

export default function TutorChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const messagesRef = useRef<Msg[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Map UI messages → API history. Assistant tool turns are flattened to text
  // (including the suggested gains + reasoning) so we never send raw, unpaired
  // tool_use blocks back to the API.
  function mapForApi(msgs: Msg[]): { role: string; content: string }[] {
    return msgs
      .filter((m) => !m.error)
      .map((m) => {
        if (m.role === "assistant" && m.tool) {
          const note = `[Suggested gains: ${formatGains(m.tool)}. Reason: ${m.tool.reasoning}]`;
          return { role: m.role, content: (m.content ? m.content + "\n" : "") + note };
        }
        return { role: m.role, content: m.content };
      })
      .filter((m) => m.content.trim().length > 0);
  }

  async function stream(text: string, history: { role: string; content: string }[]) {
    setStreaming(true);
    try {
      const simState = getSimStateForAI();

      // If a challenge is active, send exercise context so the tutor switches
      // to Socratic exercise mode (never reveals the answer).
      const st = useControlsStore.getState();
      const ex = getExercise(st.activeExerciseId);
      const exercise = ex
        ? {
            title: ex.title,
            description: ex.description,
            criteria: ex.criteria.map((c) => c.label),
            complete: st.exerciseComplete,
          }
        : undefined;

      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, simState, history, exercise }),
      });
      if (!res.ok || !res.body) throw new Error(`Server responded ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const handleEvent = (ev: any) => {
        if (ev.type === "text") {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: last.content + ev.value };
            }
            return next;
          });
        } else if (ev.type === "tool_use" && ev.name === "apply_gains") {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, tool: ev.input as GainSuggestion };
            }
            return next;
          });
        } else if (ev.type === "error") {
          throw new Error(ev.message || "stream error");
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handleEvent(JSON.parse(line));
        }
      }
      if (buf.trim()) handleEvent(JSON.parse(buf.trim()));
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") next[next.length - 1] = { ...last, error: true };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  function runExchange(userText: string) {
    if (streaming) return;
    const history = mapForApi(messagesRef.current);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userText },
      { role: "assistant", content: "" },
    ]);
    stream(userText, history);
  }

  function handleSubmit() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    runExchange(text);
  }

  function handleRetry() {
    if (streaming) return;
    const msgs = messagesRef.current;
    if (msgs.length < 2) return;
    const userText = msgs[msgs.length - 2]?.content ?? "";
    const history = mapForApi(msgs.slice(0, msgs.length - 2));
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { role: "assistant", content: "" };
      return next;
    });
    stream(userText, history);
  }

  function handleApply(idx: number) {
    if (streaming) return;
    const msg = messagesRef.current[idx];
    if (!msg?.tool) return;

    // Apply only the numeric gains that were provided.
    const partial: Record<string, number> = {};
    GAIN_KEYS.forEach((k) => {
      const v = msg.tool![k];
      if (typeof v === "number") partial[k] = v;
    });
    useControlsStore.getState().updateControllerParams(partial);

    // Mark this suggestion as applied.
    setMessages((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], toolApplied: true };
      return next;
    });

    // Tell the tutor what happened so it can react (fresh sim state goes too).
    runExchange(`I applied your suggestion: ${formatGains(msg.tool)}.`);
  }

  const lastMsg = messages[messages.length - 1];
  const showTyping =
    streaming && lastMsg?.role === "assistant" && lastMsg.content === "" && !lastMsg.tool;

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200/70 pl-4 pr-12 py-3">
        <span className="text-[13px] font-semibold tracking-tight text-slate-700">Tutor</span>
        {messages.length > 0 && (
          <button
            onClick={() => !streaming && setMessages([])}
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400 hover:text-slate-600"
          >
            clear
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-300">ask the tutor</span>
            <span className="max-w-[220px] text-[12px] text-slate-400">
              Try: &ldquo;Why is my system overshooting?&rdquo; or &ldquo;Suggest gains to reduce settling time.&rdquo;
            </span>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-slate-100 px-3.5 py-2 text-[13px] leading-relaxed text-slate-800">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="w-full max-w-[90%] text-[13px] text-slate-700">
                {m.error ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <span className="text-[12px] text-red-600">Something went wrong reaching the tutor.</span>
                    <button
                      onClick={handleRetry}
                      className="self-start rounded border border-red-300 bg-white px-2 py-1 font-mono text-[11px] text-red-600 hover:bg-red-100"
                    >
                      retry
                    </button>
                  </div>
                ) : m.content === "" && showTyping ? (
                  <TypingDots />
                ) : (
                  <>
                    {m.content && (
                      <div className="markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    {m.tool && (
                      <GainCard
                        suggestion={m.tool}
                        applied={!!m.toolApplied}
                        disabled={streaming}
                        onApply={() => handleApply(i)}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200/70 p-3">
        <div className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-1.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            }}
            rows={1}
            placeholder="Ask about your system…"
            disabled={streaming}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1 text-[13px] text-slate-800 outline-none placeholder:text-slate-300 disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={streaming || !input.trim()}
            className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-30"
          >
            {streaming ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GainCard({
  suggestion, applied, disabled, onApply,
}: {
  suggestion: GainSuggestion;
  applied: boolean;
  disabled: boolean;
  onApply: () => void;
}) {
  const gains = GAIN_KEYS.filter((k) => typeof suggestion[k] === "number");
  return (
    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
      <div className="mb-2 flex items-center gap-3">
        {gains.map((k) => (
          <div key={k} className="flex items-baseline gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-blue-400">{k}</span>
            <span className="font-mono text-[15px] font-medium tabular-nums text-blue-700">
              {suggestion[k]}
            </span>
          </div>
        ))}
      </div>
      <p className="mb-2.5 text-[12px] leading-relaxed text-slate-600">{suggestion.reasoning}</p>
      <button
        onClick={onApply}
        disabled={applied || disabled}
        className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
          applied
            ? "cursor-default bg-emerald-100 text-emerald-700"
            : "bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
        }`}
      >
        {applied ? "✓ Applied" : "Apply gains"}
      </button>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
