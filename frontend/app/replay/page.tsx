"use client";

import { TripsLayer } from "@deck.gl/geo-layers";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eyebrow, Panel } from "@/components/ui";
import { get, type Replay, type ReplayArc } from "@/lib/api";
import { flightPath, timestamps, useLoopClock } from "@/lib/geo";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Flight = ReplayArc & { path: [number, number, number][]; times: number[]; called: boolean };

export default function ReplayPage() {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [month, setMonth] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const t = useLoopClock(40, 16);

  useEffect(() => {
    get<Replay>("/api/replay/2025").then(setReplay).catch(() => null);
  }, []);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => setMonth((m) => (m >= 12 ? 12 : m + 1)), 1200);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing]);
  useEffect(() => { if (month >= 12) setPlaying(false); }, [month]);

  const flights: Flight[] = useMemo(
    () => (replay?.launches ?? []).map((l, i) => ({ ...l, called: l.rank <= (replay?.top ?? 10), path: flightPath(l.from, l.to, 40), times: timestamps(40, 10, (i * 7) % 40) })),
    [replay],
  );
  const shown = flights.filter((l) => (l.month ?? 13) <= month);
  const called = shown.filter((l) => l.called);
  const fresh = shown.filter((l) => l.month === month);
  const total = replay?.summary.launches ?? 0;

  const layers = [
    new PathLayer<Flight>({
      id: "launch-lines",
      data: shown,
      getPath: (l) => l.path,
      getColor: (l) => (l.called ? [17, 134, 90, l.month === month ? 240 : 120] : [207, 58, 78, l.month === month ? 220 : 95]),
      getWidth: (l) => (l.month === month ? 2.6 : 1.3),
      widthUnits: "pixels",
      billboard: true,
      pickable: true,
      updateTriggers: { getColor: month, getWidth: month },
    }),
    new TripsLayer<Flight>({
      id: "launch-comets",
      data: fresh,
      getPath: (l) => l.path,
      getTimestamps: (l) => l.times,
      getColor: (l) => (l.called ? [8, 92, 60] : [150, 30, 45]),
      widthMinPixels: 3.5,
      trailLength: 5,
      fadeTrail: true,
      currentTime: t,
      capRounded: true,
    }),
    new ScatterplotLayer<Flight>({
      id: "new-ends",
      data: fresh,
      getPosition: (l) => l.to,
      getRadius: 26000,
      radiusMinPixels: 4,
      getFillColor: (l) => (l.called ? [17, 134, 90, 240] : [207, 58, 78, 220]),
    }),
  ];

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <MapCanvas
        layers={layers}
        tooltip={({ object, layer }) => {
          if (layer?.id !== "launch-lines") return null;
          const l = object as Flight | undefined;
          return l ? `${l.origin} → ${l.dest} · ${l.dest_city}\nLaunched ${MONTHS[(l.month ?? 1) - 1]} 2025\nNonstop had it at #${l.rank} for ${l.origin} in January` : null;
        }}
      />

      <Panel className="absolute left-3 right-3 top-3 sm:left-5 sm:right-auto sm:top-5 sm:w-[410px] p-6">
        <Eyebrow tone="taste">Time machine · 2025</Eyebrow>
        <h1 className="font-display mt-3 text-[24px] font-semibold leading-tight">Could Nonstop have called 2025&apos;s new leisure routes in January?</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          This model learned only from 2024 launches and saw data up to December 2024. Press play: every route that
          really launched in 2025 flies in at the month it started. <span className="text-called">Green</span> means it was
          already in that airport&apos;s top 10; <span className="text-miss">red</span> means Nonstop missed it.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-black/[0.025] border border-line p-3.5">
            <div className="font-display text-[34px] font-semibold tabular leading-none text-called">{called.length}</div>
            <div className="mt-1.5 text-[11.5px] text-muted">called in advance</div>
          </div>
          <div className="rounded-xl bg-black/[0.025] border border-line p-3.5">
            <div className="font-display text-[34px] font-semibold tabular leading-none">{shown.length}<span className="text-faint text-xl">/{total}</span></div>
            <div className="mt-1.5 text-[11.5px] text-muted">launches so far</div>
          </div>
        </div>
      </Panel>

      <Panel className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[680px] p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => { if (month >= 12) setMonth(0); setPlaying((p) => !p); }}
            className="h-11 w-11 shrink-0 rounded-full bg-route text-white text-sm font-bold "
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="flex-1">
            <input type="range" min={0} max={12} value={month}
              onChange={(e) => { setPlaying(false); setMonth(Number(e.target.value)); }}
              className="w-full accent-[var(--route)]" aria-label="Month" />
            <div className="mt-1 hidden sm:flex justify-between px-0.5 text-[10px] text-faint font-mono">
              <span>JAN 1</span>{MONTHS.map((m, i) => <span key={m} className={i + 1 === month ? "text-route" : ""}>{m.toUpperCase()}</span>)}
            </div>
          </div>
          <span className="w-20 text-right font-display text-sm tabular">{month === 0 ? "Jan 1" : `${MONTHS[month - 1]} 2025`}</span>
        </div>
        {month === 12 && replay && (
          <p className="mt-3 text-[13px] text-center text-muted">
            <span className="text-called font-semibold">{replay.summary.called_in_top} of {replay.summary.launches}</span> new leisure
            routes ({Math.round(replay.summary.share * 100)}%) were in their airport&apos;s top 10 before 2025 began.
          </p>
        )}
      </Panel>
    </div>
  );
}
