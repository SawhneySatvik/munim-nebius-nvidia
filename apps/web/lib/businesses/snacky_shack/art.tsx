// The Snacky Shack's illustrations, drawn by hand for this project as inline SVG: flat fills, fine ink strokes, simple geometric
// parts, the theme's secondary colour for accents. Decorative: every one is aria-hidden.
import type { ReactElement } from "react";
import type { BrandArt } from "../types";

const INK = "var(--ink)";
const BUN = "#e9a23b";
const PATTY = "#6b3a1b";
const CHEESE = "#ffcf3f";
const LETTUCE = "#5aa43a";
const KETCHUP = "#c62f12";

/** The Snacky Shack's mark: a stacked smash burger with a cheese drip. */
function BurgerMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
        <path d="M5 14c0-6 5-9 11-9s11 3 11 9z" fill={BUN} />
        <path d="M4 17h24l-2 2.5H6z" fill={LETTUCE} />
        <path d="M5 16h22v2.5c-3 .2-5 2.5-6.5 2.5S18 18.5 16 18.5H5z" fill={CHEESE} />
        <rect x="5" y="19.5" width="22" height="4" rx="2" fill={PATTY} />
        <path d="M5 24h22c0 2.5-2 4-4.5 4h-13C7 28 5 26.5 5 24z" fill={BUN} />
      </g>
      <g fill="#fff6dc"><circle cx="12" cy="9" r=".9" /><circle cx="16" cy="7.5" r=".9" /><circle cx="20" cy="9" r=".9" /></g>
    </svg>
  );
}

/** Hero: a tall smash burger with a cheese drip and a ketchup swoosh, beside a carton of fries. */
function SmashHero({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 240" className={className} aria-hidden="true" focusable="false">
      <ellipse cx="160" cy="214" rx="140" ry="14" fill="var(--bg-deep)" />
      <path d="M20 60c40-30 90-30 120-6" fill="none" stroke={KETCHUP} strokeWidth="10" strokeLinecap="round" opacity=".85" />
      <g stroke={INK} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M40 106c0-40 36-60 82-60s82 20 82 60z" fill={BUN} />
        <path d="M34 118h176l-10 10H44z" fill={LETTUCE} />
        <path d="M38 110h168v10c-12 0-16 16-26 16s-12-12-22-12-12 22-24 22-10-22-22-22-14 10-26 10-14-14-26-14H38z" fill={CHEESE} />
        <rect x="38" y="128" width="168" height="18" rx="9" fill={PATTY} />
        <rect x="40" y="146" width="164" height="14" rx="7" fill="#7d4522" />
        <path d="M40 162h164c0 20-16 30-36 30H76c-20 0-36-10-36-30z" fill={BUN} />
        <path d="M232 132h64l-10 70h-44z" fill={KETCHUP} />
        <path d="M240 132l-6-40M252 132l-2-48M264 132l2-44M276 132l6-40M288 132l10-34" fill="none" stroke={INK} strokeWidth="2.5" />
        <path d="M240 132l-6-40M252 132l-2-48M264 132l2-44M276 132l6-40M288 132l10-34" fill="none" stroke={CHEESE} strokeWidth="6" />
        <path d="M232 132h64" fill="none" />
      </g>
      <path d="M244 160h40" fill="none" stroke="#fff6dc" strokeWidth="4" strokeLinecap="round" />
      <g fill="#fff6dc"><circle cx="96" cy="70" r="2.6" /><circle cx="120" cy="62" r="2.6" /><circle cx="146" cy="68" r="2.6" /><circle cx="170" cy="80" r="2.6" /></g>
      <g fill="var(--secondary)"><circle cx="300" cy="60" r="5" /><circle cx="226" cy="44" r="3" /><circle cx="18" cy="190" r="4" /></g>
    </svg>
  );
}

function snackyMotif(slug: string, size: number): ReactElement | null {
  const common = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true as const, focusable: "false" as const };
  const s = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  switch (slug) {
    case "fries":
    case "sides":
      return <svg {...common}><g {...s}><path d="M10 6l1 8M14 4v10M18 4v10M22 6l-1 8" fill="none" stroke={CHEESE} strokeWidth="3" /><path d="M8 14h16l-2 14H10z" fill={KETCHUP} /></g></svg>;
    case "drinks_shakes":
      return <svg {...common}><g {...s}><path d="M9 9h14l-2 19h-10z" fill="#ffffff" /><path d="M10 14h12l-1.4 13h-9.2z" fill="#f4a3b4" stroke="none" /><path d="M8 9h16" fill="none" /><path d="M18 9l3-6" fill="none" stroke={KETCHUP} /></g></svg>;
    case "veggie_room":
      return <svg {...common}><g {...s}><path d="M6 20c0-8 6-14 14-14 2 0 4 .4 6 1-1 8-6 15-14 15-2 0-4-.4-6-2z" fill={LETTUCE} /><path d="M7 22c5-5 10-9 17-14" fill="none" /></g></svg>;
    case "snacky_signature_boxes":
    case "kids_menu":
      return <svg {...common}><g {...s}><path d="M5 12h22v14H5z" fill={KETCHUP} /><path d="M5 12l4-6h14l4 6" fill={BUN} /><path d="M12 19h8" fill="none" stroke="#fff6dc" strokeWidth="2.4" /></g></svg>;
    case "extras":
      return <svg {...common}><g {...s}><path d="M6 12l20-4v14L6 26z" fill={CHEESE} /><g fill="#e0a92a" stroke="none"><circle cx="12" cy="17" r="1.6" /><circle cx="19" cy="14" r="1.4" /><circle cx="20" cy="20" r="1.2" /></g></g></svg>;
    case "specials":
      return <svg {...common}><g {...s}><path d="M16 4l3.5 7.5 8 1-6 5.5 1.6 8L16 22l-7.1 4 1.6-8-6-5.5 8-1z" fill={CHEESE} /></g></svg>;
    default:
      return null; // the burgers: the mark
  }
}

export const ART: BrandArt = { Mark: BurgerMark, Hero: SmashHero, motif: snackyMotif };
