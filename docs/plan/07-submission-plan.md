# Submission plan: the Cup suite, then FalkorDB (R62, 16 Oct 2026)

**The ask (founder).** After the autonomous build, finish **the Cup suite end to end** in one line of work — a proper
commit history, detailed docs, the architecture design and a detailed explanation (AI judges will read the whole
project), a vulnerability check, clean-up and the video script — and then **the FalkorDB entry** the same way. No more
feature development after that. The founder deploys the Cup (GCP) and FalkorDB entries from runbooks; Claude finishes the
standalone Vercel go-live. Keep the machine's load down while finishing as fast as possible.

## How the work runs (machine load)
- **At most two agents at a time**, one of them light (docs/review) where possible.
- **Heavy commands at most two at a time** across all lanes: `scripts/dev/heavy.sh <command>` (a shared lock) wraps `make check`,
  `make test-db`, red-proof suites, full pytest, `next build`, export checks. No rsync copies of the repo unless a lane
  must run a server against a stable tree; copies are deleted when the lane ends (gotcha 37).
- **Model tiering (founder):** documentation by **Sonnet** (main docs) and **Haiku** (mechanical per-module READMEs,
  glossary, link checks); security review and anything touching the guarantee or hard rule 2 by **Opus**.
- Commits by the orchestrator only, plain messages, **no AI attribution**; push to `food-ops` after each green milestone
  (R57 E-3).

## Phase 0 — finish what is running (now)
T-122 + T-123 (neutral names, `make export-cup`), S1 + S2 (Munim site redesign → Vercel **preview**), Cobnut polish, then
the Vercel go-live (hosted Cobnut seed, both deploys, the production journey, T-119's measured checks). Milestone pushes.

## Parallel tracks after C2 + C3 (amended 16 Oct, founder asked)
Documentation, design and scripts are **light** (no builds or test runs), so they run in parallel and do not count against
the two-agent limit; only heavy commands stay one at a time (`scripts/dev/heavy.sh`).
- **Track D (docs):** the Cup docs (C4) by Sonnet and Haiku lanes in parallel, plus a **shared core** (what Munim is, the One
  Guarantee, the core architecture, the AI layer, security, glossary) written once and reused by the FalkorDB repo.
- **Track F (FalkorDB, light part):** F1 graph design (model, Cypher queries, two graph-first features) and its design doc,
  then the FalkorDB-specific docs drafted from the design (verified after the build).
- **Track S (scripts):** the Cup video script and deck outline (C6), then the FalkorDB video script.
- **Heavy, in order:** C5 the final Cup export, then F2/F3 (embedded FalkorDB, the build), then the FalkorDB export.

## Phase 1 — the Cup suite (linear)
| # | Step | Who | Done when |
|---|---|---|---|
| C1 | **Security review** of the whole Cup export: dependency audit (`pnpm audit`, `uv`-based pip audit), secrets and history scan, authn/authz and tenant isolation on every core-api route, RLS and grants, the run-token path, intel's prompt-injection quarantine and cite-or-abstain, apps/web (raw-HTML paths, CSP, demo sign-in), infra/gcp (IAM least privilege, public services, Secret Manager), plus the One-Guarantee scan (both clauses) | Opus, read-only | A ranked findings list with file:line and a fix per finding |
| C2 | **Fix cycle** for C1 (≤ 2 rounds), each fix red-proved | Opus | `make check` green; every sev-1/2 closed |
| C3 | **Clean-up**: dead code and unused deps, stale comments and docs, CLAUDE.md stack line and doc map, BOARD.md, void the old local test order; the `git stash@{0}` waits for the founder's word | Sonnet | `make check` green; no `TODO`/`FIXME` without an owner |
| C4 | **Docs for the export** (public, provider-neutral, judge-ready): `README.md` (what Munim is, the One Guarantee, a 5-minute judge's tour, run locally, deploy), `ARCHITECTURE.md` (system design with mermaid diagrams: services, data flow, the book guard, run tokens, the AI layer and its specialists, cite-or-abstain, live + recorded fallback, the event and SSE path, multi-tenancy and RLS, country packs, GCP topology), `docs/` in the export: data model, API overview, AI agents, security model, testing and evaluation (gates, red-proofs, what they prove), decisions summary (public-safe), simulation and synthetic-data policy, glossary; a README per service and package | Sonnet (main), Haiku (per-module, glossary, link check) | Every doc names real files; no internal ledger ids; forbidden-word gate 0; a Haiku pass checks every link and file reference |
| C5 | **Commit history**: the docs and fixes land as normal commits here; `make export-cup --history` re-run; one author, plain messages (R60); history-wide gate 0; the export builds and tests on its own | Orchestrator | `food-ops-cup` ready locally, gate output recorded |
| C6 | **Submission pack**: video script under 3 minutes (customer → kitchen → owner → approval → Cares, "Simulated" visible, timings and shot list), deck outline (problem, product, architecture, the One Guarantee, AI layer, business case, roadmap), the GCP deploy runbook as a checklist the founder follows (`infra/gcp/README.md` + `DEPLOY.md`), a T&C re-snapshot and diff (gotcha 19) | Sonnet | Files in the export and in `docs/submission/cup/` here |

## Phase 2 — FalkorDB (linear, after Phase 1; the event closes 18 Oct 23:59 IST)
| # | Step | Who |
|---|---|---|
| F1 | **Design** (T-131): the graph model (supplier → ingredient → recipe → menu item → outlet; findings and drafts as nodes with snapshot refs), the Cypher queries the product depends on, two graph-first features ("what does a butter price rise touch", the supplier dependency view), FalkorDB required (no Postgres fallback in that build, rule 3); the One Guarantee unchanged (graph reads only; numbers from snapshots; writes are drafts) | Opus |
| F2 | **Local FalkorDB**: an embedded FalkorDB process first (no Docker); if it cannot run on this Mac, the founder provides a FalkorDB Cloud free instance through `.env` | Orchestrator |
| F3 | **Build** the graph core, the intel skill and one apps/web screen, with tests and red-proofs (pinned FalkorDB 4.x, gotcha 10) | Opus |
| F4 | Security pass, clean-up, docs (README with setup and **the graph data model**, the Cypher queries, architecture), video script, `make export-falkor` with a **fresh history** (one initial commit, R54 P-5), deploy runbook | Opus (security), Sonnet/Haiku (docs) |

## Founder's part at the end
GCP setup and the Cup deploy (runbook); FalkorDB hosting and deploy (runbook); create both GitHub repos and say push;
record both videos; the decks; the eligibility call for FalkorDB (R56 G-3); submit both.
