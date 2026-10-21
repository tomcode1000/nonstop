/** Nonstop's small design system: panels, labels, airport-code tiles, score ring, stats. */
import type { ReactNode } from "react";

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`glass rounded-2xl shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] ${className}`}>{children}</div>;
}

export function Eyebrow({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "taste" | "route" }) {
  const color = tone === "taste" ? "text-taste" : tone === "route" ? "text-route" : "text-faint";
  return <p className={`text-[10.5px] font-semibold uppercase tracking-[0.2em] ${color}`}>{children}</p>;
}

/** Airport code as split-flap departure-board tiles. */
export function CodeTiles({ code, size = "md", tone = "text" }: { code: string; size?: "sm" | "md" | "lg"; tone?: "text" | "route" }) {
  const box = size === "lg" ? "h-11 w-8 text-[26px]" : size === "md" ? "h-7 w-[22px] text-[17px]" : "h-5 w-4 text-[12px]";
  return (
    <span className="inline-flex gap-[3px] align-middle" aria-label={code}>
      {code.split("").map((ch, i) => (
        <span key={i} className={`relative inline-flex items-center justify-center rounded-[4px] font-mono font-semibold bg-[#0a1120] border border-line ${box} ${tone === "route" ? "text-route" : "text-text"}`}>
          {ch}
          <span className="absolute inset-x-0 top-1/2 h-px bg-black/60" />
        </span>
      ))}
    </span>
  );
}

/** Circular gauge for a 0-100 launch score. */
export function ScoreRing({ value, size = 64 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1a2540" strokeWidth={5} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--route)" strokeWidth={5} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ filter: "drop-shadow(0 0 6px rgba(245,181,68,0.5))" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg font-semibold tabular leading-none">{value.toFixed(1)}</span>
        <span className="text-[8.5px] uppercase tracking-[0.14em] text-faint mt-0.5">score</span>
      </div>
    </div>
  );
}

export function Stat({ value, label, sub, tone = "called" }: { value: string; label: string; sub?: string; tone?: "called" | "taste" | "route" | "text" }) {
  const color = { called: "text-called", taste: "text-taste", route: "text-route", text: "text-text" }[tone];
  return (
    <div className="rounded-xl bg-white/[0.025] border border-line px-3.5 py-3">
      <div className={`font-display text-[26px] font-semibold tabular leading-none ${color}`}>{value}</div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-muted">{label}</div>
      {sub && <div className="mt-1 text-[10.5px] text-faint">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "called" | "taste" }) {
  const cls = {
    muted: "border-line text-muted",
    called: "border-called/40 bg-called/10 text-called",
    taste: "border-taste/40 bg-taste/10 text-taste",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${cls}`}>{children}</span>;
}

/** Brand mark: a route arc over a dot. */
export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 17 C 7 5, 17 5, 21 17" stroke="var(--route)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="3" cy="17" r="2.3" fill="var(--text)" />
      <circle cx="21" cy="17" r="2.3" fill="var(--route)" style={{ filter: "drop-shadow(0 0 4px var(--route))" }} />
    </svg>
  );
}
