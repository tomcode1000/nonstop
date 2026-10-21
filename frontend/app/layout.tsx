import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import AskNonstop from "@/components/AskNonstop";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nonstop — the leisure flights your town is missing",
  description:
    "Nonstop uses Qloo's taste graph to find hidden leisure demand for nonstop routes that don't exist yet, and shows which airline is likely to fly them.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <header className="fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between px-4 sm:px-6 glass border-x-0 border-t-0">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-route shadow-[0_0_12px_var(--route)]" />
            Nonstop
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1 text-sm">
            <Link href="/" className="px-2 sm:px-3 py-1.5 rounded-md text-muted hover:text-text hover:bg-panel-2">Map</Link>
            <Link href="/replay" className="px-2 sm:px-3 py-1.5 rounded-md text-muted hover:text-text hover:bg-panel-2">
              <span className="sm:hidden">Replay</span><span className="hidden sm:inline">Time machine</span>
            </Link>
            <Link href="/proof" className="px-2 sm:px-3 py-1.5 rounded-md text-muted hover:text-text hover:bg-panel-2">Proof</Link>
            <AskNonstop />
          </nav>
        </header>
        <main className="pt-14">{children}</main>
      </body>
    </html>
  );
}
