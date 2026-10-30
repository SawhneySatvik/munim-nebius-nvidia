// The business this build serves. next.config.ts swaps this module for lib/businesses/<NEXT_PUBLIC_MUNIM_SITE>/index.ts at build time
// (turbopack.resolveAlias on this exact specifier, "@/lib/businesses/current", which only lib/businesses/index.ts imports), so a
// build holds its own business and nothing of the others. tsc, vitest and dependency-cruiser read this file as written: Cobnut, the
// default when NEXT_PUBLIC_MUNIM_SITE is unset, and the shape every business's index.ts exports.
export * from "./cobnut";
