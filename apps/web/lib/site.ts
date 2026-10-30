// The site-specific constants of the business this build serves (lib/businesses: NEXT_PUBLIC_MUNIM_SITE, Cobnut when unset).
// Everything else comes from the API or lib/munim.
import { BUSINESS, type Business } from "./businesses";
import { E164_PATTERN } from "./munim/checkout";
import { titleCase } from "./munim/format";

export const SITE: { readonly name: string; readonly short: string; readonly tagline: string; readonly locale: string; readonly categoryOrder: readonly string[] } = {
  name: BUSINESS.name,
  short: BUSINESS.short,
  tagline: BUSINESS.tagline,
  locale: BUSINESS.locale,
  /** Categories in this order first; any category the API adds later follows in API order. */
  categoryOrder: BUSINESS.categoryOrder,
};

// The API sends categories and deals as keys only (no display names): label them here, with a fallback.
export const categoryLabel = (slug: string): string => BUSINESS.categoryLabels[slug] ?? titleCase(slug);
export const dealLabel = (nameKey: string): string => BUSINESS.dealLabels[nameKey] ?? titleCase(nameKey);

/** The business's diet words. For a bakery in India the green veg mark already means "no egg", so Cobnut's reads "Eggless"; the
 *  marks themselves still follow the API's `diet` exactly and nothing is guessed from a name. */
export const DIET_WORD: Readonly<Record<string, string>> = BUSINESS.dietWords;

/** Items that take a written note, by name_key: the label and the hint for the text box. Sent as the line's note. */
export const NOTE_FIELDS: Readonly<Record<string, { label: string; hint: string }>> = BUSINESS.noteFields;

/** A shopper's mobile number at checkout, by the business's country: the country code shown before the box, how a typed number
 *  reads, and what the box says when it does not. */
const MOBILE: Readonly<Record<Business["country"], { prefix: string; toE164: (input: string) => string | null; error: string }>> = {
  IN: { prefix: "+91", toE164: toE164In, error: "Enter a 10-digit mobile number." },
  AU: { prefix: "+61", toE164: toE164Au, error: "Enter a mobile number starting with 04, like 0412 345 678." },
};

/** The business's country code, shown before the mobile number at checkout. */
export const PHONE_PREFIX = MOBILE[BUSINESS.country].prefix;
/** The checkout's words for a mobile number that does not read as one of the business's country. */
export const PHONE_ERROR = MOBILE[BUSINESS.country].error;

/** A mobile number of the business's country as typed -> E.164; null when it is not one. India: "98123 45678",
 *  "098123-45678", "+91 98123 45678", "919812345678" -> "+919812345678". Australia: "0412 345 678", "412 345 678",
 *  "+61 412 345 678", "+61 (0)412 345 678", "61412345678", "0061 412 345 678" -> "+61412345678". */
export const toE164 = (input: string): string | null => MOBILE[BUSINESS.country].toE164(input);

export function toE164Au(input: string): string | null {
  // "+61 (0)4…" keeps the trunk 0 after the country code, and "0061…" is the number dialled from abroad: the same mobile.
  const d = input.replace(/[\s()-]/g, "").replace(/^0061/, "+61").replace(/^\+610/, "+61");
  const e = d.startsWith("+") ? d : /^04\d{8}$/.test(d) ? `+61${d.slice(1)}` : /^614\d{8}$/.test(d) ? `+${d}` : /^4\d{8}$/.test(d) ? `+61${d}` : null;
  return e !== null && E164_PATTERN.test(e) && /^\+614\d{8}$/.test(e) ? e : null;
}

function toE164In(input: string): string | null {
  const d = input.replace(/[\s()-]/g, "");
  const e = d.startsWith("+") ? d : /^0\d{10}$/.test(d) ? `+91${d.slice(1)}` : /^91\d{10}$/.test(d) ? `+${d}` : /^\d{10}$/.test(d) ? `+91${d}` : null;
  return e !== null && E164_PATTERN.test(e) && (!e.startsWith("+91") || /^\+91[6-9]\d{9}$/.test(e)) ? e : null;
}

export const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
