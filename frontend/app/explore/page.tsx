"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import NationalMap from "@/components/NationalMap";
import AirportSearch from "@/components/AirportSearch";
import { Eyebrow, Panel } from "@/components/ui";

const QUICK = ["BOI", "SAV", "DSM", "FAT", "BZN", "PSP", "GRR", "RNO"];

export default function Explore() {
  const router = useRouter();
  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <NationalMap onAirport={(code) => router.push(`/airport/${code}`)} />

      <Panel className="absolute left-3 right-3 top-3 sm:left-5 sm:right-auto sm:top-5 sm:w-[380px] p-5">
        <Eyebrow tone="taste">Explore · 279 US airports</Eyebrow>
        <h1 className="font-display mt-2.5 text-[24px] font-semibold leading-tight">Pick an airport to see the leisure routes it&apos;s missing.</h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Each glowing arc is one airport&apos;s #1 missing route. Green ones already launched in 2026.
        </p>
        <div className="mt-4"><AirportSearch dark /></div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK.map((c) => (
            <Link key={c} href={`/airport/${c}`} className="rounded-lg border border-line px-2 py-1 font-mono text-[11.5px] text-muted transition-colors hover:text-route hover:border-route/60">
              {c}
            </Link>
          ))}
        </div>
      </Panel>

      <div className="absolute bottom-4 right-4 hidden sm:flex items-center gap-4 glass rounded-xl px-4 py-2.5 text-[11.5px] text-muted">
        <span className="flex items-center gap-2"><i className="h-0.5 w-5 rounded bg-route shadow-[0_0_6px_var(--route)]" /> each airport&apos;s #1 missing route</span>
        <span className="flex items-center gap-2"><i className="h-0.5 w-5 rounded bg-called shadow-[0_0_6px_var(--called)]" /> already launched in 2026</span>
      </div>
    </div>
  );
}
