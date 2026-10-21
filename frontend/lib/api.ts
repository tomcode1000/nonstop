export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Airport = {
  code: string;
  city: string;
  lat: number;
  lon: number;
  seats: number;
  top_opportunity: string;
  top_score: number;
  called_2026: number;
};

export type Airline = { carrier: string; name: string; probability: number; why: string[] };

export type Opportunity = {
  dest: string;
  dest_city: string;
  qloo_destination: string;
  lat: number;
  lon: number;
  km: number;
  rank: number;
  overall_rank: number;
  launch_score: number;
  already_launched_2026: boolean;
  second_airport_via: string | null;
  qloo_origin_list_rank: number | null;
  qloo: { affinity: number; rank_among_towns: number; rank_among_own_options: number; vs_own_options: number };
  demand: {
    passengers_per_year: number;
    metro_passengers_per_year: number;
    connect_share: number;
    avg_fare: number | null;
    annual_spend_usd: number | null;
  };
  drivers: { driver: string; push: number }[];
  airlines: Airline[];
};

export type AirportView = { airport: string; city: string; lat: number; lon: number; opportunities: Opportunity[] };

export type ReplayArc = {
  origin: string;
  dest: string;
  origin_city: string;
  dest_city: string;
  from: [number, number];
  to: [number, number];
  rank: number;
  month: number | null;
};

export type Replay = {
  year: number;
  top: number;
  picks: ReplayArc[];
  launches: ReplayArc[];
  summary: { launches: number; called_in_top: number; share: number };
};

export type Heatmap = { dest: string; qloo_destination: string; cells: [number, number, number][] };

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const fmtInt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmtUsd = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;
