# NB-5 report: Next.js security upgrade (apps/web)

**Files changed:** `apps/web/package.json`, `pnpm-lock.yaml`. No source change was forced. (`apps/web/AGENTS.md` is untracked and not mine.)

**Versions:** apps/web `next` 16.4.0 -> 16.4.3; `eslint-config-next` 16.4.0 -> 16.4.3 (`@next/eslint-plugin-next`, `@next/env`, `@next/swc-*` follow).

**Method:** installed in an rsync copy (no node_modules purge risk, gotcha 27; shared tree and dev servers untouched), then copied only package.json and the lockfile back. The copy is deleted.

**Lockfile diff:** 175 insertions, 48 deletions. Only the Next family moved: next, eslint-config-next, @next/eslint-plugin-next, @next/env, @next/swc-* platform binaries (16.4.3 added alongside 16.4.0). One cosmetic change: apps/site's next snapshot key lost its `@babel/core` peer suffix. apps/site still pins `next 16.4.0` (outside my territory).

**Gates (run in the copy):**
- `pnpm audit --prod`: 4 vulnerabilities (2 critical, 2 high), all on path `apps__site>next`; 0 on `apps__web`. **Fix needed: bump apps/site to 16.4.3 (it is still critical).**
- tsc --noEmit clean; eslint 0 errors (1 existing warning); vitest `15 files, 179 tests passed`.
- `bundle-isolation.sh cobnut blr_kitchen`: `bundle-isolation: PASS (cobnut blr_kitchen)`. Both production builds succeeded.
- `next build` with the mock env, then `tsx scripts/nav-smoke.ts`: `nav-smoke: ok` (390 and 1280 px, all dynamic-id client navigations ok).
- cacheComponents/partialPrefetching: still absent from next.config.ts (comments only).

**Not done:** no restarts of dev servers; apps/site not upgraded; csp-check not run (not in the ticket); no real-Vercel check of gotcha 41, only the CDN stand-in in nav-smoke; no git operations.
