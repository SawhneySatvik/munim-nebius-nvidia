# EVENTS-STATUS — live status of the events build (plan: [`08-events-build.md`](./08-events-build.md))

Updated after every wave. This file wins over memory. Branch `intelligence` · worktree `../foodops-intel`.

## Now
- **28 Oct ~02:50 IST: paused for the day; the local stack is DOWN** (`make down`, 8 process groups; local-db stopped, so
  the seeded worlds, the hand-applied 0037 and the NB-6 film drafts are gone). Rebuild before N3: `MUNIM_IDP=local
  MUNIM_INTEL=real make up LOCAL_DB=1`, then per world `node scripts/dev/local-operator.ts --world=<w>` +
  `MUNIM_SEED_OPERATOR=1 MUNIM_RUN_DIR=.run/local make seed WORLD=<w>` (cobnut, blr_kitchen, snacky_shack), then
  `nemotron-roles.ts --provider=nebius` and `restart-svc.sh web <w> <port>` for 3001/3002. Session handoff:
  `../hackathon/_meta/HANDOFF-2026-10-28.md`.
- **28 Oct, early:** everything that does not need the Token Factory key is built, reviewed and committed: NB-6 + fix
  (uploads take full phone photos), NB-6b (inbox spans), NB-7 + NB-7b (Tavily via an owner-approved import; zod 4.6.7,
  audit clean), NB-pack (submission text, README source, feedback), NB-film draft 1 (178.00 s, placeholders for N3).
  **`make check`: PASS on all 8 targets** (0b705aea), pushed. Waiting on the founder: Token Factory key (N3), second
  Supabase project (N4), licence + public repo + submit (N6), film notes.
- **27 Oct ~21:00 IST:** landed NB-1b (smoke names the provider; 3/3 on Nemotron), NB-4 integration (5c1cc77; 0037
  applied locally, DB at 37), env names (1bebc5f), NB-5 + apps/site on Next 16.4.3 (2bd40d3, 0bc9c47), NB-6 (0ff33df:
  invoice upload → live Nemotron read → page-span draft → approved; the hazelnut PO cites `saving_minor`; left proposed for
  the film: invoice draft 01a17dbd…, PO draft 01a17dba…). Running: NB-6 security review (Opus), NB-6b (inbox spans), NB-7
  (Tavily via the signal path + zod ≥ 4.6.6). Open for the founder: three live deployments still on Next 16.4.0
  (munim-rho from main, munim-cobnut from falkordb, the Cup on Cloud Run from cup-live).
- **27 Oct 17:15 IST — wave 1 landed** (tickets: `09-nebius-finish.md`): NB-2 (model tag on answers, 28853d9), NB-3 (approval
  re-judges under the evidence's own scope, 78e1abb), NB-4 (migration 0037, 22f5a7e; not yet applied locally — after the
  NB-4 integration lane), NB-D (+fix, b6be750/babfbaf), NB-F (film script, e5db836). **NB-1:** the regression was the roles,
  not intel — the rebuilt DB kept 0015's Gemini roles; repointed with `nemotron-roles.ts --provider=nvidia` ("5 roles on
  nvidia"); core-api, core-worker and web restarted. Found: the local router call to `gemini-3.5-flash-lite` returns 400
  (the Cup's router id — unchecked on the Cup). Running: NB-3 and MS-1 guarantee reviews (Opus), NB-1b re-run, NB-4
  integration, env names (NEBIUS_API_KEY, TAVILY_API_KEY; founder-approved).
- **27 Oct 14:30 IST: local stack rebuilt** (founder's go): `make up LOCAL_DB=1`, migration 36, intel live; cobnut (582
  writes), blr_kitchen (958, 4 planted findings), snacky_shack (768, 2 planted; AI "not ready", no AUD price) seeded; webs
  3000/3001/3002 200. **Regression: the live Ask smoke on Cobnut abstains twice** (`nemotron-smoke.ts --world=cobnut --ask`,
  the reorder question that answered every run on 24 Oct): `missing_ref`, 0 segments, at 61 s and then 80 s (the Ask
  budget). Stopped after the second identical failure; cause not investigated (first item of N2 once the plan is approved).
- **27 Oct 13:30 IST:** founder to-do 0 is done: `nebius` is a provider (8585fb2: contracts 262/262, `test_nebius_host` 3/3,
  `make intel-redproof` "ALL RED-PROOFS FIRED"). Not pushed (the session's permission system refused the push). **The local
  embedded Postgres has died** (core-api /health 503, ECONNREFUSED): the seeded worlds are gone until `make down` +
  `MUNIM_IDP=local MUNIM_INTEL=real make up LOCAL_DB=1` + reseed. The remaining Nebius work (N2–N6) waits for the founder to
  approve the plan in `hackathon/_meta/PLANS-2026-10-27.md` (D-025–D-028).
- **11:35 IST: the overnight build is done.** Waves 0–2 landed (table below). The local stack is still up with intel
  **live on Nemotron** (unattended jobs use about 3 NVIDIA calls an hour; to stop that, `scripts/dev/restart-svc.sh intel`
  brings it back in recorded mode, where every Ask abstains). Cobnut :3000, Kosambari Kitchens :3001, the Snacky Shack :3002.
- The Nebius export is ready locally (`munim-nebius`, from ff3346c) and is not published. Next steps are founder to-dos 0, 1, 1a.
- Dev helpers: `scripts/dev/restart-svc.sh` restarts one service without stopping local-db (which is throwaway), runs
  the web live as a seeded world on its own port, and re-mints demo sign-in tokens (they last 1 h).

## P0 — Baseline
| Step | State | Evidence |
|---|---|---|
| Worktree `intelligence` from `origin/falkordb` (958b105); pnpm and uv installed; `.env` linked from the main checkout (never read) | ✅ | `git log -1` = 958b105 |
| Local stack: `MUNIM_IDP=local MUNIM_INTEL=real make up LOCAL_DB=1` | ✅ | preflight "database local Postgres"; core-api /health 200, migration 35, idp local; web 200; intel 200 (01:26) |
| Operator row for the Cobnut seed (`scripts/dev/local-operator.ts`, taken from the FalkorDB export; local DB only) | ✅ | "local-operator: added: worldgen-cobnut-operator" |
| Cobnut seeded locally (`MUNIM_SEED_OPERATOR=1 MUNIM_RUN_DIR=.run/local make seed WORLD=cobnut`) | ✅ | "seed exit 0"; "live AI roles priced at 0 INR: router, reason, narrate, extract" (01:28) |
| NVIDIA endpoint models (key loaded through `munim_intel.config`) | ✅ | 85 models; Nemotron ids below |
| Baseline `make check` | ✅ with 2 known failures | lint, typecheck (17 packages), boundaries, boundaries-redproof, intel-redproof, smoke, smoke-redproof PASS; `test` FAIL on 2 of 15 packages, both pre-existing (below) |

### Nemotron model ids: NVIDIA endpoint vs Token Factory
| Use | NVIDIA endpoint (`integrate.api.nvidia.com`, dev tonight) | Token Factory (submission; catalogue 17 Oct) |
|---|---|---|
| Reason (investigations, negotiation) | `nvidia/nemotron-3-super-120b-a12b`; heavy: `nvidia/nemotron-3-ultra-550b-a55b` | `nvidia/nemotron-3-super-120b-a12b`; `nvidia/Nemotron-3-Ultra-550b-a55b` |
| Vision / extract (invoice photos) | `nvidia/nemotron-3.5-super-vl-120b-a12b` | `nvidia/Nemotron-3.5-Super-VL` |
| Router / narrate (fast) | `nvidia/nemotron-3.5-lightning-30b-a3b`, `nvidia/nemotron-nano-3-30b-a3b` | `nvidia/Nemotron-3_5-Lightning`, `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` |
| Embed | `nvidia/nemotron-3.5-embed-1b` / `-8b` | (check the catalogue) |
| Document parsing (optional) | `nvidia/nemotron-parse-2.0` | (check the catalogue) |

## Founder to-dos
0. **Approve the contracts change (blocks the Nebius submission).** The permission system refused lane A's edits to
   `packages/contracts` ("Modify Shared Resources"); I did not route around it. core-api checks a model role's provider
   against `MODEL_PROVIDERS`, so until this lands **no role can be set to `nebius` and nothing reaches Token Factory**,
   key or no key. The exact change (verified by lane A in a scratch copy: `verify_models: ok`, 17 tests pass):
   - `packages/contracts/src/platform/index.ts:12` → `export const MODEL_PROVIDERS = ["gemini", "openai", "openrouter", "nvidia", "nebius"] as const;`
   - `packages/contracts/src/internal/index.ts:259` → `provider: z.enum(["gemini", "openai", "openrouter", "nvidia", "nebius"]),`
   - then `make contracts`, `make ontology`, `scripts/dev/restart-svc.sh core-api`, restart intel live (below);
     move `docs/plan/lanes/pending/test_nebius_host.py.pending` back to `services/intel/tests/test_nebius_host.py`.
   - Same approval unlocks **gap B** (the model tag on Ask answers): `AnswerView.run_id` in
     `packages/contracts/src/threads/index.ts`, `answerViews` returns it (`services/core-api/src/modules/threads/index.ts`),
     `ask.tsx` `runId={a.run_id}`, and `run-by.tsx` lets answers skip the every-outlet gate. Details: `lanes/A.report.md` "Blocked".
   - Say "go" and I'll apply it in one commit.
1. **Before publishing `munim-nebius`:** it is re-exported from tonight's final commit (ff3346c). If anything lands later,
   re-export (`make export-nebius` refuses an existing directory: move the old one aside). Delete `munim-nebius.b4057a8`
   (the superseded first export) when you like. Clear the README's 6 "TODO before publishing" lines, run its `make up`/`make demo`
   once in a fresh clone (only dry-run tonight; the shared stack held the ports), then create the public repo yourself.
   **Licence decision:** Apache-2.0 opens Munim's full source (the FalkorDB export said "All rights reserved"); the
   Nebius rules require an open-source licence.
1a. Token Factory key (`NEBIUS_API_KEY`). The NVIDIA endpoint doesn't count for the submission.
1b. **Ask: three decisions from the answer-rate work** (`lanes/A2.report.md` §8 and Fix cycle 1):
   - **Channel names:** "Swiggy" can't be tied to a cell. Either run-frame channels (contract: `InternalRunFrameResponse`
     gains `channels: [{id, name, kind}]`, intel mints `C<n>` like `O<n>`) or a `channel_name` column on
     `finance.settlement_vs_orders` / `finance.unapproved_deductions` (migrator).
   - **Empty reads:** a whole-snapshot `Ref` (contract) would let "nothing at risk at Gomti Nagar" be cited; until then such
     a clause is told to be left out, and one folded into a cited sentence with no outlet named isn't caught.
   - **Payout time:** 4–6 Ultra steps against the 80 s Ask budget; raise the budget or the `reason` timeout, or accept it.
2. Tavily key (`TAVILY_API_KEY`, promo code `BBDEVPOST`).
3. Meta/Muse key; check that `/v1/models` works from India; read Meta's Official Rules on Mon 26 Oct.
4. The Snacky Shack owner's written consent before anything of theirs goes public.
5. Next.js 16.4.0: the CLI flags a known security vulnerability and recommends `next upgrade --agent=security`.
   Not run; your call.

## Known pre-existing failures (from the baseline check; lanes must not chase these)
- **`adapters/falkordb`, 6 of 47 tests** (`test/core-api.test.ts`: graph-project job, graph:query, /v1/graph/*): they need a
  FalkorDB server, and tonight's stack runs without `MUNIM_GRAPH=falkordb` (nothing listens on 6379). Environmental:
  503 `graph_unavailable`, `failed: 2, rebuilt: 0`. Out of scope tonight.
- **`tools/worldgen`, 1 test** (`test/cobnut.test.ts:174`, "R67: six regulars stopped coming to Hazratganj"): at-risk
  count 7, expected 6. It reads `as_of = businessToday(new Date())`, so it depends on the date. It was already red at
  958b105 before tonight's work. Lane C must not change Cobnut's seed to chase it.
- **`packages/contracts` ontology "fresh" test:** red since 0036 (a new ontology input) until `make ontology` runs, which
  waits on founder to-do 0.
- **`intel-redproof` stops at the ontology red-proof** (its baseline is the same "fresh" test), so `make check` skips the
  seven per-area red-proofs after it (brief, investigate, context, manager, fanout, threads, wiki). Until founder to-do 0
  lands, run them by hand: `for a in brief investigate context manager fanout threads wiki; do bash services/intel/tests/$a/redproof.sh --offline; done`.
- worldgen R67 and the 6 falkordb tests **passed** in the 11:00 IST check (R67 is date-dependent).
- **"Green" tonight means:** every gate passes except these 7 tests, and no new failure appears.
- `apps/web/AGENTS.md` is written by `next dev` on every start. It stays untracked.

## Incident: Vercel preview builds of `intelligence` (04:00 IST)
- munim-cobnut is Git-connected, so the pushes of `intelligence` built **preview** deployments (four Ready, 03:15–03:45).
  Production (5 days old) is untouched. Every preview URL answers 302 to Vercel's sign-in (Deployment Protection), so
  nothing is public. They hold the Cobnut web with the other two businesses bundled (the lane C fatal, being fixed).
- Fixed going forward: `deploy/vercel/ignore-build.sh` skips any build of `intelligence` (EV-5), commit b3672ec.
- **Founder:** delete those previews in the Vercel dashboard if you want them gone (I didn't delete anything). They are
  `munim-cobnut-{7dz3nw1gj,c85jkgkmu,lauqg7l7q,6meyx5183,6ud7iyn8j}-satvik-sawhneys-projects.vercel.app`, possibly with
  more; check the project's Deployments tab.

## Lane C review (b0779d7), fatal first
- **F1 (fatal):** every web build, Cobnut's included, bundled all three businesses (static registry, all fonts and CSS).
  Fix cycle 1 is making the business a build-time choice, with a bundle scan that proves it.
- **M1:** `scripts/export-cup` (the Cup export) would now fail its forbidden-word gate and ship the new worlds' tests
  without `verify/`. The Cup export isn't run from `intelligence`; the P6 Nebius export must exclude them by design.
- Deferred (no reseed tonight): UPI tenders in the Geelong history and GST on water (m5); no gate yet proves the
  watchers find the AU plants (m6); the web hard-codes country logic (m3, a rule-7 drift to fix with a storefront country field).

## Follow-ups noted by lanes
- `make ontology` must run after lane A's `make contracts` (0036 is a new input; `ontology.test.ts` "fresh" is red until then). Lane A told.
- Live Ask on Cobnut abstains until lane A's Nemotron path is live: intel has no recorded fixture for it (`RecordedFixtureMissing`). Re-shoot `ev-p3-shots` after A.
- Lane B's screenshot gate approved 3 and rejected 3 recipe drafts on the local Cobnut; 2 are still proposed (the gate needs 2 per run).
- **intel runs live now.** Always restart it with `MUNIM_MODEL_MODE=live MUNIM_ASK_BUDGET_S=80 scripts/dev/restart-svc.sh intel`; a plain restart comes back recorded and every Ask abstains.
- **Core bug (lane A):** a single-outlet RFQ's PO draft went `stale` when the owner approved it (core likely re-checks it under the owner's wider outlet scope); an RFQ across all outlets approved cleanly. Matters for filming the chain.
- `apps/web/scripts/bundle-isolation.sh` and any edit to `apps/web/next.config.ts` restart the :3000 `next dev`, which then stops at Next's security notice. Bring it back with `scripts/dev/restart-svc.sh web cobnut 3000`.
- NVIDIA use by 06:30 IST: 226 Nemotron calls on the local spend books (151 Ultra, 41 Lightning, 34 Super VL), plus about 240 bench/recorder calls by lane A2 that post no spend rows. Unattended jobs (watch sweeps, the morning brief) add about 3 an hour while intel stays live.
- NVIDIA free-credit use at 04:14 IST: 123 model calls in all (mostly lane A's smokes), 75 in the last 30 minutes, none in the 12 minutes before.
- **Kosambari has 42 stale `inventory.dead_stock` findings:** a 15-minute watcher run fired mid-seed, findings don't auto-close, and they'd clutter its inbox in a demo. Fix before any filming: dismiss them, or reseed between watcher runs.
- **The Snacky Shack is a real business:** it is in the private `food-ops` repo only. **The P6 public export must exclude it** (its hunks are also inside shared files: `lib/businesses/index.ts`, `art.tsx`, `app/fonts.ts`, `globals.css`, worldgen `run.ts`/`cli.ts`), until the owner consents. Our page copy for it was written by us and needs the owner's review.
- The Snacky Shack has no live AI: `platform.model_role` is priced in one currency (INR). Founder decision: per-currency prices, or leave it AI-off.
- Lane C edited `components/art.tsx` and `components/chrome.tsx` (owned by no lane) so each business gets its own wordmark/hero/footer; Cobnut's code paths are unchanged.
- Migration counts in `db/README.md`, `scripts/export-cup/root/docs/data-model.md` and `deploy/vercel/README.md` are now stale (no test checks them).

## Waves
| Wave | Tickets | State | Evidence | Commit |
|---|---|---|---|---|
| 0 | P0 baseline | ✅ | above; log `/tmp/claude-501/intel-check0.log` | 4e0c2fd, c9dacd0, d0032bd |
| 1 | M: `nebius` in both provider CHECKs (0036) | ✅ | db suite 38 files / 499 tests pass; local DB at migration 36, /health 200; `lanes/M.report.md` | 8d9aeeb |
| 1 | B: P3 agent + model in the staff app; owner polish | ✅; review: 0 fatal, 2 major, 3 minor → fix cycle 1 running | web tests 149/149, typecheck 0, lint 0 after the `.next-*` ignore; 18 screenshots in `.screenshots/EV-P3/` (42 checks); `lanes/B.report.md`. The model tag shows only when a trace names the model: gaps A (intel route traces need `provider`/`model_id`) and B (`AnswerView.run_id`) were handed to lane A | 5464bbb, 9773c07 |
| 1 | C: P4 Kosambari Kitchens (`blr_kitchen`, synthetic, Bengaluru, IN) | ✅; review: **1 fatal** (below), 1 major, 7 minor → fix cycle 1 running | seeded locally; live verify 4/4 (Swiggy commission leak, Zomato ad fee never opted into, urad dal price creep, overtime spike, each raised by core's watchers with resolved refs); storefront :3001 in its own theme, staff demo sign-in works; `.screenshots/EV-P4/` | b0779d7 |
| 1 | C: P5 The Snacky Shack (`snacky_shack`, Geelong, AU; real menu of 53 items, synthetic history) | ✅; same review | seeded locally; verify 2/2; AU golden-receipt + DST 27/27; tenant PII scan clean (red-proved on Cobnut); storefront :3002; `.screenshots/EV-P5/`. worldgen 96/97 (only the known R67) | b0779d7 |
| 1 | A: P1 Nemotron live on Cobnut + `nebius` provider + structured output + trace labels | ✅ except the contracts hand-off (founder to-do 0) | `node scripts/dev/nemotron-smoke.ts --world=cobnut` PASS. Ask run `01a16ad5-f810-7d40-a625-5a2b1bf65dce`: router `nvidia/nemotron-3.5-lightning-30b-a3b`, reason `nvidia/nemotron-3-ultra-550b-a55b`, 4 resolved refs. Investigation narration run `01a16ad6-4a18-7fc0-96a0-d3dad75149ca` on `nvidia/nemotron-3.5-super-vl-120b-a12b` (model lines used, not the template). Strict JSON schema works on all four schemas; reasoning off except on reason (calls ≈1 s). intel 948 passed (+3 parked), ruff/mypy clean, red-proofs 27/27, all, 27/27. `nemotron-3-super-120b-a12b` and `nemotron-nano-3-30b-a3b` are 404 on this NVIDIA account, so reason runs on Ultra | 699d1ba |
| 1 | A: P2 hero chain | ◐ partly live | **Live:** Nemotron VL reads the synthetic Riverbank invoice; the draft holds only page-span refs; a forged figure withholds it (red-proved). **Live:** the hazelnut negotiation with the simulated suppliers (run `01a16ae4-2cc8-7c5b-b234-8f197c14a8d1`, 10 route traces all `live`), the deterministic deal check, a PO draft with 2 resolved refs, **approved by the smoke script with the demo owner's token, not by a person in the UI**. **Stopped:** upload → intel ingest (no core route hands intel the document), the Tavily cite (no ingredient-price signal kind or template), the cited saving (no snapshot column). Butter has no shortfall, so the invoice (butter) and the negotiation (hazelnuts) are two separate demos today | c2adcd0 |
| 2 | P6: Nebius export | ✅ | **Re-exported 11:40 IST from ff3346c** (the final code + the README's measured Ask limitations): `/Users/satviksawhney/Downloads/projects_26/munim-nebius`, one commit 6149395, 2189 files, `--check` green (intel 814 recorded), 0 Shack/key/attribution hits; the first export (b4057a8, from ff8349d) is kept at `munim-nebius.b4057a8`. First export: 2152 files, Apache-2.0, no remote, nothing pushed. Gates: rules 277/277, source, closure, words, secrets, overlay, licence, links all clean; `--check` green (typecheck 15 packages, boundaries, web 157/157, cobnut + blr_kitchen production builds, worldgen 29/29, intel 793 recorded). 12/12 red-proofs. Orchestrator spot-check: 0 Shack hits, 0 attribution, 0 key shapes, no `.env`. README carries 6 "TODO before publishing" lines for the founder. Feedback draft `docs/nebius/FEEDBACK-DRAFT.md` | 490b9f0, ff3346c |
| 2 | A2: Ask answer rate on Nemotron (net sales, labour, expiry, Kosambari's Swiggy payout all abstained; only reorder answered) | ✅ after fix cycle 1 (review FAIL → fixed; 2 asks left open, below) | Live on Nemotron (router Lightning, reason 3 Ultra, every call `model_path=live`): reorder, net sales, labour answer on every run (Cobnut and Kosambari); expiry 4 of 6 runs (2/2 after the fix: `01a16c09-b550-76ef-8676-ccdf802217ca`, `01a16c0b-bcd8-7ac8-b4b1-e85e1acd08c6`); payout 2 of 4 (the rest hit the 80 s budget). Fixes: a read index + routing lines before a skill loads, date windows and `O<n>` outlet handles in the run frame (outlet slots only), one refusal naming every broken segment, "none" read as null, the finish tool outside the tool cap, 5 SDK retries past NVIDIA's 429 bursts. **Review blocker fixed:** the refusal no longer coaches folding an empty read into another outlet's segment, and a new runtime check refuses a segment naming an outlet none of its cited cells belongs to. **Left open (asks below):** "Swiggy" can't be tied to a cell (no channel names reach intel), and an empty-read clause folded into a cited sentence with no outlet named isn't caught; the payout replay is a strict xfail naming both. intel 972 passed / 4 xfailed; ruff, mypy clean; every intel red-proof held (manager 69 plants); smoke PASS. ~470 live NVIDIA calls for the lane, ~240 of them unmetered (bench/recorder) | a6f3274, df2062f |
| 1 | C fix cycle 1: each build carries only its own business (build-time `turbopack.resolveAlias` on `@/lib/businesses/current` and `…/fonts`; unknown site fails the build); "real menu, synthetic history" on the Shack; AU checkout tested; tracker uses the business time zone | ✅ | `apps/web/scripts/bundle-isolation.sh` re-run by the orchestrator: **PASS**, 0 forbidden hits in each of the three production builds (was 447 in Cobnut's before); Cobnut's 20 HTML pages match the old output; web 175/175, typecheck 0, lint 0; worldgen 13/13 | 4f806ea |
| 1 | B fix cycle 1: a finding names a model only from its own narration (`finding_id`), a draft only from `specialist:` calls; mock 404s; failed-draft look; one pill per model, wraps at 390 px; home separates what you can decide | ✅ | web 156/156, typecheck 0, lint 0; mock screenshot gate 39 checks; 4 unit + 3 browser red-proofs. Residual: a finding whose model narration core refused (or a later template) can still show the model, since core keeps the first `run_id` → lane A/core | d5d482e |
| 2 | Final `make check` on df2062f (quiet tree) | ✅ green by tonight's definition | lint, typecheck, boundaries, boundaries-redproof, smoke, smoke-redproof PASS; `test` 14/15 (only the known ontology "fresh"); intel 972 passed, 4 xfailed; `intel-redproof` every plant fired up to the ontology red-proof, whose baseline is the same known test; the 7 area red-proofs it then skips were run by hand at 11:30 IST, all held (brief, investigate, context, manager, fanout, threads, wiki) | — |
