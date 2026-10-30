# Back office — `/console/office` (pixel office over the full operations console)

**Ticket:** T-066 (UI), T-042 (traces), T-040 (`/v1/runs`, `/v1/traces`). **i18n prefix:** `console.office.*`.
**Who:** owner, manager, judge (advisor: console tabs only). **Spec:** design spec §9, ledger R8.
**Input is only `intel.trace_event`** (03-arch §1.8) via `GET /v1/traces/{run}` + `trace:<run>` SSE.
**Nothing is staged:** with no runs the office is empty. Art is fresh, provenance-logged (D-3 `docs/plan/art/`);
under the cut ladder the office falls back to the console tabs (B2–B5) and traces stay real.
Trace payloads carry ids and short labels only — **no raw model or untrusted text appears anywhere here.**
Whole surface hidden under `S-aioff` (nav entry removed). Reference repos were read for ideas only (R4 §A).

## B1 · Pixel office — `/console/office`

Purpose: watch or replay exactly what the agents did, drawn as an office. Heading: "Back office"

```
┌ Back office · run: "Why was this week bad?" 10:42 ▾   [▶ Live] [⏮ Replay] [1× ▾]  [Console view] ┐
│  ┌Reception┐   ┌Catalogue┐ ┌Kitchen┐ ┌Purchasing┐ ┌Finance┐       ┌ Shared board (graph) ┐      │
│  │ Router ◉│   │  ☺ ...  │ │  ☺    │ │  ☺ ⇄ ☐☐☐ │ │  ☺ !  │       │ nodes touched: ●●●   │      │
│  └─────────┘   └─────────┘ └───────┘ └──────────┘ └───────┘       └──────────────────────┘      │
│                ┌People┐ ┌Customers┐ ┌Compliance┐ ┌Market┐     ┌ Owner's desk ─────────┐           │
│                │  ☺   │ │   ☺     │ │   ☺      │ │  ☺   │     │ [≡] Draft: PO · Review│           │
│  Supplier desks (☐☐☐): each "Simulated supplier"              └───────────────────────┘           │
│  Timeline ─●────●──●●●──●──────●──  seq 1…{n}                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Trace kind → what is drawn (our mapping; one animation per kind, no other states exist):
| `kind` | Animation | Bubble copy (`console.office.bubble.*`) |
|---|---|---|
| `route` | router turns to a desk, arrow | "Routing to {pack}" |
| `skill_load` | desk lamp on | "Reading {pack} notes" |
| `subagent_start` / `subagent_end` | specialist sits / stands | "On it" / "Done" |
| `tool_call` / `tool_result` | typing / paper appears | "Checking {template}" (label = template id) |
| `a2a_send` / `a2a_receive` | walks to supplier desk / returns | "Asking Simulated supplier {name}" / "Quote received" |
| `finding` | pins a card on the shared board | "Found something" |
| `draft` | walks to the owner's desk, drops paper | "Needs your approval" (tap → draft detail) |
| `abstain` | holds up a sign | "Cannot verify" (tap → reason via README §4) — only for `cannot_verify` outcomes |
| `tool_result` labelled `fail:<code>` (deal review) | stamp on that supplier desk | "Refused" (tap → reason + refs) — a refusal, not an abstention (gap G-OFF-3: label convention) |
| `error` | desk dims | "Stopped" |
- Parallel branches: `actor` (from ADK `Event.branch`) → one character per branch; fan-out shows up to four
  specialists working at once. Run picker = recent runs (`GET /v1/runs/{id}` rows; list route not fixed —
  T-040, gap G-OFF-1).
- **No numbers are drawn in the office** (bubbles are labels). Any figure lives in the linked finding/draft.
- Replay: reads by `(run_id, seq)`; speed 1×/4×; scrubber. Live: appends from SSE; on drop `S-sse`.
States: `S-off` std (replay of loaded events continues) · `S-deny` advisor → console tabs only; staff → nav entry absent · `S-abst` drawn as the abstain sign, never hidden · `S-empty` "The office is quiet. Ask a question or wait for the morning brief to see the team work." ·
`S-load` empty office, desks only · `S-sse` "Reconnecting…" (replay resumes from last seq) · `S-err` "This
run can't be shown." · reduced-motion setting → static console view (B4) with the same events.
Tablet: tap a character → side sheet with its events; targets ≥ 48 px.

## B2 · Org chart — `/console/office/org`

Purpose: who the specialists are and what each did today. Heading: "Org chart"

Router → 8 specialists (Catalogue, Kitchen, Inventory & purchasing, Finance, People, Customers, Compliance,
Market) + Forecast (a tool, drawn as a service, not a person) + 3 supplier desks labelled "Simulated
supplier". Each node: status from its latest trace ("idle" if none today), last run time (`row
intel.run.issued_at`), findings open (list length). Kitchen node hidden for store-only tenants.
`S-empty` n/a (structure is static from the pack registry).
States: `S-load` · `S-err` std · `S-off` std · `S-deny` as B1 · `S-abst` n/a (no numbers).

## B3 · Sheets — `/console/office/sheets`

Purpose: every finding, query, draft and outcome as sortable sheets. Heading: "Sheets"

Tabs "Findings" · "Queries" · "Drafts" · "Outcomes". Spreadsheet-style, sortable, filter by pack and date.
| Tab | Rows | Numbers |
|---|---|---|
| Findings | `GET /v1/findings` | impact = `finding.impact_ref` (snapshot); confidence = `row confidence_bp` |
| Queries | trace `tool_call` events with `template_id` + snapshot id | row count = `row evidence.snapshot.row_count`; tap → Rows drawer |
| Drafts | `GET /v1/inbox` + decided drafts (route not fixed — T-008) | payload numbers with ref chips; verdict, decided_by rows |
| Outcomes | outcome checks ("did margin move?") | `snap <pack>.outcome_*` pending D-1 (gap G-OFF-2: `intel.outcome` is not an allowed numeric source) |
`S-empty` per tab: "No findings yet." / "No queries yet." / "No drafts yet." / "Outcomes are checked {n} days
after a decision."
States: `S-load` · `S-err` std per tab · `S-off` std · `S-deny` as B1 · `S-abst` an impact cell whose ref no longer resolves reads "cannot verify".

## B4 · Chat log — `/console/office/log/[run]`

Purpose: one run's full event log, labels only. Heading: "Run · {time} · {trigger}"

Linear log of the run: `seq · time · actor · kind · label · refs`. Example lines (labels only):
"10:42:03 Router route → finance, inventory_purchasing" · "10:42:05 Finance tool_call finance.pnl ⟨snap⟩" ·
"10:42:11 Purchasing a2a_send → Simulated supplier Fresh Farms". Model text is **not** in the log; the final
answer/finding envelope is linked ("Open answer") and rendered by the ref renderer. Export: "Download log
(JSON)". `S-empty` "This run has no events." · `S-404` for another tenant's run (RLS → 0 rows).
States: `S-load` · `S-err` std · `S-off` std · `S-deny` as B1 · `S-abst` the `abstain` line shows its reason copy (README §4).

## B5 · Track record — `/console/office/agent/[pack]`

Purpose: the evidence about one agent's proposals and outcomes. Heading: "{pack} specialist"

Per specialist: drafts proposed / approved / edited / rejected (counts → `snap intel.agent_track_record`
pending D-1, over `core.draft` + `core.decision`), recent rejection reasons (rows, typed by people), abstention
rate (`snap intel.abstention_rate` over `intel.answer` — gap G-OFF-2), outcome checks (B3). Fixed footer:
"This agent's permissions never change. Everything it proposes still needs your approval." (R16).
`S-empty` "No track record yet."
States: `S-load` · `S-err` std · `S-off` std · `S-deny` as B1 · `S-abst` a tile whose snapshot fails reads "cannot verify".
