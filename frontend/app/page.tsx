"use client";

import { ScatterplotLayer } from "@deck.gl/layers";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type Airport, fmtInt, get } from "@/lib/api";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });

type Backtest = {
  replay: { launches: number; in_top10: number };
  forward: { launches_seen: number; in_top10: number; through_month: number };
};

const QUICK = ["BOI", "SAV", "DSM", "FAT", "BZN", "PSP", "GRR", "RNO"];

export default function Home() {
  const router = useRouter();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<Airport[]>("/api/airports").then(setAirports).catch((e) => setError(String(e)));
    get<Backtest>("/api/backtest").then(setBacktest).catch(() => null);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return airports.filter((a) => a.code.toLowerCase().startsWith(q) || a.city.toLowerCase().includes(q)).slice(0, 6);
  }, [query, airports]);

  const maxSeats = Math.max(1, ...airports.map((a) => a.seats));
  const layers = [
    new ScatterplotLayer<Airport>({
      id: "airports",
      data: airports,
      getPosition: (a) => [a.lon, a.lat],
      getRadius: (a) => 9000 + 60000 * Math.sqrt(a.seats / maxSeats),
      radiusMinPixels: 2.5,
      getFillColor: (a) => (a.called_2026 > 0 ? [62, 224, 143, 220] : [245, 181, 68, 200]),
      getLineColor: [7, 11, 20, 255],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
      onClick: ({ object }) => object && router.push(`/airport/${object.code}`),
    }),
  ];


  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <MapCanvas
        layers={layers}
        tooltip={({ object }) => {
          const a = object as Airport | undefined;
          return a ? `${a.code} · ${a.city}\n${fmtInt(a.seats)} seats a year\nTop missing route → ${a.top_opportunity}` : null;
        }}
      />

      <section className="absolute left-3 right-3 top-3 sm:left-6 sm:right-auto sm:top-6 sm:w-[420px] glass rounded-2xl p-5 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.18em] text-taste">Powered by Qloo&apos;s taste graph</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold leading-tight">The leisure flights your town is missing.</h1>
        <p className="mt-2 text-sm text-muted">
          Every year about 200 new leisure routes launch in the US. Nonstop predicts where Allegiant, Breeze, Avelo and the
          other leisure airlines will fly next, using where people&apos;s tastes already are.
        </p>

        <div className="relative mt-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && matches[0] && router.push(`/airport/${matches[0].code}`)}
            placeholder="Find your airport — e.g. Boise or BOI"
            className="w-full rounded-xl bg-panel-2 border border-line px-4 py-3 text-sm outline-none focus:border-route"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-xl glass overflow-hidden">
              {matches.map((a) => (
                <li key={a.code}>
                  <Link href={`/airport/${a.code}`} className="flex justify-between px-4 py-2.5 text-sm hover:bg-panel-2">
                    <span><b className="font-mono">{a.code}</b> <span className="text-muted">{a.city}</span></span>
                    <span className="text-faint">→ {a.top_opportunity}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK.map((c) => (
            <Link key={c} href={`/airport/${c}`} className="rounded-full border border-line px-2.5 py-1 text-xs font-mono text-muted hover:text-text hover:border-route">
              {c}
            </Link>
          ))}
        </div>

        {backtest && (
          <div className="mt-5 grid grid-cols-2 gap-2 text-center">
            <Stat value={`${backtest.replay.in_top10}/${backtest.replay.launches}`} label="of 2025's new leisure routes called in January" sub="time machine, trained on 2024 only" />
            <Stat value={`${backtest.forward.in_top10}/${backtest.forward.launches_seen}`} label="2026 launches already in an airport's top 10" sub="never seen in training" />
          </div>
        )}
        <Link href="/proof" className="mt-3 block text-xs text-muted hover:text-text">How we measured this, honestly →</Link>
        {error && <p className="mt-3 text-xs text-miss">Can&apos;t reach the Nonstop API ({error}).</p>}
      </section>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass rounded-full px-4 py-2 text-xs text-muted flex gap-4 whitespace-nowrap">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-route" /> airport</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-called" /> <span className="sm:hidden">called a 2026 launch</span><span className="hidden sm:inline">a top-10 pick already launched in 2026</span></span>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-panel-2 border border-line p-3">
      <div className="text-2xl font-semibold tabular text-called">{value}</div>
      <div className="mt-1 text-[11px] leading-tight text-muted">{label}</div>
      <div className="mt-1 text-[10px] text-faint">{sub}</div>
    </div>
  );
}
