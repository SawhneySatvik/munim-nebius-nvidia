// Build-time file access. The site reads the generated OpenAPI file and docs/kit/*.md from the monorepo while
// prerendering; nothing here runs in the browser. `next build` may run from the repo root or from apps/site, so the
// root is found by walking up to pnpm-workspace.yaml rather than trusting the working directory.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function repoRoot(start: string = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`no pnpm-workspace.yaml above ${start}`);
    dir = up;
  }
}

export const PUBLIC_OPENAPI = ["packages", "contracts", "generated", "openapi", "public.json"] as const;
export const KIT_DOCS = ["docs", "kit"] as const;
export const SITE_PUBLIC = ["apps", "site", "public"] as const;
