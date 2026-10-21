"use client";

import { useEffect, useState } from "react";
import { Eyebrow, Panel, Stat } from "@/components/ui";
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
const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STEPS = [
  { n: "01", title: "Every US route, every month", body: "US DOT T-100 data for all 61 airlines (2022–2026) shows which airport pairs gained a brand-new nonstop each year.", tone: "text" },
  { n: "02", title: "Who already makes the trip", body: "US DOT DB1B, a 10% sample of every ticket, shows people flying each pair through connections, and what they pay.", tone: "text" },
  { n: "03", title: "Where the taste already is", body: "For 158 leisure destinations, Qloo's taste graph returns a US-wide heat map of about 10,000 cells. Each airport gets its area's affinity, its rank among all towns, and how much it prefers that place over its other options.", tone: "taste" },
  { n: "04", title: "One honest model", body: "A logistic regression scores every possible route using only the previous year's data; the airline matchmaker learns each leisure airline's habits from its own launches.", tone: "text" },
] as const;

export default function ProofPage() {
  const [b, setB] = useState<Backtest | null>(null);
  useEffect(() => { get<Backtest>("/api/backtest").then(setB).catch(() => null); }, []);
  const m = (k: string) => b?.models[k] as Metrics | undefined;
  const ci = b?.models["logistic | Qloo AUC lift 90% CI"] as number[] | undefined;
  const base = m("logistic | baseline");
  const full = m("logistic | baseline + Qloo");

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-taste/[0.06] blur-3xl" />
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-12">
        <Eyebrow tone="taste">Proof</Eyebrow>
        <h1 className="font-display mt-3 text-[34px] sm:text-[42px] font-semibold leading-[1.05] max-w-3xl">
          Does Qloo&apos;s taste data actually predict new routes?
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
          We tested it the hard way: train on one year, predict the next, and compare against the same model without Qloo.
          Every number here is out of sample. The limits are at the bottom.
        </p>

        {b && base && full && (
          <>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <Stat value={`${b.replay.in_top10}/${b.replay.launches}`} label="2025 leisure launches already in their airport's top 10 in January" sub="Time machine · trained on 2024 only" />
              <Stat value={`${b.forward.in_top10}/${b.forward.launches_seen}`} label={`2026 launches (Jan–${MONTHS[b.forward.through_month]}) already in an airport's top 10`} sub="Never seen in training · updates as DOT publishes" />
              <Stat value={full.auc.toFixed(3)} tone="taste" label="AUC on routes it never saw" sub={`${base.auc.toFixed(3)} without Qloo`} />
            </div>

            <Panel className="mt-8 p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <Eyebrow>The backtest</Eyebrow>
                  <p className="mt-2 text-[13px] text-muted max-w-2xl">
                    Train: {b.train.candidates.toLocaleString()} possible routes for 2024 ({b.train.launches} launched). Test:{" "}
                    {b.test.candidates.toLocaleString()} possible routes for 2025 across {b.test.destinations} leisure destinations ({b.test.launches} launched).
                  </p>
                </div>
                {ci && (
                  <div className="rounded-xl border border-taste/30 bg-taste/[0.06] px-4 py-2.5 text-right">
                    <div className="font-display text-xl font-semibold text-taste tabular">+{ci[1].toFixed(4)} AUC</div>
                    <div className="text-[11px] text-muted">Qloo lift · 90% CI {ci[0] >= 0 ? "+" : ""}{ci[0].toFixed(4)} to +{ci[2].toFixed(4)}</div>
                  </div>
                )}
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-[13px] tabular">
                  <thead className="text-[10.5px] uppercase tracking-[0.14em] text-faint">
                    <tr className="border-b border-line">
                      <th className="text-left py-2.5 pr-3 font-medium">Model</th>
                      <th className="py-2.5 px-3 font-medium">AUC</th>
                      <th className="py-2.5 px-3 font-medium">Avg precision</th>
                      <th className="py-2.5 px-3 font-medium">Top 10 per airport</th>
                      <th className="py-2.5 pl-3 font-medium">Top 10 per destination</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["logistic | baseline", "logistic | baseline + Qloo", "lightgbm | baseline", "lightgbm | baseline + Qloo"].map((k) => {
                      const r = m(k)!;
                      const qloo = k.includes("Qloo");
                      return (
                        <tr key={k} className={`border-b border-line/60 ${qloo ? "text-text" : "text-muted"}`}>
                          <td className="py-3 pr-3">
                            {k.startsWith("logistic") ? "Logistic" : "LightGBM"}
                            <span className={qloo ? "text-taste" : "text-faint"}> · {qloo ? "with Qloo" : "baseline"}</span>
                          </td>
                          <td className={`py-3 px-3 text-center ${qloo ? "text-taste font-semibold" : ""}`}>{r.auc.toFixed(3)}</td>
                          <td className="py-3 px-3 text-center">{r.avg_precision.toFixed(3)}</td>
                          <td className="py-3 px-3 text-center">{pct(r["recall@10 per origin"])}</td>
                          <td className="py-3 pl-3 text-center">{pct(r["recall@10 per destination"])}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
                The baseline is deliberately strong: distance, airport size, leisure airlines already present, the US DOT&apos;s own ticket
                data, and whether a nearby airport in the same metro is already served. Qloo&apos;s lift is on top of all of that.
              </p>
            </Panel>
          </>
        )}

        <h2 className="font-display mt-14 text-2xl font-semibold">How it works</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {STEPS.map((s) => (
            <Panel key={s.n} className="p-5">
              <div className="flex items-baseline gap-3">
                <span className={`font-mono text-[12px] ${s.tone === "taste" ? "text-taste" : "text-route"}`}>{s.n}</span>
                <h3 className={`font-display text-[17px] font-semibold ${s.tone === "taste" ? "text-taste" : ""}`}>{s.title}</h3>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.body}</p>
            </Panel>
          ))}
        </div>

        <h2 className="font-display mt-14 text-2xl font-semibold">Limits, stated plainly</h2>
        <ul className="mt-5 space-y-3 text-[13.5px] leading-relaxed text-muted">
          {[
            "Qloo's data is a 2026 snapshot. Some of the taste it measures may have formed after the routes it scores, which could flatter the backtest. The 2026 forward check is the clean test.",
            "Taste predicts where leisure airlines launch. It does not predict which new routes survive; we tested that and found no signal, so Nonstop makes no claims about route cuts.",
            "Qloo improves each airport's ranking but slightly lowers precision when all routes nationwide are pooled into one list (average precision above), so Nonstop is built around the per-airport view.",
            "Qloo has no destination entry for about 30 small Midwest and Plains airports (for example Green Bay, Fargo, Jackson Hole), so they can't be ranked as destinations yet.",
            "Results describe group tastes, never individuals. No personal data is sent to Qloo.",
          ].map((l) => (
            <li key={l} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-route" /><span>{l}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
