# DECISIONS — append-only build log

Every non-routine decision, at the moment it is made. APPEND-ONLY: a wrong earlier entry gets a
correcting entry, never an edit. Ratified product/architecture decisions live in
`docs/plan/00-decision-ledger.md`; this file is the audit trail of the run.

---

### 9 Oct 2026 · Log opened — SHIPYARD-PROMPT governs

Session started with the text of `INITIAL-PROMPT.md`. The repo README marks that prompt superseded;
asked which governs, the founder chose `SHIPYARD-PROMPT.md` (D-018, ledger R14). Orchestrator: this
Claude Code session. No board yet. Phase 1 (research) dispatched as five parallel read-only agents
(Cup rules + office-repo reference; Spanner Graph + FalkorDB; ADK/A2A/Gemini/GCP cost; market + AU pack;
Snacky Shack teardown, ideas only, cloned outside the repo).

### 9 Oct 2026 · Environment facts that change plans

- Live T&C (snapshot `docs/admin/cup-tnc-snapshot-2026-10-09.md`) says roster changes close **11 Oct**;
  `BRIEF.md` and `docs/00-context.md` said 4 Oct. OQ-D is time-critical.
- This machine has **no `gcloud` and no Gemini API key**. Model IDs cannot be probed live yet; R4 records
  them as `UNVERIFIED` until a probe runs with founder-provided credentials.
- Today (9 Oct) is past the 8 Oct core checkpoint, and the independent assessment's 9 Oct kill
  criterion (an ADK agent on a public Cloud Run URL) will not be met. Recorded, not acted on; OQ-C.

### 9 Oct 2026 · Ledger R1–R14 ratified from SHIPYARD §2

The founder's already-made decisions (SHIPYARD-PROMPT §2, D-016–D-018) were transcribed into the ledger
the same day per RULES §3. No new choices were made in transcription. Two flagged consequences:
the public Cup repo must be a separate clean history (R9), and the shipyard Supabase profile's
PostgREST/`auth.uid()` rules do not apply to this design (R9).

### 9 Oct 2026 · Clarify round 1 ratified — R15 One Guarantee, R16 no auto-apply, R17 roster

All three answers took the recommended option (OQ-D answered in free text: "Teammate information is
submitted", interpreted as no roster change and founder-only code review). `CLAUDE.md` product rule on
low-risk auto-apply amended per R16 — founder-decided, so no council. OQ-C and OQ-G held until Phase 1
research reports kill/reshape facts.

### 9 Oct 2026 · Research agents A (rules/office repo), B (graph), E (Snacky Shack) reported

Load-bearing: T&C requires "original assets" — pixel art must be made fresh (both reference repos use
third-party sprite packs). Spanner free-trial instance supports Graph and the emulator runs GQL; Mumbai
Enterprise is ~$126/month, not ~$90. Snacky Shack repo is private (cloned with the founder's stored
credentials, read for ideas only, clone kept outside the repo in the session scratchpad).

### 9 Oct 2026 · Phase 1 closed; clarify round 2 ratified — R18–R21

R4 committed (93c15ab). Round 2: OQ-C scope → founder chose "pure waves, no slice" over the recommended
"stories deep + 8 desks real" (both halves in R18); timing → two-pass docs, W1 deploy 11–12 Oct (R19);
K5 → LISTEN/NOTIFY SSE, amending R9 (R20); OQ-G → free-text rider: config-driven country packs with a
one-setting flip plus a config-driven platform master admin (R21). Orchestrator added one integrity rule
to R21 (no country flip after the first posted ledger entry) as a derivation of R15 — flagged to the
founder. Freeze date (~16 Oct) recorded as an assumption in R18.

### 9 Oct 2026 · Clarify round 3 ratified — R22 RFQs non-binding, R23 one supplier service, R24 R21 confirmed, R25 intel writes via core-api

Advisor flagged two ledger contradictions before pass-1 writing: R8 too narrow for intel's real outputs,
and R15's "outbound messages" catching A2A RFQs. Founder rulings: RFQs to simulated suppliers are
non-binding (R22); suppliers in one service (R23, amends R7); R21 additions confirmed (R24). On intel
writes the founder asked to "think about this once more"; the revised recommendation (who-mints-truth:
DB-minted snapshots, intel writes its own interpretations) was overruled in favour of "everything via
core-api" (R25, both halves recorded). Snapshot minting in core-api, the core-side validator and
rendered-not-written numbers were carried into R25 as the mechanisms for R15 clause 2 — stated to the
founder as strikable.

Environment: no Docker on this machine (needed for local Supabase, Spanner emulator, FalkorDB). Founder
asked to install Docker and gcloud, create a billing project with a budget alert, and a separate project
for the one-time Spanner trial.

### 9 Oct 2026 · Pass-1 adversarial review: 3 reviewers, ~45 findings; founder rulings R26–R29

Reviewers (contradictions/buildability; guarantee holes; gates/feasibility) found blocker classes:
intel write channels outside R25 (ADK DatabaseSessionService, PUBLIC EXECUTE on definer functions);
clause-1 gates testing only the intel role while internal routes run as an all-powerful core role;
draft-payload numbers outside the validator; imports changing books without per-change approval;
background loops (relay, debounce, trace flush) that stall on request-billed Cloud Run; Cloud SQL
f1-micro's 25-connection cap; isolation red-proof that cannot go red; digit-only number check; W1 tickets
missing setup commands, read paths, event types and template owners; SSE auth impossible from EventSource.
One reviewer claim was wrong: "the tree is not a git repo" — it is (commits 93c15ab…887db6e).
Founder ruled the four definitional questions (all recommended): R26 clause-2 scope, R27 named person +
command authority, R28 import runs are drafts, R29 closed book/operational tag list. Orchestrator
resolutions needing no ledger change: ADK uses per-request InMemorySessionService (keeps R25 intact);
in-request publish + scheduled sweeper; leading-edge watcher claim via core; synchronous trace flush;
f1-micro kept with an explicit connection budget (no new spend). Applied across the pass-1 corpus next.

### 9 Oct 2026 · Pass-1 corpus revised against all review findings

Rewritten: `03-architecture.md` (roles incl. `munim_svc`/`munim_view_owner`, book guard §1.3, run tokens,
publish-after-commit + Scheduler sweeper, leading-edge watch claim, synchronous trace flush, three NOTIFY
channels, stream tokens, one number grammar, core-composed abstain text, connection budget 19/25, IAM list,
health with DB round-trip), `02-schema.md` (tags, outlet-scoped list, country truth in `core.tenant` with
row-lock flip, `command_authority`, draft `outlet_ids`/`based_on`/`stale`, import staging, evidence schema
moved to 0003 so module migrations ship their templates, intel W1 tables `run`/`event_claim`/`watch_state`/
`supplier_quote`, 768-d embeddings, gates with independent expectations and accept pairs), `04-agent-
framework.md`, `BOARD.md` (W0 founder steps; splits of T-004/T-007/T-009/T-010/T-011; setup commands in
T-002; read paths in T-007a; worldgen via commands; `/ask` moved to W2 as T-035; templates routed to m-1),
ADR-004/005/007 revised, ADR-013 added, `CLAUDE.md` rules 14–19 and gotchas 20–26. Not acted on: the
reviewer's "not a git repo" claim (false). SHIPYARD-PROMPT.md left untouched (founder's file; R16 governs).

### 9 Oct 2026 · Verification review (fix cycle 2 of 2) applied

Verifier confirmed most blocker classes fixed and found residuals; applied: service-cannot-write gate
re-specified (`has_table_privilege` for `munim_svc` + trigger gate as `munim_core` raising `MB001`);
`munim_crosstenant` (NOLOGIN BYPASSRLS) owns exactly `outbox_claim`, `active_tenants`, `tenant_registry`
with a definer-owner gate; snapshot minting is ordinary `munim_svc` code under RLS (no definer); run tokens
Ed25519 (intel holds only the public key) + `intel.run` row check, 2 h TTL for event runs; Scheduler →
`core-worker fanout` job → per-tenant tokens; `core.derivation_rule` table + `origin` column; decision
replay blocked by `executing` + `exec_txid`; draft execution needs no role switch (approve route is
`munim_core`); global reference tables exempt from tenant-leading keys; storefront guests are `customer`
rows created by the customer's own command (customer moved to 0004); W1 setup commands for stock,
brands, channels, devices, pickup windows; operator provisioning in T-006; `idp-local` test IdP; fetch-based
SSE with bearer (no EventSource, no stream token); grammar `\p{N}` with ambiguous words removed and
false-positive controls; country lock as a FOR SHARE currency assertion (no stored flag); `/v1/snapshots`,
`/v1/runs`; territories de-overlapped; IAM completed. Three founder rulings outstanding: Cloud SQL tier
(money), country-lock trigger point (R21 wording), R20 amendment (NOTIFY channels). Per RULES §7 this was the
last fix cycle on the docs; remaining doc defects found during build are fixed in the ticket that hits them.

### 9 Oct 2026 · Advisor pass before ratification: deploy split, lifecycle alignment

T-011b split: T-011b now deploys the skeleton (core-api + web shell + migrations, `/health` with DB
round-trip) as soon as T-004a/M2/T-011a and the founder's GCP setup land — the first public URL no longer
waits for all of W1 (SHIPYARD §7, CLAUDE.md 12 Oct rule); T-011c is the live e2e. Draft status lifecycle in
03-arch aligned with 02-schema (`proposed → executing → executed`; verdicts on `core.decision`). `judge`
added to `membership.role`. T-001 owns the web landing page used as the skeleton's positive marker.

### 9 Oct 2026 · Build round 1 started — central prep and toolchain pin

Pass 1 ratified (R33). Orchestrator central prep (shared by every TS lane, so not left to race): root
`package.json` (pnpm 11.9.0, Node ≥ 22), `pnpm-workspace.yaml`, `tsconfig.base.json` (strict, NodeNext).
**TypeScript pinned to 6.0.3**, not npm `latest` 7.0.2: 7.x is the native-compiler line and tooling built on
the JS compiler API (dependency-cruiser, typescript-eslint, zod→OpenAPI generators) is not verified against
it — reversible within a cycle. Root `pyproject.toml`/uv workspace stays with T-001. First dispatch: T-001,
T-002, T-003 in parallel (no DB needed); M1+ wait for F1 (Supabase project + `.env`).

### 9 Oct 2026, 23:10 · Standalone reset ratified (R34–R39); board rewritten; test DB = embedded Postgres

Founder stopped the running lanes and asked to step back: focus on one standalone, provider- and DB-agnostic
POS/ERP for restaurants and shops (individual outlets and small chains); no Cup/FalkorDB shaping; per-wave testing
and adversarial review; autonomous; most of the backend by 10:00 on 10 Oct. Brainstorming round: DB = any Postgres
+ graph port; runtime = ADK 2.11 with native adapters, no LiteLLM (R5 research found ADK 2.10+ `OpenAILlm`, which
makes LiteLLM unnecessary); providers = operator setting per role + eval comparison; FalkorDB = separate product
from 15 Oct (R12 kept). Spec `docs/superpowers/specs/2026-10-09-munim-standalone-reset-design.md`. CLAUDE.md
rule 2 scoped to the future Cup fork (R37). Board rewritten W0–W5, ~60 tickets incl. 3 doc lanes and 3 migrator
batches.
Orchestrator decision (reversible): **test database = `embedded-postgres` 18.4 from npm** (probed: starts, pgcrypto
ok, pgvector absent). Removes the founder's Supabase setup from the critical path for every gate and gives a
plain-Postgres check on top of Supabase; the one vector migration is `-- requires: vector`, skipped loudly there and
gated on Supabase. Not a brew install — a project devDependency. The writing-plans step of the brainstorming skill
is replaced by the shipyard board, per the founder's explicit wave/ticket instruction.
T-001 (built, unreviewed) and T-002 (partial) remain uncommitted in the tree; T-001 joins the W1 review batch;
T-002 is resumed by a fresh lane with a self-contained brief (caselaw §6).

### 9 Oct 2026 · D-3 built; orchestrator rulings on its open items

Inter (SIL OFL) allowed as a library font (hard rule 1 targets art assets; `system-ui` fallback if ever blocked);
byte budgets accepted as proposed (office atlas ≤ 160 KB, office total ≤ 200 KB, 0 office bytes on POS/KDS/
storefront/admin) — reversible; raw art drops git-ignored, processed + shipped assets committed with sha rows;
image model chosen by live probe and recorded per provenance row (never `gemini-2.5-*`). New paths `art/office/**`,
`apps/web/public/office/**`, `scripts/art/**` assigned to T-066. D-3 joins the W1 review batch.

### 9 Oct 2026 · Council on number-rule scope (C1–C7) → ledger R40; T-002 built; T-003 dispatched

D-2 surfaced cases R26 does not literally cover. A 3-agent council (identical prompts) voted; majority text
ratified as R40 (preview writes nothing and cites source rows; tender stores tendered/change; loyalty
`balance_after`; badges = length of the held list; member/operator-minted snapshots with minter recorded and role
check; column-level allow-list for AI-about-AI numbers; status messages are derived book rows with no model text;
expired-batch sales refused, override single-use and default-off per pack). Founder item opened: customer status
channel + provider (money). Schema riders for R40 and the D-2 gaps sent to m-1 by message (not by editing its files).
T-002 (contracts) built: 64 schemas, 75 tests, 4 red-proofs; whole-tree `make check` red only from m-1's in-progress
`db/` (no tsconfig/tests yet) — attributed, not a T-002 defect. T-003 dispatched with an explicit note that plural
magnitude words await a contracts update (routed later with D-1's reason codes).

### 9 Oct 2026 · D-1 built; routed; orchestrator tag ruling

D-1 wrote 9 pack specs (checker script red-proven). Routing: contracts extension (reason codes, plural magnitude
words, `review` trace kind, generic draftable registry replacing the fixed `edited_payload` union, pack detector
thresholds + licence kinds + `expired_sale_override` + `status_channels`, R40 preview/tender/member-mint contracts)
resumed in lane b-2; W1 schema additions (catalogue/orders/kitchen/inventory/purchasing/tenancy) sent to m-1 as rider
3; finance/people/customers/compliance/goals/forecast tables queued for M-B (W2). Orchestrator ruling (reversible,
stricter direction only): `business_policy`, `channel_terms`, `dispute`, `transfer` tagged **book** (extends R29's
list toward more protection); `market_signal` operational (external facts). Deviations accepted: forecast has no
draft type (deterministic service, R3/R25); kitchen pack is "not applicable" for shops.

### 9 Oct 2026, 23:45 · Founder completed F1 + F2; env names adopted; `.env` is never read by agents

Founder filled `.env` (Supabase project, Upstash Redis, Gemini/NVIDIA/OpenRouter keys on free plans; no OpenAI key)
and rewrote `.env.example` with the variable names only — verified all 25 template values are empty before
committing it. The founder's names supersede the orchestrator's earlier template (`DATABASE_URL_DIRECT` etc.):
migrations + LISTEN use the session pooler (IPv4), app pools the transaction pooler. CLAUDE.md rule 20 added.
Consequences: T-001's `scripts/db-ping.mjs` must switch to the new names (W1 review fix); provider registry treats
OpenAI as "no key → skipped". Upstash Redis is present in `.env` but has no role in the design — not used unless a
later decision adds it.

### 10 Oct 2026, 00:00 · T-003 built; orchestrator rulings on its two product questions

T-003 (core-domain): 92 tests, 13 red-proofs, goldens born before the implementation (file birth times), whole-tree
`make check` green at its final run. Rulings (reversible): (1) **SKU stock** — a `sku` item consumes its
`item.stock_ingredient_id` 1:1 by quantity via new derivation rule `inventory.consume_sku`; no recipe needed (T-003
fix in the W1 review + seed row via m-1 rider 4). (2) **IN aggregator orders** under Sec 9(5)
(`operator_collects_excluded`): the aggregator issues the tax invoice; Munim prints a record-only receipt with no
CGST/SGST tax-invoice heading (T-003 fix). Other T-003 requests routed: option ingredient deltas + consume seed rows +
removal of a stray `tenancy.country.set.v1` seed (m-1 rider 4); explicit TaxId→receipt-field link in contracts (b-2,
W1 review fix). Caveats carried to later lanes: `checkGrammar().match` is raw model text — never into traces, logs or
error bodies (T-007/T-040); `validateDraft` rejects person edits by design — T-008 validates edits separately; every
envelope segment must carry a ref (intel must fold connective prose into cited segments). Gaps noted, not ticketed
yet: digit-free spelled dates ("fifth of October") pass the grammar; no IGST; no combos/unit conversion in consumption.

### 10 Oct 2026, 00:10 · Cross-check of SDK and end-customer accounts → R41–R43; tickets T-035, T-076

Founder asked to cross-check developer SDK and merchants' customer accounts before going fully autonomous. Findings:
public `/v1` + generated SDK existed; no developer keys, webhooks, rate limits, versioning or SDK packaging tickets;
customer accounts existed only as guest records ("email-OTP account later"). Founder rulings: one login with
per-merchant profiles (R41), email OTP + Google sign-in (R42), SDK only for now (R43, recommended full platform
declined — recorded). New tickets: T-035 (W2) customer identity + accounts incl. DPDP export/erasure; T-076 (W5) SDK
packaging + example storefront. Schema rider for M-B: `core.customer.idp_sub` + unique per tenant. From here the run is
fully autonomous per R38; founder asked only for money, hard rules, the ledger, or founder-only blockers.

### 10 Oct 2026, 00:20 · M-A built; 0001–0006 frozen; deviations accepted

105 DB tests on embedded PG 18.4 (77 tables; 65 tenant, 50 book, 23 outlet-scoped), automated red-proofs on every run.
Frozen sha256: 0001 04a2a586… · 0002 c64200cd… · 0003 517102a4… · 0004 18a8a25d… · 0005 517c1298… · 0006 6507413b…;
next change is 0007. Accepted deviations: `btree_gist` in the extension allow-list (exclusion constraints; fallback =
advisory-lock trigger if hosted Supabase lacks it); `return` split into `supplier_return`/`sale_return`; extra outlet
scoping; non-tenant-led partial outbox index for the cross-tenant sweeper; `fy_start_month` also locked after
onboarding (protects the per-FY invoice series); `prep_list` tagged book (stricter than D-1); customer principal key is
`app.customer_id`; DB assigns business_date/ticket_no/invoice numbers and audit seq/hash. Root edits by m-1 accepted:
`pnpm-workspace.yaml` allowBuilds for embedded-postgres (orchestrator added darwin-x64/linux-x64/linux-arm64 for CI).
Gotchas 29–32 engraved. Routed: contract gap `catalogue.item.upsert.v1` lacks `stock_ingredient_id`/MRP → T-021 (W2);
derivation rules for GRN receipt, waste, transfer, returns → M-B; `intel_ro` views, `munim_trace`/inbox NOTIFY, W2 FKs →
M-B. UNVERIFIED on hosted Supabase (BYPASSRLS grant, role SET, btree_gist, PG15) → checked in the W1 wave test by
applying 0001–0006 to the founder's dev project through the config module (no agent reads `.env`).

### 10 Oct 2026, 00:25 · M-B pipelined ahead of the W1 review

The serial migrator queue is the long pole to the morning target. M-B (W2 schema) starts now in parallel with the
remaining W1 code lanes; it touches only `db/**` (single owner). R38 still holds for app code: no W2 module lane is
dispatched before the W1 wave test + adversarial review; any W1 review schema fix lands as a later migration.

### 10 Oct 2026, 00:40 · T-004 built; severity-1 gate defect found and routed; T-006 dispatched

T-004 (core-api base): 32 tests, 12 red-proofs, `make check` exit 0. **Incident (caselaw §7 class — gate that cannot
fail):** `embedded-postgres` registers an exit hook calling `process.exit(0)`, so failing DB test runs exited 0 — M-A's
and T-007's process-level gates could not go red (test lines still showed failures). Routed as a priority rider to m-1
(fix once in the `@munim/db` harness, red-prove a non-zero exit through `make test-db` and `make test`) and a warning to
b-7; gotcha 33 engraved. The W1 wave test re-runs every gate's planted failure at the process level.
Orchestrator rulings (reversible, docs updated at wave close): member tenant discovery via
`core.memberships_for_sub(sub)` and storefront keys via `core.storefront_key` + `core.tenant_for_storefront_key()`, both
owned by `munim_crosstenant` (definer-owner list grows from 3 to 5, gate updated); DB role passwords for the dev Supabase
come from a bootstrap CLI writing `.run/db-roles.json` (git-ignored), run only in the wave test through the config
module. Routed to the W1 review fix list: contracts export `./registry` and declare `X-Munim-Tenant` /
`X-Munim-Storefront-Key` headers; `message` vs `message_key` (code wins: `message`); health-version rule must exclude
skipped `-- requires:` files. T-006 dispatched (needs T-004 only).

### 10 Oct 2026, 00:50 · T-005 built; guard hardening routed; T-008 dispatched

T-005: commit helper, outbox publishing, Ed25519 run tokens, audit verifier — 19 core-api + 10 adapter tests,
red-proofs incl. replay, tamper, delete, forged/expired/ended/cross-tenant tokens; fresh-copy `make check` exit 0.
**Guarantee finding:** the DB guard binds role→command type but not command type→tables; T-005 closed it in code
(handlers are `{type, run}`; mismatch → 422 before any DB work). Routed to m-1 as a hardening rider:
`command_authority.target_tables` checked by the guard's own-command and decision branches (fix forward, red-proven).
Logged INFERENCE choices: event runs use actor `watcher:events`, scope `["*"]`, TTL 2 h (ask 15 min); request hash =
sha256(canonical {actor, command_id, type, payload}); batch content type `application/cloudevents-batch+json`.
Contract conflict for the W1 review: `CommandResult.replayed` in the body vs byte-identical replay — move it to a
header. Cross-lane note: a core-worker hook-timeout failure was reported with `make check` exit 0 — same class as the
exit-code incident; the W1 wave test verifies. T-008 dispatched.

### 10 Oct 2026, 01:00 · T-007 built; rulings; W1 integration ticket T-009 added

T-007: 29 tests (real SIGKILL crash child, real SIGTERM child, real HTTP intel stub), 17 red-proofs, exit-code
workaround proven (planted → `make test` exit 2). Rulings: fan-out runs are ended (`endRun`) once intel returns
(narrows token lifetime); the injected Publisher and minter must use a `munim_svc` login (integration). Board gap
found: no composition roots exist for core-api or core-worker, so nothing runs end to end — added **T-009 (W1
integration)**: wiring, `make up`, dev Supabase bring-up through the config module (answers m-1's UNVERIFIED hosted
items), smoke tests. Noted behaviours (accepted for now): local-time jobs tick every 15 min; a chain spanning zones
uses its first outlet's zone; missed windows are not caught up.

### 10 Oct 2026, 01:10 · T-006 built; MB008 fixture fallout centralised; guest tracking ruling

T-006 (stream): 14 tests, 10 code-plant red-proofs (each red run exit 1), caught its own cross-tenant inbox bug (P10).
Design: NOTIFY = wake-up only; every subscriber re-reads under its own RLS; composite cursor; 120 s look-back + seen-set
for late commits; findings/drafts on `inbox:` send categorical fields only. Disclosure accepted: early plants briefly
stacked in its own files during a failed restore (only `/v1/stream` affected), redone with verified restores.
Fallout: m-1's 0007 command→table binding (MB008) correctly refuses fixtures across lanes that seed tables under the wrong
command → routed to m-1: complete `target_tables` seeds + one canonical binding-respecting `buildWorld` in the `@munim/db`
harness; lanes switch fixtures in the W1 review fix cycle. Also routed: per-tenant commit-ordered outbox `seq` + cursor
indexes (closes T-006's residual late-commit limit). Ruling: guest order tracking by a one-time access token returned at
placement, stored as `order.guest_access_hash`; wrong token → 404. Requests for T-009: session-mode LISTEN URL in
`packages/config`, `configureStream` + `closeStream` wiring; T-022/T-023: order and kitchen events carry `data.outlet_id`.

### 10 Oct 2026, 01:20 · T-008 built; run-scoping ruling; all W1 build lanes done; T-009 dispatched

T-008 (approvals): 12 tests, 10 red-proofs; orphan query proves every price row written by approvals traces to the
owner's decision; audit chain verifies. Escalation (spec contradiction): event runs are tenant-wide (`{*}`), so under
R40 C4 an outlet-scoped manager could never verify/approve an intel draft. Orchestrator ruling (implements R40 C4 and
the screen spec together, no ledger change): **intel runs are scoped to the narrowest outlet set the work needs;
outlet-specific drafts come from outlet-scoped runs; tenant-wide drafts are owner-only.** Consolidated the W1 fix list
(`docs/plan/W1-FIX-LIST.md`, 20 items) for the wave-test fix cycle. T-009 (integration + dev Supabase bring-up)
dispatched; when it and M-B finish, the W1 wave test + adversarial review run on a quiet tree.

### 10 Oct 2026, 01:35 · M-B built (0007–0013); harness exit-code fix landed; gaps routed to the fix list

167/167 DB tests, `make test-db` exit 0; 133 tenant tables, 90 book tables (all guarded, 0 service grants), 580/580
intel write attempts refused, 5 definer objects, command→table binding (MB008) on both guard branches, balanced
books (MB010), closed periods (MB009), loyalty race (MB011), claim quotes (MB012), payroll pack scope (MB013), gapless
traces (MB014). Exit-code fix red-proven through `make test-db` and `make test` (planted → exit 2). Riders landed in a
separate 0007, so M-B is 0008–0013 (BOARD numbering superseded). Accepted deviations: forecast_point outlet-scoped;
finding uses outlet overlap; munim_platform reads 4 intel_spend columns for budgets; munim_svc writes import_run;
~50 invented command names in `command_authority` (lanes adopt or request renames). Gaps routed to
`W1-FIX-LIST.md` #21–#27 (derivation source state, unguarded operational money columns, status transitions, posting
rules for refund/expense/payroll, test rewrites, error mapping). core-api failures are expected rider fallout (fixtures →
buildWorld, MB008–MB014 mapping, health version rule, late-commit test) — fix cycle.

### 10 Oct 2026, 01:55 · W1 review (guarantee + security): four severity-1 DB-layer breaks confirmed

Reviewer probes on embedded PG proved, and the orchestrator confirmed in `0007:110-175`: F1 the guard's outlet check
passes rows without `outlet_id` (manager rewrote another outlet's UPI VPA) and the decision branch checks no scope; F2
customer contexts can write tenders/orders on others' orders (own/own_order scopes never enforced); F3 table-level
binding lets a kitchen command rewrite order totals; F4 customer RLS is tenant-wide on most tables. Clause 1 is broken at
the DB layer until fixed (app-layer checks currently hold in W1 routes). Added to the fix list #28–#37 with required
red-proofs; ruling F10 (stricter): run/trace visibility requires outlet scope covering the run's scope. The fix cycle
dispatches when the other two reviewers report.

### 10 Oct 2026, 02:05 · W1 review (cross-package correctness): 23 findings; 4 product rulings

Spot-checked and confirmed: `ref_type` three-way mismatch (core-domain "order" vs DB `^core\.` vs event `^[a-z_]+$`)
and `catalogue.item.upsert.v1` missing `stock_ingredient_id` (SKU insert would 23514). Routed as fix list #38–#58 with
owners. The reviewer's founder questions are product rules without spend, ruled by the orchestrator (reversible): cash
rounding as pack data (AU 5¢, IN ₹1 INFERENCE), per-outlet business-day cutoff (default 04:00), MRP from the sold batch
else the item, per-outlet job zones with a tenant `home_tz` for the brief (#59–#62).

### 10 Oct 2026, 02:25 · Fix cycle 1: contracts closed; all other W1 lanes resumed in parallel

b-2 closed its 17 items (73 schemas, 130 tests; new gen-time model/schema check red-proven; payloads no longer carry
`customer_id`; replay via `X-Munim-Replayed` header). Lanes resumed with their fix-list items (same agents, full
context): m-1, b-3, b-4, b-5, b-6, b-7, b-8, b-1. Territories unchanged; DB-dependent halves code against documented
behaviour and report what is pending. Accepted from b-2: `CatalogueItemUpsertV1` is a discriminated union on `kind`.

### 10 Oct 2026, 02:35 · T-009 built; dev Supabase blocked on the founder's DB password

T-009: composition roots (core-api `composeCoreApi`, worker `composeWorker`), `make up`/`down`/`dev-db`, local-DB
mode, preflight, intel stub, smoke 4/4 with 6 red-proofs, secret scan over 18 captured outputs = 0 hits (red-proven).
Dev Supabase bring-up blocked: both poolers return 28P01 for the `.env` admin user; ~7 attempts then stopped (ban
risk). Founder asked to reset the DB password. Orchestrator decision: the hosted bring-up runs only after W1 DB changes
freeze at the end of the fix cycle (the runner records sha256 per migration on first apply). Accepted deviations:
config refactor (`roleUrl`, session URL, intel URL, service secret, run dir overrides); worker per-row publisher applies
the outlet-scope ruling (request path to follow, #64); `up` no longer depends on the stale `db-ping`. New fix-list items
#63–#67.

### 10 Oct 2026, 02:45 · W1 wave test run + gate audit reported; review phase complete

Wave test (copy at 01:07): 8 packages green (db 167, contracts 99, core-domain 92, config 9, publisher-http 10, web 1,
core-worker 29), core-api 7 reds — all already on the fix list (#10, #11, #13, #25/#26) with three false reds from one
hung test. Gotcha 33 fix verified: planted failures exit non-zero in all 8 packages and via `make test`. New: `make
check` bails at the first failing package and hides other lanes (sev 1, #68); hung-test poisoning (#69); weak worker
write scan (#70); untested `idp-supabase` (#71); core-api gates import from T-009's dev-root (#72); smaller items
#73–#76. Routed to the live fix-cycle lanes. W1 review phase complete: 3 reviewers + wave test → 76 fix-list items.

### 10 Oct 2026, 03:00 · b-5 fix cycle closed (pending one ruling update); rulings

b-5 closed #3, #12 (its half), #13, #34/F7, #18/#64, #72: 22 core-api + 10 adapter tests, red-proofs for command
binding, per-type event schemas, run scope narrowing, outer-transaction publishing. Ruling: a non-empty `data.outlet_ids`
narrows the event run scope to exactly those outlets. Routed: approvals publishes via `publishCommitted` after the outer
commit (b-8); worker uses `createRowPublisher` + dead-letters poison rows after 5 attempts (b-7) with
`outbox.publish_attempts`/`dead_at` (m-1). New standing rule: every new event type must register a contracts schema
before it can be written (F7 enforcement) — W2 module lanes register theirs in their own `src/<module>/`.

### 10 Oct 2026, 03:20 · b-4 and b-1 fix cycles closed; rulings on guest scope and test imports

b-4: #9 #10 #11 #26 #31 #36 #45 #46 #47 #63 #71 #73 #76 done — core-api 76 tests, 13 red-proofs, `make check` exit 0
at its run (db 202). #72 blocked by the boundary rule → ruling: narrow depcruise carve-out letting test files import
`adapters/dev/idp-local` only (b-1). Guest scope ruling (stricter): guests get an order-scoped DB context
(`app.role='guest'`, `app.order_id`) with own-order policies (m-1), plus a tenant-led partial index on
`guest_access_hash`. T-009 wires `storefrontResolver` + `deps.publish` and adds `make smoke` to `check`.
b-1: db-ping through config (5 failure cases, planted-secret count 0, leak plant caught), `make check` runs every target
and every package with per-package/target summaries (red-proven: 4 failing packages all reported), `test-db` needs no
`.env` (167 pass in a copy without it), pytest prints SKIPPED. `pnpm-exec-summary.json` git-ignored. Live `make check`
red only on a core-api `stream.test.ts` type error (b-6's file, fix cycle in progress).

### 10 Oct 2026, 03:30 · b-3 fix cycle closed; Sec 9(5) invoice-number ruling

b-3: 13 items, 110 tests, 22 red-proofs, goldens hand-written before code (01:26:12). Accepted INFERENCE choices:
inclusive-pack discounts come off the gross; MRP checked before discount, batch MRP else item MRP; `tax_id_missing`
covers absent + pattern (`problem` field); SKU qty maps 1:1 to the base unit; consume rules never throw at sale (issues
reported instead). Ruling: IN Sec 9(5) aggregator orders take no number from the gapless GST invoice series (NULL
invoice_no; "Order no" = external ref/ticket) — routed to m-1; T-022 uses `cashTender`, `orderTax` with deltas and
discounts, and derives consumption only from eligible orders (0014 source-state predicate).

### 10 Oct 2026, 03:40 · b-8 fix cycle closed; provenance rule for updates confirmed

b-8: #12 (publish after the outer commit, red-proven: in-transaction publish delivers `committed:false`), #16, #32/F5,
#35/F8, #57, contract shapes, buildWorld fixtures, ruling #18 positive gate — approvals 17/17. #72 waits on b-1's
carve-out. Confirmed design (orchestrator): `origin` = creation provenance, never re-stamped; updates trace through
`audit_log.decision_id` → `decision.decided_by` (gotcha 34). With no publisher configured, approvals still succeeds and
the sweeper delivers (no refusal). F5's manager-403 branch is unreachable over HTTP (RLS hides `{}` drafts → 404), proven
via an advisor instead — accepted.

### 10 Oct 2026, 03:55 · b-6 fix cycle closed; shopper-policy and guest-key rulings

b-6: #14 #25 #33 #37 #47 #51 #69 done; stream 19/19 ×3 runs; 10 red-proofs + hang isolation proof (planted hang fails
alone). Accepted contract change: customer/guest `order:` streams carry `order.status` / `order.promised_at` events from
`core.order_event` (no actor, no reason, no amounts) with a per-subscriber `n=` cursor; members keep outbox CloudEvents
with `o=<seq>`. Rulings: shopper roles are governed solely by restrictive ownership policies (outlet policies exempt
customer/guest; core-api keeps shoppers at `outlet_ids '{}'`; the stream's `'*'` override is removed afterwards); guest
key stays `app.guest_access_hash` (supersedes the `app.order_id` idea) and a guest context never carries `customer_id`;
judge counts like owner for `{*}` runs. `make check` at b-6's run: every target PASS except smoke-redproof (stale anchor,
routed to b-9). Fix-cycle-2 queue #77–#80.

### 10 Oct 2026, 04:05 · b-7 fix cycle closed; nightly-at-cutoff confirmed

b-7: #15, endRun, #60, #62, #70, poison rows, main.ts — worker 36/36, 10 red-proofs. Caught a cross-lane regression:
core-domain's `businessDate()` gained the cutoff, which silently stopped the 02:00 nightly; worker now uses `localDate`
for windows. Confirmed reading (orchestrator): nightly runs per outlet at that outlet's `business_day_cutoff` and covers
the business date that just closed (fixed 02:00 removed); brief at 06:00 `home_tz`. Poison rows dead-letter in memory
until m-1 lands `outbox.publish_attempts`/`dead_at` (requested). smoke-redproof's stale anchor: b-7's validated
replacement sent to b-9. Remaining live: m-1 (sev-1 guard/RLS + shopper policies), b-9 (wiring + red-proof anchors),
b-1 (depcruise carve-out).

### 10 Oct 2026, 04:20 · m-1 fix cycle 1 closed (0014); fix cycle 2 dispatched

m-1: one forward migration `0014_w1_fix_cycle_1.sql` (sha256 e133ca10…) — F1 `core.book_scope` (92 tables) with scope
checks in both guard branches; F2 customer writes own rows only via `customer_target_tables`; F3 order money frozen
except `orders.reprice`; F4 restrictive `customer_scope` + `guest_scope` on every tenant table; #37 run visibility;
#21 derivation source states; #22 reconciliation_break + viability_case → book, import runs frozen after preview,
market_signal only inside the import approval; #23 71 status transitions on 21 tables; #24 posting rules; #49 override
by cart line; #54 commands; #55 rule parity; #59/#60/#62/#17; outbox dead-lettering; Sec 9(5) no invoice number.
`make test-db` 209/209, `make check: ok`, red-proofs for every item; caught its own NULL trap in the F3 freeze via the
paired green test. R41 email merge: token-only claim implemented; R41's verified-email merge stays and moves to W2 T-035
(+ M-C definer function) — ledger unchanged. Accepted: 7 derivation rules existence-only (sources have no state).
Fix cycle 2 (#77–#79 + 0014 contract fallout) dispatched to b-4, b-5, b-6, b-8.

### 10 Oct 2026, 04:55 · Wave 1 closed

All W1 lanes closed two fix cycles (76+ fix-list items; four severity-1 DB-layer guarantee breaks fixed in 0014 and
red-proven). Orchestrator verification on a quiet tree: `make check` PASS on all 7 targets (lint, typecheck, boundaries,
test, boundaries-redproof, smoke, smoke-redproof) — 594 tests across 9 packages. Spot-checks in code: guard scope check
in both branches (0014:518, :572), restrictive `customer_scope`/`guest_scope` created per table (0014:662, :690), order
money frozen except `orders.reprice`, shopper role cleared only for bookkeeping writes (execute.ts:132-157), approvals
publish after the outer commit (decide.ts:24, :237). Only `packages/config` reads `.env`. Secret scan over 392 new files:
0 hits. Committed by ticket, staged by name: T-001 466f8d6, T-002 9eefed1, T-003 3f8cd37, db 89b34c9, T-004 f96c54e,
T-005 88260f1, T-006 610d582, T-008 5256a6a, T-007 866b117, T-009 499c3c1, docs 609ab6a. Open carry-overs: dev Supabase
bring-up (founder password), R41 email merge → T-035, worker's duplicate poison pre-check (W2 sweep), template runner
shared by T-040/M-C.

### 10 Oct 2026, 05:05 · Wave 2 dispatched (14 parallel module lanes)

Prep: registry mounts `modules/accounts` and `src/platform` (d3546cd); shared `docs/plan/W2-LANE-BRIEF.md` (3ce8992)
with build rules and fixed cross-module seams (priceLines, itemsForSale, provisionTenant, placeOrder/previewOrder,
deriveOrderConsumption/deriveGoodsReceipt/pickSaleBatches, postFor, loyalty seams, ensureProfile). Territory changes:
`/platform/v1/tenants:provision` is T-031's route over T-020's `provisionTenant` seam (fix-list #66 superseded); kitchen
exposes `createTicketsFor` for T-022. Schema requests from lanes are batched into the W2 fix cycle for the migrator.
T-033 worldgen and T-034 integration follow once modules land.

### 10 Oct 2026, 09:55 · W2 relaunched after the API rate limit; model tiering

All 14 W2 lanes stopped at ~05:10 on an API weekly rate limit (reset 08:30) before writing any file (tree verified
clean). Founder: continue, and use cheaper models where possible. Relaunched fresh (a resumed agent keeps its model):
**Opus** for the money/stock/security-critical lanes — T-021 catalogue (pricing seam), T-022 orders/POS, T-024 inventory,
T-026 finance, T-030 imports, T-035 accounts; **Sonnet** for T-020 tenancy, T-023 kitchen, T-025 purchasing, T-027
people, T-028 customers, T-029 compliance+goals, T-031 platform, T-032 storefront. Standing policy from here: Sonnet for
conventional lanes and doc/scaffold work; Opus for the migrator, money/stock/guarantee-critical lanes, and the
guarantee/security dimension of adversarial reviews.

### 10 Oct 2026 · W2 modules built; pause + matrix; integration plan

All 14 W2 module lanes reported (gates and red-proofs per lane in `docs/plan/W2-FIX-LIST.md` sources). Founder asked to
pause after the modules and give a build matrix (given), then: "complete the wave2, do reviews and test post that, then
ensure everything is working correctly and as expected" — accepted the orchestrator's nine default rulings W2-R1…R9
(version take-over, guests don't change orders online, refund caps per role, loyalty policy per tenant, finance policies,
stock restored on cancel, storefront change windows, P&L template min_role advisor, kitchen never writes `core.order`),
recorded in the fix list.

- **Checkpoint commits before review (deliberate departure).** Two scratchpad collisions during the lanes (shared
  `scratchpad/bak/`, a contracts file briefly holding router code) showed an uncommitted 289-file tree is fragile with
  parallel lanes. The 14 lanes are committed per ticket as "lane build, pre-review" plus one regenerated-contracts commit;
  W2 closes only after the review + fix cycles. Lanes now keep scratch files in `scratchpad/<lane>-<ticket>/`.
- **Supabase dev database verified** after the founder's password reset: both poolers connect (PG 17.11, pgvector 0.8.2
  available, not installed); schema bring-up waits for 0015.
- **Integration plan:** Batch A migrator 0015 in an isolated worktree (merged in one step once `make test-db` is green);
  Batch B i-1 (Opus: events, kitchen→orders, worker/platform wiring, storefront on real seams, money-flake hunt) and i-2
  (Sonnet: tests, boundaries, unit bug, SDK route coverage, reason codes, verified-email bind, export completeness).
  Contracts `gen` and full `make check` are run only by the orchestrator on a quiet tree.
- **Definition of done for W2:** 7/7 `make check` + `make test-db` green on a quiet tree; T-034 flows green with no
  stand-ins (no `command_authority` shims, no seam fakes on default/gate paths); Supabase migrated, `make up` → `/health`
  200, and one live HTTP run onboarding → first sale → outbox.

### 10 Oct 2026, ~13:45 · W2 paused by the founder

Founder: "pause the builds and capture current state so that we can resume". Stopped t-1 (T-034, mid guarantee-scan
tightening) and b-33 (T-033, mid gate-(d) red-proofs); killed their leftover embedded Postgres. Since the last entry:
0015 merged (f9ffdf0, test-db 246/246, A1/A2/A3/A10 red-proofs), i-2 (1cb0afb) and i-1 (b594373) integration merged,
contracts regenerated (cb0f831), gotcha 34 corrected (derivation UPDATEs re-stamp `origin`), hosted Supabase brought up
(426dbf1: 0001 now asserts NOSUPERUSER by check — PG16+ lets only superusers name the attribute; bootstrap grants USAGE
on schema `extensions` for the vector type; 0001–0015 applied, 17/17 checks; `/health` 200 on port 8797). W2-R8
reverted (template `min_role` has no advisor rung → W3). Partial T-034/T-033 work is committed on
`wip/w2-integration`, not on `main`. Resume plan: `docs/plan/RESUME.md`.

### 10 Oct 2026, evening · W2 review + two fix cycles complete — W2 closed

**Review** (HEAD dbe80ec; findings and routing in `docs/plan/W2-FIX-LIST.md`): R1 guarantee/security (Opus) 0 blocker ·
5 major · 13 minor; R2 money/stock (Opus) 7 sev-1 · 10 sev-2 · 8 sev-3 with 13 failing HTTP probes (all now green);
R3 contracts/SDK/gates (Sonnet) 8 major · 12 minor. Clean bills: book guard, definer objects, platform split,
cross-tenant/outlet/customer isolation, event payloads (ids only), error bodies, pricing identity over 6,000 random carts.

**Fix cycle 1** (m-4 0016 · f-1 orders/storefront · f-2 finance/stock · f-3 security/integration · f-4 contracts/SDK) and
**fix cycle 2** (m-5 0017 · f-2 · c2-a · c2-b · c2-c). Notable outcomes: loyalty redemption posted and traced to its
ledger row; advances, invoice-vs-GRN variance, transfer batches, overtime by pay week, unit cost per 1000 base units;
refunds cumulative-capped per role; cancel refused while paid; re-price merges the snapshot and audits every line and
coupon use; erasure blanks every PII column catalog-wide (incl. merged and token-claimed guests); clause-1 scan checks
source_state at write, other-tenant rows and origin re-stamps (redproof.sh: 26 plants); IdP confirmation only where an
email must be verified, with timeouts + bounded cache; pg errors logged by code only; onboarding mints the tenant id (no
existence oracle); SDK guest-token scheme, error-code enum, response-parse + route-uniqueness gates; worldgen no-SQL gate
hardened; packs IN/AU v2. **0017 restores gotcha 34**: origin is never re-stamped (the derivation branch had been).

**Rulings added:** W2-R10 (points reversed in full on full refund). W2-R8 reverted (template `min_role` has no advisor
rung → W3). Re-time after any tender refused (R2-S2-6, broad by design). Aggregator refunds post as a channel deduction.

**Evidence (quiet tree, c3c1d05):** `make check` 7/7 PASS; tests core-api 606 · integration 40 · db 278 · contracts 160 ·
core-domain 132 · worldgen 38 · worker 36 · idp-supabase 15 · config 10 · publisher 10 · web 1 (≈1,326). `make test-db`
278/278. **Hosted Supabase:** 0001–0017 applied, packs v2 seeded; `/health` 200 (migration_version 17); store world (183
days via the public API, real confirmed sign-in) re-verified live 9/9 after the migrations. Transaction-pooler logins
refuse rotated passwords briefly (28P01) — bootstrap now retries.

**Carried to W3+ (not W2 defects):** dated-history API for worldgen/intel (D8, blocks long-window plants); `deal_changed`
needs preview deal refs on place; guard derivation branch does not bind the written row to its source (compensated by
per-table triggers; generalise in W3); D3 counter-sale customer attach; D4 POS-export quarantine; tenant-only RLS on
outlet-data tables before outlet-scoped templates (R1-m9); Pydantic numbered classes (R3-m10); unmounted W3 SDK ops;
W4 read routes (R3 spec-drift list); dev IdP selector for `make seed` (founder, auth flow).

### 10 Oct 2026, ~23:15 · R44 lanes + hosted demo data

Founder approved R44 (dev local sign-in, dated history via approved imports, fast seeding). Slow live seeding loops
stopped. Lanes: d-1 (Sonnet) T-036 dev IdP selector; h-1 (Opus, migrator for 0018) dated-history import kinds + batched
commit with measured targets. Next: worldgen moves to history files + parallel worlds + `make demo`.
**Hosted demo data:** founder chose "keep and add alongside" (recommended was wipe and reseed). Existing hosted data is
kept: the verified store world, partial AU café and cloud kitchen; synthetic Supabase Auth users
e2e-owner-store@example.com, e2e-owner-au@example.com, owner@/cashier@cloud-kitchen.synthetic.test. New demo businesses
are created alongside; no destructive operation on the founder's project.

### 10 Oct 2026, ~23:40 · W3 starts in parallel with the R44 data work

Founder: build the AI layer in parallel with the data work, and first run a Sonnet-powered deep research on agentic
architecture: Palantir ontology/Actions/decision capture, Karpathy's context and graph engineering, Anthropic/OpenAI
first-party agent guidance, deterministic type-safe tools and decision APIs, planning/world models ("JEV" →
interpretation to be reported, likely JEPA). Launched the deep-research workflow (5 angles → fetch → 3-vote adversarial
verify → synthesis), every agent pinned to Sonnet. Its output feeds an architecture ADR (orchestrator, specialist
boundaries, ontology/graph over Postgres, per-run context, long-horizon tasks, typed tools, decision API, evals), which
then rewrites the W3 board rows T-040…T-059.
Started now because they are pattern-neutral: **b-41 T-041** (Opus) intel runtime plumbing (uv project, ADK pinned,
RunContext from run token, internal client, provider registry, RecordedLlm, FastAPI, Python gates) and **b-52 T-052**
(Sonnet) deterministic forecast engine. M-C snapshot templates wait for h-1's 0018 (single migrator).

### 10 Oct 2026, ~23:55 · Process for the intelligence-layer architecture (founder)

Founder: when the deep research lands, write a comprehensive synthesis with **Opus**, have it **ratified by independent
agents**, and only then present it; the founder decides the shape of the AI intelligence layer. Plan:
(1) Opus synthesis grounded in the research report and the existing corpus (ledger R15–R16, R25–R29, R36, R40–R44;
03-architecture; 04-agent-framework; R5-agent-runtime; packs; T-041 runtime facts) → `docs/plan/adr/` draft;
(2) independent ratification: 3 reviewers with identical prompts and no access to each other (guarantee/security,
agentic precision/cost, buildability on ADK 2.11 + our stack), majority + dissent recorded; one revision pass;
(3) present options with a recommendation for the founder's decision. No W3 orchestrator/specialist tickets are
dispatched before the decision (pattern-neutral plumbing — T-041, T-052, templates — continues).

### 11 Oct 2026 · Intelligence layer decided (R45, F1–F10); docs reconciled; W3 board rewritten

**Founder decisions** (ledger R45; ADR-014 §11):
- **F1** investigations are a core-owned playbook with deterministic verdicts and a balanced margin bridge.
- **F2** decision models: LLM mimic on the `router` role, with egress allow-lists. Jev and OpenAI Decisions only as a W5 bake-off.
- **F3** ≤ 20 tools per context, a design choice. 04 §2's "12 (FACT)" was mislabelled.
- **F4** hybrid negotiation: the AI picks moves within rules, the deal review is deterministic, and the PO is a draft from review code.
- **F5** ≤ 4 read-only branch Runners, not `ParallelAgent`.
- **F6** a Gemma fine-tune for intent routing after W5.
- **F7** Postgres edges now, FalkorDB later.
- **Addenda:**
  - **F8** 8 named specialists as team members, a Manager and a shared Forecast service; each owns its workflows, skill, identity, track record and evals.
  - **F9** a main conversation via the Manager (`@Specialist`, "{Specialist} · via Manager") plus specialist threads and desks on the same validated path, with bounded cited thread context.
  - **F10** Step / Plan / Auto investigations under owner-set per-role ceilings and a monthly AI cap. Auto is built last, on core-worker.

**Docs updated** (docs lane, no code). Superseded text is kept in quoted blocks, each with "Why it changed" and "What this improves":
- `04-agent-framework.md`: §1, §2, §3, §5, §6, §7, §8 and §11 are superseded in place; §12 is new (specialists, conversations, modes).
- `03-architecture.md`: §1.1, §1.3, §1.8, §1.9, §3 T6/T7, §4, §5, §7 and §10.
- ADR-007 and ADR-008 are amended. ADR-014 gains "Post-ratification notes" listing the body passages that F4 and F8–F10 supersede; the ledger wins.
- New `docs/plan/DECISION-EVOLUTION.md`: every changed architecture decision, 9–11 Oct, in before/after/why/improves/watch form.
- New `docs/plan/W4-READ-ROUTES.md`: the W2 R3 spec-drift list was never saved. It was rebuilt from the mounted routes, the OpenAPI and the screen specs: 26 missing reads, 4 filter gaps and 7 declared-but-unmounted routes. The last are not served today because `loadRouters` silently skips the missing `evidence/findings/inbox/runs/traces` directories.
- The facts behind the ADR-007 change come from the installed ADK 2.11.0 wheel:
  - `ParallelAgent` is deprecated (`parallel_agent.py:246`);
  - "Session state is shared by every branch" (`:259–262`), which refutes old 04 §2;
  - `BasePlugin` has 14 callbacks.

**BOARD W3 rewritten** into W3.0–W3.4 from ADR-014 §12 plus F1–F10:
- **Done:** T-041 7f6418a and T-052 e05dd79, plus the R44 lanes T-036, H-1 and W-1.
- **New tickets:**
  - M-C3 (threads, AI policy as book rows, `intel.agent_track_record`);
  - T-087a/b (specialist registry, desks);
  - T-088a/b (threads, taint carried across turns);
  - T-089a/b (Plan, then Auto);
  - T-090 (AI policy);
  - T-092a/b (W4 read routes);
  - T-055 split into a rule half (a) and an AI half (b).
- **Changed:**
  - M-C2 gains the mode columns and a cost-estimate template.
  - T-040 also mounts the 7 unmounted reads and fails boot on a missing router directory.
  - T-085 reports per specialist ("no plants", never 100%).
- **W4 and W5:** W4 T-064/065/066/068 are amended and T-077 (AI settings) added. W5 T-070 is narrowed to live measurements.
- **Every row** carries a model tier (Opus rows state their reason), dependencies, and a gate counted against an independent source.

**Contradictions recorded:**
- **ADR-014 body vs the ledger** (the ledger is followed):
  - F4 vs §3.2 #5, §13.2, §14 L4/P6 and the §12 T-055 "0 LLM calls" gate;
  - F9 vs §6.4 rule 4 ("answers never re-read");
  - F10 vs §0.5, §7.2 and §13.3;
  - §12 has no F8–F10 tickets.
- **Minor:**
  - ledger F8 "ADK-014";
  - F1's dangling "(a)";
  - R36 lists `OPENAI_API_KEY`, while rule 20 says there is none;
  - 03 §1.9's stale T-035/T-036 refs (fixed).

**Open and routed, not settled:**
- **O-1** identity for unattended Auto steps (R40 C4 vs worker-minted run tokens): orchestrator, or the founder if it is an auth-flow change.
- **O-2** the owner's monthly cap vs the operator's `platform.llm_budget.limit_minor`. This is money, so it goes to the founder. Assumed: min of the two. **Blocks T-090 dispatch.**
- **M-C1d's guard-derivation binding** changes ADR-013's book guard. The orchestrator checks whether that is non-additive, which would be a severity-4 escalation.
- **O-3** advisor and judge default ceilings, `step` and `plan` (INFERENCE).

Design points the board fixes:
- Thread summaries take segments from untainted turns only, which closes B1 across the window.
- Plan runs inside the approving request: the member's token gives the scope, and there is no core-api background loop.
- Run tokens are never refused for budget. The hard cap means rules only (rule 11).

The ledger itself was not edited.

### 11 Oct 2026 · Hosted demo loaded with dated history

`make demo` against hosted Supabase (0018 applied, `MUNIM_IDP=local`, port 8797): all four worlds seeded and verified —
restaurant_group 640 s PASS 19/19, cloud_kitchen 377 s 15/15, store 246 s 12/12, au_outlet 439 s 14/14; **666 s total,
60/60 plants recomputed** from read routes (target 600 s: slightly over; the restaurant group's ~550 live network writes
are the critical path — move more live legs into history files in W3). Before R44 a single world took > 1 h and did not
finish. The demo tenants sit alongside the earlier partial ones (founder: keep and add alongside).

### 11 Oct 2026 · Open items resolved (R45 F11)

Founder: O-2 AI cap = lower of owner cap and operator budget; O-1 Auto runs under a standing grant from the member
(read-only, one investigation, scope re-checked each step, revocable); M-C1d guard binding approved with a full-flow
dry run first. T-090, T-089b and M-C1d unblocked.

### 11 Oct 2026 · Founder: pause after W3 with a handoff file

When W3 closes (review + ≤ 2 fix cycles + quiet `make check`), stop all lanes, write `docs/plan/HANDOFF-W3.md`
(state, commits, hosted state, open items, pending founder decisions, W4 start order), commit it, report, and wait.
No W4 lane is dispatched before that.

### 11 Oct 2026 · W3 consolidated for token cost (founder: "merge + shared brief")

35 → 26 lanes: M-C1b+M-C1c; M-C3+M-C2+F11 grant (migrator chain 6 → 4); T-055a+b; T-084a+b; T-092a+b; packs 8 → 5
lanes (Finance; Inventory & Purchasing; Kitchen+People; Menu & Pricing+Market; Customers+Compliance). One-page
`docs/plan/W3-LANE-BRIEF.md` replaces whole-ADR reading per lane; one review per sub-wave. Expected ≈ 15–20% fewer W3
tokens and ≈ 2–3 h shorter. Manager, threads, trace plugin, pipeline and investigations stay separate (size/weight).

### 11 Oct 2026 · M-C1a merged — template role ladder

0019 merged (outlet RLS on 21 tables, 14 templates incl. `finance.margin_bridge`). The template `min_role` ladder is now
**staff < manager < advisor < owner** (judge = owner in its demo tenant, operator above): advisors read finance, managers
read catalogue/ops templates but not finance — consistent with W2-R8's intent and the W2 finance routes (owner/advisor).
Before this change core ranked advisor = staff, which with advisor-level finance templates would have let staff open the
P&L (measured by the migrator). Orchestrator ruling (restricts, does not widen access); revisit if founders want
outlet managers to see their own outlet's P&L (alternative ladder L1).

### 11 Oct 2026 · W3.1 rulings (orchestrator)

- **Unknown `@name`** in an ask → no addressing; the Manager answers (friendlier than 422 `unknown_specialist`; BOARD gate
  and 04 §12.2 text superseded). Only a leading mention counts; `@Manager`/`@forecast` address no one.
- **Concurrent asks** on a thread both land as consecutive turns (gapless); MB014/409 only for a stale explicit turn_no.
- **Thread taint is permanent within a thread** (an answer composed with tainted context is itself tainted — B1 laundering
  through answers). UX: the console says drafting is off in this thread and offers a new thread. Recorded for T-064.
- **Run-frame thread block:** one source — core's `threadBlock()` bound by core to the ask run; intel may not choose a
  thread id (routed to T-040b).
- **AI policy:** two POST routes (ceiling, cap) instead of one PUT (one command per route); setting a cap with no
  same-currency operator budget for the month is refused (`platform_budget_missing`, fail closed).

### 11 Oct 2026 · W3.2 ruling — finance.missing_payout impact (orchestrator, layer rule)
Pack §5 names `expected_net_minor` as the impact; pack §4 grades severity on "Σ order totals" and every answer key
(RG-F4 = 6 × 29,400; RG-F7 "Σ order values") measures order values. Ruling: the finding's impact is Σ
`order_total_minor` (what is unsettled); the dispute draft claims Σ `expected_net_minor` (what is owed after the
channel's fees), per §6. Both are snapshot cells; the pack §5 line is amended at doc sync. Trigger: the oldest unsettled
order is older than `days_unsettled_gt`; impact covers every unsettled order of that channel (the only rule matching
both RG-F7 key states, 898,800 → 176,400 after the held statement is approved).

### 11 Oct 2026 · W3.2 rulings — Customers & Compliance (orchestrator)
- **Licence "missing":** fires only for pack `licence_kinds` that apply to the outlet's kind and are not marked
  `_unverified`; expiry fires for any kind held. Needs `licence_kinds` in the run-frame (integration) and a
  `compliance.licence_calendar` v2 that reports *expired* separately from *missing* (M-C1e), so an expired unverified
  licence is not lost.
- **CK-G2 at reduced scale** stands as a gate-local plant (T-086 already noted reduced-scale G2/G3); the pack-scale case
  is gated offline. Worldgen re-plants at pack scale in the demo-data follow-up.

### 11 Oct 2026 · W3.2 ruling — workflow draftables (ingest invoice, negotiation PO) (orchestrator; ADR-014 §2.1)
Some drafts are emitted by deterministic intel code, never by a model tool: the supplier-invoice draft from ingestion
(T-056) and the PO draft from deal review (T-055). Ruling:
- **Registry:** a specialist entry gains `workflow_draftables` (here `inventory_purchasing`: `purchasing.invoice.record.v1`;
  the PO type if it is not already a propose tool). They are **not** agent-exposed (no `propose_*` tool, NOT_AGENT_EXPOSED),
  and core's internal drafts route admits them for that pack only.
- **Taint:** a workflow draft may be posted from a tainted run — the taint lock bars *model-chosen* proposals; this path
  has no model choice. Allowed only because every numeric leaf is a ref a person must confirm or type (doc-span cite,
  quote row) and core still re-validates the body. Recorded as the one exception to W3 rule 4.
- **based_on:** may be empty for a workflow draft whose every numeric leaf is a document or quote ref (a document-sourced
  draft cites no snapshot cell); for all other drafts ≥ 1 remains.
- **Number grammar:** `invoice_no` is an identifier (like the coupon `code`), excepted from the grammar and documented in
  `drafts.ts`; `lines[].description` stays prose and must pass — ingestion moves quantities and units out of descriptions
  into their own span refs, or leaves the description to the linked ingredient's name.
- **Clause 2 note:** a document-span value is the model's transcription of the page, shown beside the value as
  "from the document"; nothing executes until the approver confirms or types it (R26). The UI must say so (W4).

### 11 Oct 2026 · W3.2 integration rulings (orchestrator)
- **Driver listing windows:** `window_days: 30` for `purchasing.overbilled`, `purchasing.near_duplicate_invoice` and
  `inventory.shrinkage` (pack v3, INFERENCE) — the window the driver lists invoices/counts over. Accepted.
- **Skill instruction cap** = 1.5k *tokens* (≈ 6,000 characters), one gate in `tests/packs/test_skills.py`; per-pack tests
  asserting 1,500 characters are stricter and may stay.
- **Campaign drafts stay unwired** until `consented_audience` filters to the at-risk segment and per-channel consent
  (M-C1e/W4): an approved campaign must never reach customers outside the finding. coupon.set waits for
  `coupon_current` v2 (M-C1e).
- **New 0022 templates** assigned: inventory_purchasing ← purchasing.invoices, inventory.counts, inventory.count_variance;
  finance ← finance.gst_summary; market ← market.goals (largest toolset inventory_purchasing 17 ≤ 20).
- **`purchasing.invoice.record.v1`** is not agent-exposed (workflow draftable).

### 11 Oct 2026 · W3.2 review ruling — quote provenance for the PO workflow draft (orchestrator; R-C F3)
The workflow-draft ruling allowed code-emitted drafts whose numbers "a person must confirm or type". A PO's price and
quantity are `quote_compare` cells over **model-transcribed** supplier replies, so "confirm" needs something to confirm
against. Ruling: the supplier's reply is stored as untrusted chunk text, each quote field keeps its `[start, end]` span in
that text (0024: `intel.supplier_quote.source_chunk_id`, `spans`, span ⊂ chunk enforced), and the approval card shows
each PO number beside "from the supplier's reply" with the highlighted span (W4). Grounding binds each field to its own
context (price by currency and unit, quantities by unit, terms by "days"), every number token in the reply must be
claimed, and quantity must equal the RFQ (R-C F1/F2). RFQs go only to `kind = 'simulated'` suppliers, checked in intel
before sending and by a 0024 CHECK (R-C F4).

### 11 Oct 2026 · W3.3 rulings — Manager ask (orchestrator)
- **Unaddressed draft request** ("draft a PO…" with no `@Name`): v1 abstains with `specialist_needed` and the console
  offers the specialists to @mention. No model picks the skill for a draft. A typed `route.skill` decision is a W5
  candidate if evals show the need.
- **A tainted run keeps `propose_*` declared; the plugin refuses each call** (so the refusal is a traced, gated event
  rather than an unknown-tool error). ADR §5.1's "bound only when not tainted" is satisfied in effect.
- **AI off / no or spent budget on an ask** → abstain `model_blocked`, no model or router call. Every tenant needs a
  `platform.llm_budget` row for the month or its asks abstain — checked at the W3 close for hosted tenants.
- **Intel unavailable** → core's `/v1/ask` returns 503 with nothing written; the console must hide or disable Ask rather
  than show an error (rule 11, W4).

### 11 Oct 2026 · W3.3 rulings — investigations (orchestrator)
- **H2 waste** is judged on its own bridge row (`waste`) at the same 1,000 bp share bar and is **never netted** with the
  `cogs_volume_mix` giveback. This supersedes the earlier "judged on quantity" wording, which no doc defined; it gives the
  RG-MF1 key's outcome.
- **The margin_fall gate world** is restaurant_group plus a one-closed-shift-per-trading-day `shift_log_v1` import
  (owner-approved), because plain RG has no shift data and H0 (`pos_days_closed`) can never complete there. The paired
  plain-RG check keeps the key's "waits" outcome.
- **A negative "Cash Tenders" control total** in a shift log is legitimate (refunds can exceed takings); it is no
  longer quarantined (T-093 fix).

### 11 Oct 2026 · W3.2 review rulings — coupons (orchestrator; R-B S1-A/B)
- `catalogue.coupon.set.v1` is **not agent-exposed** and no watcher drafts it, until pack customers-growth §6's
  executable tightening lands (`valid_to` ← a core-computed next-business-day cell from `customers.coupon_current` v3,
  every copied cell cited in `based_on`). Core's coupon.set can change only caps, `valid_to` and `active`; the old
  `requires_customer` "tightening" was a no-op, and a model-copied draft could revert a newer owner change.
  Members set coupons themselves as before. Campaigns stay unwired (R-B S1-D; core refuses them from intel).
- Business-held licences (GST, ABN) are filed once per tenant; the task's assignee is the manager of the first outlet
  in the snapshot (accepted).

### 11 Oct 2026 · W3.2 CLOSED — specialists, services, review and fix cycle 1
**Shipped:** M-C1d (0022) guard binding · M-C1e (0023) template v2s · the 8 specialist packs (T-044…T-051; 41 detectors
+ 3 forecast) · pack integration and wiring (driver/follow-up mints, abstain, workflow draftables, graph route) · T-093
history kinds · T-084a lineage · T-056 ingestion · T-058 graph · T-055 negotiation · worldgen fixes (wg-1, wg-2).
**Review:** three adversarial reviewers (db/core, packs/pipeline, negotiation/ingest/graph) — 34 findings; every one
confirmed in code and fixed with a red-proven gate in fix cycle 1 (f-core, f-neg, f-intel, 0024), merged by i-3.
Majors fixed: graph outlet isolation; concurrent and back-dated history imports; invoice_no shape; quote fields grounded
by context (a swapped/omitted field had won a PO for the hidden-MOQ supplier); lakh parsing; quote provenance spans;
simulated-only RFQs; coupon.set no-op and stale revert; duplicate dispute claims; campaigns reachable on the ask path;
one detector killing the sweep. Rulings: workflow draftables, quote provenance, coupons, licences, H2 waste (above).
**Evidence at c38490c:** core-api 844/844 · contracts 191/191 · db 388/388 · intel 744 passed / 3 strict xfail ·
integration 47/47 · smoke · boundaries · every red-proof script exit 0.
**Note:** migration 0024 landed inside 1a41dcc (a DECISIONS commit), because the merged db files were already staged.
**Carried to the W3 close / handoff:** business_policy command (labour/margin targets); `coupon_current` v3 + executable
coupon tightening; shop SKUs have no recipe so no store PO can pass deal review (pack decision, R34); branch AI spend not
summed into the Manager's budget; search views and run-held chunks; FindingView dedupe_key never rendered (W4);
recipe_waste_gap false alarms from high baseline waste; hosted demo needs CK manager sign-in; unused reason code
`campaign_audience_unscoped`.

### 11 Oct 2026 · W3.3/3.4 rulings — Plan mode, router without logprobs (orchestrator)
- **Plan `stop_reason = draft` is reserved, not built:** no draft-linking lookup exists (ADR-014 §7.2 fingerprints). Rider
  for W4 with the investigation screen.
- **Plan with no AI budget row for the month fails closed** (0 steps, `stop_reason = budget`), consistent with the ask
  ruling. Founder-visible (money): every tenant needs a `platform.llm_budget` row per month; checked for hosted tenants at
  the W3 close.
- **Investigation `steps_done` / `max_steps`** are operational counters, not book figures; W4 renders them as plain
  progress ("step 2 of 7") and the T-064 number gate exempts named counters explicitly.
- **DecisionModel without logprobs (dm-1, live finding):** neither approved Gemini router model returns logprobs. The DM
  retries once without them and returns band `unscored`; only `route.intent` may use an unscored answer (all paths fail
  safe); `map.columns` and others abstain. ADR-014 §3.4 DM row is ≤ 2 calls. An unscored `investigate` may fan out (≤ 4
  read-only branches) — bounded by the run and monthly caps; founder informed.

### 11 Oct 2026 · W3 close review rulings (orchestrator)
- **Investigation visibility is per viewer, not just per scope:** a checklist item whose verdict templates the viewer
  cannot open (e.g. advisor-level `finance.margin_bridge`) is shown as `restricted` — no verdict, no narration — in the
  view, list and SSE. 0020's scope-only RLS stays; the redaction is in core-api.
- **Wiki and conversations are not for staff** (403) until W4 decides per-outlet wiki pages and message masking;
  managers and above read them. Customer message bodies stay unmasked for managers (they handle complaints).
- **The daily brief is served only to owner, advisor and judge** (W4 read route rider): its ordering uses owner-level
  impacts and its texts span outlets.
- **Intel must post AI spend** (after every model call, including the DecisionModel's and every fan-out branch's) so the
  monthly cap actually decrements — it never did in W3 (R-E 1-C). Founder informed.
- **Live model calls get a timeout** per role; on timeout the call fails like any provider error (abstain/template).

### 12 Oct 2026 · Hosted dev project at the W3 close; W3 paused
- Hosted Supabase migrated 18 → 26 (pre-checks clean); four `-w3` demo businesses seeded alongside the old seven with R47
  demo values and operator-approved October budgets; answer keys 65/65. Our own stale 11 Oct stack on 8797 was stopped
  first (`make down`) — the founder's project on 8787 untouched.
- Findings carried: core-api dies on an unhandled `pg` client error under load against the hosted pooler (sev 2); two
  transient first-pass verify values (RG-K2, RG-G7); worldgen budget draft id collides on a second tagged run.
- **W3 is closed and the build is paused by founder instruction.** Resume point: `docs/plan/HANDOFF-W3.md`.

## 12 Oct 2026 · Munim Cares M-D review rulings (orchestrator)

- **M-D lane loss.** The 0028 migrator lane ended on an API access error (`oauth_org_not_allowed`, transient — Sonnet and Opus
  probes succeeded minutes later) before reporting. The orchestrator ran its gates (db 444/444; red-proofs 0024–0028 exit 0) and
  an Opus review stood in for the missing deviation list (9 deviations, 8 accepted, snapshot publish on a proposed draft not).
- **Review of 0028 + T-095c: no sev-1, 7 sev-2** (unit mixing in the hand-over binding; batch UPDATE via the receive derivation;
  publish/enable on an unapproved config draft; staff close without hand-over; hand-over on a withdrawn listing; the network
  aggregate mintable into a tenant `evidence.snapshot`; the 4 new movement kinds missing from contracts). 0028 is unapplied
  outside test DBs, so it is fixed in place (fix lane fx-md), contracts in fx-95c.
- **Rulings:** `handed_at` is stamped by core (a client time selects the recipe version); the market response carries
  `city_code` and `pickup_on`.
- **Hard rule 5 — synthetic label (reviewer's sev-4):** in this build all data is synthetic, so every Cares impact figure, public
  or member, shows "Measured on synthetic data" and "to simulated recipients" **unconditionally**; `all_synthetic` / `is_demo` do
  not gate the label. A real-data deployment is a founder decision for later.
- **Disk.** The scratch folder filled the disk (29 GB of finished lanes' repo copies; one rsync failed with ENOSPC). Deleted the
  finished copies (24 GB); lanes now rsync with `--exclude /scratchpad --exclude .venv` and delete their copy when done.
- **fx-md + fx-95c (fix cycle 1) closed the 7 sev-2 and the DB sev-3 items** in 0028 (in place, unapplied outside tests): base-unit
  hand-over/receive bindings; receive → batch insert-only with no MRP/supplier/GRN; publish/enablement bound at commit to a config
  draft applied in the same transaction (DEFERRABLE constraint trigger); close only with a recorded hand-over in the transaction;
  hand-over only on a published donation or allocated offer (re-read under the lock); network impact never minted into tenant
  evidence (DB `op` CTE + `platform/snapshots.ts` 404); received claims bound to the accepted allocation and handed qty; outcome no
  longer a status oracle; actor columns = `app.member_id` (MB005); cooked lines only by the owner's own command; accepted allocation
  needs a published offer; network listings need an active recipient. Contracts: the 4 movement kinds, reason-code/name/portion
  limits, `handed_at` removed (core stamps it), market `city_code`/`pickup_on`. Gates: db 451, red-proof 0028 77/77 (76 plants),
  0017–0027 PASS, core-api 947, contracts 249.
- **Ruling — `inventory.transfer_in → core.batch` gains `o.id IS NULL` (0028 updates 0022's rule row):** a tightening of an applied
  derivation binding, escalation class "non-additive". Accepted by the orchestrator as a guarantee fix, not a founder question: it
  only refuses a batch UPDATE under a posting rule that no code path performs (its sole writer, core-api `destinationBatch`, inserts);
  `inventory.batch.update.v1` stays an own-command path. Backed out by removing 0028's guarded UPDATE and the JSON line.

## 13 Oct 2026 · Cares build, T-099, integration kit — wave close rulings (orchestrator)

- **Shipped (committed before the review, for durability after one lane was lost to an API error):** b46f07f T-099 storefront
  completeness (0029), daeeec1 T-095a/b/d Munim Cares, e2756b3 + be60be5 integration, 974b252 K1–K4 site / mock / kit docs / SDK.
  Combined tree green: db 461, core-api 1014, intel 859, contracts 257, site 99, worldgen 70, core-worker 38, core-domain 137.
- **Wave review (Opus): no sev-1, 2 sev-2, 16 sev-3, 1 founder question.** Fix lanes fx-w1 (core) and fx-w2 (site/kit).
- **2-A (storefront place replay):** a replay must return the stored order before any availability re-check (window full, outlet
  paused, item off sale) — the kit, the SDK README and the mock already promise this; core did not (pre-existing since T-032).
- **2-B ruling — B2B offer hand-overs are all-or-nothing and final in v1:** an offer's hand-over must equal the accepted quantity
  of every line and cannot be voided (donations keep partial hand-overs and voids). This removes the stranded-claim states (void
  after a completing hand-over; partial hand-over then receive). Known v1 limitation, documented: an accepted offer the offerer
  never hands over has no exit for either side (needs a later "release allocation" command).
- **Accepted without a ruling change:** pack v4 edited in place (`pay_at_counter_methods`) — v4 was never seeded on the hosted DB
  (`.run/` logs show no v4 seed); a DB that already holds a different v4 must move to v5. `pickup_time_outside_window` refuses a
  promise outside its chosen window, which earlier builds accepted — listed in the kit changelog under the v1 freeze. G-14 is
  closed by a `tz` field on public Cares listings, not by the doc workaround (AU businesses can span zones).
- **Founder question (hard rule 1):** the site loads three open-source OFL fonts (Fraunces, Inter, JetBrains Mono) via
  next/font. Fonts are not art or sprite packs; asked the founder whether they count as "original assets".
- **Fix cycle 1 closed (fx-w1 core, fx-w2 site/kit).** 2-A: a used idempotency key replays the stored order before any
  availability check (capacity-1 gate; also fixed a pre-existing 500 when a retry re-minted the guest envelope). 2-B: offer
  hand-overs all-or-nothing (`handover_must_be_complete`) and final (`offer_handover_final`), enforced in core-api (no DB
  backstop — it would need a migration; donations unchanged). `tz` on public Cares listings (required). Limiter: per-IP bucket
  ahead of (IP, key), oldest-first eviction. `pricedPack` returns null rates ("cannot verify") instead of the tenant's current
  pack — **ruling: `prices_include_tax` on placed/viewed storefront orders widens to `boolean | null`** (null = cannot verify;
  clause 2 outranks the frozen shape; changelog row). Preview prices in one REPEATABLE READ snapshot. Red-proofs for the 0029
  definer filters; `redproof-cares.sh` copy-first. Site: serves public.json as generated (StreamEvent page), honest copy
  (country fixed at onboarding; Cares "Built · screens in progress"; illustration uses listings the system accepts), mock caps
  + scoped reset + `X-Mock-Force-429` + `tz`. Gates: core-api 1020, db 461 + red-proofs 0017–0029, contracts 257, intel 859,
  site 111, check-refs OK.
- **Founder ruling (13 Oct, hard rule 1): open-source OFL fonts are fine** (Fraunces, Inter, JetBrains Mono on the site); fonts
  are not art or sprite packs. Binds the Cup copy too.

## 13 Oct 2026 — W4-spine: the demo screens (R50)

- **Founder ruling (R50):** a third-party site's frontend was proposed for reuse and refused under hard rules 1 and 4 and R13
  (Snacky Shack stays ideas only). Screens are written fresh; open-source libraries only as npm dependencies (none added except
  `@playwright/test`; no headless-UI kit, no icon pack — glyphs drawn fresh). Scope = demo spine; one store (Spice Route); AI in
  recorded mode only. Cup T&C re-snapshot 13 Oct: only the roster line changed (14 Oct); the T&C names no launch date and is silent
  on libraries. The founder confirmed the Cup launched on or before 9 Oct (first commit 9 Oct 13:51 IST).
- **Wave A (committed):** e02d7dc R50 + board; 1f0b9d7 T-100a Cares seed for restaurant_group (operator-approved city, 3 simulated
  recipients, enablement; RG-CA1 near-expiry curd plant; one handed-over and one published donation; a B2B offer; published network
  impact); 382aadf T-060 `packages/ui` + apps/web foundation + e2e.
- **Wave B:** T-061 POS, T-062 KDS, T-063 Spice Route storefront, T-064 console (home/brief, inbox, draft approval, Ask), T-100
  Cares console (spec `docs/plan/screens/cares.md` written first). Shared dev backend `make up LOCAL_DB=1` on :8790 (never 8787).
- **Wave review (2 × Opus: guarantee/security; spec/visual): no sev-1 in code; findings fixed in one cycle:**
  - Security (dev): the orchestrator's own proxy fix (Origin vs Host) admitted DNS rebinding → owner-signed approvals via
    `/dev/sign-in`. Fixed with an explicit allow-list (`apps/web/lib/origins.ts`): production = `MUNIM_WEB_ORIGINS` only (unset →
    every write refused); dev = localhost/127.0.0.1/[::1]; dev sign-in mints only on POST and only on a local Host; `next dev -H
    127.0.0.1` (it bound 0.0.0.0); `Origin: null` → 403; public paths (`/v1/storefront/**`, `/v1/cares-network/**`) never carry
    member credentials.
  - Clause 2: refused previews rendered core's zeroed totals ("Total ₹0.00") on POS and storefront → hidden on refusal; the
    storefront Cares meals figure was floored client-side with an unchecked raw ref → ref-verified chips (meals + weight) opening
    the public snapshot rows. New cross-surface gate `apps/web/test/amount-arithmetic.test.ts` (template literals, Number()
    wrappers, aliases, Math.*), red-proved.
  - Hard rule 5: own B2B offer prices lacked "Recorded, never processed" (and a test asserted its absence) → fixed. Demo worlds are
    now provisioned by the operator with `is_demo = true` (worldgen `kit.onboard`; no core change), so the "Sample data" badge shows;
    the no-operator path warns loudly. Consequence: a world's tenant id derives from (seed, world) — reseed into a fresh DB or a new
    `--seed`.
  - Also fixed: live pill stuck "Reconnecting…" for roles core will not stream the inbox to; Ask switched AI off on any 503 (a
    recorded-fixture miss) → only `model_blocked`; suggestions are now recorded router questions; "basis points" after a percent in 5
    intel detector templates (+ a template gate); raw enums on POS/KDS; KDS late-colour e2e red-proved; storefront tap targets
    ≥ 48 px, no IN/UTC fallbacks, refusal copy from the contracts map; Cares withdraw confirm, impact minted once per scope/window.
- **Deferred (recorded):** a member route for the caller's own id/name/outlet ids (`GET /v1/me`) — managers' console reads as
  owner-less (email greeting, scope "All outlets"); an API contract addition → founder. Ingredient names for members; B2B claim/
  hand-over UI (no read returns the buyer's ids); Cares SSE topics; storefront theming read route; KDS amber edge up to 10 s late
  (no event). The e2e specs write to the dev world (orders, listings, decided drafts): reseed a fresh DB before recording.
- **Re-verification on the final world (advisor):** the T-100a rider changed onboarding after the screen lanes' last runs, so all
  seven e2e specs were re-run against a fresh operator-provisioned world: t060 4, t061 6, t062 8, t063 19, t064-console 10,
  t064-decide 8 (+1 skip), t100 8 (+1 skip) — all green. t062 had hard-coded old-world uuids (now read from the API, red-proved);
  t064-decide picked a draft type the new world no longer proposes (now picks by shape). `make check: ok` 8/8 on ed1243c.
- **Carried (not founder decisions):** worldgen mirrors per-country defaults (zones, aggregators, own channels) because no owner
  route exposes the pack (rule 7 tension, tooling only); real-backend reject not exercised on the new world (no spare draft); the
  Cares "drafts waiting" e2e skips when the inbox holds no Cares draft; a manager's `GET /v1/outlets` lists every outlet (devices
  and inbox are scoped) — check when `/v1/me` lands.
- **Founder answers (R51):** live Gemini + recorded backup; add `GET /v1/me`; clean-up before the split; no split until asked.

## 13 Oct 2026 — W4-spine reverted (R52)

- The founder rejected the restaurant frontend and asked for a revert and a re-plan. Reverted by one commit (history kept, so it is
  recoverable): apps/web to the pre-wave placeholder; packages/ui, e2e/, docs/plan/screens/cares.md removed; pnpm-lock.yaml
  restored. Kept: T-100a Cares seed + demo-world provisioning, T-101 intel wording, Makefile web-port/host fix, site scan fix.
  The T-102 `/v1/me` lane was stopped mid-work; its changes are parked in `git stash` (not committed). After the revert:
  `make typecheck` ok (13 packages), `make boundaries` ok, apps/web test 1/1.

## 14 Oct 2026 — Owner-screens handoff pack, T-102 `/v1/me`, SDK 0.2.0 (R53)

- **T-102 `/v1/me`** resumed from the stash (source files only; the stash's `apps/web`/`e2e` parts were not restored).
  Tenancy tests 26/26, red-proved; `make check` ok 8/8 (the intel-redproof stage prints its planted failures by design).
  Local core-api restarted on 8790; `/v1/me` live (owner `*`, manager one outlet).
- **SDK 0.2.0** ships as `munim-sdk-0.2.0.tgz`; `munim-sdk.tgz` (0.1.0) kept byte-identical because the teammate's
  lockfile pins its sha512 (checked equal). Site deployed by the founder's word; both files verified live by sha256.
- **Owner-screens pack** (`docs/handoff/owner-screens/`, 11 files) for the teammate's Cobnut Bakehouse repo: phase 1
  (README, rules, client, design, mock), three parallel screen lanes (counter + kitchen, owner home + Ask, Cares +
  suppliers), integration (one draft-decision module and bar, per-type role gate from `core.command_authority`),
  page components for Cares/Suppliers, one adversarial review (no sev 1; five sev 2, ten sev 3, two sev 4) and one
  fix cycle. Guarantee scan (review): clause 1 clean on the real API (every write is a person's command or a named
  approval through one gate; the outlet-scope gap that showed a button core refuses is fixed); clause 2 clean (AI
  numbers render only through source chips, "Cannot verify" otherwise, no server/model message shown); the mock's
  per-viewer leaks were fixed.
- **Evidence (final run, fix lane):** 68 blocks extracted onto a fresh copy of the teammate's repo, 0 differing
  duplicates; tsc 0 (bad import red-proof exit 2); eslint 0; vitest 34 (copy plant fails 3); `next build` 0 with all 15
  `/staff` routes; staff + storefront smokes ok; served 67 / fixtures 111 parsed with the contract's strict schemas
  (plants fail); lane flows 48 + 57 ok; six new checks red-proved; headless render ok; staff smoke ok against the
  real core-api (local IdP), Ask not run, nothing approved.
- **Finding overturned:** "quote prices never trace" (phase 1) was false — the negotiation review drafts both PO
  quantity and price as `purchasing.quote_compare` cells (`negotiate/review.py`). POs can be approved as proposed.
- **Open for the founder:** 26 contract questions in the pack's 00 §7 (CORS for member routes; where the real backend
  runs; till shift close; staff receive-only view; negotiation-run scope; SDK on a vercel.app URL vs hard rule 2 for a
  Cup repo; a tenant-free inbox topic; …).

## 15 Oct 2026 — Cobnut sync check; R54 production-and-split plan

- **Cobnut at 0382306** (12 commits, one author, first commit 14 Oct 00:25 IST) was built from the pre-integration
  owner-screens pack, on SDK 0.1.0 with `/v1/me` typed by hand. On a scratch copy: lockfile unchanged, tsc 0, eslint 0,
  vitest 47/47, `next build` 0 with 15 `/staff` routes, storefront smoke ok (12), staff smoke ok (28) on the mock and
  ok (28) against the real core-api (it approves nothing; it leaves one paid order in `preparing` on the local dev DB).
- **Red-proofs:** manager on a Cares draft → no Approve, mock 403 (pass). Two-outlet draft gate not testable (no such
  seed) and absent in code (S2-3 not fixed). Approve-with-edits rewrites the mock draft's payload (S2-4b not fixed).
- **Live site** (read-only): on HEAD; consistent Cobnut look; counter staff never see Approve. Every owner-home Source
  drawer shows "Cannot verify" on Vercel: the pack's mock keeps minted snapshots in memory per instance (03 §2), so the
  open lands on another instance. Phone: Suppliers 180px too wide at 390; Source tags and the Mock pill under 48px.
- **Guarantee scan:** clause 1 — every decision is a person's tap with their name shown; the missing gates offer
  buttons core refuses (UI faults, not breaches). Clause 2 — AI numbers render only through source chips, no
  client-side money arithmetic, no raw HTML; gaps: recipient badge missing in the drawer, Cares/PO drafts in the inbox
  missing their simulated/recorded lines.
- **History scan** (7 shallow commits at the time): no tokens, keys, `.env` or forbidden words; `sfk_` only the public
  mock keys. The full 12 are rescanned at import (plan phase 1).
- **R54** recorded; plan in `docs/plan/05-production-and-split.md`. Nothing imported or changed in code yet.

## 15 Oct 2026 (afternoon) — resumed session: T-112, T-113 committed; founder answers

- **Committed:** T-113 (1f5c385, deploy adapter) and T-112 (714134d, apps/web final pack + production mode) after
  `make check` 8/8 on the tree (lint, typecheck, boundaries, test — core-api 1026/1026, intel 863 — boundaries-redproof
  11/11, intel-redproof all fired, smoke 4/4, smoke-redproof 6/6). Lane A's walk re-run to completion: 72/72, 4 people ×
  1280/390, zero console errors, no overflow; without `MUNIM_MOCK` the mock and demo-session routes answer 404.
- **Founder: hosted operator for Cobnut = the synthetic seed operator** (`worldgen-cobnut-operator`), as the other hosted
  worlds. Hosted DB (read-only probe through packages/config): migration 26, 11 non-demo synthetic tenants, 4 synthetic
  operators, no Cobnut.
- **Founder: Vercel layout stays R55** — the Munim backend (core-api + intel + suppliers-sim) in one project
  (munim-api), the web app in another (munim-cobnut). FACT (Vercel docs, Services + config reference): services in one
  project share its environment variables; there is no per-service env. So intel's process env holds the run-token
  private key and DB role passwords it never reads. **The founder accepted this** over a third project: R25 / rule 15
  hold in code (intel has no DB client — `make boundaries`; it verifies with the public key only), not by process
  isolation, on the standalone deploy. Every later guarantee scan states it. The Cup fork (GCP) is not bound by this.
- **Incident:** the embedded Postgres behind the old local backend on :8790 was stopped by mistake (taken for an orphan
  test DB). Throwaway dev data; data dir kept; not restored.
- Lanes C (T-114: negotiation trigger, Cobnut recorded fixtures, compliance outlet) and D (T-115: migration 0030,
  display order) re-launched from 714134d.
