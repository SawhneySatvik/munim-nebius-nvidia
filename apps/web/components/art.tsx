// The shop's illustrations: the business's own, drawn by hand for this project as inline SVG (lib/businesses/<id>/art.tsx; a
// build carries only its own business's). Decorative: every one is aria-hidden. Logged in the README.
import { ART, BUSINESS } from "@/lib/businesses";

/** Hero: the business's large illustration (Cobnut's croissant). */
export function HeroArt({ className = "" }: { className?: string }) {
  return <ART.Hero className={className} />;
}

/** The business's small mark (Cobnut's hazelnut), for marks and section motifs. */
export function Hazelnut({ size = 28, className = "" }: { size?: number; className?: string }) {
  return <ART.Mark size={size} className={className} />;
}

/** Category motifs: a little line drawing for each category the business uses (fallback: its mark). */
export function CategoryMotif({ slug, size = 30 }: { slug: string; size?: number }) {
  return ART.motif(slug, size) ?? <ART.Mark size={size} />;
}

/** The wordmark: the mark beside the name in the display face. `compact` drops the accented part ("Bakehouse") on phones, in the
 *  two page bars (shop: Staff and Cart beside it; staff: the person and Sign out), where the full name does not fit one row. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  const w = BUSINESS.wordmark;
  return (
    <span className="inline-flex items-center gap-2">
      <ART.Mark size={30} />
      <span className="display text-[22px] leading-none">
        {`${w.lead} `}<span className={`${w.accentClass} text-secondary${compact ? " max-sm:hidden" : ""}`.trimStart()}>{w.accent}</span>
      </span>
    </span>
  );
}
