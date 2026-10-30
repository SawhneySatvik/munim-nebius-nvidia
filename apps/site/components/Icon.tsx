// Glyphs drawn for this site (24 px grid, 2 px stroke, currentColor); no third-party icon set (hard rule 1).
// Decorative by default: every use sits beside a text label.
import type { ReactNode } from "react";

const GLYPHS: Record<string, ReactNode> = {
  pos: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4M7 8h4M7 11h7" />
    </>
  ),
  kds: (
    <>
      <rect x="2.5" y="4" width="19" height="14" rx="2" />
      <path d="M8 4v14M14 4v14M4.5 8h2M10 8h2M16 8h3.5M4.5 11h2M10 11h2" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  team: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M3 19c0-3 2.2-5 5-5s5 2 5 5M13.5 15.2c.9-.8 1.9-1.2 3-1.2 2.5 0 4.5 1.8 4.5 4.5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5.5 5.5M8 10.5h5M10.5 8v5" />
    </>
  ),
  cares: (
    <>
      <path d="M3 14h4l3 2h4.5a1.5 1.5 0 0 1 0 3H9" />
      <path d="M14.5 19H18l3-3" />
      <path d="M12 3c3 0 5 2 5 5-3 0-5-2-5-5Z" />
      <path d="M12 3c0 3 0 5-1 8" />
    </>
  ),
  shop: (
    <>
      <path d="M4 10v10h16V10" />
      <path d="M3 10 5 4h14l2 6c0 1.5-1.2 2.5-2.5 2.5S16 11.5 16 10c0 1.5-1.8 2.5-4 2.5S8 11.5 8 10c0 1.5-1.2 2.5-2.5 2.5S3 11.5 3 10Z" />
      <path d="M10 20v-4h4v4" />
    </>
  ),
  outlets: (
    <>
      <path d="M3 20V9l5-3v14M8 20V4l8 4v12M16 20v-8l5 2v6" />
      <path d="M2 20h20" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z" />
    </>
  ),
  ledger: (
    <>
      <path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z" />
      <path d="M5 17a2 2 0 0 1 2-2h12M9 7h6M9 10.5h6" />
    </>
  ),
  check: <path d="m4 12.5 5 5L20 6.5" />,
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Z" />
      <path d="m8.8 12 2.4 2.4 4-4.4" />
    </>
  ),
  menu: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  pot: (
    <>
      <path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5Z" />
      <path d="M2 10h2M20 10h2M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2" />
    </>
  ),
  crate: (
    <>
      <path d="M3 8 12 4l9 4v9l-9 4-9-4V8Z" />
      <path d="m3 8 9 4 9-4M12 12v9" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
      <path d="M15 10.2c3.4.1 6 1.4 6 2.8v4c0 1.7-2.7 3-6 3-2 0-3.8-.5-4.9-1.2" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M8.5 12l2.3 2.3 4.7-4.6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="m7.5 14.5 3.5-4 3 2.5 5-6" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  draft: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9M16 7l2.5 2.5M18.5 4.5 21 7" />
    </>
  ),
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 20h16" />,
  book: (
    <>
      <path d="M3 5c3-1.5 6-1.5 9 0v15c-3-1.5-6-1.5-9 0V5ZM12 5c3-1.5 6-1.5 9 0v15c-3-1.5-6-1.5-9 0" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6 8.5 7 8.5-7" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </>
  ),
};

export type IconName = keyof typeof GLYPHS;

export function Icon({ name, size = 24, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: "false" })}
    >
      {GLYPHS[name]}
    </svg>
  );
}
