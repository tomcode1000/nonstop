/** Nonstop's small design system: panels, labels, airport-code tiles, score ring, stats. */
import type { ReactNode } from "react";

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`glass rounded-xl ${className}`}>{children}</div>;
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
        <span key={i} className={`relative inline-flex items-center justify-center rounded-[4px] font-mono font-semibold bg-[var(--panel-2)] border border-line  ${box} ${tone === "route" ? "text-route" : "text-text"}`}>
          {ch}
          <span className="absolute inset-x-0 top-1/2 h-px bg-black/70" />
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
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={5} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--route)" strokeWidth={5} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}  />
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
      <div className={`font-mono text-[24px] font-medium tabular tracking-[-0.02em] leading-none ${color}`}>{value}</div>
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

/** Brand mark: an N drawn as one unbroken flight path, origin (white) to destination (amber). */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="ns-route" gradientUnits="userSpaceOnUse" x1="9" y1="0" x2="23" y2="0">
          <stop offset="0" stopColor="#fff3d1" />
          <stop offset="0.45" stopColor="#ffd36b" />
          <stop offset="1" stopColor="#ffc53d" />
        </linearGradient>
      </defs>
      <rect x="0.3" y="0.3" width="31.4" height="31.4" rx="7.2" fill="#0b0b0c" stroke="#2a2a2e" strokeWidth="0.6" />
      <path d="M9.6 22.6 V9.6 C15.2 12.2 19.4 16.4 22.4 22.4 V9.4" stroke="url(#ns-route)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.6" cy="22.6" r="2.15" fill="#ffffff" />
      <circle cx="22.4" cy="9.4" r="2.15" fill="#ffc53d" />
    </svg>
  );
}
