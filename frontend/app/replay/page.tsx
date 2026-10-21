"use client";

import { ArcLayer, ScatterplotLayer } from "@deck.gl/layers";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { get, type Replay, type ReplayArc } from "@/lib/api";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ReplayPage() {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [month, setMonth] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    get<Replay>("/api/replay/2025").then(setReplay).catch(() => null);
  }, []);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => setMonth((m) => (m >= 12 ? 12 : m + 1)), 1100);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing]);
  useEffect(() => { if (month >= 12) setPlaying(false); }, [month]);

  const shown = useMemo(() => (replay?.launches ?? []).filter((l) => (l.month ?? 13) <= month), [replay, month]);
  const called = shown.filter((l) => l.rank <= (replay?.top ?? 10));
  const fresh = shown.filter((l) => l.month === month);

  const layers = [
    new ArcLayer<ReplayArc>({
      id: "launches",
      data: shown,
      getSourcePosition: (l) => l.from,
      getTargetPosition: (l) => l.to,
      getSourceColor: (l) => (l.rank <= 10 ? [62, 224, 143, l.month === month ? 255 : 150] : [240, 86, 106, l.month === month ? 230 : 90]),
      getTargetColor: (l) => (l.rank <= 10 ? [62, 224, 143, l.month === month ? 255 : 170] : [240, 86, 106, l.month === month ? 230 : 110]),
      getWidth: (l) => (l.month === month ? 3.5 : 1.6),
      greatCircle: true,
      pickable: true,
      updateTriggers: { getSourceColor: month, getTargetColor: month, getWidth: month },
    }),
    new ScatterplotLayer<ReplayArc>({
      id: "new",
      data: fresh,
      getPosition: (l) => l.to,
      getRadius: 30000,
      radiusMinPixels: 4,
      getFillColor: (l) => (l.rank <= 10 ? [62, 224, 143, 230] : [240, 86, 106, 200]),
    }),
  ];

  const total = replay?.summary.launches ?? 0;
  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <MapCanvas
        layers={layers}
        tooltip={({ object }) => {
          const l = object as ReplayArc | undefined;
          return l ? `${l.origin} → ${l.dest} (${l.dest_city})\nLaunched ${MONTHS[(l.month ?? 1) - 1]} 2025\nNonstop had it at #${l.rank} for ${l.origin} in January` : null;
        }}
      />

      <section className="absolute left-3 right-3 top-3 sm:left-6 sm:right-auto sm:w-[400px] glass rounded-2xl p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-taste">Time machine · 2025</p>
        <h1 className="mt-2 text-xl font-semibold leading-snug">Could Nonstop have called 2025&apos;s new leisure routes in January?</h1>
        <p className="mt-2 text-sm text-muted">
          The model here was trained only on 2024 launches and sees only data up to December 2024. Each arc is a real
          route that launched in 2025: <span className="text-called">green</span> if it was already in that airport&apos;s top 10,{" "}
          <span className="text-miss">red</span> if Nonstop missed it.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-panel-2 border border-line p-3">
            <div className="text-3xl font-semibold tabular text-called">{called.length}</div>
            <div className="text-[11px] text-muted">called in advance</div>
          </div>
          <div className="rounded-xl bg-panel-2 border border-line p-3">
            <div className="text-3xl font-semibold tabular">{shown.length}<span className="text-faint text-lg">/{total}</span></div>
            <div className="text-[11px] text-muted">launches so far</div>
          </div>
        </div>
      </section>

      <div className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[640px] glass rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { if (month >= 12) setMonth(0); setPlaying((p) => !p); }}
            className="h-10 w-10 shrink-0 rounded-full bg-route text-bg font-bold"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <input type="range" min={0} max={12} value={month} onChange={(e) => { setPlaying(false); setMonth(Number(e.target.value)); }} className="flex-1 accent-[var(--route)]" />
          <span className="w-20 text-right text-sm tabular">{month === 0 ? "Jan 1" : `${MONTHS[month - 1]} 2025`}</span>
        </div>
        {month === 12 && replay && (
          <p className="mt-3 text-sm text-center">
            <span className="text-called font-semibold">{replay.summary.called_in_top} of {replay.summary.launches}</span> new leisure routes
            ({Math.round(replay.summary.share * 100)}%) were in their airport&apos;s top 10 before the year began.
          </p>
        )}
      </div>
    </div>
  );
}
