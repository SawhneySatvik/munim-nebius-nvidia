# T-127 — the demo path on the real system (step-B blockers from T-114 and T-125)

Read `CLAUDE.md` (it binds you: rules 1–6, 11, 13, 14, 16, 17, 19, 20; gotchas 1–3, 17, 21, 22, 27–33), ledger R47, R54–R58
(**R58: the Vercel demo runs live Gemini with the recorded fallback; every gate stays recorded**), and the two reports:
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/d3d6cd99-23c3-4800-9f13-0e8bcbe8e5df/scratchpad/lane-C.md`
(§0 blockers, §4, §8) and `.../lane-T125.md` (the over-cap gap, with its proposed diffs). Code is committed through
T-114 (b6dda3c), T-116/T-117 (31b6b43), T-125 (eba2d32).

**Do not edit anything until `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/sync/GO2` exists**
(a full `make check` is running). Read and plan meanwhile; poll with short sleeps.

You are the **only migrator** now. Concurrent lane: **T-122/T-123** (packages/config, composition roots `env-root.ts`/
`dev-root.ts`/`server.ts`/core-worker `main.ts`, `apps/web/lib/server/**`, a new `adapters/dev` mapping package,
`.dependency-cruiser.cjs`, `scripts/export-cup.sh`, export README/ARCHITECTURE, and *rewording only* in worldgen/tests).
Stay out of those files; if you need a change there, report the exact diff. You own `make contracts` and `make ontology`
for this period (T-122 does not run them).

## Work, in this order
1. **Migration `0032_rfq_authority.sql`** (additive, post-conditions inside, `assert_catalog('0032')`, its red-proof script
   like `redproof-0031.sh`, bump the other red-proof plants 0032 → 0033, manifest + `grants.test.ts` counts): the
   `core.command_authority` row for `purchasing.rfq.request.v1` — exactly the stand-in T-114's tests insert (owner,
   manager, judge; scope `outlet`; target tables as the stand-in). Remove the stand-in inserts from `rfq.test.ts`, the
   harness and `redproof-t114.sh` (its `no-authority` plant must now delete/plant against the migration's row instead).
2. **Purchases budget route.** `finance.budget.set.v1` has an authority row and no route. Add the member route (read how
   budgets are stored and read by the deal review; follow the existing command pattern: idempotency, audit entry under
   the person, book guard, the person's own command), its contract + SDK (`make contracts`), tests (role refusals,
   idempotency replay, audit, red-proofs). Owner (and whoever the authority row allows) only.
3. **Over-cap at the run level (T-125's gap).** Add an explicit AI-on field to the run-frame (contract + `frame.ts`) so
   intel can tell "AI switched off" (never serve AI answers) from "over the R47 cap" (serve the recorded fallback when a
   fixture exists, else abstain). Wire `manager/ask.py`, `negotiate/route.py` and `app.py` per T-125's report. Tests incl.
   the dangerous case: AI off + fixture present → **no** AI answer (red-proved).
4. **Ingestion fallback:** the one-line directory fix T-125 found (live ingestion extraction looks for fallback fixtures
   in the wrong directory) + the missing `recorded-fallback` trace label for `ingest/quarantine.call`. Tests.
5. **One-outlet RFQ resets the other outlet's forecast** (lane-C §0): choose the smallest correct fix (a forecast run over
   all the tenant's outlets in the RFQ route, or a per-outlet latest run in the reading templates — the latter would be a
   migration; prefer the route fix if it is correct) and prove it.
6. **Cobnut world** (`tools/worldgen/src/worlds/cobnut.ts`, `kit.ts`, `cli.ts`, Makefile `seed` target):
   - the three simulated suppliers with agent cards `<SUPPLIERS_SIM_PUBLIC_URL>/{steady,discounter,premium}/.well-known/agent-card.json`
     added **in that order** through `POST /v1/suppliers` (kind `simulated`; names keep "(simulated)"), the sim URL from
     env at seed time (refuse to seed suppliers without it; print the URL used);
   - a purchases budget for the current month through the new route (owner's command), ₹50,000 like T-114's e2e;
   - `make seed WORLD=cobnut SEED=<seed>` pass-through (`$(if $(SEED),--seed=$(SEED))`), both flag forms in the CLI;
   - keep the determinism gate and the cobnut test green.
7. **Vercel env (R58):** in `deploy/vercel/env-setup.ts`, munim-api gets `MUNIM_MODEL_MODE=live` and `GEMINI_API_KEY`
   (from `.env` via `packages/config`; if it is absent, set everything else, name the missing variable, exit 1), plus the
   R47 cap setting if config has one; update its tests and `deploy/vercel/README.md`'s env table. Gates and `make smoke` stay recorded.

## Gates
`make test-db` (0032 counted; red-proofs), core-api full vitest, core-worker, intel pytest + ruff + mypy, `make intel-redproof`,
`make contracts` no drift + `make ontology` + contracts tests, worldgen node tests (cobnut, determinism), deploy/vercel
tests, `make boundaries`. **End to end on a fresh local stack (recorded mode, ports 4420–4439)**: seed
`MUNIM_SEED_OPERATOR=1 make seed WORLD=cobnut` with the sim URL → the owner requests quotes for hazelnuts for both
outlets **with no SQL and no hand-added suppliers or budget** → PO draft for both outlets → the Gomti Nagar manager 403 →
the owner approves → PO + audit row. (Recorded mode still needs the exact 1 kg shortfall: do the owner's stock count
through the API as T-114's e2e does — that limit disappears with live Gemini, R58.) Guarantee scan, both clauses.

## Limits
No commits; no AI attribution anywhere. Never read `.env`. Never touch hosted Supabase or Vercel. Don't touch
`pnpm-lock.yaml`/`uv.lock` (report dependencies). Never 8787/4102/3000; leave 8790/8090 alone. Kill what you start;
delete token files and copies.

Report: `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/d3d6cd99-23c3-4800-9f13-0e8bcbe8e5df/scratchpad/lane-T127.md`.
Final message ≤ 30 lines.
