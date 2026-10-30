# Lane B1 — the Cobnut world (worldgen) + demo accounts

Repo: `/Users/satviksawhney/Downloads/projects_26/foodops-os` (read `CLAUDE.md` first; it binds you).
SCRATCH = `/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad`
Read `SCRATCH/sync/interface.md` (lane rules, names, env) — it binds you.
**Do not edit anything until `SCRATCH/sync/GO` exists** (a full `make check` is running). Read and plan meanwhile; poll
with `test -f` in a loop of short sleeps (under 2 minutes per call).

Territory: `tools/worldgen/**`, the `seed` target's WORLD list in `Makefile` (one line), `adapters/dev/idp-supabase/**`
only if demo-account creation needs it (report first). Nothing in `services/` or `apps/` (report needed changes).

## Work
1. A new world **`cobnut`** (`make seed WORLD=cobnut`), modelled on `tools/worldgen/src/worlds/restaurant_group.ts` and the
   T-100a Cares seed, following interface.md exactly:
   - business, two outlets (kind restaurant; Hazratganj with GSTIN + FSSAI; Gomti Nagar without), INR, Asia/Kolkata,
     operator-provisioned `is_demo = true`;
   - catalogue = `apps/web/mock-server/data.ts` (items, variants/sizes, option groups, prices, availability windows) and its
     coupons; a storefront channel + storefront key for Cobnut (written to the run dir like the other worlds, never logged);
   - people: owner Nandini Mehrotra (`*`), manager Farah Qureshi (Gomti Nagar), staff Imran Siddiqui (counter, Hazratganj),
     staff Kavya Tandon (kitchen, Hazratganj); POS device(s) and KDS stations the screens need;
   - dated history (R44) so the owner home figures, watchers and findings are non-empty: sales, tickets, waste (butter at
     Hazratganj), stock with use-by dates (sliced sourdough near expiry → expiry_risk → a Cares listing draft), labour;
   - simulated suppliers matching `apps/web/mock-server/staff-data.ts` (names with "(simulated)"), quotes so a negotiation
     yields a PO draft; simulated Cares recipients (Riverside Night Shelter (simulated), Old Town Community Kitchen
     (simulated)), Cares enabled by an operator-approved config draft (as T-100a does);
   - the drafts the mock seed has, produced the way the real system produces them (watchers/intel in recorded mode,
     negotiation), and **at least one draft whose outlet_ids cover both outlets** if any real flow makes one — find out
     which (e.g. a group-wide price or menu change, a PO for both outlets); if none can, say so with evidence.
2. **Demo accounts** for `MUNIM_IDP=supabase`: the four people bound to `<key>@cobnut-demo.invalid` with one generated
   password (`MUNIM_DEMO_PASSWORD`) written to the run dir (umask 077, git-ignored), never printed. Design it so the same
   seed run can target the hosted project later (Supabase admin API via `packages/config`'s secret key), but **do not run
   it against hosted Supabase**. With `MUNIM_IDP=local`, write the four tokens to a run-dir file for apps/web's
   `MUNIM_DEMO_TOKENS`.
3. **Reseed on demand**: one command (`make seed WORLD=cobnut` again) makes a fresh Cobnut tenant and prints only its
   tenant id + where the storefront key and tokens were written, so the site can be pointed at it
   (`MUNIM_DEMO_TENANT_ID`, `NEXT_PUBLIC_MUNIM_STOREFRONT_KEY`).

## Gates
- Seed the world into a **fresh embedded/local test database** you start yourself (see `packages/db` harness and how
  `make seed` / eval suites seed worlds; ports 4330–4339). Do not seed into the running 8790 backend.
- Assert, from SQL or the API: 2 outlets with the kinds and tax ids above; 4 members with the roles/scopes above; the
  storefront menu equals data.ts (item names, variant names, prices — a scripted diff, red-proved by perturbing one price);
  ≥ 1 finding of each type the owner home and inbox show; the drafts listed above exist; Cares enabled; `is_demo` true.
- Run apps/web's staff smoke (`apps/web/scripts/staff-smoke.ts`) and storefront smoke (`apps/web/scripts/smoke.ts`) against
  your seeded core-api (they take `NEXT_PUBLIC_MUNIM_API`, `STAFF_SMOKE_TOKENS`, `NEXT_PUBLIC_MUNIM_STOREFRONT_KEY`).
- `make check` targets for worldgen (lint, typecheck, tests) pass.

## Report
`SCRATCH/reports/lane-B1.md`: files, the world's contents table, gate outputs, the two-outlet-draft finding, the exact
reseed command, anything wrong, what you did not do. Final message ≤ 30 lines.
