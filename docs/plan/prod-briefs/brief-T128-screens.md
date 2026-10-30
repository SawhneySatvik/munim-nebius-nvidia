# T-128 — the screens wave: everything the Munim site still lists as "screens in progress" or "not started"

Read `CLAUDE.md` (the One Guarantee; rules 1–20; gotchas 18, 40), ledger R53 H-4 (the staff screens wear Cobnut's look),
R54–R65 (R61: Cobnut keeps its own brand; R64 X-2: the demo deny-list; R65 V-6: the film shows the page builder,
campaign messages, an Australian outlet and the AI office as built — building them makes the film true), the screen specs
under `docs/plan/screens/` and `docs/plan/packs/` that cover these features, `docs/handoff/owner-screens/02-design.md`
(the staff shell, source chips, the decision bar — the patterns to reuse), and the existing apps/web staff code
(`apps/web/components/staff/**`, `lib/munim/**`, `mock-server/**`).

The founder (16 Oct): the design is locked; complete **all remaining frontend**, especially what the Munim site
(`apps/site/app/page.tsx`, the "features" list) marks "Built · screens in progress", "In progress" or "On the roadmap".

## Step 0 — audit (read-only, write it down first)
For each feature row on the site, find what exists (backend routes/contracts, apps/web screens, tests) and what is missing.
Expected gaps (verify): **Investigations** (Step / Plan / Auto modes, the plan approval, findings with their rows);
**the specialists and the Manager** (a desk view: the eight specialists' findings and drafts by desk, @desk addressing in
Ask, the "AI office" visual in Cobnut's look); **many outlets and brands** (an owner rollup across outlets with per-outlet
books apart; managers see only their outlet; brand switch for a cloud-kitchen tenant if the backend supports brands);
**theming and the drag-and-drop page builder** (brand colours, layout presets, a visual editor for the storefront's
sections; check `0029_storefront_display` and the storefront contracts for what is stored — if storage is missing, design
the smallest additive backend: a person's own command, versioned, published by the owner); **customer campaign messages**
(customers specialist drafts, approval, "sent" recorded only — no real email/SMS provider, hard rule 5); an **Australian
outlet** on the AU pack (worldgen + screens show AUD/GST correctly). Write the audit and a screen list to
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/t128/audit.md`
and **report founder questions immediately** (return a short message listing them, then keep working on what they don't
block; the orchestrator relays answers).

## Step 1 — build (after the file `…/scratchpad/sync/GO3` exists; the go-live fix lane is editing apps/web until then)
- Every new screen in **Cobnut's look**, through the existing staff shell, client, refs/source chips and decision module;
  numbers only from snapshot cells (source chips; "Cannot verify" otherwise); every change a person's own command or an
  approved draft; simulated labels where they exist today; 48px targets, 16px inputs; works at 390 and 1280.
- Backend only where a screen needs it and the audit shows it missing: additive contracts/routes/migrations (you are the
  only migrator while you run; `make contracts` + `make ontology`; `make test-db` for migrations), each with tests and
  red-proofs, guarantee scan both clauses.
- Mock routes for every new screen (dev/tests), and the real-API path.
- **Update the Munim site's status lines** (`apps/site/app/page.tsx` feature list) to match what is now true — plain words,
  no overclaiming; anything still not built says so.

## Gates
Through `scripts/dev/heavy.sh`: apps/web tsc/eslint/vitest/next build + both smokes; core-api/intel tests for touched
areas; `make check`; screenshots of every new screen state at 1280 and 390 into `…/scratchpad/t128/shots/`; no sideways
scroll; no console errors. Report `…/scratchpad/t128/report.md` (or as text): per screen — files, backend added, tests,
screenshots; founder questions; what is not done.

## Limits
No commits (the orchestrator commits); no AI attribution; never open `.env`; ports 4580–4599; `apps/site` only for the
status lines; do not touch `video/` (the film lane) or `deploy/`. Concurrent lanes: go-live fixes (until GO3), C2 security
fixes (core-api command guards, contracts order caps, apps/web next.config headers — coordinate by staying out of those
exact files and reporting overlaps), the film lane.
