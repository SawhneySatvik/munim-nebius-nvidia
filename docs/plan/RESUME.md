# Resume point — W2 integration paused (10 Oct 2026, ~13:45 IST)

Founder: "pause the builds and capture current state so that we can resume". Both live lanes were stopped mid-task.
Nothing is lost: their partial work is committed on branch **`wip/w2-integration`**; `main` stays at the last
green-by-gate commit.

## Where things stand

| Item | State |
|---|---|
| `main` @ `426dbf1` | W1 closed; W2 14 modules (checkpoint commits, pre-review); integration Batches A (0015), B (i-1, i-2) merged; Supabase bring-up fixes |
| `wip/w2-integration` | `main` + two WIP commits: **T-034** (t-1, Opus) partial and **T-033** (b-33, Sonnet) partial — not gated, may not pass |
| Hosted Supabase dev DB | **0001–0015 applied**, roles + packs seeded, 17/17 bring-up checks; `PORT=8797 make up` → `/health` 200 (migration_version 15). Port 8787 is used by another local project (sarthi) — do not kill it |
| Last quiet-tree `make check` | at the pre-integration checkpoint only (lint/typecheck/smoke ✅; boundaries/test ❌ with known causes, all since addressed by B-batch). **Not yet re-run** after integration |
| W2 review | not started |

## Paused lanes (stopped mid-task — audit their own state before continuing)

**t-1 · T-034 (Opus)** — brief = W2-FIX-LIST section C (C1–C3) + "the work" items 1–4 of its dispatch:
1. fix the 6 post-0015 core-api failures (accounts merge audit-per-row, compliance 404, finance-posting via draft, platform seeded model_role, purchasing chart code);
2. C1 remove every test-only `command_authority` shim;
3. C2 routes on 0015 seeds (orders advance/accept/reject, tenancy member role set/deactivate, payroll status + reversal, invoice dispute + reversal, POS-export import commit, loyalty policy read, inventory `reverseOrderConsumption` seam, catalogue `couponUses` excludes cancelled, itemsForSale/priceLines variant rule, `DbRole` munim_platform, `chart_incomplete`, blob store via Deps);
4. C3 `tests/integration/**` over HTTP (counter sale, storefront guest+signed-in + cancel reversals, PO→GRN→invoice→payable→dispute, import→settlement→break, onboarding→first sale IN + AU, price-draft take-over) with clause-1 scan + audit-chain verify per flow.
Last activity when stopped: tightening the clause-1 guarantee scan (`tests/integration/guarantee*.ts`).
Touched (uncommitted at pause → now on the WIP branch): contracts orders/people/tenancy, `packages/config`, core-api
modules accounts, catalogue, customers, finance, imports, inventory, orders, people, purchasing, tenancy, platform,
`app.ts`, `lib/{errors,types}.ts`, `server.ts`, many tests, new `tests/integration/`.

**b-33 · T-033 worldgen (Sonnet)** — `tools/worldgen/**` + `make seed`: 4 worlds via the public API only, ~40
planted problems with answer keys, determinism across TZ, independent read-only recompute, no-SQL grep gate,
simulated-supplier labels. Last activity: red-proofs for gate (d) (no SQL clients). Its API-gap list was not yet
reported.

## Resume order

1. `git checkout wip/w2-integration`; `make test-db`; run `services/core-api`, `tests/integration`, `tools/worldgen`
   vitest to see where the WIP stands (expect some red).
2. Resume t-1 and b-33 (same agents if the session still has them, else fresh lanes with this file + their briefs
   above; first instruction: "audit your own state against the brief, then continue in smaller increments").
3. Orchestrator: contracts gen on a quiet tree → full `make check` + `make test-db` (definition of done in DECISIONS
   10 Oct "W2 modules built").
4. W2 adversarial review (Opus: guarantee/security, money/stock; Sonnet: contracts/SDK, gate quality — grep for
   `vi.mock`, `setPostFor`, `setProvisionTenant`, `setOrderSeams`, `configureStorefront({seams`,
   `ORDERS_REAL_PRICING`, `db.admin` inserts into `command_authority`) → ≤ 2 fix cycles.
5. Merge `wip/w2-integration` into `main` (commits by ticket), live HTTP run on Supabase: onboarding → first sale →
   outbox delivered; BOARD + DECISIONS close W2. Then W3.

## Open items carried
- W2-R8: advisor access to finance templates → W3 M-C (template `min_role` ladder has no advisor).
- Supabase `email_confirmed_at` check via `/auth/v1/user` is UNVERIFIED against the hosted project (needs a live sign-in).
- `munim_platform` / `munim_intel_ro` logins on the transaction pooler not yet probed by bring-up (core + svc are).
- Founder items unchanged: customer status channel/provider (money); ROFR email.
- Deferred snapshot templates list: W2-FIX-LIST "Deferred to W3".
