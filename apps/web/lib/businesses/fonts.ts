// The display face and colour tokens of the business this build serves: next.config.ts swaps this module for
// lib/businesses/<NEXT_PUBLIC_MUNIM_SITE>/fonts.ts at build time, as it does current.ts, on this exact specifier
// ("@/lib/businesses/fonts", which only app/fonts.ts imports). Kept apart from current.ts because next/font runs only inside Next's
// compiler: the page modules, which the unit tests load, never import a face. Cobnut's by default.
export * from "./cobnut/fonts";
