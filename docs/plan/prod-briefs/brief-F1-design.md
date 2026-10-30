# F1 — FalkorDB entry: graph design + embedded-server spike (plan 07 Phase 2, R12, R56 G-3, R62 S-5)

Read `CLAUDE.md` (the One Guarantee, rules 1–4, gotcha 10: pin FalkorDB 4.x), ledger R12, R54 P-5, R56 G-3, R62, plan 06
step E (T-130–T-133) and plan 07 Phase 2, `docs/admin/falkordb-rules-snapshot-2026-10-15.md` (the event rules: FalkorDB must
be the primary graph DB and central; "if the product still works once FalkorDB is taken out, the graph is decoration";
deliverables: public repo, README with setup **and the graph data model**, the Cypher queries the product depends on, demo
video, live deployment or full local setup, the track), the existing graph code (`adapters/dev/graph-falkordb/`, the graph
port and the Postgres-edges default — find them in core-api/intel; `core.graph_*` tables if any; intel's graph tools and
`tests/graph/`), and the data model for suppliers, ingredients, recipes, menu items, outlets, findings and drafts
(`db/migrations`, `docs/plan/02-schema.md`).

**Design only — no product code edits.** You may create files under `docs/plan/falkordb/` and a scratch spike directory.

## Deliverables
1. `docs/plan/falkordb/design.md`:
   - **The graph model:** node labels (lowercase, gotcha 9 style if applicable), properties, edge types and direction,
     cardinalities; supplier → ingredient → recipe → menu item → outlet; findings and drafts as nodes carrying snapshot
     refs (ids only, never model text); tenant isolation (one graph per tenant or tenant id on every node — choose, justify).
   - **How the graph is filled:** a derived read model projected from core's book tables by core (core-worker job and/or on
     commit via the outbox), never written by intel (R25 holds: intel has no write grant), idempotent re-projection, and what
     happens when FalkorDB is down (in the FalkorDB build: the graph features stop and say so — rule 3; no Postgres fallback).
   - **The Cypher queries** the product depends on (exact text, parameters, expected result shape), at least:
     "what does a butter price rise touch" (ingredient → recipes → menu items → outlets, with the margin snapshot refs),
     the supplier dependency view (which items/outlets depend on one simulated supplier; single-supplier risk), and the
     queries the intel graph skill uses.
   - **Two graph-first features** end to end: the intel skill (graph read → snapshot minting for every number → cite-or-
     abstain answer), the apps/web screen (Cobnut's look) and the API route(s), and how the One Guarantee holds (graph reads
     only; numbers from snapshots; any change is a draft a person approves).
   - **The export** (`make export-falkor`): allowlist vs the Cup's, fresh one-commit history (R54 P-5), the README and graph
     docs it carries, the track (Agents That Act on Connected Data suggested).
   - **File-by-file build plan** for F3 with test and red-proof per piece, and an effort estimate.
2. **Embedded FalkorDB spike:** in a scratch directory (not the repo), try running FalkorDB locally without Docker on this
   Mac (e.g. the `falkordblite`/redislite route or an official macOS binary of FalkorDB 4.x); start it, create a small graph,
   run one of your Cypher queries, stop it. Record versions, start time, memory, and whether it can back tests in CI-like
   runs (`make check` style) — or why it cannot (then the founder supplies a FalkorDB Cloud free instance, R62 S-5).
   Install nothing into the repo's venv or node_modules; keep the machine light.

## Limits
No product code edits; no commits; no AI attribution; never open `.env`; ports 4540–4559 for the spike. Report:
`/private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/f1/report.md`
(or as text): the design summary, the spike result, open questions for the founder. Final message ≤ 25 lines.
