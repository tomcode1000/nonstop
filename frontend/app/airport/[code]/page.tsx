"use client";

import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { MapViewState } from "@deck.gl/core";
import { ArcLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import RouteCaseButton from "@/components/RouteCaseButton";
import { type AirportView, fmtInt, fmtUsd, get, type Heatmap, type Opportunity } from "@/lib/api";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });

const ROUTE: [number, number, number] = [245, 181, 68];
const CALLED: [number, number, number] = [62, 224, 143];

export default function AirportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [view, setView] = useState<AirportView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [heat, setHeat] = useState<Heatmap | null>(null);
  const [showHeat, setShowHeat] = useState(true);
  const [map, setMap] = useState<MapViewState | null>(null);
  const [secondAirports, setSecondAirports] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<AirportView>(`/api/airport/${code}/opportunities?limit=15&second_airports=${secondAirports}`)
      .then((v) => {
        setView(v);
        setSelected((s) => (s && v.opportunities.some((o) => o.dest === s) ? s : v.opportunities[0]?.dest ?? null));
        setMap((m) => m ?? { longitude: v.lon, latitude: v.lat - 2, zoom: 3.9, pitch: 40, bearing: -10 });
      })
      .catch((e) => setError(String(e)));
  }, [code, secondAirports]);

  useEffect(() => {
    if (!selected) return;
    setHeat(null);
    get<Heatmap>(`/api/heatmap/${selected}`).then(setHeat).catch(() => setHeat(null));
  }, [selected]);

  const opp = view?.opportunities.find((o) => o.dest === selected) ?? null;

  const layers = useMemo(() => {
    if (!view) return [];
    const origin: [number, number] = [view.lon, view.lat];
    return [
      showHeat && heat &&
        new HeatmapLayer<[number, number, number]>({
          id: "qloo-taste",
          data: heat.cells,
          getPosition: (c) => [c[1], c[0]],
          getWeight: (c) => Math.pow(c[2], 3),
          radiusPixels: 26,
          intensity: 1.1,
          threshold: 0.04,
          colorRange: [[8, 40, 60], [12, 80, 110], [20, 130, 160], [40, 180, 210], [61, 214, 245], [190, 245, 255]],
          opacity: 0.55,
        }),
      new ArcLayer<Opportunity>({
        id: "routes",
        data: view.opportunities,
        getSourcePosition: () => origin,
        getTargetPosition: (o) => [o.lon, o.lat],
        getSourceColor: (o) => [...(o.already_launched_2026 ? CALLED : ROUTE), o.dest === selected ? 255 : 120],
        getTargetColor: (o) => [...(o.already_launched_2026 ? CALLED : ROUTE), o.dest === selected ? 255 : 160],
        getWidth: (o) => (o.dest === selected ? 5 : 1 + (o.launch_score - 90) / 4),
        getHeight: 0.6,
        greatCircle: true,
        pickable: true,
        onClick: ({ object }) => object && setSelected(object.dest),
        updateTriggers: { getSourceColor: selected, getTargetColor: selected, getWidth: selected },
      }),
      new ScatterplotLayer<Opportunity>({
        id: "dests",
        data: view.opportunities,
        getPosition: (o) => [o.lon, o.lat],
        getRadius: (o) => (o.dest === selected ? 26000 : 16000),
        getFillColor: (o) => (o.already_launched_2026 ? CALLED : ROUTE),
        radiusMinPixels: 3,
        pickable: true,
        onClick: ({ object }) => object && setSelected(object.dest),
        updateTriggers: { getRadius: selected },
      }),
      new ScatterplotLayer({
        id: "origin",
        data: [origin],
        getPosition: (p: [number, number]) => p,
        getRadius: 32000,
        radiusMinPixels: 6,
        getFillColor: [231, 236, 245],
        getLineColor: ROUTE,
        stroked: true,
        lineWidthMinPixels: 2,
      }),
      new TextLayer<Opportunity>({
        id: "labels",
        data: view.opportunities.slice(0, 8),
        getPosition: (o) => [o.lon, o.lat],
        getText: (o) => o.dest,
        getSize: 12,
        getColor: [231, 236, 245, 220],
        getPixelOffset: [0, -14],
        fontFamily: "monospace",
        fontWeight: 600,
      }),
    ].filter(Boolean);
  }, [view, heat, selected, showHeat]);

  if (error) {
    return (
      <div className="p-8 text-sm">
        <p className="text-miss">No predictions for {code.toUpperCase()}.</p>
        <Link href="/" className="text-muted hover:text-text">← Back to the map</Link>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      {map && (
        <MapCanvas
          key={code}
          layers={layers as never}
          initialView={map}
          tooltip={({ object, layer }) => {
            if (!object || !layer || !["routes", "dests"].includes(layer.id)) return null;
            const o = object as Opportunity;
            return `${code.toUpperCase()} → ${o.dest} · ${o.dest_city}\nLaunch score ${o.launch_score.toFixed(1)} · #${o.rank} for this airport`;
          }}
        />
      )}

      {/* Route list */}
      <aside className="absolute left-3 top-3 bottom-3 w-[300px] glass rounded-2xl p-4 overflow-y-auto hidden md:block">
        <Link href="/" className="text-xs text-muted hover:text-text">← All airports</Link>
        <h1 className="mt-2 text-xl font-semibold">
          <span className="font-mono text-route">{code.toUpperCase()}</span> {view?.city}
        </h1>
        <p className="mt-1 text-xs text-muted">Missing leisure routes, ranked. Click one to see why.</p>
        <label className="mt-3 flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" checked={secondAirports} onChange={(e) => setSecondAirports(e.target.checked)} className="mt-0.5 accent-[var(--route)]" />
          Include second-airport routes (a nearby airport in that city is already served)
        </label>
        <ol className="mt-3 space-y-1">
          {view?.opportunities.map((o) => (
            <li key={o.dest}>
              <button
                onClick={() => setSelected(o.dest)}
                className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm border ${o.dest === selected ? "border-route bg-panel-2" : "border-transparent hover:bg-panel-2"}`}
              >
                <span className="w-5 text-faint tabular text-xs">{o.rank}</span>
                <span className="flex-1 min-w-0">
                  <span className="font-mono font-semibold">{o.dest}</span>{" "}
                  <span className="text-muted truncate">{o.dest_city}</span>
                </span>
                {o.already_launched_2026 ? (
                  <span className="rounded-full bg-called/15 text-called text-[10px] px-2 py-0.5">launched ✓</span>
                ) : (
                  <span className="tabular text-xs text-route">{o.launch_score.toFixed(1)}</span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </aside>

      {/* Mobile: routes as a swipeable strip above the detail sheet */}
      <div className="md:hidden absolute left-0 right-0 top-2 px-3">
        <div className="glass rounded-xl px-3 py-2">
          <p className="text-sm font-semibold"><span className="font-mono text-route">{code.toUpperCase()}</span> {view?.city}</p>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {view?.opportunities.map((o) => (
              <button key={o.dest} onClick={() => setSelected(o.dest)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-mono ${o.dest === selected ? "border-route text-route" : "border-line text-muted"}`}>
                {o.rank}. {o.dest}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Route detail */}
      {opp && <RouteCard origin={code.toUpperCase()} opp={opp} heat={heat} showHeat={showHeat} setShowHeat={setShowHeat} />}
    </div>
  );
}

function RouteCard({ origin, opp, heat, showHeat, setShowHeat }: {
  origin: string; opp: Opportunity; heat: Heatmap | null; showHeat: boolean; setShowHeat: (v: boolean) => void;
}) {
  const maxPush = Math.max(0.5, ...opp.drivers.map((d) => Math.abs(d.push)));
  return (
    <section className="absolute left-3 right-3 bottom-3 max-h-[52%] md:left-auto md:top-3 md:max-h-none md:w-[380px] glass rounded-2xl p-5 overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Route #{opp.rank} for {origin}</p>
          <h2 className="mt-1 text-2xl font-semibold">
            <span className="font-mono">{origin}</span> <span className="text-faint">→</span> <span className="font-mono text-route">{opp.dest}</span>
          </h2>
          <p className="text-sm text-muted">{opp.dest_city} · {fmtInt(opp.km)} km</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular text-route">{opp.launch_score.toFixed(1)}</div>
          <div className="text-[10px] text-muted">launch score / 100</div>
        </div>
      </div>
      {opp.already_launched_2026 && (
        <p className="mt-3 rounded-lg bg-called/10 border border-called/30 px-3 py-2 text-xs text-called">
          Already launched in 2026. Nonstop ranked it before it appeared in the data it was trained on.
        </p>
      )}
      {opp.second_airport_via && (
        <p className="mt-3 rounded-lg bg-panel-2 border border-line px-3 py-2 text-xs text-muted">
          Second-airport option: {origin}&apos;s metro already has a nonstop to this city ({opp.second_airport_via.replace("-", " → ")}).
        </p>
      )}

      <h3 className="mt-5 text-xs uppercase tracking-[0.16em] text-taste">Qloo taste</h3>
      <div className="mt-2 space-y-2 text-sm">
        <Bar label={`How much ${origin}'s area likes ${opp.qloo_destination}`} value={opp.qloo.affinity} />
        <Bar label="Rank among every US town that could fly there" value={opp.qloo.rank_among_towns} />
        <Bar label={`Rank among ${origin}'s other destination options`} value={opp.qloo.rank_among_own_options} />
      </div>
      {opp.qloo_origin_list_rank && (
        <p className="mt-2 text-xs text-taste">
          #{opp.qloo_origin_list_rank} on Qloo&apos;s list of destinations people around {origin} love most.
        </p>
      )}
      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} className="accent-[var(--taste)]" />
        Show where America loves {heat?.qloo_destination ?? opp.qloo_destination} (Qloo heat map)
      </label>

      <h3 className="mt-5 text-xs uppercase tracking-[0.16em] text-muted">Why it ranks here</h3>
      <ul className="mt-2 space-y-1.5">
        {opp.drivers.map((d) => (
          <li key={d.driver} className="text-xs">
            <div className="flex justify-between"><span className={d.driver === "Qloo taste" ? "text-taste" : "text-text"}>{d.driver}</span><span className="tabular text-faint">{d.push >= 0 ? "+" : ""}{d.push.toFixed(2)}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-panel-2 overflow-hidden relative">
              <div
                className={`absolute h-full ${d.push >= 0 ? (d.driver === "Qloo taste" ? "bg-taste" : "bg-route") : "bg-miss"}`}
                style={{ left: d.push >= 0 ? "50%" : `${50 - (50 * Math.abs(d.push)) / maxPush}%`, width: `${(50 * Math.abs(d.push)) / maxPush}%` }}
              />
              <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
            </div>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 text-xs uppercase tracking-[0.16em] text-muted">People already making this trip</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Mini value={fmtInt(Math.max(opp.demand.passengers_per_year, opp.demand.metro_passengers_per_year))} label="passengers a year (metro to metro)" />
        <Mini value={`${Math.round(opp.demand.connect_share * 100)}%`} label="via a connection" />
        <Mini value={opp.demand.annual_spend_usd ? fmtUsd(opp.demand.annual_spend_usd) : "—"} label="spent a year" />
      </div>
      <p className="mt-1 text-[10px] text-faint">US DOT DB1B ticket sample, 2025 Q1–Q2 annualised where 2025 is incomplete.</p>

      <h3 className="mt-5 text-xs uppercase tracking-[0.16em] text-muted">Most likely airline</h3>
      <ul className="mt-2 space-y-2">
        {opp.airlines.map((a, i) => (
          <li key={a.carrier} className={`rounded-lg border p-2.5 text-xs ${i === 0 ? "border-route/50 bg-panel-2" : "border-line"}`}>
            <div className="flex justify-between font-semibold text-sm"><span>{a.name}</span><span className="tabular text-route">{Math.round(a.probability * 100)}%</span></div>
            <p className="mt-1 text-muted">{a.why.join(" · ")}</p>
          </li>
        ))}
      </ul>
      <RouteCaseButton key={opp.dest} origin={origin} dest={opp.dest} />
    </section>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-muted">{label}</span><span className="tabular text-taste">{Math.round(value * 100)}</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-panel-2 overflow-hidden"><div className="h-full bg-taste" style={{ width: `${Math.max(2, value * 100)}%` }} /></div>
    </div>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-panel-2 border border-line px-2 py-2">
      <div className="font-semibold tabular">{value}</div>
      <div className="text-[10px] text-muted leading-tight">{label}</div>
    </div>
  );
}
