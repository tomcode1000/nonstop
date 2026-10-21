"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Markdown from "@/components/Markdown";
import { API } from "@/lib/api";

/** Writes a route case an airport can send to an airline (about 45 seconds), with copy and download. */
export default function RouteCaseButton({ origin, dest }: { origin: string; dest: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [md, setMd] = useState("");
  const [error, setError] = useState("");

  async function build() {
    setState("busy");
    try {
      const res = await fetch(`${API}/api/case/${origin}/${dest}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? res.statusText);
      setMd(body.markdown);
      setState("done");
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `nonstop-${origin}-${dest}-route-case.md` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        onClick={build}
        disabled={state === "busy"}
        className="mt-5 w-full rounded-xl bg-route text-bg font-semibold py-2.5 text-sm disabled:opacity-60"
      >
        {state === "busy" ? "Writing the route case from Nonstop's data…" : "Build the route case for the airline"}
      </button>
      {state === "error" && <p className="mt-2 text-xs text-miss">{error}</p>}
      {/* Portal: the route card's backdrop blur would otherwise trap this fixed overlay inside the card. */}
      {state === "done" && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={() => setState("idle")}>
          <article className="glass rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-line">
              <p className="text-sm font-semibold">Route case · {origin} → {dest}</p>
              <div className="flex gap-2">
                <button onClick={() => navigator.clipboard.writeText(md)} className="text-xs rounded-lg border border-line px-2.5 py-1.5 hover:border-route">Copy</button>
                <button onClick={download} className="text-xs rounded-lg bg-route text-bg font-semibold px-2.5 py-1.5">Download .md</button>
                <button onClick={() => setState("idle")} className="text-xs text-muted px-2" aria-label="Close">✕</button>
              </div>
            </header>
            <div className="overflow-y-auto px-5 py-4">
              <Markdown>{md}</Markdown>
              <p className="mt-4 text-[10px] text-faint">Written by DeepSeek from Nonstop&apos;s facts only (US DOT data, Qloo taste graph, backtest). Check figures before sending.</p>
            </div>
          </article>
        </div>,
        document.body,
      )}
    </>
  );
}
