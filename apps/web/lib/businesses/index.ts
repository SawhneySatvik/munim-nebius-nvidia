// One web, many businesses: the brand of the business this build serves, chosen at build time by NEXT_PUBLIC_MUNIM_SITE
// (next.config.ts; unset = cobnut, so Cobnut is unchanged). The id is the worldgen world that seeds the business, the name
// scripts/dev/restart-svc.sh passes. Each business lives in its own directory (lib/businesses/<id>/: profile, art, display face,
// colour tokens) and a build carries only its own (scripts/bundle-isolation.sh is the gate). The live look still comes from the page
// the owner published (components/storefront-theme.tsx); a profile is what the shop shows before that answers and what never changes
// with it: the words, the fonts, the art.
import { BUSINESS } from "@/lib/businesses/current";

export type { BrandArt, Business } from "./types";
export { ART, BUSINESS } from "@/lib/businesses/current";

/** Its own look beyond Cobnut's: the attribute app/layout.tsx sets on <html> (the business's theme.css keys its tokens on it). */
export const SITE_ATTR: Record<string, string> = BUSINESS.id === "cobnut" ? {} : { "data-site": BUSINESS.id };
