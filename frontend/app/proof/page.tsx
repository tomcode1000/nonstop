"use client";

import { useEffect, useState } from "react";
import { get } from "@/lib/api";

type Metrics = { auc: number; avg_precision: number; "recall@10 per destination": number; "recall@10 per origin": number };
type Backtest = {
  train: { candidates: number; launches: number };
  test: { candidates: number; launches: number; destinations: number };
  models: Record<string, Metrics | number[]>;
  forward: { year: number; through_month: number; launches_seen: number; in_top10: number };
  replay: { year: number; launches: number; in_top10: number };
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function ProofPage() {
  const [b, setB] = useState<Backtest | null>(null);
  useEffect(() => { get<Backtest>("/api/backtest").then(setB).catch(() => null); }, []);
  const m = (k: string) => b?.models[k] as Metrics | undefined;
  const ci = b?.models["logistic | Qloo AUC lift 90% CI"] as number[] | undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <p className="text-xs uppercase tracking-[0.18em] text-taste">Proof</p>
      <h1 className="mt-2 text-3xl font-semibold">Does Qloo&apos;s taste data actually predict new routes?</h1>
      <p className="mt-3 text-muted">
        We tested it the hard way: train on one year, predict the next, and compare against the same model without Qloo.
        Every number below is out of sample, and the limits are at the bottom.
      </p>

      {b && (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Card big={pct(m("logistic | baseline + Qloo")!["recall@10 per origin"])} label="of 2025's real leisure launches were in their airport's top 10"
              sub={`${pct(m("logistic | baseline")!["recall@10 per origin"])} without Qloo`} />
            <Card big={`${b.replay.in_top10}/${b.replay.launches}`} label="2025 launches called in January (time machine)" sub="model trained on 2024 only" />
            <Card big={`${b.forward.in_top10}/${b.forward.launches_seen}`} label={`2026 launches (Jan–${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][b.forward.through_month]}) already in an airport's top 10`}
              sub="never seen in training; updates as DOT publishes" />
          </div>

          <h2 className="mt-10 text-lg font-semibold">The backtest</h2>
          <p className="mt-1 text-sm text-muted">
            Train: {b.train.candidates.toLocaleString()} possible routes for 2024 ({b.train.launches} launched). Test:{" "}
            {b.test.candidates.toLocaleString()} possible routes for 2025 across {b.test.destinations} leisure destinations ({b.test.launches} launched).
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm tabular">
              <thead className="bg-panel-2 text-muted text-xs">
                <tr><th className="text-left p-3">Model</th><th className="p-3">AUC</th><th className="p-3">Avg precision</th><th className="p-3">Top 10 per airport</th><th className="p-3">Top 10 per destination</th></tr>
              </thead>
              <tbody>
                {["logistic | baseline", "logistic | baseline + Qloo", "lightgbm | baseline", "lightgbm | baseline + Qloo"].map((k) => {
                  const r = m(k)!;
                  const qloo = k.includes("Qloo");
                  return (
                    <tr key={k} className={`border-t border-line ${qloo ? "text-text" : "text-muted"}`}>
                      <td className="p-3">{k.replace("logistic", "Logistic").replace("lightgbm", "LightGBM").replace(" | ", " · ")}</td>
                      <td className={`p-3 text-center ${qloo ? "text-taste" : ""}`}>{r.auc.toFixed(3)}</td>
                      <td className="p-3 text-center">{r.avg_precision.toFixed(3)}</td>
                      <td className="p-3 text-center">{pct(r["recall@10 per origin"])}</td>
                      <td className="p-3 text-center">{pct(r["recall@10 per destination"])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ci && (
            <p className="mt-2 text-sm">
              Qloo adds <span className="text-taste font-semibold">+{ci[1].toFixed(3)} AUC</span> on top of a baseline that already
              includes distance, airport size, existing leisure airlines and the US DOT&apos;s own ticket data (90% interval{" "}
              {ci[0] >= 0 ? "+" : ""}{ci[0].toFixed(3)} to +{ci[2].toFixed(3)}, resampling destinations).
            </p>
          )}
        </>
      )}

      <h2 className="mt-10 text-lg font-semibold">How it works</h2>
      <ol className="mt-3 space-y-3 text-sm text-muted list-decimal pl-5">
        <li><b className="text-text">Every US route, every month.</b> US DOT T-100 data (all 61 airlines, 2022–2026) shows which airport pairs gained a brand-new nonstop each year.</li>
        <li><b className="text-text">Who already makes the trip.</b> US DOT DB1B, a 10% sample of all tickets, shows people flying each pair through connections and what they pay.</li>
        <li><b className="text-taste">Where the taste is.</b> For each of 158 leisure destinations, Qloo&apos;s taste graph returns a US-wide heat map of about 10,000 cells. Each airport gets its catchment&apos;s affinity, its rank among all towns, and how much it prefers that destination over its other options.</li>
        <li><b className="text-text">One honest model.</b> A logistic regression scores every possible route using only the previous year&apos;s data, and the airline matchmaker learns each leisure airline&apos;s habits from its own launches.</li>
      </ol>

      <h2 className="mt-10 text-lg font-semibold">Limits, stated plainly</h2>
      <ul className="mt-3 space-y-2 text-sm text-muted list-disc pl-5">
        <li>Qloo&apos;s data is a 2026 snapshot. Some of the taste it measures may have formed after the routes it is scoring, which could flatter the backtest. The 2026 forward check and our published predictions are the clean tests.</li>
        <li>Taste predicts <i>where leisure airlines launch</i>. It does not predict which new routes survive; we tested that and found no signal, so Nonstop makes no claims about route cuts.</li>
        <li>Qloo improves each airport&apos;s ranking, but it slightly lowers precision when all routes nationwide are pooled into one list (average precision above), so Nonstop is built around the per-airport view.</li>
        <li>Qloo has no destination entry for about 30 small Midwest and Plains airports (for example Green Bay, Fargo, Jackson Hole), so those can&apos;t be ranked as destinations yet.</li>
        <li>Results describe group tastes, never individuals. No personal data is sent to Qloo.</li>
      </ul>
    </div>
  );
}

function Card({ big, label, sub }: { big: string; label: string; sub: string }) {
  return (
    <div className="rounded-2xl glass p-5">
      <div className="text-3xl font-semibold tabular text-called">{big}</div>
      <div className="mt-2 text-sm">{label}</div>
      <div className="mt-1 text-xs text-faint">{sub}</div>
    </div>
  );
}
