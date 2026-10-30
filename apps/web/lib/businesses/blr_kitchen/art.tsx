// Kosambari Kitchens' illustrations, drawn by hand for this project as inline SVG: flat fills, fine ink strokes, simple geometric
// parts, the theme's secondary colour for steam and accents. Decorative: every one is aria-hidden.
import type { ReactElement } from "react";
import type { BrandArt } from "../types";

const INK = "var(--ink)";
const STEEL = "#c9d0d4";
const STEEL_DARK = "#9aa3a8";
const LEAF = "#4f8a3c";
const LEAF_DARK = "#2f5f26";
const DOSA = "#e2a548";
const DOSA_DARK = "#b07320";

/** Kosambari Kitchens' mark: a steel tumbler standing in its davara, steaming. */
function TumblerMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
        <path d="M4 22h24l-2.5 6h-19z" fill={STEEL} />
        <path d="M10 9h12l-1.6 14h-8.8z" fill={STEEL_DARK} />
        <path d="M10.4 12.5h11.2" fill="none" />
      </g>
      <path d="M14 7c-1.2-1.3 1.2-2.2 0-3.6M18 7c-1.2-1.3 1.2-2.2 0-3.6" fill="none" stroke="var(--secondary)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Hero: a rolled dosa on a banana leaf with cups of chutney and sambar, and filter coffee steaming in its tumbler. */
function DosaHero({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 240" className={className} aria-hidden="true" focusable="false">
      <ellipse cx="160" cy="214" rx="140" ry="14" fill="var(--bg-deep)" />
      <g stroke={INK} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M14 178C44 118 146 82 250 92 234 158 140 204 14 178z" fill={LEAF} />
        <path d="M22 174C100 150 180 118 246 94" fill="none" stroke={LEAF_DARK} />
        <path d="M70 160l-10-16M110 146l-8-20M150 132l-6-22M190 118l-4-18M98 152l8 18M140 138l8 18M180 124l8 16" fill="none" stroke={LEAF_DARK} strokeWidth="1.6" />
        <path d="M36 152L196 100c14-5 30 2 32 16s-8 24-22 26L44 166c-10 2-16-9-8-14z" fill={DOSA} />
        <ellipse cx="212" cy="121" rx="13" ry="19" transform="rotate(-18 212 121)" fill="#f2c94c" />
        <path d="M78 141l4 9M116 129l5 10M154 117l5 11" fill="none" stroke={DOSA_DARK} strokeWidth="2" />
        <ellipse cx="96" cy="188" rx="24" ry="10" fill={STEEL} />
        <ellipse cx="96" cy="186" rx="17" ry="6" fill="#fbf7ea" />
        <ellipse cx="156" cy="180" rx="24" ry="10" fill={STEEL} />
        <ellipse cx="156" cy="178" rx="17" ry="6" fill="#c8642a" />
        <path d="M236 196h68l-7 15h-54z" fill={STEEL} />
        <path d="M250 124h40l-5 74h-30z" fill={STEEL_DARK} />
        <path d="M251.5 136h37" fill="none" />
      </g>
      <g fill={LEAF_DARK}>
        <circle cx="90" cy="186" r="1.8" />
        <circle cx="100" cy="185" r="1.8" />
      </g>
      <g fill="none" stroke="var(--secondary)" strokeWidth="3" strokeLinecap="round">
        <path d="M262 112c-8-8 8-14 0-24" />
        <path d="M278 112c-8-8 8-14 0-24" />
      </g>
      <g fill="var(--secondary)">
        <circle cx="40" cy="70" r="4" />
        <circle cx="210" cy="56" r="3" />
        <circle cx="300" cy="60" r="5" />
      </g>
    </svg>
  );
}

function kosambariMotif(slug: string, size: number): ReactElement | null {
  const common = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true as const, focusable: "false" as const };
  const s = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  switch (slug) {
    case "dosa":
      return <svg {...common}><g {...s}><path d="M4 21L25 10c3-1.5 5 2.5 2.5 4.2L7 26c-3 1.5-5-2.6-3-5z" fill={DOSA} /><path d="M12 17.5l1.5 3M18 14.2l1.5 3" fill="none" stroke={DOSA_DARK} /></g></svg>;
    case "idli_vada":
      return <svg {...common}><g {...s}><ellipse cx="11" cy="20" rx="8" ry="5" fill="#fbf7ea" /><circle cx="22" cy="14" r="7" fill="#c98a3a" /><circle cx="22" cy="14" r="2.2" fill="var(--card)" /></g></svg>;
    case "rice_bath":
      return <svg {...common}><g {...s}><path d="M8 16c1-5 15-5 16 0z" fill="#e8b860" /><path d="M5 16h22c0 7-5 11-11 11S5 23 5 16z" fill={STEEL} /></g></svg>;
    case "sweets":
      return <svg {...common}><g {...s}><path d="M5 15h10v10H5z" fill="#e8b860" /><path d="M17 11h10v10H17z" fill="#f0c870" /><g fill={DOSA_DARK} stroke="none"><circle cx="9" cy="19" r="1" /><circle cx="12" cy="22" r="1" /><circle cx="21" cy="15" r="1" /><circle cx="24" cy="18" r="1" /></g></g></svg>;
    case "combos":
      return <svg {...common}><g {...s}><rect x="8" y="9" width="16" height="6" rx="2" fill={STEEL} /><rect x="8" y="15" width="16" height="6" rx="2" fill={STEEL_DARK} /><rect x="8" y="21" width="16" height="6" rx="2" fill={STEEL} /><path d="M11 9V5h10v4" fill="none" /></g></svg>;
    case "drinks":
      return <TumblerMark size={size} />;
    default:
      return null;
  }
}

export const ART: BrandArt = { Mark: TumblerMark, Hero: DosaHero, motif: kosambariMotif };
