import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import AskNonstop from "@/components/AskNonstop";
import NavLinks from "@/components/NavLinks";
import { Logo } from "@/components/ui";
import "./globals.css";

const sans = Inter({ variable: "--font-sans-src", subsets: ["latin"] });
const display = Space_Grotesk({ variable: "--font-display-src", subsets: ["latin"], weight: ["500", "600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-mono-src", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Nonstop — the leisure flights your town is missing",
  description:
    "Nonstop combines every US route and ticket record with Qloo's taste graph to find the leisure flights a town is missing, and the airline most likely to fly them.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${mono.variable} antialiased min-h-screen`}>
        <header className="fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between px-3 sm:px-5 bg-[rgba(5,9,18,0.82)] backdrop-blur-xl border-b border-line">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-[17px] font-semibold tracking-tight">Nonstop</span>
            <span className="hidden md:inline text-[11px] text-faint border-l border-line pl-2.5 ml-0.5">Route intelligence for airports</span>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1 text-[13px]">
            <NavLinks />
            <AskNonstop />
          </nav>
        </header>
        <main className="pt-14">{children}</main>
      </body>
    </html>
  );
}
