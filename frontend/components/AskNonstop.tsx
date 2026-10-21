"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Markdown from "@/components/Markdown";
import { API } from "@/lib/api";

type Step = { tool: string; args: Record<string, unknown>; ok: boolean };
type Turn = { q: string; answer?: string; trace?: Step[]; error?: string };

const TOOL_LABEL: Record<string, (a: Record<string, unknown>) => string> = {
  find_airports: (a) => `looked up “${a.query}”`,
  airport_opportunities: (a) => `ranked ${a.code}'s missing routes`,
  explain_route: (a) => `checked ${a.origin} → ${a.dest}`,
  search_routes: (a) =>
    `searched routes${a.origin_states ? ` from ${(a.origin_states as string[]).join(", ")}` : ""}${a.dest_states ? ` to ${(a.dest_states as string[]).slice(0, 4).join(", ")}` : ""}`,
  backtest_summary: () => "read the backtest",
};

const SUGGESTIONS = [
  "Which Texas towns are best placed for a new nonstop to Florida?",
  "What leisure routes is Boise missing, and who would fly them?",
  "How accurate is Nonstop, honestly?",
];

export default function AskNonstop() {
  const path = usePathname();
  const airport = path.startsWith("/airport/") ? path.split("/")[2]?.toUpperCase() : undefined;
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  // Braces matter: newer browsers return a Promise from scrollIntoView, which React would call as a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { q }]);
    try {
      const res = await fetch(`${API}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, airport }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? res.statusText);
      setTurns((t) => [...t.slice(0, -1), { q, answer: body.answer, trace: body.trace }]);
    } catch (e) {
      setTurns((t) => [...t.slice(0, -1), { q, error: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  // Lives in the header (no overlap with map controls); the panel is portalled to <body> because the
  // header's backdrop blur would otherwise trap a fixed panel inside it.
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="ml-1 rounded-full bg-taste text-bg font-semibold px-3 py-1.5 text-sm shadow-[0_0_18px_rgba(61,214,245,0.35)]"
      >
        {open ? "Close" : "Ask"}<span className="hidden sm:inline">{open ? "" : " Nonstop"}</span>
      </button>
      {open && createPortal(
        <section className="fixed z-40 top-16 right-3 left-3 sm:left-auto sm:w-[420px] max-h-[75vh] glass rounded-2xl flex flex-col shadow-2xl">
          <header className="px-4 pt-4 pb-2 border-b border-line">
            <p className="text-sm font-semibold">Ask Nonstop</p>
            <p className="text-xs text-muted">
              Answers use only Nonstop&apos;s own data and Qloo results; every step is shown.{airport ? ` Looking at ${airport}.` : ""}
            </p>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {turns.length === 0 && (
              <div className="space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="block w-full text-left text-xs rounded-lg border border-line px-3 py-2 text-muted hover:text-text hover:border-taste">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-medium">{t.q}</p>
                {t.trace && t.trace.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.trace.map((s, j) => (
                      <span key={j} className={`text-[10px] rounded-full px-2 py-0.5 border ${s.ok ? "border-taste/40 text-taste" : "border-miss/40 text-miss"}`}>
                        {(TOOL_LABEL[s.tool] ?? (() => s.tool))(s.args)}
                      </span>
                    ))}
                  </div>
                )}
                {t.answer && <Markdown>{t.answer}</Markdown>}
                {t.error && <p className="text-xs text-miss">Couldn&apos;t answer: {t.error}</p>}
              </div>
            ))}
            {busy && <p className="text-xs text-muted animate-pulse">Checking routes, ticket data and Qloo taste…</p>}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="p-3 border-t border-line flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={airport ? `Ask about ${airport}…` : "Ask about any airport or route…"}
              className="flex-1 rounded-lg bg-panel-2 border border-line px-3 py-2 text-sm outline-none focus:border-taste"
            />
            <button disabled={busy} className="rounded-lg bg-taste text-bg px-3 text-sm font-semibold disabled:opacity-50">Send</button>
          </form>
        </section>,
        document.body,
      )}
    </>
  );
}
