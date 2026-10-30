import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Production calls Munim's API on this site's own origin: /api/* goes to MUNIM_API_ORIGIN (the munim-api deployment,
// or a local core-api). A plain Next rewrite, so it works on any host; unset (dev, tests) means no rewrite.
const apiOrigin = process.env.MUNIM_API_ORIGIN?.replace(/\/+$/, "");

// The container build (infra/gcp) sets MUNIM_NEXT_STANDALONE=1 for a self-contained server; unset, the build is unchanged.
// The tracing root is the workspace root, so the standalone output keeps the workspace packages.
const standalone = process.env.MUNIM_NEXT_STANDALONE === "1";

// One business per build: NEXT_PUBLIC_MUNIM_SITE names a directory under lib/businesses (cobnut when unset), and Turbopack swaps
// the two modules that stand for "this build's business" (lib/businesses/current.ts and fonts.ts, Cobnut's as written) for that
// directory's own. No other business's profile, art, face or colour tokens reaches the build: a business that is real and has not
// agreed to be shown must not ship inside another's. An unknown value fails the build. scripts/bundle-isolation.sh is the gate.
const businesses = resolve(process.cwd(), "lib/businesses");
const site = process.env.NEXT_PUBLIC_MUNIM_SITE || "cobnut";
if (!/^[a-z_]+$/.test(site) || !existsSync(resolve(businesses, site, "index.ts"))) {
  const known = readdirSync(businesses, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  throw new Error(`NEXT_PUBLIC_MUNIM_SITE=${site} names no business (known: ${known.join(", ")})`);
}

// No cacheComponents (and so no partialPrefetching): with it every route with a dynamic id (/o/[outletId], the tracker, the
// staff detail pages) is a PPR shell prerendered with placeholder params, and the deploy platform's CDN answers a client navigation's RSC request
// from that one cached prerender for every id (measured on munim-cobnut, 16 Oct: `x-matched-path: /o/[outletId].rsc`, HIT,
// segment keys `%%drp:…%%`), so useParams() sees no real id and the page says "This link isn't valid." until a reload.
// Without it those routes render per request (ƒ) and the static pages stay static. scripts/nav-smoke.ts is the gate.
// Security headers on every response (C1 S3-6), set here so they hold on any host. The browser calls only this origin
// (`/api` rewrite, `/mock`, `/staff/demo-session`; next/font serves the fonts from here), so connect-src is 'self' plus the
// API's origin only when NEXT_PUBLIC_MUNIM_API is an absolute URL. script-src keeps 'unsafe-inline': the App Router's
// hydration payload is inline <script>, and a static header cannot carry a per-request nonce. `next dev` also needs eval
// (React's dev stacks) and its HMR websocket. scripts/csp-check.ts is the gate.
const dev = process.env.NODE_ENV === "development";
const apiBase = process.env.NEXT_PUBLIC_MUNIM_API ?? "";
const apiConnect = /^https?:\/\//.test(apiBase) ? ` ${new URL(apiBase).origin}` : "";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${apiConnect}${dev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()" },
];

const nextConfig: NextConfig = {
  // A second local dev server (another business on another port, scripts/dev/restart-svc.sh) needs its own build
  // directory: Next refuses two dev servers on one, and NEXT_PUBLIC_* values are inlined per build.
  ...(process.env.MUNIM_WEB_DIST_DIR ? { distDir: process.env.MUNIM_WEB_DIST_DIR } : {}),
  ...(standalone ? { output: "standalone", outputFileTracingRoot: resolve(process.cwd(), "../..") } : {}),
  poweredByHeader: false,
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
  // @munim/sdk is a workspace package shipped as TypeScript source.
  transpilePackages: ["@munim/sdk"],
  rewrites: async () => (apiOrigin ? [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }] : []),
  turbopack: {
    resolveAlias: {
      "@/lib/businesses/current": `./lib/businesses/${site}/index.ts`,
      "@/lib/businesses/fonts": `./lib/businesses/${site}/fonts.ts`,
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
