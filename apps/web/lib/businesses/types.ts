// What every business behind this web brings (lib/businesses/<id>/): its profile, its art and its display face. Shared by all of
// them, so it names none of them: a build carries one business and nothing of the others (next.config.ts).
import type { ReactElement } from "react";
import type { PageDoc } from "../munim/page-theme";

export interface Business {
  /** The worldgen world (and NEXT_PUBLIC_MUNIM_SITE value) of this business. */
  id: string;
  name: string;
  short: string;
  tagline: string;
  /** Number, date and money formatting (Intl). */
  locale: string;
  /** The <html lang>. */
  lang: string;
  /** The country pack: how a shopper's mobile number is read at checkout (lib/site.ts toE164) and its prefix shown. */
  country: "IN" | "AU";
  /** The IANA zone of its outlets: the shop's times before the menu (and its outlet's own zone) answers. */
  tz: string;
  /** Categories in this order first; any category the API adds later follows in API order. */
  categoryOrder: readonly string[];
  /** The API sends categories and deals as keys only: their display names, with a title-cased fallback. */
  categoryLabels: Readonly<Record<string, string>>;
  dealLabels: Readonly<Record<string, string>>;
  /** The diet words beside the marks (the marks follow the API's `diet` exactly). */
  dietWords: Readonly<Record<string, string>>;
  /** Items that take a written note, by name_key. */
  noteFields: Readonly<Record<string, { label: string; hint: string }>>;
  /** The built-in storefront page: what the shop shows while nothing is published. */
  page: PageDoc;
  /** The name as the wordmark and the home heading set it: the plain part, then the accented part and its extra classes. */
  wordmark: { lead: string; accent: string; accentClass: string };
  /** What one outlet is called on the shop ("bakehouse", "kitchen"). */
  outletWord: string;
  meta: { title: string; template: string; description: string; themeColor: string };
  /** The footer's line under the name. */
  footer: string;
  /** How much of it is synthetic, in each demo label's words (CLAUDE.md rule 5: simulated means labelled): the footer's line, the
   *  staff screens' bar and the story page's badge. */
  dataWords: { foot: string; staffBar: string; storyBadge: string };
  /** The Munim Cares card on the home page. */
  caresCard: string;
  /** The category motif on the home page's second card. */
  cardMotif: string;
  story: {
    title: { lead: string; accent: string };
    paragraphs: readonly string[];
    promises: ReadonlyArray<{ motif: string; title: string; body: string }>;
    surplus: { title: string; body: string };
  };
}

/** A business's illustrations (components/art.tsx draws through these). Decorative: every one is aria-hidden. */
export interface BrandArt {
  /** The small mark beside the name and in place of a missing motif. */
  Mark(p: { size?: number; className?: string }): ReactElement;
  Hero(p: { className?: string }): ReactElement;
  /** A category's motif, or null for the mark. */
  motif(slug: string, size: number): ReactElement | null;
}
