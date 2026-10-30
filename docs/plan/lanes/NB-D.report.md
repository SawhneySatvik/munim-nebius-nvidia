# NB-D report: deploy prep for the Nebius demo (no network)

**Files created (all new, nothing existing edited):** `deploy/nebius/{package.json,guard.ts,stage.ts}`,
`deploy/nebius/test/{guard,stage}.test.ts`, `docs/nebius/DEPLOY.md`, this report. `packages/config` is unchanged:
`loadRepoConfig` already honours `MUNIM_ENV_FILE`; a test in guard.test.ts proves selection and the unset default (`.env`).
Not mine: `apps/web/AGENTS.md` (untracked, other lane).

**Guard** (`guard.ts check | exec --`): refuses unless MUNIM_ENV_FILE is `.env.nebius`, MUNIM_RUN_DIR is `.run/nebius`, no Supabase
project ref (pooler login, project id, project URL, direct host) equals the reference file's, and Vercel names are `munim-nebius-*`
and not the existing four. Names only in output (test asserts no value leaks). Pooler hosts are shared per region, so project ref is
the identity, not host (deviation from "compare host names"). Fails closed on a missing/empty reference.

**Tests:** `node --test "deploy/nebius/test/*.test.ts"` -> `# pass 17 # fail 0`.
**Red-proof** (mutated copies, deleted after): ref comparison off -> 5 failures (tests 2-5, 11); name check off -> test 8 fails;
guard result ignored in `main` -> test 11 fails; stage: link check off -> test 4 fails; guard enforcement off -> test 1 fails.

**Dry run:** `node deploy/nebius/stage.ts --deploy --dry-run` printed the full plan (worktree add, `pnpm install --frozen-lockfile`,
build.mjs, project add/update/link, `deploy --prod --regions bom1 --archive=tgz`, pull/build/`--prebuilt`) and exit 0; guard line
`WOULD REFUSE — .env.nebius does not exist` (expected until the founder writes it). A real `build.mjs --out <scratch>` staged 47M, exit 0.

**Founder:** create the second Supabase project, write `.env.nebius`, name the platform operator (DEPLOY.md, Founder section).

**Not done / gaps:** no network, DB, or `.env*` access; no `vercel` call. `deploy/vercel/env-setup.ts` hardcodes the old project
names, so Nebius env vars are BLOCKED until a profile-aware variant exists (outside my territory). Kosambari persona tokens
(demo-accounts is Cobnut-specific) UNVERIFIED. Steps 3-8 of the runbook are untested live. Guard scan: clause 1 clean (writes nothing
to books; refuses writes to the wrong database); clause 2 n/a (no numbers shown).
