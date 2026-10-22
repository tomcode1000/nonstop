import type { Metadata } from "next";
import { Caveat, Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import AppHeader, { MainShell } from "@/components/AppHeader";
import "./globals.css";

const sans = Inter({ variable: "--font-sans-src", subsets: ["latin"] });
// Variable font (no fixed weights) so headlines can sit at Hypothec-style in-between weights like 620.
const display = Inter_Tight({ variable: "--font-display-src", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono-src", subsets: ["latin"], weight: ["500", "600"] });
const hand = Caveat({ variable: "--font-hand-src", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  title: "Nonstop — your town's next nonstop is already in the data",
  description:
    "Nonstop combines every US route and ticket record with Qloo's taste graph to show an airport which leisure routes to pitch next, and to which airline.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables live on <html> because the font stacks in globals.css are defined on :root;
    // defined lower down, :root could not see them and every page fell back to the system font.
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable} ${hand.variable}`}>
      <body className="antialiased min-h-screen">
        <AppHeader />
        <MainShell>{children}</MainShell>
      </body>
    </html>
  );
}
