# Munim (folder: foodops-os)

## The One Guarantee — outranks every feature (ledger R15)

> **Nothing changes the books without a named person's approval, and every number shown traces to a
> ledger row.**

- *The books* = every core-owned record: ledgers, stock, prices, catalogue, rosters/payroll, customer
  records, and messages to customers, staff or real external parties. (RFQs to **simulated** suppliers are
  not books — R22.) Platform config changes are approved drafts too (R24).
- *Traces to a ledger row* = the number on screen was rendered from a SQL snapshot cell minted by core-api
  (`⟨snap:ID·row·col⟩`), never typed by a model (R25). If it cannot trace: "cannot verify".
- Channels it must hold across: DB grants (intel has **no write grant**, R25), API payloads, NOTIFY/SSE
  payloads (ids only), error messages (never raw model text), traces (ids and labels, never untrusted
  text), draft execution (one transaction with the audit entry, under the approver's identity).
- **Nothing auto-applies in v1** (R16). Every adversarial review has a guarantee-scan section with both
  clauses, stated even when clean.

## How to work here

Write the simplest thing that works. No abstraction for a single use. No error handling for a scenario
that cannot occur. Read the file before you edit it; match its style; every changed line traces to the
ticket. Comments only for the non-obvious (why, what breaks, which ledger entry forced it). Say what you
did **and what you did not do**. Show output; never claim a test passes without running it. Disagree once,
briefly, then follow the ledger. Delete code rather than commenting it out.

---

## Hard rules (event rules — breaking one can disqualify)

1. **Fresh code and original assets only.** AI Builder Cup T&C: "exclusively of fresh code and original
   assets created during the official hackathon timeline". Do not copy or port code from anything in
   `projects_26` (Sathi, second_brain, team-bot, Lawyer-Up, Sanad, Kosh, PitchSide, shipyard code, etc.) or
   any other repo. **No third-party sprite packs or art** — back-office art is generated fresh with a dated
   provenance log (R4 K2). Patterns and judgment are fine; files are not.
2. **Google Cloud only for anything submitted — binds the future Cup fork, not this standalone build (R37).** Gemini/ADK, deployed on Cloud Run/GCP. **No Vercel, no
   Supabase, no AWS** in the submitted build or its repo. Supabase is the dev environment only, behind
   ports, under `adapters/dev/`, excluded by `make export-cup` (R9, ADR-012). The public Cup repo is a
   separate, clean history the founder creates. No cloud credits — the founder pays; respect budgets.
3. **Nothing proprietary from Juspay.** The founder works at Juspay. Public knowledge and synthetic data
   only. Do not model Juspay systems, schemas, partner terms or internal practices.
4. **Nothing from inspirations or references is reused.** Xyne Spaces (a Juspay product), Greptile, AIBMOS,
   Kit (KitchenSync), the pixel-office repos and the private Snacky Shack repo are ideas only. Design
   schemas and flows from first principles. Never mirror a third party's table, endpoint or copy text.
5. **Simulated means labelled.** Supplier agents are simulated; all data is synthetic; payments are
   *recorded*, never processed. Say so plainly in the UI, video, deck and README. Never imply real
   suppliers, customers or money. Any "savings" or "₹ found" figure is a measured result on synthetic data.
6. **Team eligibility.** The registered team is the founder plus one teammate (roster submitted, R17). Add
   no contributor without checking: 21+, working professional/entrepreneur/founder (not a student), JAPAC.
7. **IP.** Hack2skill holds a 6-month right of first refusal over submitted materials and sponsors hold a
   perpetual marketing licence (T&C snapshot `docs/admin/`). The founder accepted this (D-002). Commit
   nothing that would be a problem to hand over.

**Anything touching a hard rule, money, or the event rules stops and asks the founder** — never a council.

---

## What this is

Munim is an operating system for restaurant groups (2–5 outlets), multi-brand cloud kitchens and stores —
India first, Australia by one country-pack flip. **Munim Core** (TypeScript, Hono, Postgres) is the
deterministic, headless system of record: POS, QR/web ordering, KDS, ledgers, operations, multi-tenancy,
public `/v1` API. **Munim Intelligence** (Python, Google ADK) is a router plus eight domain specialists that
explain what happened with citations, find money leaks and draft actions; a person decides everything.

**Stack (standalone, R35–R36; production shape R54–R55).** Next.js: `apps/web` = the Cobnut Bakehouse demo (storefront
at `/`, staff screens under `/staff`; imported from the teammate's repo, R54) and `apps/site` = the Munim site and developer
portal · Hono `core-api` + long-running `core-worker` process · Python `intel` on ADK 2.11 (Gemini native; OpenAI /
OpenRouter / NVIDIA via ADK `OpenAILlm`; no LiteLLM) · `suppliers-sim` (A2A, simulated) · any Postgres (Supabase now) · SSE
via LISTEN/NOTIFY · graph port (Postgres edges default, FalkorDB optional) · IdP and blob store behind ports
(`adapters/dev` Supabase; `adapters/gcp` Identity Platform and Cloud Storage). Deploys: `deploy/vercel` (the standalone
Vercel + Supabase go-live) and `infra/gcp` + `scripts/deploy-gcp.sh` (the Cup on Cloud Run). `video/` holds the launch film
(HyperFrames). The early W4-spine restaurant frontend was reverted (R52); the handoff packs under `docs/handoff/` are history.
Focus: restaurants and shops, individual outlets and small chains (R34).

**Timeline.** Backend-first waves (R39): W1–W3 closed (12 Oct). Then the production phases (R54–R69, 15–16 Oct): Cobnut
in `apps/web`, the Vercel go-live, the Cup suite (export, security review, clean-up, docs) and the FalkorDB entry (R68).
State: `docs/plan/HANDOFF-PROD.md`, tickets: `docs/plan/BOARD.md`, plan: `docs/plan/07-submission-plan.md`.

---

## Doc map — authority order (higher wins)

| Doc | Binds |
|---|---|
| `docs/plan/00-decision-ledger.md` | **BINDING.** R-series. Flag disagreement once, then comply. Amend via founder or 3-agent council (not for hard rules/money). |
| `db/migrations/`, `packages/contracts/` | **The runtime contract** once they exist. Read the source, never the doc about it. |
| `docs/plan/01-pdr.md` | Personas, scope by pack, non-goals, headline numbers, cut ladder |
| `docs/plan/02-schema.md` | Data model + access rules (commentary once migrations exist) |
| `docs/plan/03-architecture.md` + `adr/` | Shared names, roles, book guard, run tokens, containers, trust boundaries, routes, ports, deployment, connection budget |
| `docs/plan/04-agent-framework.md` | Run context, tools, cite-or-abstain validator, watchers, negotiation, traces |
| `docs/plan/packs/`, `screens/`, `flows/`, `design-system.md` | Pass 2 (R19) |
| `docs/plan/05-production-and-split.md`, `06-gaps-and-split.md`, `07-submission-plan.md`, `falkordb/design.md` | The production, Cup and FalkorDB plans (R54–R69); ledger wins on conflict |
| `docs/plan/BOARD.md` | Tickets, territories, waves, gates |
| `docs/plan/HANDOFF-PROD.md`, `prod-briefs/` | Where the production work stands; the lane briefs |
| `docs/DECISIONS.md` | Append-only build journal |
| `docs/shared/` | Provider-neutral public docs shared by the Cup and FalkorDB exports (C4) |
| `docs/handoff/`, `docs/specs/`, `docs/research/`, `docs/00–05`, `HANDOFF.md` | Background/history only — never override the above |

---

## Commands

```bash
make up            # all services as local processes against the hosted dev Supabase project (.env); no Docker (R31)
make seed WORLD=restaurant_group|cloud_kitchen|store|au_outlet
make contracts     # zod → OpenAPI/JSON Schema → TS SDK + Pydantic
make check         # lint + typecheck + boundaries + unit + db gates + guarantee gates. Run before claiming done.
make test-db       # migrations + every DB gate on embedded Postgres 18 (no Docker, no .env) + static Supabase-ism gate
make eval          # N1–N5 + injection + tenant-isolation suites against seeded worlds
make deploy-gcp PROJECT_ID=<id>   # the Cup on Cloud Run (T-121); make export-cup EXPORT_ARGS="--check" — the Cup repo export (T-123)
```
Package managers: pnpm (TS), uv (Python). Versions are pinned only from a live probe (STACK, pass 2).

---

## Non-negotiable rules

1. **Only `core-api`/`core-worker` write Postgres.** intel uses `/internal/intel/v1` for every write (R25).
2. **The tenant is never a model argument.** Tools close over `RunContext`; no tool schema has `tenant_id`.
3. **Numbers come only from snapshots** minted by core-api; model prose never contains free digits (R25).
4. **RLS is forced on every tenant table; context only via `SET LOCAL app.*`; never `auth.uid()`; no
   `pgmq`/`pg_net`** (R9). `tenant_id` leads every key.
5. **Append-only books.** No DELETE grant on `core`/`evidence`/`intel`. Corrections are reversals or voids
   with reason and actor. Journal entries balance per currency at commit.
6. **Migrations belong to the migrator lane only.** Never edit an applied migration; fix forward. Every
   table has an explicit revoke-then-grant block. Assert `pg_index`, never trust `if not exists`.
7. **No country logic in code paths** — read the country pack (R21).
8. **Extraction is quarantined:** the extractor model has no tools; untrusted text never rides in traces.
9. **Prices and totals are re-derived server-side**; client-sent totals are ignored; deals are re-judged
   whenever the promised time changes.
10. **Order status changes go through the allowed-transition table** and are conditional on the current state.
11. **AI surfaces degrade to hidden/template, never to an error state;** the kill switch is a typed flag.
12. **Simulation labels are part of the feature:** a supplier screen without "Simulated supplier" is a bug.
13. Never use any `gemini-2.5-*` model (retires 20 Oct 2026). Model ids and providers come from
    `platform.model_role` (R36). **Never install `litellm`** or ADK's `[eval]`, `[extensions]`, `[all]`, `[test]` extras.
14. **Book guard (ADR-013):** every `core` table is tagged `munim:book` or `munim:operational`; book tables
    admit writes only from a person's own command (per `core.command_authority`), an approved decision
    (`app.decision_id`), or an allow-listed derivation of an approved row (`app.posting_rule`). Internal
    routes and jobs connect as `munim_svc`, which has no book grants (R26–R29).
15. **Run tokens carry the tenant to intel.** Ed25519, minted only by core (intel holds the public key);
    core-api checks the signature and the `intel.run` row, and takes tenant and outlet scope only from it.
16. **Publish outbox rows after commit inside the request**; the long-running `core-worker` process sweeps
    stragglers and runs cron (R35); intel flushes traces before its response returns.
17. **Every gate runs with `MUNIM_MODEL_MODE=recorded`** (committed fixtures). Live models only in the
    post-probe smoke test. ADK sessions are in-memory per request; intel never writes Postgres.
18. **Imports are drafts** (R28): preview → approval → commit under the approver. Mappings are renames +
    units, no arithmetic.
20. **Never read, print, copy or log `.env`.** It holds the founder's real keys. Code loads it through one config
    module (`packages/config` / `munim_intel.config`) that redacts secrets in errors and logs. Variable names are
    exactly those in `.env.example` (the founder's template): providers `GEMINI_API_KEY`, `NVIDIA_API_KEY`,
    `OPENROUTER_API_KEY` (no OpenAI key — OpenAI paths are skipped loudly); Supabase `SUPABASE_*`. Migrations and
    LISTEN/NOTIFY use `SUPABASE_SESSION_POOLER_CONNECTION_STRING` (IPv4, session mode); app pools use
    `SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING`. Munim-internal settings (model mode, dev run-token keys, service
    secret) are not in `.env`: they default in code or are generated under `.run/` (git-ignored). Gates never need
    `.env` — they run on embedded Postgres and recorded models.
19. **Draft numbers proposed by intel are refs** (snapshot cell, quote row, document span), shown beside
    the value; a person's edit is labelled as theirs (R26).

---

## Conventions

- Layout per `03-architecture.md` §7; boundaries enforced by dependency-cruiser / import-linter in CI.
- Domain logic lives in `packages/core-domain` (framework-free) or `core-api` modules — never only in a
  Next.js Server Action or component.
- Money: minor units + currency. Time: `timestamptz`, IANA zones from the pack, one tz module.
- Mock only at system boundaries; **never mock the database** — RLS is the thing under test.
- i18n keys for every user-facing string. Copy in `"double quotes"` in screen specs is literal.
- Tag claims in docs `FACT` / `INFERENCE` / `UNVERIFIED`.
- **Git:** the orchestrator owns git; lanes never commit. Stage by name — never `git add .`/`-A`. Read the
  cached diff of every shared file; read `--stat` after every commit. Commit messages `T-###: …`, with **no
  AI attribution of any kind** — no `Co-Authored-By` trailer, no "Generated with" line (founder, 15 Oct; history
  rewritten to strip them). Never push, never create a remote (the founder does).

---

## Verification gate — before you claim anything is done

`make check` green, plus:

| Touched | Must run / must hold |
|---|---|
| `db/migrations` | `make test-db`: embedded Postgres + static Supabase-ism gate; isolation over every table with a `tenant_id` column; intel-write refusal on N/N tables (N from the migration manifest); book-guard and service-privilege gates; append-only and balance gates |
| core-api write path | idempotency replay test; audit-chain verify; guarantee clause 1 scan |
| validator / envelopes / renderer | free-digit, forged-ref and cross-tenant-ref cases → "cannot verify" |
| ADK plugin / traces | every callback fired ≥ 1 on the scripted run |
| tz / business-date logic | DST suite, both transitions, IN + AU (`Asia/Kolkata`, `Australia/Melbourne`) |
| country pack | IN and AU golden receipts and tax totals |
| UI surface | screenshot every state named in the screen spec into `.screenshots/<ticket>/` |
| `adapters/` or export | `make export-cup` with a planted forbidden import → fails; clean → passes |

**A gate that cannot fail is worse than no gate.** Assert a positive expected quantity; red-prove every new
gate; expected counts come from an independent source; artifacts must be fresher than their inputs.

---

## Autonomous build protocol

Shipyard method (`../shipyard/RULES.md`), per wave (R38): all wave tickets built in parallel lanes → wave test
run on a quiet tree → one adversarial review of the whole wave (with guarantee scan) → ≤ 2 fix cycles →
orchestrator spot-check → commits by ticket → close with evidence in `docs/DECISIONS.md`. Stop on the second identical
failure. Advisor before committing to an approach and before declaring a lane done. 3-agent council for
ledger amendments or spec contradictions (never for hard rules or money — those go to the founder). Lanes
stay in their file territory; conflict → skip and report. Dev servers in rsync-isolated copies, killed by
PID. At ~80% context: handoff, commit, compact, resume.

**Escalate** (severity 4): non-additive schema changes, auth-flow changes, external API contracts, any
ledger amendment, anything touching a hard rule or money. Severity: 1 architectural/major · 2 minor bug ·
3 polish/tests/docs · 4 founder question.

---

## Gotchas — silent failures (sourced; grow only from measured incidents)

| # | Trap |
|---|---|
| 1 | `create index if not exists` silently no-ops against a same-name, different-columns index — assert `pg_index`. (shipyard profile) |
| 2 | Session-level `SET` leaks across a transaction-mode pooler — use `SET LOCAL` inside the transaction. (R1) |
| 3 | Table owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is set; the app role must not own tables. (R1) |
| 4 | ADK plugin hooks need the exact `_callback` suffix; a misspelled hook is silently never called. (R4 K14) |
| 5 | ADK 2.x `InMemorySessionService` raises for a missing session — create it first; tutorials show 1.x. (R4 §C) |
| 6 | `to_a2a()` advertises `localhost:8000` over http unless given the public URL. (R4 K6) |
| 7 | Cloud SQL Postgres 16+ defaults to Enterprise Plus — create with `--edition=ENTERPRISE`. (R4 K12) |
| 8 | Request-billed Cloud Run throttles CPU between requests — background subscribers stall; SSE requests cap at 60 min. (R4 K5) |
| 9 | Spanner Graph requires the GoogleSQL dialect; schemaless graphs need lowercase labels/properties; one commit ≤ 80k mutations. (R4 §B) |
| 10 | FalkorDB `latest` is the new Rust 6.x engine — pin an explicit 4.x tag. (R4 K13) |
| 11 | Custom auth claims cap at 1000 bytes and refresh only with the token — roles live in Postgres. (R4 K11) |
| 12 | Gemini Live bills the whole conversation each turn — cost grows with the square of session length; cap ~3 min. (R4 §C) |
| 13 | A gate that reads a build artifact without asserting it is newer than its inputs verifies a stale world. (shipyard [U]) |
| 14 | One date/time library and one tz module; mixed libraries cause off-by-one-hour bugs. (shipyard [U]) |
| 15 | Never render model- or user-generated rich text through a raw-HTML path. (shipyard [U]) |
| 16 | A bad capability token (storefront key, signed link) returns 404, never 403; compare timing-safe; never log it. (shipyard [U]) |
| 17 | `--flag value` parsing that misses `--flag=value` silently runs the default — parse both, refuse unknown values. (shipyard [U]) |
| 18 | Any input under 16px font makes iOS Safari zoom; tap targets ≥ 48px (POS/KDS tablets). (shipyard [S]) |
| 19 | The T&C changed silently once (roster 4 Oct → 11 Oct) — re-snapshot and diff before submitting. (R4 K3) |
| 20 | Any Postgres role can `SET` a custom `app.*` setting — RLS isolates requests, not roles; tenant context must come from a verified identity or run token. (review) |
| 21 | Functions get EXECUTE granted to PUBLIC by default — a SECURITY DEFINER writer is a write path for every role unless revoked. (review) |
| 22 | Dropping a policy on a FORCE-RLS table makes it deny-all, so an isolation canary stays green — red-prove with `NO FORCE` or a `USING (true)` policy. (review) |
| 23 | Browser `EventSource` cannot send auth headers or refresh credentials on reconnect, and `run.app` is a public suffix (no shared cookies) — use fetch-based SSE with the bearer token. (review) |
| 24 | Cloud SQL `db-f1-micro` allows ~25 connections including reserved slots — respect the connection budget in 03-arch §8. (review) |
| 25 | ADK `DatabaseSessionService` creates and writes its own tables — forbidden here (R25); use in-memory sessions. (R4 §C, review) |
| 27 | pnpm 11 checks dependencies before `pnpm run` and may rewrite `pnpm-lock.yaml` (and tried to purge `node_modules` through symlinks in an rsync copy) — lanes run tools via `node`/`node_modules/.bin` in copies; the orchestrator reads the lockfile diff before every commit. (T-001, T-002) |
| 33 | **Importing `embedded-postgres` registers an exit hook that calls `process.exit(0)` — a failing vitest run with an embedded-PG global setup exits 0.** Every gate must red-prove a non-zero process exit, not just a failing test line. Fixed once in the `@munim/db` harness. (T-004) |
| 34 | A book row's `origin` is its **creation** provenance and is never re-stamped by any UPDATE (0014 command/decision branches; 0017 fixed the derivation branch, which had re-stamped on `orders.reprice` and the merge). Every later change traces through `core.audit_log` (`decision_id` → `core.decision.decided_by`, or the command actor). Orphan/guarantee scans for UPDATEs must join the audit log, not read `origin`. (b-8, m-1, m-2, m-5) |
| 29 | After a `SET LOCAL` transaction ends, `current_setting(k, true)` returns `''` (not NULL) on a pooled connection — wrap in `nullif(…, '')` before casting. (M-A) |
| 30 | `ALTER DEFAULT PRIVILEGES … IN SCHEMA … REVOKE EXECUTE FROM PUBLIC` does nothing — use the global form. (M-A) |
| 31 | `ANY((SELECT x::uuid[]))` parses as subquery-ANY — cast outside the scalar subquery. (M-A) |
| 32 | Production code imports `@munim/db/migrate`, never `@munim/db` — the harness and world builder are test tooling (embedded-postgres is a devDependency, now loaded lazily inside `startTestDb()`). (M-A, M-B) |
| 28 | Draftable command types register when their module is imported — core-api and core-worker must `await loadRegistry()` at boot, or approvals refuses every type (fails closed). (T-002) |
| 35 | ADK `LlmAgent` treats `{name}` in an instruction as a session-state variable — a literal `{C1}` handle raises `KeyError: Context variable not found`; keep braces out of instructions (handles go in contents). (T-057) |
| 36 | ADK 2.11 `BaseToolset` caches its tools per invocation — a mid-run `load_skill` binds nothing unless the toolset turns the cache off. (T-082a) |
| 37 | Lane rsync scratch copies (~0.6–9 GB each) filled the disk (ENOSPC mid-run) — exclude `/scratchpad`, `.venv`, `apps/site/.next`, and delete the copy when the lane ends. (12 Oct) |
| 38 | `vercel deploy --prebuilt` from `apps/site` fails ("File does not exist: node_modules/.pnpm/…") — pnpm keeps deps at the repo root; link and deploy from the root with `rootDirectory: apps/site`. (13 Oct) |
| 39 | `vercel link` (CLI 60.1.3) run inside `deploy/vercel/out` linked the **parent** `deploy/vercel` and wrote a `.env.local` holding a `VERCEL_OIDC_TOKEN` (plus a `.gitignore` edit) — check where `.vercel/project.json` landed after every link, move it if needed, and delete the `.env.local` unread. (15 Oct) |
| 40 | A lane's `git mv`/`git rm` stages changes; an orchestrator commit of unrelated files then sweeps them in (7046272 removed dev-root.ts without the new files; HEAD did not build for 8 commits). **Lanes never stage** (no `git add/mv/rm`); the orchestrator runs `git diff --cached --stat` before every commit and stages by name only. (16 Oct) |
| 41 | With Next.js `cacheComponents`/`partialPrefetching`, Vercel answered every client navigation into a dynamic-id route from one cached shell holding placeholder ids (`%%drp`) — the tracker, checkout and staff draft/PO pages showed "This link isn't valid." until a reload. Off in apps/web; verify with client navigation (`apps/web/scripts/nav-smoke.ts`), never `page.goto`. (16 Oct) |
| 42 | `deploy/vercel/deploy.mjs` stages munim-api from the **working tree** — with other lanes' uncommitted work in it, that ships unreviewed code. Stage from a clean checkout of the commit (a worktree with `pnpm install --frozen-lockfile --offline`). (16 Oct) |
| 43 | `vercel deploy --prebuilt` of the site failed with `api-upload-free` (more than 5,000 file uploads a day on the free plan); `--archive=tgz` uploads one tarball and succeeds. Use it for every prebuilt deploy. (16 Oct) |
| 44 | `CI=true` makes pytest append ` - <message>` to every short-summary line — a red-proof matching whole lines (`grep -x`) never fires on GitHub. Match the line's prefix. (17 Oct) |
| 45 | Under `set -o pipefail`, an early-exit reader (`grep -q`, `head`) kills the writer with SIGPIPE (141) and the condition reads false on large output. Use `grep … >/dev/null` and `sed -n '1,Np'`. (17 Oct) |
| 46 | The SSE feed sends one event per `updated_at` it has not sent; two quick updates can fold into one event. A test that needs an intermediate state waits for that event before the next mutation. (17 Oct) |
| 47 | `pg-pool`'s `end()` resolves when its client list is empty, before the sockets close — a `DROP DATABASE … WITH (FORCE)` right after hits closing backends with 57P01, re-emitted as an unhandled pool error on slow CI runners. The db harness's pool `end()` waits for every client's `end` event. (17 Oct) |
| 48 | On GitHub (`CI` set, a colour terminal) vitest colours its report, so a script grepping `^ *FAIL` matches nothing and, under `set -euo pipefail`, dies silently. Run parsed vitest with `NO_COLOR=1` and end extractions with `|| true` so a miss fails loudly. (17 Oct) |
| 26 | pgvector indexes cap at 2,000 dimensions — embeddings use `output_dimensionality = 768`. (review, UNVERIFIED cap) |
