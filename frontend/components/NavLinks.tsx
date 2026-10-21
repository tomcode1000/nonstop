"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Map", short: "Map", match: (p: string) => p === "/" || p.startsWith("/airport") },
  { href: "/replay", label: "Time machine", short: "Replay", match: (p: string) => p.startsWith("/replay") },
  { href: "/proof", label: "Proof", short: "Proof", match: (p: string) => p.startsWith("/proof") },
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href}
          className={`px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${l.match(path) ? "text-text bg-white/[0.06]" : "text-muted hover:text-text hover:bg-white/[0.04]"}`}>
          <span className="sm:hidden">{l.short}</span><span className="hidden sm:inline">{l.label}</span>
        </Link>
      ))}
    </>
  );
}
