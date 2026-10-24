"use client";

import { useState } from "react";
import { API } from "@/lib/api";

type Call = { endpoint: string; ms: number; fresh: boolean; ok: boolean };
type LiveTaste = {
  qloo_destination: string;
  affinity: number;
  ahead_of_share_of_towns: number;
  towns_compared: number;
  fetched_at: string;
  qloo_calls: Call[];
};

/** Asks Qloo again, now, for one route: proof the taste figures are not just a saved file. */
export default function LiveQloo({ origin, dest }: { origin: string; dest: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [live, setLive] = useState<LiveTaste | null>(null);
  const [error, setError] = useState("");

  async function check() {
    setState("busy");
    try {
      const res = await fetch(`${API}/api/live/taste/${origin}?place=${dest}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? res.statusText);
      setLive(body);
      setState("done");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setState("error");
    }
  }

  const secs = live ? (live.qloo_calls.reduce((s, c) => s + c.ms, 0) / 1000).toFixed(1) : "";
  const fresh = live?.qloo_calls.some((c) => c.fresh);
  return (
    <div className="mt-3.5 rounded-lg border border-line px-3 py-2.5">
      {state === "idle" && (
        <button onClick={check} className="flex w-full items-center justify-between text-[11.5px] text-muted hover:text-taste">
          <span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-taste" /> Re-check this live on Qloo</span>
          <span className="font-mono text-[10.5px] text-faint">Insights API →</span>
        </button>
      )}
      {state === "busy" && (
        <p className="flex items-center gap-2 text-[11.5px] text-muted">
          <i className="live-dot h-1.5 w-1.5 rounded-full bg-taste" /> Calling Qloo now: search, then a US taste heatmap…
        </p>
      )}
      {state === "error" && <p className="text-[11.5px] text-miss">Qloo didn&apos;t answer: {error}</p>}
      {state === "done" && live && (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-taste">Live · {live.qloo_destination}</span>
            <span className="font-mono text-[10px] text-faint">{live.qloo_calls.length} calls · {secs}s{fresh ? "" : " · memo"}</span>
          </div>
          <p className="mt-1.5 text-[12px] text-text">
            Affinity <span className="font-mono text-taste">{Math.round(live.affinity * 100)}</span>, ahead of{" "}
            <span className="font-mono text-taste">{Math.round(live.ahead_of_share_of_towns * 100)}%</span> of {live.towns_compared} US towns
          </p>
          <p className="mt-1 font-mono text-[10px] text-faint">fetched {live.fetched_at.replace("T", " ").replace("+00:00", " UTC")}</p>
        </div>
      )}
    </div>
  );
}
