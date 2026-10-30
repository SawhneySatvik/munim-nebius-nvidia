# NB-D / NB-2 fix cycle 1

Gates: `node --test "deploy/nebius/test/*.test.ts"` -> `# tests 31 # pass 31 # fail 0` (was 17). `apps/web`: `vitest run tests/run-by.test.ts` 4 passed; `tsc --noEmit` clean.
Red-proofs: guard tests vs the original guard.ts -> A,A,B,C,F,F fail (6); stage tests vs original stage.ts -> D, E, --reference fail (3); env-setup with old project name + name check removed -> 3 fail; RunBy passing `null` -> "expected vi.fn() to be called with arguments". All mutations restored.

- A guard.ts: `MUNIM_REFERENCE_ENV_FILE` gone; reference = `<root>/.env` or `--reference <path>` (guard check/exec and stage). OK line `(reference: <basename>)`; reference with no session-pooler login ref refused. Allow-list also makes a stale export unreachable.
- B guard.ts refOf/label lowercased.
- C guard.ts refOf falls back to the `db.<ref>.supabase.co` host label.
- D stage.ts: pull+build in try/finally, `.env.production.local` always removed.
- E stage.ts vercelProject: after every `link`, `.env.local` deleted unread in the dir and its parent; `assertLinked` still checks `project.json` in the dir (test: a link landing in the parent is refused).
- F guard.ts `ALLOWED` allow-list (PATH, HOME, SHELL, TMPDIR, TERM, USER, LANG/LC_*, NODE_*, XDG_*, PNPM_HOME, PORT, MUNIM_API_URL, SUPPLIERS_SIM_PUBLIC_URL, MUNIM_SEED_TOKENS, MUNIM_SEED_OPERATOR_TOKEN). Test through `main`: planted PGPASSWORD and TAVILY_API_KEY reach the child as `[null,null]`. I added PORT/MUNIM_API_URL/SUPPLIERS_SIM_PUBLIC_URL because DEPLOY steps 4-5 export them.
- G deploy/nebius/env-setup.ts (+ test/env-setup.test.ts): imports `VARS` from deploy/vercel/env-setup.ts, maps to munim-nebius-api/web, swaps GEMINI for NVIDIA_API_KEY, drops FalkorDB/graph (my decision; confirm). Guard first. `--dry-run` prints `project NAME [state]` only. Apply path tested with a stub exec only. DEPLOY.md step 7 and the reference/allow-list text updated.
- H ask.tsx:56 comment replaced.
- I run-by.test.ts: no jsdom/testing-library installed, so `renderToString` with `useEffect` mocked to run inline and `useStaff` stubbed; asserts `getTraces(RUN)`.

Not done: no network/vercel/DB/.env*. No git ops. Env-setup could not import the unexported `Missing` class, so a dry run without `--api-origin` uses a placeholder origin and labels three names "needs --api-origin" (cleaner if deploy/vercel/env-setup.ts exported it; not my territory). Not mine: apps/web/AGENTS.md, docs/plan/lanes/NB-1.report.md. Guard scan: clause 1 clean (refusals only; nothing writes books); clause 2 n/a.
