"use client";

import type { MapViewState } from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { type Airport, fmtInt, get } from "@/lib/api";
import { flightPath, timestamps, useLoopClock } from "@/lib/geo";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });

export type TopRoute = { origin: string; dest: string; dest_city: string; score: number; from: [number, number]; to: [number, number]; launched: boolean };
type Flight = TopRoute & { path: [number, number, number][]; times: number[] };
const LOOP = 120;

/** The live national map: every airport, and each airport's #1 missing leisure route as an animated flight. */
export default function NationalMap({ interactive = true, view, onAirport, vignette = true, theme = "night" }: {
  interactive?: boolean;
  view?: MapViewState;
  onAirport?: (code: string) => void;
  vignette?: boolean;
  theme?: "night" | "chart";
}) {
  // On the light chart map, glows become ink and deeper amber so they read on paper.
  const light = theme === "chart";
  const ROUTE: [number, number, number] = light ? [214, 128, 8] : [245, 181, 68];
  const COMET: [number, number, number] = light ? [196, 104, 0] : [255, 196, 92];
  const CALLED: [number, number, number] = light ? [17, 134, 90] : [62, 224, 143];
  const [airports, setAirports] = useState<Airport[]>([]);
  const [routes, setRoutes] = useState<TopRoute[]>([]);
  const t = useLoopClock(LOOP, 14);

  useEffect(() => {
    get<Airport[]>("/api/airports").then(setAirports).catch(() => null);
    get<TopRoute[]>("/api/top-routes").then(setRoutes).catch(() => null);
  }, []);

  const flights: Flight[] = useMemo(
    () => routes.map((r, i) => ({ ...r, path: flightPath(r.from, r.to), times: timestamps(48, 30, (i * 37) % LOOP) })),
    [routes],
  );
  const maxSeats = Math.max(1, ...airports.map((a) => a.seats));

  const layers = [
    new PathLayer<Flight>({
      id: "route-lines",
      data: flights,
      getPath: (f) => f.path,
      getColor: (f) => (f.launched ? [...CALLED, light ? 110 : 70] : [...ROUTE, light ? 70 : 38]),
      widthMinPixels: 1,
      billboard: true,
    }),
    new TripsLayer<Flight>({
      id: "comets",
      data: flights,
      getPath: (f) => f.path,
      getTimestamps: (f) => f.times,
      getColor: (f) => (f.launched ? CALLED : COMET),
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
      getFillColor: light ? [214, 128, 8, 30] : [245, 181, 68, 26],
      radiusMinPixels: 5,
    }),
    new ScatterplotLayer<Airport>({
      id: "airports",
      data: airports,
      getPosition: (a) => [a.lon, a.lat],
      getRadius: (a) => 7000 + 26000 * Math.sqrt(a.seats / maxSeats),
      getFillColor: (a) => (a.called_2026 > 0 ? [...CALLED, 255] : light ? [11, 22, 38, 220] : [255, 214, 140, 235]),
      radiusMinPixels: 2,
      pickable: interactive,
      onClick: ({ object }) => object && onAirport?.(object.code),
    }),
  ];

  return (
    <MapCanvas
      layers={layers}
      initialView={view}
      interactive={interactive}
      vignette={vignette}
      theme={theme}
      tooltip={({ object, layer }) => {
        if (!interactive || layer?.id !== "airports") return null;
        const a = object as Airport | undefined;
        return a ? `${a.code} · ${a.city}\n${fmtInt(a.seats)} seats a year\nTop missing route → ${a.top_opportunity} (${a.top_score.toFixed(1)})` : null;
      }}
    />
  );
}
