# Screens — route inventory, global chrome, standing data rules (D-2)

**Purpose.** The single index of every `web` route and the rules every screen spec in this folder obeys.
**Depends on:** ledger R4, R8, R15, R16, R21, R26–R30, R34; `01-pdr.md` §3–§4; `03-architecture.md` §1.7–§1.9,
§9; `02-schema.md`; `packages/contracts/src/{routes,reason-codes,public}.ts`; R4 §E. Copy in "double quotes"
is literal (i18n source text, English). `FACT` = sourced; `INFERENCE` = design reasoning.

## 1 · Route inventory (`apps/web`, one Next.js app, five segments — 03-arch §1.1)

| Route | Screen | Who | Spec |
|---|---|---|---|
| `/pos` (tender + receipt are panels: `/pos?order=[id]`) · `/pos/tables` · `/pos/refund/[id]` | counter sale, tender, receipt, tables, void/refund | staff, manager, owner | `pos.md` |
| `/kds` · `/kds/prep` | ticket board (stations), prep list | staff, manager | `kds.md` |
| `/order/[key]` · `/order/[key]/checkout` · `/order/[key]/t/[order]` · `/order/[key]/table/[ref]` | storefront menu, checkout, tracker, table QR | customer (guest or account) | `storefront.md` |
| `/console` · `/console/inbox` · `/console/inbox/[draft]` · `/console/ask` · `/console/wiki/[page]` | home (brief + inbox), draft detail, ask, wiki | owner, manager, advisor (read), judge | `console-home-inbox-ask.md` |
| `/console/d/{catalogue,kitchen,inventory,finance,people,customers,compliance,market}` | 8 dashboards | owner, manager (scoped), advisor (read) | `dashboards.md` |
| `/console/office` · `/console/office/{org,sheets,log/[run],agent/[pack]}` | pixel office + ops console | owner, manager, judge | `back-office.md` |
| `/console/ops/{counts,waste,roster,cash,checklists,temps,handover}` | daily ops | manager, staff (subset) | `manager-staff-ops.md` |
| `/console/settings/{business,outlets,members,devices,storefront,menu}` | settings incl. menu editor | owner (manager: own outlet hours, sold-out) | `onboarding-import.md` §C |
| `/onboarding/{1..4}` | sign-up → first sale (5th screen is `/pos`) | new owner | `onboarding-import.md` |
| `/import` · `/import/[run]` | import wizard, preview | owner, manager | `onboarding-import.md` |
| `/admin/{tenants,packs,plans,flags,budgets,models,drafts}` | platform admin | operator | `platform-admin.md` |

## 2 · Global chrome

```
┌ [logo] Business ▾ [Group | Outlet ▾]   "Sample data" badge?   (•) live   [Inbox 3] [Ask] [Meena ▾] ┐
│ nav: Home · Dashboards ▾ · Office · Ops ▾ · Back office ▾ · Settings                                │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Scope switch** (`chrome.scope.*`): "All outlets" or one outlet; managers see only their `membership.outlet_ids`.
  Every query and snapshot request carries the scope; numbers re-render on switch.
- **Demo badge** (`chrome.demo.*`): when `tenant.is_demo` — "Sample data — synthetic, for demonstration". Judge
  sessions show the member name, e.g. "Judge 7f3a (demo)" (R27).
- **Live pill** (`chrome.live.*`): green dot when the SSE stream is open; "Reconnecting…" when it drops.
- **Inbox badge** = length of the `/v1/inbox` list the client holds (see gap note in §5); opens that list.
- **AI-off** (`intel.enabled = false`): Ask, Office and agent panels are *removed from nav*, not errored (03-arch §9).
- POS, KDS and storefront have their own minimal chrome (spec'd in their files). Tablet rule for all
  staff surfaces: **tap targets ≥ 48 px, input font ≥ 16 px** (CLAUDE.md gotcha 18).

## 3 · Standard states (every screen lists these IDs; files add only deviations)

| ID | When | Copy (`common.state.*`) — in screen files, `std` = this copy; `n/a` = the state cannot occur, with why |
|---|---|---|
| `S-load` | first fetch | skeleton rows; no spinner text; never a placeholder number |
| `S-empty` | 0 rows | per screen (literal copy given in each file) |
| `S-err` | 5xx / unknown | "Something went wrong. Nothing was changed." + "Try again" (core-composed `error.message`, never model text) |
| `S-off` | network lost | "No connection. Nothing was saved." + "Retry" — a retry resends the **same** idempotency key (03-arch §1.6). No offline queue (PDR §5). |
| `S-sse` | stream dropped | pill "Reconnecting…"; on reconnect, replay via `Last-Event-ID`; lists refresh silently |
| `S-deny` | 403 from `command_authority` | "You don't have permission to do this. Ask an owner or manager." Buttons the member cannot use are hidden, not greyed, when the authority row is known client-side |
| `S-abst` | envelope `abstained` | "Cannot verify: …" from §4, plus "What was checked" listing the refs it tried |
| `S-aioff` | intel disabled / down / budget hard cap | AI panel hidden; brief falls back to the rules-only template (04 §5). Never an error |
| `S-404` | bad storefront key or signed link | generic not-found page (gotcha 16): "This link isn't valid." |

Draft-only states (`approval.md`): `D-stale` "This proposal is out of date: the numbers it relied on have
changed." · `D-done` "Already decided by {name} at {time}." · `D-fail` "Approved, but it could not be applied.
Nothing was changed." · `D-exec` "Applying…".

## 4 · Reason codes → refusal copy (core composes; intel never writes it — 03-arch §1.7)

| `reason_code` (contracts) | i18n key | Copy |
|---|---|---|
| `number_grammar` | `abstain.number_grammar` | "Cannot verify: the answer contained a number that does not come from your records." |
| `unresolved_ref` | `abstain.unresolved_ref` | "Cannot verify: a source it cited could not be found." |
| `cross_tenant_ref` | `abstain.cross_tenant_ref` | "Cannot verify: a source it cited is outside this business." |
| `quote_mismatch` | `abstain.quote_mismatch` | "Cannot verify: a quotation does not match its source." |
| `missing_ref` | `abstain.missing_ref` | "Cannot verify: a statement had no source." |
| `settlements_missing` | `abstain.settlements_missing` | "Cannot verify: settlements for this period are missing." |
| `recipe_missing` | `abstain.recipe_missing` | "Cannot verify: this item has no recipe." |
D-1 pack specs add NEW codes (e.g. `cost_price_missing`, `ticket_times_missing`, `forecast_stale`); the pack
file owns their copy. Refusals these specs need that have **no code anywhere** are marked `reason_code TBD`.

## 5 · Standing data rules (R15, R26)

1. **Row number** — a record's own field (order total, tender, timer, movement qty). Spec notation:
   `row core.<table>.<column>`. One tap opens the record (`common.open_row`).
2. **Snapshot number** — anything intel says and every aggregate (sum, count, ratio, P&L, ₹ found). Spec
   notation: `snap <pack>.<name>` + `pending D-1` until `docs/plan/packs/` names it. Rendered from
   `⟨snap:ID·row·col⟩`; tapping opens `GET /v1/snapshots/{id}` in the **Rows drawer** (`common.rows_drawer`:
   "Source rows", template id, minted time, row count, sha prefix).
3. Unresolvable ref → the number is replaced by "cannot verify" (lower case, inline) — never a guess.
4. **Draft numbers** show the proposed value with its ref chip beside it; a person's edit shows
   "Typed by {name}" and the diff (`approval.md`).
5. Formatting (currency, separators, dates, zones) comes from the tenant's country pack — no hard-coded
   symbol or digit grouping in copy. Copy below writes `{money}`, `{qty}`, `{time}`.
6. **Simulation labels:** every name, card, bubble, chart series, wiki page and quote of a `supplier.kind = simulated`
   row (all suppliers in seeded worlds) carries "Simulated supplier" (R7, rule 12). A merchant's own real suppliers do not.
   Every tender screen says "Recorded only — Munim does not process payments." (R4).
7. **Nothing auto-applies (R16)** — prep lists and roster drafts included. Every draft shows the full
   payload, Approve / Edit / Reject, and Reject requires a reason (1–500 chars, contracts `drafts.reject.v1`).
8. **Count badges** (inbox, late tickets) equal the number of rows on screen; they are list lengths, not
   aggregates of money. `INFERENCE` — R26 does not say this; flagged for ratification.

## 6 · Route-naming convention in these specs

Routes named in 03-arch §1.9 / `contracts/src/routes.ts` are written plainly (`POST /v1/orders`). Every
other call names its **command type** from `contracts/src/commands` (or a proposed one, marked *proposed*)
and says `route not fixed — T-0xx` (the owning ticket). Each such call is a gap in the D-2 report.

## 7 · Gap index (ids used inline; owner ticket in brackets)

| Id | Gap |
|---|---|
| G-POS-1 | Pre-commit cart/checkout total: R26 covers rows and snapshots, not a server price preview. Need a pricing-preview route [T-022/T-032] or a ruling that only the committed order shows a total. |
| G-POS-2 | Tender "Remaining"/"Change" is arithmetic over rows; needs a ruling (row-derived display vs snapshot) [ledger]. |
| G-POS-3 | No SSE topic for POS (tables, QR orders arriving); only `kds:<outlet>` exists [T-006]. |
| G-CAT-1 | No per-outlet sold-out column in 02-schema §2.3 [M-B / T-021]. |
| G-KDS-1 | No outlet default prep time column (scheduled-ticket surfacing, "Ready in about") [T-023]. |
| G-KDS-2 | `kitchen.prep_list.create.v1` not in `DRAFTABLE`; no prep-list table [T-002/T-023]. |
| G-SF-1 | No column for cancel/reschedule window length [T-032]. |
| G-SF-2 | R4 §E 9 needs a non-email status channel; none chosen (WhatsApp banned, R5) [founder]. |
| G-SF-3 | Customer-facing aggregates (loyalty balance): customers cannot open snapshots [ledger]. |
| G-CON-1 | Who mints dashboard snapshots outside an intel run? §1.7 mints only via `/internal/intel/v1/snapshots` [T-040/T-065]. |
| G-CON-2 | No pack owns sales/order-count templates (home "Today" strip) [D-1]. |
| G-FIN-1 | Finance drafts (dispute, journal adjust, period close) not in `DRAFTABLE` [T-002/T-026]. |
| G-PPL-1 | `people.roster.create.v1` not in `DRAFTABLE` [T-002/T-027]. |
| G-OFF-1 | No list route for runs (office run picker); only `/v1/runs/{id}` and `?finding=` [T-040]. |
| G-OFF-2 | `intel.outcome` / `intel.answer` are not allowed numeric sources; track record and abstention rate need core-sourced templates or an allow-list change [M-C/ledger]. |
| G-ONB-1 | No member/self-serve provisioning route; only operator `/platform/v1/tenants:provision` [T-020]. |
| G-IMP-1 | Staged-rows total has no template or column (`imports.run_preview`) [M-C/T-030]. |
| G-IMP-2 | Approving an import whose totals mismatch: allowed with reason, or refused? [ledger]. |
| G-IMP-3 | No import routes named [T-030]; import-run and mapping command types not in `DRAFTABLE`. |
| G-IMP-4 | No batch catalogue draft type for menu-photo import [T-056/T-021]. |
| G-ADM-1 | Platform routes beyond `tenants:provision` not named [T-031]. |
| G-ADM-2 | Operator aggregates (`llm_budget.spent_minor`) have no snapshot mechanism [T-031]. |
| G-ADM-3 | Config drafts have no `based_on`, so staleness is undefined [T-031]. |
| G-OPS-1 | No temperature range columns on `asset`/`temp_log` [M-B/T-029]. |
| G-SHOP-1 | Selling stock whose only batches are expired: refuse or allow? T-024 defines FEFO only [T-024]. |
| G-OFF-3 | No trace kind for a deal-review verdict; `tool_result` with a `fail:<code>` label is our convention [T-042/T-055]. |
| G-S1-1 | No `/v1` route for a person to start a negotiation ("Get quotes") [T-053/T-055]. |
