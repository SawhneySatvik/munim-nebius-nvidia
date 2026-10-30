# C4 — judge-ready docs for the Cup export, plus a shared core (plan 07 C4, Track D)

AI judges will crawl the whole public repo. Write documentation that is accurate, specific, and verifiable against the
code: every claim names a real file, route, table or test, and nothing is described that the code does not do.

Read first: `CLAUDE.md` (hard rules 1–5; never mention Juspay, Vercel, Supabase, AWS, Claude/Anthropic, Snacky Shack; no
internal ledger ids like R25/T-128 in public docs), `scripts/export-cup/rules.py` (what the export keeps; the FORBIDDEN
words), `scripts/export-cup/root/{README,ARCHITECTURE}.md` (today's export root docs — rewrite and extend them),
`docs/plan/03-architecture.md`, `docs/plan/04-agent-framework.md`, `docs/plan/02-schema.md` (commentary only — the
migrations in `db/migrations/` and `packages/contracts/` are the truth), `infra/gcp/README.md`.

## Deliverables (all under `scripts/export-cup/root/`, which the export overlays at the repo root)
1. `README.md` — what Munim is (restaurants and shops, 2–5 outlets; core system of record + an AI layer that explains,
   finds money leaks and drafts actions; a person decides everything), the One Guarantee, a 5-minute judge's tour of the
   live demo (the Cobnut Bakehouse storefront, staff screens by role, Ask Munim, the supplier negotiation, Cares), run it
   locally, deploy on Google Cloud (point to `infra/gcp/README.md`), repo map, "Simulated means labelled" policy.
2. `ARCHITECTURE.md` — system design with mermaid diagrams: services and data flow; the book guard (book vs operational
   tables, command authority, approved decisions, posting rules); run tokens (Ed25519, minted by core, tenant only from
   the token); the AI layer (router + domain specialists on Gemini via ADK, tools closing over the run context, snapshot
   cells and cite-or-abstain, "Cannot verify"); live models with the recorded fallback; outbox → LISTEN/NOTIFY → SSE;
   multi-tenancy and forced RLS; country packs (India live, Australia pack); the Google Cloud topology (Cloud Run, Cloud
   SQL, Secret Manager, Identity Platform, GCS — as `infra/gcp/` and `adapters/gcp/` actually build it).
3. `docs/` (the export carries `scripts/export-cup/root/docs/**` as `docs/**`; check `export.py` overlays nested files —
   if it does not, add that and a test in `scripts/export-cup/test_rules.py`): `data-model.md` (schemas, the key tables,
   append-only books, journal balance — from the migrations), `api.md` (public `/v1`, auth, idempotency, errors and
   reason codes, SSE; from `packages/contracts` and core-api routes), `ai-agents.md` (each specialist, its tools,
   watchers, investigations, negotiation over A2A with simulated suppliers, traces), `security.md` (threat model, RLS,
   grants, intel has no write grant, run tokens, CSP/headers, secrets handling, demo protections — do **not** describe
   the number-grammar gaps), `testing.md` (`make check`, `make test-db`, red-proofs: what each proves, recorded models),
   `decisions.md` (a public-safe summary of the key design choices, no ledger ids), `simulation-policy.md`,
   `glossary.md`.
4. One `README.md` per exported service and package (`services/*`, `packages/*`, `apps/web`, `db`, `tools/worldgen`) —
   written **in place** in this repo (they export as-is). Short: purpose, entry points, how to run and test, key files.
   Existing READMEs: improve, don't duplicate.
5. A **shared core** for the FalkorDB repo: `docs/shared/` here (what Munim is, the One Guarantee, core architecture, the
   AI layer, security, glossary) — the FalkorDB docs (F4) reuse it; keep it provider-neutral.

## Lanes
You are the **main (Sonnet) lane**: items 1, 2, 3, 5. Spawn **one Haiku sub-agent** for item 4 (per-module READMEs) and,
at the end, a second Haiku pass that checks every link and every file/route reference in all new docs against the tree
(report broken ones; fix them yourself).

## Other lanes (stay out of their files)
C3 clean-up edits `CLAUDE.md`, `docs/plan/BOARD.md`, `infra/gcp/README.md`, `packages/config/src/index.ts`, apps/web
source-chip rendering. The FalkorDB build edits `adapters/falkordb/**`, core-api `internal/graph`, `modules/graph`,
contracts `graph/`, `Makefile`, the lockfile. The go-live lane edits `packages/sdk/README.md` and `apps/site` — **you
leave `packages/sdk/README.md` alone**.

## Gates
`python3 scripts/export-cup/test_rules.py` green; `make export-cup` exports a commit, never the working tree, so check your
uncommitted docs with `scripts/dev/heavy.sh /private/tmp/claude-501/-Users-satviksawhney-Downloads-projects-26-foodops-os/84258902-638e-4814-8803-eab00eb1a6f6/scratchpad/sync/export-wt.sh` (temp index + dangling commit; no ref moves): 0 forbidden words **in your
files** (C3 is clearing the rest). `apps/web/README.md` is yours, including clearing its deploy-platform words; mermaid blocks parse
(`npx -y @mermaid-js/mermaid-cli` is too heavy — instead keep diagrams to flowchart/sequenceDiagram syntax and have the
Haiku pass eyeball each). Light lane: no builds or test suites beyond those. No commits, no staging; no AI attribution;
never open `.env`. Plain, confident English; short sentences; tag nothing FACT/INFERENCE in public docs (write only what
is true).

## Not in the Cup docs
The FalkorDB build (separate worktree) adds `/v1/graph/*` routes and a supplier map that are **mounted only when a graph
backend is configured** — the Cup build has none. Do not document them in the Cup docs. A reconcile pass against the final
tree runs before the export; keep a list of the claims most likely to drift (outlet names in Ask, consent, SDK version).

## Report
Files written, word counts, the link-check result, the export check output, and what you did not do.
