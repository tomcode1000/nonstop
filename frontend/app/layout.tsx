import type { Metadata } from "next";
import { Caveat, Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import AppHeader, { MainShell } from "@/components/AppHeader";
import "./globals.css";

const sans = Inter({ variable: "--font-sans-src", subsets: ["latin"] });
const display = Inter_Tight({ variable: "--font-display-src", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
const mono = JetBrains_Mono({ variable: "--font-mono-src", subsets: ["latin"], weight: ["500", "600"] });
const hand = Caveat({ variable: "--font-hand-src", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  title: "Nonstop — your town's next nonstop is already in the data",
  description:
    "Nonstop combines every US route and ticket record with Qloo's taste graph to show an airport which leisure routes to pitch next, and to which airline.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${mono.variable} ${hand.variable} antialiased min-h-screen`}>
        <AppHeader />
        <MainShell>{children}</MainShell>
      </body>
    </html>
  );
}
