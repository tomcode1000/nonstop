"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CodeTiles } from "@/components/ui";
import { type Airport, get } from "@/lib/api";

let cache: Promise<Airport[]> | null = null;

/** Airport search with a dropdown of matches. `dark` for the app, light for the landing page. */
export default function AirportSearch({ dark = false, big = false }: { dark?: boolean; big?: boolean }) {
  const router = useRouter();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    cache ??= get<Airport[]>("/api/airports");
    cache.then(setAirports).catch(() => { cache = null; });
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return airports.filter((a) => a.code.toLowerCase().startsWith(q) || a.city.toLowerCase().includes(q)).slice(0, 6);
  }, [query, airports]);

  const input = dark
    ? "bg-[#060b17] border-line text-text placeholder:text-faint focus:border-route/70"
    : "bg-white border-[var(--rule)] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-[var(--amber)] shadow-[0_1px_0_rgba(11,22,38,0.04),0_12px_32px_-18px_rgba(11,22,38,0.35)]";
  const list = dark ? "glass" : "bg-white border border-[var(--rule)] shadow-xl";

  return (
    <div className="relative">
      <svg className={`absolute left-4 top-1/2 -translate-y-1/2 ${dark ? "text-faint" : "text-[var(--ink-3)]"}`} width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && matches[0] && router.push(`/airport/${matches[0].code}`)}
        placeholder="Your airport — Boise, Savannah, BZN…"
        aria-label="Find your airport"
        className={`w-full rounded-xl border pl-11 pr-4 outline-none transition-colors ${big ? "py-4 text-[15px]" : "py-3 text-sm"} ${input}`}
      />
      {matches.length > 0 && (
        <ul className={`absolute z-20 mt-1.5 w-full rounded-xl overflow-hidden ${list}`}>
          {matches.map((a) => (
            <li key={a.code}>
              <Link href={`/airport/${a.code}`} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${dark ? "hover:bg-black/[0.04]" : "hover:bg-[var(--paper)]"}`}>
                <span className="flex items-center gap-3">
                  <CodeTiles code={a.code} size="sm" />
                  <span className={`text-sm ${dark ? "text-muted" : "text-[var(--ink-2)]"}`}>{a.city}</span>
                </span>
                <span className={`text-[11px] ${dark ? "text-faint" : "text-[var(--ink-3)]"}`}>top missing: <span className="font-mono text-route">{a.top_opportunity}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
