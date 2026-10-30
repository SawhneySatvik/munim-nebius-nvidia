// The Munim mark: an "M" written on a ledger rule, with the middle dot that separates the parts of a ⟨snap⟩ ref.
// Drawn for this site; app/icon.svg is the same drawing.
import Link from "next/link";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" className="logo-tile" />
      <path d="M8.5 21.5V10.5L16 18l7.5-7.5v11" fill="none" className="logo-ink" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 25.5h18" className="logo-rule" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="25.5" r="1.9" className="logo-dot" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Munim home">
      <LogoMark />
      <span className="logo-word">Munim</span>
    </Link>
  );
}
