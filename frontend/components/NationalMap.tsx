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
const AMBER: [number, number, number] = [255, 197, 61];
const GREEN: [number, number, number] = [75, 227, 143];

/** The live national map: each airport's #1 missing leisure route as an animated flight. */
export default function NationalMap({ interactive = true, view, onAirport }: {
  interactive?: boolean;
  view?: MapViewState;
  onAirport?: (code: string) => void;
}) {
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
      getColor: (f) => (f.launched ? [...GREEN, 80] : [...AMBER, 46]),
      widthMinPixels: 1,
      billboard: true,
    }),
    new TripsLayer<Flight>({
      id: "comets",
      data: flights,
      getPath: (f) => f.path,
      getTimestamps: (f) => f.times,
      getColor: (f) => (f.launched ? GREEN : AMBER),
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
      getRadius: (a) => 20000 + 80000 * Math.sqrt(a.seats / maxSeats),
      getFillColor: [...AMBER, 28],
      radiusMinPixels: 4,
    }),
    new ScatterplotLayer<Airport>({
      id: "airports",
      data: airports,
      getPosition: (a) => [a.lon, a.lat],
      getRadius: (a) => 6000 + 24000 * Math.sqrt(a.seats / maxSeats),
      getFillColor: (a) => (a.called_2026 > 0 ? [...GREEN, 255] : [255, 236, 190, 240]),
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
      tooltip={({ object, layer }) => {
        if (!interactive || layer?.id !== "airports") return null;
        const a = object as Airport | undefined;
        return a ? `${a.code} · ${a.city}\n${fmtInt(a.seats)} seats a year\nTop missing route → ${a.top_opportunity} (${a.top_score.toFixed(1)})` : null;
      }}
    />
  );
}
