"use client";

import { TripsLayer } from "@deck.gl/geo-layers";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CodeTiles, Eyebrow, Panel, Stat } from "@/components/ui";
import { type Airport, fmtInt, get } from "@/lib/api";
import { flightPath, timestamps, useLoopClock } from "@/lib/geo";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });

type Backtest = {
  replay: { launches: number; in_top10: number };
  forward: { launches_seen: number; in_top10: number; through_month: number };
};
type TopRoute = { origin: string; dest: string; dest_city: string; score: number; from: [number, number]; to: [number, number]; launched: boolean };
type Flight = TopRoute & { path: [number, number, number][]; times: number[] };

const QUICK = ["BOI", "SAV", "DSM", "FAT", "BZN", "PSP", "GRR", "RNO"];
const LOOP = 120;

export default function Home() {
  const router = useRouter();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [routes, setRoutes] = useState<TopRoute[]>([]);
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const t = useLoopClock(LOOP, 14);

  useEffect(() => {
    get<Airport[]>("/api/airports").then(setAirports).catch((e) => setError(String(e)));
    get<TopRoute[]>("/api/top-routes").then(setRoutes).catch(() => null);
    get<Backtest>("/api/backtest").then(setBacktest).catch(() => null);
  }, []);

  const flights: Flight[] = useMemo(
    () => routes.map((r, i) => ({ ...r, path: flightPath(r.from, r.to), times: timestamps(48, 30, (i * 37) % LOOP) })),
    [routes],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return airports.filter((a) => a.code.toLowerCase().startsWith(q) || a.city.toLowerCase().includes(q)).slice(0, 6);
  }, [query, airports]);

  const maxSeats = Math.max(1, ...airports.map((a) => a.seats));
  const layers = [
    new PathLayer<Flight>({
      id: "route-lines",
      data: flights,
      getPath: (f) => f.path,
      getColor: (f) => (f.launched ? [62, 224, 143, 70] : [245, 181, 68, 38]),
      widthMinPixels: 1,
      billboard: true,
    }),
    new TripsLayer<Flight>({
      id: "comets",
      data: flights,
      getPath: (f) => f.path,
      getTimestamps: (f) => f.times,
      getColor: (f) => (f.launched ? [62, 224, 143] : [255, 196, 92]),
      widthMinPixels: 2.5,
      trailLength: 9,
      fadeTrail: true,
      currentTime: t,
      capRounded: true,
      jointRounded: true,
    }),
    new ScatterplotLayer<Airport>({
      id: "airport-halo",
      data: airports,
      getPosition: (a) => [a.lon, a.lat],
      getRadius: (a) => 22000 + 90000 * Math.sqrt(a.seats / maxSeats),
      getFillColor: [245, 181, 68, 26],
      radiusMinPixels: 5,
    }),
    new ScatterplotLayer<Airport>({
      id: "airports",
      data: airports,
      getPosition: (a) => [a.lon, a.lat],
      getRadius: (a) => 7000 + 26000 * Math.sqrt(a.seats / maxSeats),
      getFillColor: (a) => (a.called_2026 > 0 ? [62, 224, 143, 255] : [255, 214, 140, 235]),
      radiusMinPixels: 2,
      pickable: true,
      onClick: ({ object }) => object && router.push(`/airport/${object.code}`),
    }),
  ];

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <MapCanvas
        layers={layers}
        tooltip={({ object, layer }) => {
          if (layer?.id !== "airports") return null;
          const a = object as Airport | undefined;
          return a ? `${a.code} · ${a.city}\n${fmtInt(a.seats)} seats a year\nTop missing route → ${a.top_opportunity} (${a.top_score.toFixed(1)})` : null;
        }}
      />

      <Panel className="absolute left-3 right-3 top-3 sm:left-5 sm:right-auto sm:top-5 sm:w-[440px] p-6">
        <Eyebrow tone="taste">Powered by Qloo&apos;s taste graph</Eyebrow>
        <h1 className="font-display mt-3 text-[30px] sm:text-[34px] font-semibold leading-[1.05]">
          The leisure flights<br />your town is <span className="text-route">missing.</span>
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          Nonstop reads every US route and ticket record, adds Qloo&apos;s map of where people&apos;s tastes already
          point, and tells an airport which leisure routes to pitch next, and to which airline.
        </p>

        <div className="relative mt-5">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && matches[0] && router.push(`/airport/${matches[0].code}`)}
            placeholder="Find your airport — Boise, Savannah, BZN…"
            className="w-full rounded-xl bg-[#060b17] border border-line pl-10 pr-4 py-3 text-sm outline-none transition-colors focus:border-route/70 placeholder:text-faint"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1.5 w-full rounded-xl glass overflow-hidden">
              {matches.map((a) => (
                <li key={a.code}>
                  <Link href={`/airport/${a.code}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-white/[0.04]">
                    <span className="flex items-center gap-3"><CodeTiles code={a.code} size="sm" /> <span className="text-sm text-muted">{a.city}</span></span>
                    <span className="text-[11px] text-faint">top: <span className="font-mono text-route">{a.top_opportunity}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK.map((c) => (
            <Link key={c} href={`/airport/${c}`} className="rounded-lg border border-line px-2 py-1 font-mono text-[11.5px] text-muted transition-colors hover:text-route hover:border-route/60">
              {c}
            </Link>
          ))}
        </div>

        {backtest && (
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Stat value={`${backtest.replay.in_top10}/${backtest.replay.launches}`} label="2025 leisure routes called in January" sub="Time machine · trained on 2024 only" />
            <Stat value={`${backtest.forward.in_top10}/${backtest.forward.launches_seen}`} label="2026 launches already in an airport's top 10" sub="Never seen in training" />
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-[12px]">
          <Link href="/replay" className="text-muted hover:text-text">Watch the time machine →</Link>
          <Link href="/proof" className="text-muted hover:text-text">How we measured it</Link>
        </div>
        {error && <p className="mt-3 text-xs text-miss">Can&apos;t reach the Nonstop API ({error}).</p>}
      </Panel>

      <div className="absolute bottom-4 right-4 hidden sm:flex items-center gap-4 glass rounded-xl px-4 py-2.5 text-[11.5px] text-muted">
        <span className="flex items-center gap-2"><i className="h-0.5 w-5 rounded bg-route shadow-[0_0_6px_var(--route)]" /> each airport&apos;s #1 missing route</span>
        <span className="flex items-center gap-2"><i className="h-0.5 w-5 rounded bg-called shadow-[0_0_6px_var(--called)]" /> already launched in 2026</span>
      </div>
    </div>
  );
}
