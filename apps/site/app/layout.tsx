import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { SimulationStrip } from "../components/Labels.tsx";
import { Logo } from "../components/Logo.tsx";
import "./globals.css";

// Open-source fonts (SIL OFL) served by next/font; latin-ext carries the rupee sign.
const sans = Atkinson_Hyperlegible({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], variable: "--font-sans", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "600"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Munim — the AI back office for restaurants and shops", template: "%s · Munim" },
  description:
    "Munim runs the counter, kitchen and books for restaurant groups, cloud kitchens and shops, explains what happened with every number traced, and drafts fixes a named person approves. India first; Australia on its own country pack. Demo build on synthetic data.",
};

export const viewport: Viewport = {
  themeColor: "#f3ead7",
};

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/nebius", label: "Nebius AI" },
  { href: "/readme", label: "Project README" },
  { href: "/cares", label: "Munim Cares" },
  { href: "/developers", label: "Developers" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="wrap header-inner">
            <Logo />
            <nav aria-label="Main" className="nav-desktop">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="nav-link">
                  {n.label}
                </Link>
              ))}
              <Link href="/contact" className="btn btn-primary btn-sm">
                Contact us
              </Link>
            </nav>
            <details className="nav-mobile">
              <summary aria-label="Menu">
                <span className="burger" aria-hidden="true" />
                Menu
              </summary>
              <nav aria-label="Main (mobile)">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="nav-link">
                    {n.label}
                  </Link>
                ))}
                <Link href="/contact" className="btn btn-primary">
                  Contact us
                </Link>
              </nav>
            </details>
          </div>
        </header>
        <SimulationStrip />
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-grid">
            <div>
              <Logo />
              <p className="muted footer-tag">The AI back office for restaurants and shops. India first; Australia on its own country pack.</p>
            </div>
            <nav aria-label="Footer" className="footer-links">
              <div>
                <h2 className="footer-h">Product</h2>
                <Link href="/#product">Features</Link>
                <Link href="/#guarantee">The One Guarantee</Link>
                <Link href="/#how">How it works</Link>
                <Link href="/nebius">Nebius AI</Link>
                <Link href="/readme">Project README</Link>
                <Link href="/cares">Munim Cares</Link>
              </div>
              <div>
                <h2 className="footer-h">Developers</h2>
                <Link href="/developers">Overview</Link>
                <Link href="/developers/reference">API reference</Link>
                <Link href="/developers/guides">Guides</Link>
                <Link href="/developers/downloads">Downloads</Link>
              </div>
              <div>
                <h2 className="footer-h">Company</h2>
                <Link href="/contact">Contact us</Link>
              </div>
            </nav>
          </div>
          <div className="wrap footer-base">
            <p>
              Demo build on synthetic data. Suppliers and food-donation recipients are simulated; payments are recorded, never processed. Any
              money-found or savings figure Munim shows is measured on synthetic data.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
