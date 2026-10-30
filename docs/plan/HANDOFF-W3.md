# HANDOFF — Wave 3 closed (12 Oct 2026)

Munim's intelligence layer (W3) is built, reviewed, fixed and committed. The build is **paused here by founder
instruction**: nothing after W3 starts until the founder says go. This file is the resume point; the ledger
(`docs/plan/00-decision-ledger.md`, R44–R47) and `docs/DECISIONS.md` hold the reasoning.

## 1. Where things stand

| Wave | State |
|---|---|
| W0–W2 (core, POS/KDS/ledgers, ops modules, imports, demo data) | ✅ closed earlier |
| W3.0 foundations, W3.1 AI core, W3.2 specialists + services, W3.3 Manager/investigations, W3.4 fan-out/evals/Auto/read routes | ✅ closed |
| W3 close review (2 reviewers) + fix cycle; R47 founder-decision round | ✅ closed |
| Hosted Supabase dev project | see §6 (migrated and re-seeded at the close) |
| W4 / W5 | ⬜ not started — see §8 |

**Gates at the close (quiet tree, `5a50a28`):** `make check` — lint, typecheck, boundaries, test, boundaries-redproof,
intel-redproof, smoke, smoke-redproof (one core-worker shutdown-timeout flake under full load; passes standalone and in a
`make test` rerun). core-api 943 · core-worker 38 · contracts 214 · db 410 · integration 47 · worldgen 68 · intel 845
(3 strict xfail, all documented) · suppliers-sim 9. `make test-db`, `templates-worlds`, `make eval-w3` green. Every
`services/core-api/test/*redproof*.sh` and `db/tests/redproof-00*.sh` exits 0.

## 2. What W3 built (map to code)

- **Deterministic-first pipeline** — watchers → 41 specialist detectors (+3 forecast) → findings → drafts
  (`services/intel/munim_intel/{watch,detect,mapping,narrate}`); the model only narrates.
- **8 specialists** (F8) with skills (`skills/<pack>`), generated typed tools (`tools/`, ontology `packages/contracts/generated/ontology.json`), ≤ 20 tools per context.
- **Manager** (`manager/`): route.intent → path table; @mentions; drafts only on request with one skill; context assembler (`context/`); threads (`modules/threads`, `threads/`); fan-out ≤ 4 read-only branches (`fanout/`).
- **Investigations** (`modules/investigations`, `core-domain/investigations`, `investigate/`): Step, Plan, Auto (F10/F11), deterministic verdicts, margin bridge, per-viewer redaction.
- **Brief, wiki, graph, ingestion, negotiation** (`brief/`, `wiki/`, `graph/` + core `internal/graph`, `ingest/`, `negotiate/` + `services/suppliers-sim`).
- **Money and safety**: AI policy (mode ceilings, monthly cap = lower of owner and operator), spend posted per model call at operator prices, live timeouts, kill switch, taint lock, number grammar parity with core, book guard binding (0022), workflow draftables.
- **Read routes for screens** (T-092), lineage (T-084a), history imports for shifts and counts (T-093).
- **Evaluation**: `make eval-w3` (8 specialists × 4 worlds scorecard, investigation verdicts, plumbing); `make smoke-live` (explicit, capped live probe).

Migrations added in W3: 0019–0026.

## 3. The One Guarantee at the close

Both clauses hold on every reviewed channel (reviews R-A…R-E). Nothing auto-applies; intel writes only through
`/internal/intel/v1`; every displayed number is a snapshot cell or "cannot verify"; traces carry ids/labels only (core
refuses prose labels and bare 4+-digit numbers). Known residuals, by design or deferred: values read from a document or a
supplier reply are model transcriptions shown "from the document / supplier's reply" and executed only as the person
confirms or types them; a run snapshot at core's 500-row cap is refused by the P2 detector but the Manager's read path can
still see a truncated snapshot (§7).

## 4. Founder decisions waiting (please answer when you resume)

| # | Topic | What is needed |
|---|---|---|
| F-1 | **Frontend split** | Build the screens ourselves (W4 as planned) **or** hand them to your teammate with an integration kit first (SDK packaged, API reference + per-screen guides, AI contract + reference renderer + conformance check, one-command local dev kit with recorded AI, `/v1` frozen + changelog). My recommendation: the kit, then the teammate builds. |
| F-2 | **Munim Cares (R46)** | Scope: recipients, per-merchant vs network page, food-safety rules per country, how the AI routes donations. |
| F-3 | **AI prices (R47 D1)** | Enter real per-role prices (operator config draft). **Until then every live AI call is refused** (`price_missing`). Recorded/test mode is unaffected. |
| F-4 | **Price currency** | A role has one price currency; budgets are INR or AUD per business; intel refuses a mismatch. Choose: prices per currency, or an operator FX table. |
| F-5 | **Labour/demand definition (P2)** | The template finds ₹4,080 on the demo restaurant vs the key's ₹4,800 (worldgen has three two-bill slot-days; the rolling 8-week norm absorbs the plant). Anchor the norm before the window, or accept the template. |
| F-6 | **Snapshot row cap** | Core silently caps snapshots at 500 rows. Add a `truncated` flag on snapshots, raise the cap for run mints, or add a weekday filter to `labour_vs_demand`. |
| F-7 | **Demo deal values** | I set margin floor 15% and payment terms 7 days for the demo businesses (yours to change). POs still need a purchases budget and a forecast run in the worlds to pass deal review. |
| F-8 | **Cost exposure notes** | Unscored "why…" questions now answer single-agent and offer "dig deeper"; Auto resumes only on new data. Live Gemini never returns confidence, so fan-out happens only on the tap. |

## 5. Carried items (not founder decisions)

- **Provider fallbacks (R47 D8)** — research in `docs/research/R7-free-models-2026-10-11.md`; wiring needs a
  `model_role_fallback` table, an ordered-fallback LLM wrapper and a non-Gemini embed client → W5 T-070.
- ~~**Mode downgrade for Auto**~~ — done in T-098 (0027, 12 Oct): a lowered ceiling downgrades Auto to Plan with `stop_reason 'ceiling'`; Auto is entered only in the plan-approving update.
- **Draft-linking** for investigations (ADR-014 §7.2) — the Plan `draft` stop is reserved.
- **Ingestion trigger** — run type exists; member upload → document text read → `/ingest` wiring is W4.
- **Wiki scheduler** — needs an entity/claim read route and persisted page fingerprints.
- **Eval gaps (ratcheted, not accepted):** customers RG/CK lapsing (unplanted at-risk customers in worldgen), CK-G3 at
  pack scale, RG-P2 (§4 F-5/F-6). Brief top-5 hand data needs five corrections (A1 high, F5 three weeks, F4+F7 one
  finding, price_creep as `also`, the rank-5 tie). AU labour % findings come from the café's small sales (worldgen realism).
- **Packaging deals** abstain on need = 0 (no forecast for non-recipe items).
- **Operator bootstrap** for live seeding — see §6.

## 6. Hosted Supabase dev project

- **Migrated 18 → 26** (`make dev-db`, 12 Oct): 0019–0026 applied, pre-checks clean (151 `import` drafts, 0 duplicate
  counts, 0 non-simulated suppliers with a card URL). Runtime-role passwords rotated into `.run/db-roles.json`.
- **Four fresh demo businesses, alongside the 7 old ones** (sign-ins tagged `-w3`, e.g. `worldgen-restaurant_group-owner-w3`):
  restaurant_group `3ae45618-…` (INR), cloud_kitchen `e4e7eb23-…` (INR), store `43688202-…` (INR), au_outlet `b86d14cd-…` (AUD).
  Each has labour 30% / margin 65% / floor 15% / 7 days and an operator-approved October AI budget (₹5,000 / A$5,000 in
  minor units 500000). Answer keys verify 65/65 (24 + 15 + 12 + 14). Old tenants untouched (command counts unchanged),
  but they have no targets and no budget, so their AI declines (R47 D2).
- **Operators:** `platform.operator` rows `worldgen-<world>-operator` (dev identity bootstrap); the local-IdP minter takes
  `MUNIM_SEED_OPERATOR=1` and `MUNIM_SEED_SUB_TAG=<tag>` (opt-in).
- **Do not re-run `make demo` on hosted as-is:** a second run with the same tag replays into the w3 tenants, and the budget
  draft id has no tenant in it (global key collision; fix in `tools/worldgen/src/kit.ts`). Use a new tag after that fix.
- **No stack is running.** Start one with `MUNIM_IDP=local MUNIM_ENV=dev PORT=8797 make up` (8787 is another project).
- **Found while seeding:** core-api crashed once on an unhandled `pg` client `'error'` event (hosted pooler "received
  invalid response: 0") under four parallel verifiers — `lib/db.ts` only listens on the pool (idle clients). Severity 2,
  fix before the next hosted demo. Two first-pass verify values (RG-K2, RG-G7) read about 0.75 of the key and matched on
  re-run — UNVERIFIED cause (verify racing the last history commits, or a paged read tolerating a failed page).

## 7. How to resume

1. Read this file, then ledger R44–R47 and `docs/DECISIONS.md` from "W3.2 CLOSED".
2. `git log --oneline -30` — the close is `5a50a28` plus this handoff.
3. Answer §4 (at least F-1 and F-3).
4. Run `make check` on a quiet tree before starting anything (≈ 50 min), and `make eval-w3`.
5. Lanes run per `docs/plan/W3-LANE-BRIEF.md` rules (they carry into W4): territory, no git, no `.env`, red-proof every gate,
   expected values from independent sources.

## 8. What comes next

- **If F-1 = kit:** W4-K integration kit (SDK packaging, API reference + per-screen guides, AI contract + reference
  renderer + conformance check, local dev kit, `/v1` freeze) → teammate builds the screens against it; we run W5.
- **If F-1 = build ourselves:** W4 screens (T-060…T-069, T-075, T-077) per `docs/plan/BOARD.md`, with the W4 riders in
  DECISIONS (brief audience, "from the document / supplier's reply", @mention offers, hide Ask when AI is down, step
  counters, "dig deeper" tap).
- **W5:** live evals and provider comparison (T-070, incl. D8 fallbacks), e2e suites, performance, README/runbook, SDK
  packaging, **Munim Cares (T-095)**, final sweep.
- **After W5:** Gemma routing fine-tune (F6), FalkorDB adapter in use (F7), Jev/OpenAI DM if it wins (F2).
