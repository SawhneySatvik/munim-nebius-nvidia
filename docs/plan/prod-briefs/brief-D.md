# Lane D — migrator: menu and outlet display order

Repo: `/Users/satviksawhney/Downloads/projects_26/foodops-os` (read `CLAUDE.md` rules 4–6, 14 and gotchas 1, 3, 21, 22, 30;
they bind you). You are the **only migrator** right now. Read `docs/plan/prod-briefs/interface.md` (lane rules).

Problem (Lane B1, `SCRATCH/reports/lane-B1.md` §6 items 2–3; SCRATCH =
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad`):
core orders variants and option values by `name_key` (`services/core-api/src/modules/catalogue/menu.ts:60,71`, storefront
`read.ts`), with no position column, so "Large" shows before "Regular" and box flavours are alphabetical; storefront
outlets are ordered by name, so Gomti Nagar (busy) comes before Hazratganj.

Territory: `db/migrations/0030_*.sql` (new; never edit an applied migration), its manifest entries and DB gates,
`services/core-api/src/modules/catalogue/**` and the storefront read module, `packages/contracts` **only if** a response
needs a new field (prefer none: ordering is not a shape change — if you must, coordinate: Lane C is the one running
`make contracts`; report instead), `tools/worldgen/src/kit.ts` + `worlds/cobnut.ts` to set positions, tests.

## Work
- Additive migration 0030: a `position` (int, default from existing order so current worlds are unchanged) on catalogue
  variants and option values (and items within a category if they lack one), and a storefront display position for
  outlets (check 0029_storefront_display first — it may already have a place for it). Explicit revoke-then-grant blocks,
  RLS forced, `tenant_id` leading keys, book/operational tag per ADR-013, assert `pg_index`. Writes to these positions go
  through the existing catalogue commands (a person's command; no new write path).
- Reads order by `position, name_key`. Storefront outlets by position, then name.
- worldgen: positions in Cobnut match `apps/web/mock-server/data.ts` order (Regular before Large; Hazratganj first);
  other worlds unchanged (determinism gate).

## Gates
`make test-db` (embedded PG 18 + static Supabase-ism gate; isolation, intel-write refusal on N/N, book-guard,
append-only gates — all green with the new table/columns counted); core-api catalogue/storefront tests incl. an order
test red-proved; worldgen tests (the Cobnut menu diff vs data.ts now also checks order); `make boundaries`.
Ports 4360–4369 for anything you run. No commits. Report `SCRATCH/reports/lane-D.md` (migration text summary, gate
output, hosted-apply note), final message ≤ 20 lines.
