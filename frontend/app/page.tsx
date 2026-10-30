"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AirportSearch from "@/components/AirportSearch";
import AskNonstop from "@/components/AskNonstop";
import NationalMap, { type TopRoute } from "@/components/NationalMap";
import { CodeTiles, Logo } from "@/components/ui";
import { type AirportView, fmtInt, fmtUsd, get, type Opportunity } from "@/lib/api";

type Backtest = {
  models: Record<string, { auc: number } | number[]>;
  replay: { launches: number; in_top10: number };
  forward: { launches_seen: number; in_top10: number; through_month: number };
};
const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Landing() {
  const [bt, setBt] = useState<Backtest | null>(null);
  const [boi, setBoi] = useState<AirportView | null>(null);
  const [called, setCalled] = useState<TopRoute | null>(null);

  useEffect(() => {
    get<Backtest>("/api/backtest").then(setBt).catch(() => null);
    get<AirportView>("/api/airport/BOI/opportunities?limit=5").then(setBoi).catch(() => null);
    get<TopRoute[]>("/api/top-routes").then((r) => setCalled(r.filter((x) => x.launched).sort((a, b) => b.score - a.score)[0] ?? null)).catch(() => null);
  }, []);

  const hero = boi?.opportunities[0];
  const ci = bt?.models["logistic | Qloo AUC lift 90% CI"] as number[] | undefined;
  const auc = (k: string) => (bt?.models[k] as { auc: number } | undefined)?.auc;

  return (
    <div className="paper min-h-screen">
      <LandingHeader />

      {/* ------------------------------------------------------------ HERO */}
      <section className="relative graticule border-b border-[var(--rule)] overflow-hidden">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 pt-28 pb-16 lg:pb-24 grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-6 items-start">
          <div>
            <Link href="/replay" className="inline-flex items-center gap-2 rounded-full border border-[var(--rule)] bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-[var(--ink-2)] hover:border-[var(--ink-3)]">
              <span className="live-dot h-2 w-2 rounded-full bg-[var(--green)]" />
              {bt ? <>Live · {bt.forward.in_top10} of 2026&apos;s first {bt.forward.launches_seen} new leisure routes called before launch</> : "Live forecasts for 279 US airports"}
              <span aria-hidden>→</span>
            </Link>

            <h1 className="font-display mt-6 text-[46px] sm:text-[62px] lg:text-[72px] font-[560] leading-[1.0] tracking-[-0.04em]">
              Your town’s next{" "}
              <span className="relative inline-block text-[var(--amber)]">
                nonstop
                {/* A flight path drawn under the word: origin dot, dashed arc, destination dot. */}
                <svg className="absolute -bottom-[7px] left-[2%] w-[96%] h-[10px] overflow-visible" viewBox="0 0 220 16" preserveAspectRatio="none" aria-hidden>
                  <path className="arc-draw" d="M6 6 C 60 18, 160 18, 214 6" fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" />
                  <circle cx="6" cy="6" r="4" fill="var(--ink)" /><circle cx="214" cy="6" r="4" fill="var(--amber)" />
                </svg>
              </span>{" "}
              is already in the data.
            </h1>

            <p className="mt-6 max-w-[540px] text-[17px] leading-[1.6] text-[var(--ink-2)]">
              Nonstop reads every US route and ticket record, adds Qloo&apos;s map of where people&apos;s tastes already
              point, and tells an airport which leisure routes to pitch next, and to which airline.
            </p>

            <div className="mt-8 max-w-[520px]"><AirportSearch big /></div>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/explore" className="rounded-lg bg-[var(--ink)] px-5 py-2.5 text-[14px] font-semibold text-[var(--paper)] hover:bg-white/85">Open the live map</Link>
              <Link href="/replay" className="text-[14px] font-semibold text-[var(--ink)] hover:text-[var(--amber)]">Watch it call 2025 in January →</Link>
            </div>
            <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
              US DOT T-100 · DB1B ticket sample · Qloo Taste AI · 279 airports · 61 airlines
            </p>
          </div>

          {/* The live map printed straight onto the chart paper: no window, edges fade into the page. */}
          <div className="relative lg:-mt-6 lg:-mr-10">
            <div
              className="relative aspect-[16/12] [mask-image:radial-gradient(ellipse_62%_60%_at_52%_52%,#000_42%,transparent_96%)]"
            >
              <NationalMap interactive={false} view={{ longitude: -96, latitude: 38, zoom: 2.95, pitch: 28, bearing: -6 }} />
            </div>
            <span className="absolute left-[14%] top-[9%] flex items-center gap-1.5 rounded-full border border-[var(--rule)] bg-[var(--paper)]/90 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--ink-2)]">
              <i className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--green)]" /> Live · every airport&apos;s #1 missing route
            </span>

            {hero && (
              <div className="absolute -left-2 sm:-left-10 -bottom-12 sm:-bottom-10 w-[300px] sm:w-[330px] z-10">
                <BoardingPass origin="BOI" originCity="Boise" opp={hero} />
              </div>
            )}
            {called && (
              <div className="absolute -right-2 sm:-right-6 -top-6 z-10 rounded-xl bg-[#0b0b0c] px-4 py-3 border border-[var(--rule)]">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--green)]">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--green)] text-[9px] text-black">✓</span> Called before launch
                </div>
                <div className="mt-1.5 flex items-center gap-2 font-mono text-[15px] font-semibold">
                  {called.origin} <span className="text-[var(--ink-3)]">→</span> {called.dest}
                </div>
                <div className="text-[11.5px] text-[var(--ink-3)]">{called.dest_city} · launched in 2026</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ THE PROBLEM */}
      <section className="mx-auto max-w-[1240px] px-5 sm:px-8 pt-28 pb-20">
        <Eyebrow>The problem</Eyebrow>
        <h2 className="font-display mt-3 max-w-[820px] text-[34px] sm:text-[46px] font-[540] leading-[1.02] tracking-[-0.035em]">
          Airports pitch new routes with yesterday&apos;s tickets.
        </h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-3">
          <BigNumber n="~450" label="brand-new US airport-pair markets open every year" source="US DOT T-100, 2023–2025" />
          <BigNumber n="4 in 10" label="are no longer served a year later" source="US DOT T-100, 2023–2024 cohorts" tone="red" />
          <BigNumber n="56 → 14" label="communities applied for federal air-service grants; 14 were funded" source="US DOT, 2026 round" />
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <Compare title="What a route study sees today" tone="muted" rows={[
            ["Data", "Tickets people already bought"],
            ["Blind spot", "Demand for a flight that doesn't exist yet"],
            ["Scope", "One airport, once a year"],
            ["Cost", "Consultant retainers (Savannah's: $135k a year)"],
          ]} />
          <Compare title="What Nonstop adds" tone="amber" rows={[
            ["Data", "Every route and ticket, plus Qloo's taste graph"],
            ["Sees", "Where people's tastes already point, flight or not"],
            ["Scope", "Every missing leisure route, 279 airports, monthly"],
            ["Output", "The likely airline, and a case written for them"],
          ]} />
        </div>
      </section>

      {/* ------------------------------------------------------------ HOW IT WORKS */}
      <section id="how" className="border-y border-[var(--rule)] bg-[var(--paper-2)]/60 graticule">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-24">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="font-display mt-3 max-w-[760px] text-[34px] sm:text-[46px] font-[540] leading-[1.02] tracking-[-0.035em]">
            Four data layers, one ranked list per airport.
          </h2>
          <ol className="relative mt-14 grid gap-8 md:grid-cols-4">
            <svg className="pointer-events-none absolute left-0 right-0 top-[18px] hidden md:block w-full h-6" preserveAspectRatio="none" viewBox="0 0 1000 24" aria-hidden>
              <path d="M20 12 H 980" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="6 8" fill="none" />
            </svg>
            {[
              ["01", "Every route, every month", "US DOT T-100 for all 61 US airlines shows which airport pairs gained a brand-new nonstop each year since 2022."],
              ["02", "Who already makes the trip", "The DB1B ticket sample shows how many people fly each pair through a connection, and what they pay."],
              ["03", "Where the taste already is", "Qloo's taste graph maps, town by town, how strongly people lean toward 158 leisure destinations, even with no flight there."],
              ["04", "Who would fly it", "A model trained on past launches ranks every missing route, and a matchmaker learns each leisure airline's habits."],
            ].map(([n, title, body]) => (
              <li key={n} className="relative">
                <span className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border font-mono text-[12px] font-semibold ${n === "03" ? "border-[var(--cyan)] bg-[var(--cyan)] text-black" : "border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]"}`}>{n}</span>
                <h3 className={`font-display mt-5 text-[20px] font-[540] tracking-[-0.025em] ${n === "03" ? "text-[var(--cyan)]" : ""}`}>{title}</h3>
                <p className="mt-2 text-[14px] leading-[1.6] text-[var(--ink-2)]">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------ INSIDE THE PRODUCT */}
      <section className="mx-auto max-w-[1240px] px-5 sm:px-8 py-24">
        <Eyebrow>Inside an airport</Eyebrow>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display max-w-[720px] text-[34px] sm:text-[46px] font-[540] leading-[1.02] tracking-[-0.035em]">
            Boise, for example.
          </h2>
          <Link href="/airport/BOI" className="rounded-lg border border-[var(--ink)] px-5 py-2.5 text-[14px] font-semibold hover:bg-[#0b0b0c] hover:text-black">Open Boise →</Link>
        </div>
        {boi && hero && (
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <Screen title="The missing routes, ranked" note="Each one is a market with no nonstop today.">
              <ol className="space-y-1.5">
                {boi.opportunities.map((o) => (
                  <li key={o.dest} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-2.5 py-2">
                    <span className="w-3 text-[11px] text-[#71717a]">{o.rank}</span>
                    <CodeTiles code={o.dest} size="sm" tone={o.rank === 1 ? "route" : "text"} />
                    <span className="flex-1 text-[12.5px] text-[#a1a1aa]">{o.dest_city.split(",")[0]}</span>
                    <span className="font-mono text-[12px] text-[#ffc53d]">{o.launch_score.toFixed(1)}</span>
                  </li>
                ))}
              </ol>
            </Screen>
            <Screen title="Why it ranks, with Qloo's evidence" note="Qloo is the cyan layer: taste for a place, mapped town by town." accent="cyan">
              <div className="space-y-3">
                <TasteBar label={`Boise's lean toward ${hero.dest_city.split(",")[0]}`} v={hero.qloo.affinity} />
                <TasteBar label="Ahead of this share of US towns" v={hero.qloo.rank_among_towns} />
                <TasteBar label="Ahead of Boise's other options" v={hero.qloo.rank_among_own_options} />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MiniStat v={fmtInt(Math.max(hero.demand.passengers_per_year, hero.demand.metro_passengers_per_year))} l="already fly it with a connection" />
                  <MiniStat v={hero.demand.annual_spend_usd ? fmtUsd(hero.demand.annual_spend_usd) : "—"} l="spent on the trip each year" amber />
                </div>
              </div>
            </Screen>
            <Screen title="The airline, and the pitch" note="One click writes the case an airport sends to an airline planner.">
              <div className="space-y-2">
                {hero.airlines.slice(0, 2).map((a, i) => (
                  <div key={a.carrier} className={`rounded-lg border px-3 py-2 ${i === 0 ? "border-[#ffc53d]/40 bg-[#ffc53d]/[0.06]" : "border-white/10"}`}>
                    <div className="flex justify-between text-[13px] font-semibold text-[#f4f4f5]"><span>{a.name}</span><span className="font-mono text-[#ffc53d]">{Math.round(a.probability * 100)}%</span></div>
                    <p className="mt-0.5 text-[11px] text-[#a1a1aa]">{a.why[0]}</p>
                  </div>
                ))}
                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 font-mono text-[10.5px] leading-[1.6] text-[#a1a1aa]">
                  <span className="text-[#45d9ff]">## The ask</span><br />
                  Boise requests evaluation of a new nonstop BOI–{hero.dest}, the #1 route in its list of missing markets…
                </div>
              </div>
            </Screen>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ PROOF */}
      <section id="proof" className="border-y border-[var(--rule)] bg-[#070708] text-[#f4f4f5]">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-24 grid gap-12 lg:grid-cols-[1fr_1.1fr] items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#45d9ff]">Proof, not promises</p>
            <h2 className="font-display mt-3 text-[34px] sm:text-[46px] font-[540] leading-[1.02] tracking-[-0.035em]">
              We let it call 2025 before 2025 happened.
            </h2>
            <p className="mt-5 max-w-[480px] text-[16px] leading-[1.6] text-[#a1a1aa]">
              The model learned only from 2024 launches and saw nothing after December 2024. Then we checked its picks against
              every new leisure route that really opened in 2025, and against 2026 routes as they appear.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
              <Link href="/replay" className="rounded-lg bg-[#ffc53d] px-5 py-2.5 text-[14px] font-semibold text-black">Play the time machine</Link>
              <Link href="/proof" className="text-[14px] font-semibold text-[#f4f4f5] hover:text-[#ffc53d]">Read the full backtest →</Link>
            </div>
          </div>
          {bt && (
            <div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2">
              <DarkNumber n={`${bt.replay.in_top10}/${bt.replay.launches}`} l="new 2025 leisure routes were already in their airport's top 10 in January" />
              <DarkNumber n={`${bt.forward.in_top10}/${bt.forward.launches_seen}`} l={`2026 launches through ${MONTHS[bt.forward.through_month]} were called before they opened`} />
              <DarkNumber n={`${auc("logistic | baseline + Qloo")?.toFixed(3)}`} l={`accuracy (AUC) on routes it never saw, up from ${auc("logistic | baseline")?.toFixed(3)} without Qloo`} cyan />
              <DarkNumber n={ci ? `+${ci[1].toFixed(4)}` : "—"} l={ci ? `Qloo's lift on top of the government's own ticket data (90% CI ${ci[0] >= 0 ? "+" : ""}${ci[0].toFixed(3)} to +${ci[2].toFixed(3)})` : ""} cyan />
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------ WHO IT'S FOR */}
      <section id="who" className="mx-auto max-w-[1240px] px-5 sm:px-8 py-24">
        <Eyebrow>Who it&apos;s for</Eyebrow>
        <h2 className="font-display mt-3 max-w-[760px] text-[34px] sm:text-[46px] font-[540] leading-[1.02] tracking-[-0.035em]">
          For the people whose job is getting the next flight.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            ["Airport air-service teams", "Walk into an airline meeting with the routes your town is missing, the demand already flying them the long way, and the carrier most likely to say yes."],
            ["Communities applying for grants", "Federal air-service grants ask for evidence of demand. Nonstop gives a ranked, sourced case for the route you're asking to fund."],
            ["Tourism boards", "See which towns already love your destination and have no nonstop to it yet, and where a co-funded route would land best."],
          ].map(([t, b], i) => (
            <div key={t} className="rounded-xl border border-[var(--rule)] bg-[#0b0b0c] p-6">
              <span className="font-mono text-[12px] text-[var(--amber)]">0{i + 1}</span>
              <h3 className="font-display mt-3 text-[21px] font-[540] tracking-[-0.025em]">{t}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.6] text-[var(--ink-2)]">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ LIMITS */}
      <section className="border-t border-[var(--rule)]">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-20 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Eyebrow>Limits, stated plainly</Eyebrow>
            <h2 className="font-display mt-3 text-[30px] sm:text-[38px] font-[540] leading-[1.04] tracking-[-0.035em]">What Nonstop doesn&apos;t claim.</h2>
            <Link href="/proof" className="mt-5 inline-block text-[14px] font-semibold hover:text-[var(--amber)]">The full method and results →</Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              ["Not route survival", "Taste predicts where leisure airlines launch, not which routes last. We tested it; there was no signal."],
              ["A score, not a probability", "The launch score ranks routes against each other from 0 to 100."],
              ["Today's taste", "Qloo's data is a 2026 snapshot, so we also check it forward against 2026 launches as they happen."],
              ["Groups, never people", "Qloo describes group tastes. No personal data is sent to it."],
            ].map(([t, b]) => (
              <li key={t} className="rounded-xl border border-[var(--rule)] p-5">
                <p className="font-display text-[17px] font-[540] tracking-[-0.02em]">{t}</p>
                <p className="mt-1.5 text-[13.5px] leading-[1.55] text-[var(--ink-2)]">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------ FINAL CTA */}
      <section className="relative graticule border-t border-[var(--rule)] overflow-hidden">
        <div className="mx-auto max-w-[860px] px-5 sm:px-8 py-28 text-center">
          <h2 className="font-display text-[42px] sm:text-[60px] font-[560] leading-[0.98] tracking-[-0.04em]">
            Find the flight your town is <span className="text-[var(--amber)]">missing.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[520px] text-[16px] leading-[1.6] text-[var(--ink-2)]">Type your airport. You&apos;ll see its missing leisure routes, why they rank, and who would fly them.</p>
          <div className="mx-auto mt-8 max-w-[520px] text-left"><AirportSearch big /></div>
        </div>
      </section>

      <footer className="border-t border-[var(--rule)] bg-black text-[#a1a1aa]">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-12 grid gap-8 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <Wordmark light />
            <p className="mt-3 max-w-[340px] text-[13.5px] leading-[1.6]">Route intelligence for airports: the leisure flights a town is missing, and the airline most likely to fly them.</p>
          </div>
          <div className="text-[13px] leading-[1.9]">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717a]">Product</p>
            <Link href="/explore" className="block hover:text-white">Live map</Link>
            <Link href="/replay" className="block hover:text-white">Time machine</Link>
            <Link href="/proof" className="block hover:text-white">Proof and method</Link>
          </div>
          <div className="text-[13px] leading-[1.9]">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717a]">Data</p>
            <p>US DOT BTS T-100 and DB1B · OurAirports</p>
            <p>Taste data from the <span className="text-[#45d9ff]">Qloo Insights API</span></p>
            <p>Map tiles © CARTO, © OpenStreetMap contributors</p>
            <a href="https://github.com/tomcode1000/nonstop" className="block hover:text-white">Source on GitHub (MIT) ↗</a>
          </div>
        </div>
        <p className="border-t border-white/10 px-5 py-4 text-center text-[11.5px] text-[#71717a]">Built for the Qloo Agentic Hackathon, 2026. Forecasts, not guarantees.</p>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={28} />
      <span className={`font-display text-[20px] font-[580] tracking-[-0.035em] ${light ? "text-white" : ""}`}>Nonstop</span>
    </span>
  );
}

function LandingHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-30 border-b border-[var(--rule)] bg-[rgba(0,0,0,0.82)] backdrop-blur-xl">
      <div className="mx-auto max-w-[1240px] h-16 px-5 sm:px-8 flex items-center justify-between">
        <Link href="/"><Wordmark /></Link>
        <nav className="hidden md:flex items-center gap-7 text-[14px] text-[var(--ink-2)]">
          <a href="#how" className="hover:text-[var(--ink)]">How it works</a>
          <a href="#proof" className="hover:text-[var(--ink)]">Proof</a>
          <a href="#who" className="hover:text-[var(--ink)]">Who it&apos;s for</a>
          <Link href="/replay" className="hover:text-[var(--ink)]">Time machine</Link>
        </nav>
        <div className="flex items-center gap-2">
          <AskNonstop />
          <Link href="/explore" className="rounded-lg bg-[var(--ink)] px-4 py-2 text-[13px] font-semibold text-[var(--paper)] hover:bg-white/85">Open the map</Link>
        </div>
      </div>
    </header>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11.5px] font-medium uppercase tracking-[0.18em] text-[var(--ink-3)]">{children}</p>;
}

function BoardingPass({ origin, originCity, opp }: { origin: string; originCity: string; opp: Opportunity }) {
  const airline = opp.airlines[0];
  return (
    <div className="ticket rounded-xl bg-[#0b0b0c] text-[var(--ink)]" style={{ "--tear": "70%" } as React.CSSProperties}>
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
          <span>Missing route · #1</span><span className="text-[var(--amber)]">Score {opp.launch_score.toFixed(1)}</span>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div><div className="font-display text-[36px] font-[600] leading-none tracking-[-0.04em]">{origin}</div><div className="text-[11.5px] text-[var(--ink-3)]">{originCity}</div></div>
          <svg width="82" height="26" viewBox="0 0 82 26" aria-hidden className="mb-3">
            <path d="M2 22 C 22 0, 60 0, 80 22" fill="none" stroke="var(--amber)" strokeWidth="2" strokeDasharray="4 4" />
            <circle cx="2" cy="22" r="3" fill="var(--ink)" /><circle cx="80" cy="22" r="3" fill="var(--amber)" />
          </svg>
          <div className="text-right"><div className="font-display text-[36px] font-[600] leading-none tracking-[-0.04em] text-[var(--amber)]">{opp.dest}</div><div className="text-[11.5px] text-[var(--ink-3)]">{opp.dest_city.split(",")[0]}</div></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
          <div><div className="font-mono uppercase tracking-[0.12em] text-[var(--ink-3)]">Qloo taste</div><div className="mt-0.5 font-semibold text-[var(--cyan)]">Ahead of {Math.round(opp.qloo.rank_among_towns * 100)}% of US towns</div></div>
          <div><div className="font-mono uppercase tracking-[0.12em] text-[var(--ink-3)]">Likely airline</div><div className="mt-0.5 font-semibold">{airline?.name} · {Math.round((airline?.probability ?? 0) * 100)}%</div></div>
        </div>
      </div>
      <div className="mx-4 border-t-2 border-dashed border-[var(--rule)]" />
      <div className="px-5 py-3 font-mono text-[10.5px] text-[var(--ink-2)]">
        {fmtInt(Math.max(opp.demand.passengers_per_year, opp.demand.metro_passengers_per_year))} people a year already fly it with a connection
        {opp.demand.annual_spend_usd ? ` · ${fmtUsd(opp.demand.annual_spend_usd)}` : ""}
      </div>
    </div>
  );
}

function BigNumber({ n, label, source, tone }: { n: string; label: string; source: string; tone?: "red" }) {
  return (
    <div className="bg-[var(--paper)] p-7">
      <div className={`font-display text-[50px] font-[540] leading-none tracking-[-0.04em] ${tone === "red" ? "text-[var(--miss)]" : ""}`}>{n}</div>
      <p className="mt-3 text-[15px] leading-[1.5] text-[var(--ink-2)]">{label}</p>
      <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--ink-3)]">{source}</p>
    </div>
  );
}

function Compare({ title, rows, tone }: { title: string; rows: [string, string][]; tone: "muted" | "amber" }) {
  const hi = tone === "amber";
  return (
    <div className={`rounded-xl border p-6 ${hi ? "border-[var(--amber)] bg-[#0b0b0c]" : "border-[var(--rule)] bg-transparent"}`}>
      <p className={`font-mono text-[11px] uppercase tracking-[0.16em] ${hi ? "text-[var(--amber)]" : "text-[var(--ink-3)]"}`}>{title}</p>
      <dl className="mt-4 divide-y divide-[var(--rule)]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-[13px] text-[var(--ink-3)]">{k}</dt>
            <dd className={`text-right text-[14.5px] ${hi ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-2)]"}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Screen({ title, note, children, accent }: { title: string; note: string; children: React.ReactNode; accent?: "cyan" }) {
  return (
    <div>
      <div className="rounded-xl bg-[#0b0b0c] p-4 border border-[var(--rule)] min-h-[300px]">
        <p className={`mb-3 font-mono text-[10px] uppercase tracking-[0.16em] ${accent === "cyan" ? "text-[#45d9ff]" : "text-[#71717a]"}`}>{title}</p>
        {children}
      </div>
      <p className="mt-3 px-1 text-[13.5px] leading-[1.5] text-[var(--ink-2)]">{note}</p>
    </div>
  );
}

function TasteBar({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="flex justify-between text-[11.5px]"><span className="text-[#a1a1aa]">{label}</span><span className="font-mono text-[#45d9ff]">{Math.round(v * 100)}</span></div>
      <div className="mt-1 h-[5px] rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#1f6f8a] to-[#45d9ff]" style={{ width: `${v * 100}%` }} /></div>
    </div>
  );
}

function MiniStat({ v, l, amber }: { v: string; l: string; amber?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <div className={`font-display text-[17px] font-bold ${amber ? "text-[#ffc53d]" : "text-[#f4f4f5]"}`}>{v}</div>
      <div className="text-[10.5px] leading-tight text-[#a1a1aa]">{l}</div>
    </div>
  );
}

function DarkNumber({ n, l, cyan }: { n: string; l: string; cyan?: boolean }) {
  return (
    <div className="bg-[#070708] p-6">
      <div className={`font-display text-[44px] font-[540] leading-none tracking-[-0.04em] ${cyan ? "text-[#45d9ff]" : "text-[#3ee08f]"}`}>{n}</div>
      <p className="mt-3 text-[13.5px] leading-[1.5] text-[#a1a1aa]">{l}</p>
    </div>
  );
}
