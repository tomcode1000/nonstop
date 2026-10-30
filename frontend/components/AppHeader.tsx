"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AskNonstop from "@/components/AskNonstop";
import NavLinks from "@/components/NavLinks";
import { Logo } from "@/components/ui";

/** The dark app header. The landing page ("/") draws its own light header instead. */
export default function AppHeader() {
  const path = usePathname();
  if (path === "/") return null;
  return (
    <header className="fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between px-3 sm:px-5 bg-[rgba(0,0,0,0.82)] backdrop-blur-xl border-b border-line">
      <Link href="/" className="flex items-center gap-2.5">
        <Logo size={26} />
        <span className="font-display text-[18px] font-[650] tracking-[-0.035em]">Nonstop</span>
        <span className="hidden md:inline text-[11px] text-faint border-l border-line pl-2.5 ml-0.5">Route intelligence for airports</span>
      </Link>
      <nav className="flex items-center gap-0.5 sm:gap-1 text-[13px]">
        <NavLinks />
        <AskNonstop />
      </nav>
    </header>
  );
}

/** Top padding for pages under the fixed app header (none on the landing page). */
export function MainShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return <main className={path === "/" ? "" : "pt-14"}>{children}</main>;
}
