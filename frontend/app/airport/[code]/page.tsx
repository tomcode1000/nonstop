"use client";

import { HexagonLayer } from "@deck.gl/aggregation-layers";
import type { MapViewState } from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import { PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import RouteCaseButton from "@/components/RouteCaseButton";
import { CodeTiles, Eyebrow, Panel, Pill, ScoreRing } from "@/components/ui";
import { type AirportView, fmtInt, fmtUsd, get, type Heatmap, type Opportunity } from "@/lib/api";
import { flightPath, timestamps, useLoopClock } from "@/lib/geo";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });

type Route = Opportunity & { path: [number, number, number][]; times: number[] };
const LOOP = 60;
// Qloo taste skyline: deep teal to bright cyan to white for the strongest affinity.
const TASTE_RANGE: [number, number, number][] = [[10, 45, 70], [14, 80, 115], [22, 125, 160], [40, 175, 210], [61, 214, 245], [200, 248, 255]];

export default function AirportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const [view, setView] = useState<AirportView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [heat, setHeat] = useState<Heatmap | null>(null);
  const [showHeat, setShowHeat] = useState(true);
  const [map, setMap] = useState<MapViewState | null>(null);
  const [secondAirports, setSecondAirports] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useLoopClock(LOOP, 18);

  useEffect(() => {
    get<AirportView>(`/api/airport/${code}/opportunities?limit=15&second_airports=${secondAirports}`)
      .then((v) => {
        setView(v);
        setSelected((s) => (s && v.opportunities.some((o) => o.dest === s) ? s : v.opportunities[0]?.dest ?? null));
        setMap((m) => m ?? { longitude: v.lon + 2, latitude: v.lat - 4.5, zoom: 3.8, pitch: 52, bearing: -12 });
      })
      .catch((e) => setError(String(e)));
  }, [code, secondAirports]);

  useEffect(() => {
    if (!selected) return;
    setHeat(null);
    get<Heatmap>(`/api/heatmap/${selected}`).then(setHeat).catch(() => setHeat(null));
  }, [selected]);

  const routes: Route[] = useMemo(
    () => (view ? view.opportunities.map((o, i) => ({ ...o, path: flightPath([view.lon, view.lat], [o.lon, o.lat]), times: timestamps(48, 14, (i * 9) % LOOP) })) : []),
    [view],
  );
  const opp = view?.opportunities.find((o) => o.dest === selected) ?? null;

  const layers = useMemo(() => {
    if (!view) return [];
    const origin: [number, number] = [view.lon, view.lat];
    const sel = routes.filter((r) => r.dest === selected);
    return [
      showHeat && heat &&
        new HexagonLayer<[number, number, number]>({
          id: "qloo-taste",
          data: heat.cells,
          getPosition: (c) => [c[1], c[0]],
          getColorWeight: (c) => c[2],
          colorAggregation: "MEAN",
          getElevationWeight: (c) => c[2] ** 3,
          elevationAggregation: "MEAN",
          radius: 28000,
          coverage: 0.72,
          extruded: true,
          elevationScale: 1,
          elevationRange: [0, 75000],
          // Hide the weakest 45% of areas so the skyline shows where taste really concentrates.
          lowerPercentile: 45,
          elevationLowerPercentile: 45,
          colorRange: TASTE_RANGE,
          opacity: 0.42,
          material: { ambient: 0.6, diffuse: 0.5, shininess: 24, specularColor: [80, 200, 255] },
        }),
      // Glow under the selected route so it reads above the taste skyline.
      new PathLayer<Route>({
        id: "route-glow",
        data: sel,
        getPath: (r) => r.path,
        getColor: (r) => (r.already_launched_2026 ? [62, 224, 143, 70] : [245, 181, 68, 70]),
        getWidth: 14,
        widthUnits: "pixels",
        billboard: true,
      }),
      new PathLayer<Route>({
        id: "routes",
        data: routes,
        getPath: (r) => r.path,
        getColor: (r) => r.already_launched_2026 ? [62, 224, 143, r.dest === selected ? 255 : 110] : [245, 181, 68, r.dest === selected ? 255 : 80],
        getWidth: (r) => (r.dest === selected ? 3.5 : 1.4),
        widthUnits: "pixels",
        billboard: true,
        pickable: true,
        onClick: ({ object }) => object && setSelected(object.dest),
        updateTriggers: { getColor: selected, getWidth: selected },
      }),
      new TripsLayer<Route>({
        id: "comets",
        data: routes,
        getPath: (r) => r.path,
        getTimestamps: (r) => r.times,
        getColor: (r) => (r.dest === selected ? [255, 236, 190] : [255, 196, 92]),
        widthMinPixels: 3,
        trailLength: 5,
        fadeTrail: true,
        currentTime: t,
        capRounded: true,
        updateTriggers: { getColor: selected },
      }),
      new ScatterplotLayer<Route>({
        id: "dests",
        data: routes,
        getPosition: (r) => [r.lon, r.lat],
        getRadius: (r) => (r.dest === selected ? 30000 : 17000),
        getFillColor: (r) => (r.already_launched_2026 ? [62, 224, 143] : [245, 181, 68]),
        getLineColor: [4, 7, 14],
        lineWidthMinPixels: 1.5,
        stroked: true,
        radiusMinPixels: 3,
        pickable: true,
        onClick: ({ object }) => object && setSelected(object.dest),
        updateTriggers: { getRadius: selected },
      }),
      new ScatterplotLayer({
        id: "origin",
        data: [origin],
        getPosition: (p: [number, number]) => p,
        getRadius: 38000,
        radiusMinPixels: 7,
        getFillColor: [233, 238, 247],
        getLineColor: [245, 181, 68],
        stroked: true,
        lineWidthMinPixels: 3,
      }),
      new TextLayer<Route>({
        id: "labels",
        data: [...routes.slice(0, 8), ...sel],
        getPosition: (r) => [r.lon, r.lat],
        getText: (r) => r.dest,
        getSize: (r) => (r.dest === selected ? 14 : 11),
        getColor: (r) => (r.dest === selected ? [255, 236, 190, 255] : [190, 200, 220, 200]),
        getPixelOffset: [0, -16],
        fontFamily: "JetBrains Mono, monospace",
        fontWeight: 600,
        background: true,
        getBackgroundColor: [4, 7, 14, 200],
        backgroundPadding: [4, 2],
        updateTriggers: { getSize: selected, getColor: selected },
      }),
    ].filter(Boolean);
  }, [view, routes, heat, selected, showHeat, t]);

  if (error) {
    return (
      <div className="p-8 text-sm">
        <p className="text-miss">No predictions for {code}.</p>
        <Link href="/explore" className="text-muted hover:text-text">← Back to the map</Link>
      </div>
    );
  }

  const launched = view?.opportunities.filter((o) => o.already_launched_2026).length ?? 0;
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
            return `${code} → ${o.dest} · ${o.dest_city}\nLaunch score ${o.launch_score.toFixed(1)} · #${o.rank} for ${code}`;
          }}
        />
      )}

      {/* Departure board: the airport and its missing routes */}
      <Panel className="absolute left-4 top-4 bottom-4 w-[318px] hidden md:flex flex-col overflow-hidden">
        <div className="p-5 pb-4 border-b border-line">
          <Link href="/explore" className="text-[11.5px] text-faint hover:text-text">← All airports</Link>
          <div className="mt-3 flex items-center gap-3">
            <CodeTiles code={code} size="lg" tone="route" />
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold leading-tight truncate">{view?.city.split(",")[0]}</p>
              <p className="text-[12px] text-muted">{view?.city.split(",")[1]?.trim()} · missing leisure routes</p>
            </div>
          </div>
          <label className="mt-4 flex items-start gap-2 text-[11.5px] text-muted cursor-pointer">
            <input type="checkbox" checked={secondAirports} onChange={(e) => setSecondAirports(e.target.checked)} className="mt-0.5 accent-[var(--route)]" />
            Include second-airport routes (that city is already served via a nearby airport)
          </label>
        </div>
        <div className="flex items-center justify-between px-5 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.18em] text-faint">
          <span>Destination</span><span>Score</span>
        </div>
        <ol className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
          {view?.opportunities.map((o) => (
            <li key={o.dest}>
              <button
                onClick={() => setSelected(o.dest)}
                className={`group w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${o.dest === selected ? "bg-route/[0.09] ring-1 ring-route/50" : "hover:bg-white/[0.035]"}`}
              >
                <span className="w-4 text-[11px] text-faint tabular">{o.rank}</span>
                <CodeTiles code={o.dest} size="sm" tone={o.dest === selected ? "route" : "text"} />
                <span className="flex-1 min-w-0 text-[12.5px] text-muted truncate">{o.dest_city.split(",")[0]}</span>
                {o.already_launched_2026 ? (
                  <Pill tone="called">launched</Pill>
                ) : (
                  <span className="w-14">
                    <span className="block text-right text-[11.5px] font-semibold tabular text-route">{o.launch_score.toFixed(1)}</span>
                    <span className="mt-1 block h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                      <span className="block h-full bg-route/80" style={{ width: `${Math.max(4, (o.launch_score - 85) * (100 / 15))}%` }} />
                    </span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
        {launched > 0 && (
          <p className="px-5 py-3 border-t border-line text-[11px] text-muted">
            <span className="text-called font-semibold">{launched}</span> of these already launched in 2026, after the data the model learned from.
          </p>
        )}
      </Panel>

      {/* Mobile: routes as a strip above the detail sheet */}
      <div className="md:hidden absolute left-0 right-0 top-2 px-3">
        <Panel className="px-3 py-2.5">
          <div className="flex items-center gap-2"><CodeTiles code={code} size="sm" tone="route" /><span className="text-sm text-muted">{view?.city}</span></div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {view?.opportunities.map((o) => (
              <button key={o.dest} onClick={() => setSelected(o.dest)}
                className={`shrink-0 rounded-lg border px-2 py-1 text-[11.5px] font-mono ${o.dest === selected ? "border-route text-route" : "border-line text-muted"}`}>
                {o.rank}·{o.dest}
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {opp && <RouteCard origin={code} opp={opp} heat={heat} showHeat={showHeat} setShowHeat={setShowHeat} />}

      {showHeat && heat && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-3 glass rounded-xl px-4 py-2.5 text-[11.5px] text-muted">
          <span className="text-taste font-medium">Qloo taste</span>
          <span className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(90deg, rgb(10,45,70), rgb(22,125,160), rgb(61,214,245), rgb(200,248,255))" }} />
          <span>taller = that area loves {heat.qloo_destination} more (Qloo heat map)</span>
        </div>
      )}
    </div>
  );
}

function RouteCard({ origin, opp, heat, showHeat, setShowHeat }: {
  origin: string; opp: Opportunity; heat: Heatmap | null; showHeat: boolean; setShowHeat: (v: boolean) => void;
}) {
  const maxPush = Math.max(0.5, ...opp.drivers.map((d) => Math.abs(d.push)));
  // The Qloo place used as the destination's taste anchor can differ from the airport's city
  // (Key West's airport is anchored on Marathon); say both so the label never looks wrong.
  const qlooPlace = heat?.qloo_destination ?? opp.qloo_destination;
  const cityName = opp.dest_city.split(",")[0];
  const anchor = qlooPlace === cityName ? cityName : `${cityName} (Qloo: ${qlooPlace})`;
  return (
    <Panel className="absolute left-3 right-3 bottom-3 max-h-[52%] md:left-auto md:right-4 md:top-4 md:bottom-4 md:max-h-none md:w-[392px] overflow-y-auto">
      <div className="p-5 border-b border-line">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Route #{opp.rank} for {origin}</Eyebrow>
            <div className="mt-2.5 flex items-center gap-2">
              <CodeTiles code={origin} size="md" />
              <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden><path d="M1 12 C 8 1, 18 1, 25 12" stroke="var(--route)" strokeWidth="1.8" fill="none" strokeDasharray="3 2" /></svg>
              <CodeTiles code={opp.dest} size="md" tone="route" />
            </div>
            <p className="mt-2 text-[12.5px] text-muted">{opp.dest_city} · {fmtInt(opp.km)} km</p>
          </div>
          <ScoreRing value={opp.launch_score} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {opp.already_launched_2026 && <Pill tone="called">✓ Launched in 2026 — called before it happened</Pill>}
          {opp.second_airport_via && <Pill>Second airport · {opp.second_airport_via.replace("-", " → ")} exists</Pill>}
          {opp.qloo_origin_list_rank && <Pill tone="taste">#{opp.qloo_origin_list_rank} on {origin}&apos;s Qloo favourites</Pill>}
        </div>
      </div>

      <section className="p-5 border-b border-line">
        <Eyebrow tone="taste">Qloo taste</Eyebrow>
        <div className="mt-3 space-y-3">
          <Bar label={`How strongly ${origin}'s area leans toward ${anchor}`} value={opp.qloo.affinity} />
          <Bar label="Ahead of this share of all US towns" value={opp.qloo.rank_among_towns} />
          <Bar label={`Ahead of this share of ${origin}'s other options`} value={opp.qloo.rank_among_own_options} />
        </div>
        <label className="mt-3.5 flex items-center gap-2 text-[11.5px] text-muted cursor-pointer">
          <input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} className="accent-[var(--taste)]" />
          Show the 3D Qloo taste map for {anchor}
        </label>
      </section>

      <section className="p-5 border-b border-line">
        <Eyebrow>Why it ranks here</Eyebrow>
        <ul className="mt-3 space-y-2.5">
          {opp.drivers.map((d) => (
            <li key={d.driver} className="text-[12px]">
              <div className="flex justify-between">
                <span className={d.driver === "Qloo taste" ? "text-taste font-medium" : "text-text"}>{d.driver}</span>
                <span className="tabular text-faint">{d.push >= 0 ? "+" : ""}{d.push.toFixed(2)}</span>
              </div>
              <div className="mt-1.5 h-[5px] rounded-full bg-white/[0.05] relative overflow-hidden">
                <div className={`absolute h-full rounded-full ${d.push >= 0 ? (d.driver === "Qloo taste" ? "bg-taste" : "bg-route/85") : "bg-miss/80"}`}
                  style={{ left: d.push >= 0 ? "50%" : `${50 - (50 * Math.abs(d.push)) / maxPush}%`, width: `${(50 * Math.abs(d.push)) / maxPush}%` }} />
                <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="p-5 border-b border-line">
        <Eyebrow>People already making this trip</Eyebrow>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini value={fmtInt(Math.max(opp.demand.passengers_per_year, opp.demand.metro_passengers_per_year))} label="passengers a year" />
          <Mini value={`${Math.round(opp.demand.connect_share * 100)}%`} label="via a connection" />
          <Mini value={opp.demand.annual_spend_usd ? fmtUsd(opp.demand.annual_spend_usd) : "—"} label="spent a year" accent />
        </div>
        <p className="mt-2 text-[10.5px] text-faint">US DOT DB1B ticket sample, metro to metro. 2025 annualised from Q1–Q2.</p>
      </section>

      <section className="p-5">
        <Eyebrow>Most likely airline</Eyebrow>
        <ul className="mt-3 space-y-2">
          {opp.airlines.map((a, i) => (
            <li key={a.carrier} className={`rounded-xl border p-3 ${i === 0 ? "border-route/40 bg-route/[0.05]" : "border-line"}`}>
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold">{a.name}</span>
                <span className="text-[12px] tabular text-route">{Math.round(a.probability * 100)}%</span>
              </div>
              <div className="mt-1.5 h-[3px] rounded-full bg-white/[0.05] overflow-hidden"><div className="h-full bg-route/70" style={{ width: `${a.probability * 100}%` }} /></div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{a.why.join(" · ")}</p>
            </li>
          ))}
        </ul>
        <RouteCaseButton key={opp.dest} origin={origin} dest={opp.dest} />
      </section>
    </Panel>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[12px]"><span className="text-muted">{label}</span><span className="tabular font-semibold text-taste">{Math.round(value * 100)}</span></div>
      <div className="mt-1.5 h-[5px] rounded-full bg-white/[0.05] overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-[#1a7fa3] to-taste shadow-[0_0_8px_rgba(61,214,245,0.5)]" style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
    </div>
  );
}

function Mini({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.025] border border-line px-2.5 py-2.5">
      <div className={`font-display text-[17px] font-semibold tabular ${accent ? "text-route" : ""}`}>{value}</div>
      <div className="text-[10.5px] text-muted leading-tight mt-0.5">{label}</div>
    </div>
  );
}
