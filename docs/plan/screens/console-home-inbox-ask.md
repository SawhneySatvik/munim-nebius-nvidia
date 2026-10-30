# Console — home (brief + inbox), draft detail, ask, wiki

**Ticket:** T-064 (UI), T-040 (read paths), T-053 (ask), T-054 (brief + ranking), T-057 (wiki).
**i18n prefix:** `console.home.*`, `console.inbox.*`, `console.draft.*`, `console.ask.*`, `console.wiki.*`.
**Who:** owner, manager (their outlets), advisor (read-only: no Approve/Edit/Reject — hidden), judge (owner
rights in their demo tenant). Desktop + tablet; buttons ≥ 48 px; inputs ≥ 16 px. States per README §3.

## C1 · Home — `/console`

Purpose: what needs the owner's decision, what it is worth, and today so far. Heading: "Good morning, {name}"

```
┌ Good morning, Meena · Thu 10 Oct · All outlets ▾                                         ┐
│ MORNING BRIEF  "Prepared at 06:00 from your records"                    [Show what ran]   │
│ 1 ▲ Paneer price up ⟨snap⟩ at Outlet B — costs you ⟨snap⟩ a week     [Open] [Draft ▸]    │
│ 2 ▲ Swiggy ad fees you didn't approve: ⟨snap⟩ in September          [Open] [Draft ▸]    │
│ 3 ● Oil stock runs out ⟨snap⟩ before the next delivery                [Open]              │
│ INBOX (5)                                  sort: "Most valuable first"                     │
│ ▸ Price change · Paneer tikka · proposed by Catalogue · ⟨snap⟩ impact      [Review]       │
│ ▸ Purchase order · Simulated supplier "Fresh Farms" · ⟨quote⟩ total         [Review]       │
│ TODAY  Sales ⟨snap⟩ · Orders ⟨snap⟩ · Late tickets ⟨snap⟩                                 │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Brief** = latest brief run's findings (`GET /v1/findings?status=open` scoped, ranked server-side by
  impact × confidence × urgency, T-054). Each line = finding `envelope` rendered by the ref renderer; ▲/● =
  `finding.severity`; impact = `finding.impact_ref` (a snapshot cell). Header time = `row intel.run.issued_at`.
  "Show what ran" → `/console/office/log/[run]` (`GET /v1/runs?finding=…`, `GET /v1/traces/{run}`).
- **Inbox** = `GET /v1/inbox` (findings + drafts awaiting a person), live via `inbox:<tenant>` SSE. Count =
  list length (README §5 rule 8). Impact chip per draft = its finding's `impact_ref`; PO total = quote refs.
- **Today strip**: `snap orders.sales_today`, `snap orders.order_count_today` (pending D-1 — no pack owns
  sales templates, gap G-CON-2), late tickets `snap kitchen.ticket_times` (D-1). Gap G-CON-1: who mints
  dashboard snapshots without an intel run? §1.7 mints only via `/internal/intel/v1/snapshots`.
- Brief fallback when the model was unavailable: header reads "Prepared from rules only" (template text with
  refs, 04 §5) — `S-aioff` never shows an error.
States: `S-err` per panel (the others render) · `S-off` std (decision buttons disabled: "No connection.") · `S-load` · `S-empty` brief: "Nothing needs you this morning." · inbox: "Inbox zero. New proposals
appear here." · `S-sse` "Reconnecting…" · `S-abst` on a brief line → that line reads "Cannot verify: …" and
keeps its "What was checked" link · `S-deny` n/a (read) · advisor: buttons hidden, banner "Read-only access".

## C2 · Draft detail — `/console/inbox/[draft]` (full spec of the moves in `flows/approval.md`)

Purpose: decide one proposal with its full evidence. Heading: "{draft type} · {subject}"

```
┌ Price change · Paneer tikka · Outlet B         proposed by Catalogue agent · 06:02     ┐
│ WHY  "Paneer cost rose ⟨snap⟩ since ⟨snap⟩; margin is now ⟨snap⟩." [Open rows]          │
│ PAYLOAD (catalogue.price.set.v1)                                                        │
│   item        Paneer tikka                       row core.item                          │
│   outlet      Outlet B                           row core.outlet                        │
│   amount      {money}  ⟨snap:S4·0·suggested⟩     ← proposed value + ref chip            │
│   valid_from  {date}   ⟨snap:S4·0·from⟩                                                 │
│ RELIES ON  margin cell ⟨snap⟩ = {value} (re-checked at approval)                         │
│ [ "Approve" ]   [ "Edit" ]   [ "Reject" ]                                                │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
- Source: `DraftView` (`contracts/public.ts`): `payload`, `resolved_refs` (JSON Pointer → value, shown beside
  each field — R26), `evidence`, `based_on`, `status`. Draft get route not fixed — T-008 (gap).
- **Every field of the payload is shown** — no hidden fields, no "advanced" fold (rule: full payload).
- **Edit** turns proposed values into inputs; each changed field shows "Typed by {name}" and a diff line
  "was {old} ⟨ref⟩ → now {new} (typed)". "Approve edited" sends `edited_payload` (`drafts.approve.v1`).
- **Reject** opens "Why are you rejecting this?" (required, 1–500 chars; button disabled until filled).
- Supplier drafts carry "Simulated supplier" next to every supplier name and quote (rule 12).
States: `S-load` payload skeleton · `S-empty` n/a (unknown id → "This proposal no longer exists.") · `S-err` std · `S-off` std (retry resends the same key) · `D-exec`, `D-stale`, `D-done`, `D-fail` (README §3) · `S-deny` "Your role can't approve {type}
proposals. An owner can." · `S-abst` (draft whose refs no longer resolve) → payload numbers read "cannot
verify" and Approve is hidden: "This proposal can't be checked any more. Reject it with a reason."

## C3 · Ask — `/console/ask`

Purpose: ask in plain words; get a cited answer or a refusal. Heading: "Ask about your business"

```
┌ Ask about your business                                       scope: All outlets ▾ ┐
│ [ Why was this week bad?                                              ] [ "Ask" ]   │
│ ── answer (streams) ─────────────────────────────────────────────────────────────  │
│ Sales fell ⟨snap⟩ against last week ⟨cite:row⟩, mostly at Outlet B ⟨snap⟩. Paneer  │
│ cost rose ⟨snap⟩ ⟨cite:row⟩ and waste rose ⟨snap⟩… [1][2][3]                      │
│ "Checked: {n} sources · {m} specialists"   [Show what ran]   [Sources ▸]          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```
- `POST /v1/ask` → answer envelope (validated by core); trace streamed on `trace:<run>` so the office can
  animate. Each ref chip opens the **Rows drawer** (`GET /v1/snapshots/{id}`) or the document span (cite).
  "Checked: … sources · … specialists" = counts of refs / branch actors in the envelope + trace (list lengths).
- Suggested questions (when empty): "Why was this week bad?", "Which dish loses money?", "What did Swiggy
  charge me last month?" (`console.ask.suggest.*`).
States: `S-off` "No connection. Your question was not sent." · `S-deny` staff → Ask hidden (owner, manager, advisor, judge only; `INFERENCE`) · `S-empty` "Ask anything about your sales, stock, staff or money. Every number links to its source." ·
`S-load` "Checking your records…" + live specialist chips from trace events · `S-abst` "Cannot verify: …"
(README §4) + "What was checked" list — **no partial answer is shown** · `S-aioff`: Ask removed from nav;
direct URL shows "Ask is switched off for this business." · `S-err` "Something went wrong. Nothing was
changed." · intel budget soft cap: answer still renders (cheaper role); hard cap → `S-aioff`.

## C4 · Wiki — `/console/wiki/[page]`

Purpose: what Munim knows about one entity, every sentence cited. Heading: "{page title}"

Pages per entity (outlet, item, ingredient, supplier — titled "{name} · Simulated supplier" when simulated — person) compiled by intel (T-057). Every sentence has
≥ 1 ref (uncited sentences are dropped at compile); numbers are `⟨snap⟩` refs, quotes are `⟨cite:doc⟩` spans.
Header: "Compiled {time} from {n} sources" (n = refs on page). "Versions" tab lists `wiki_version` rows with
a diff (cut-ladder item: may ship as list-only). Search box (≥ 16 px) over page titles.
States: `S-load` · `S-err` std · `S-off` std (the loaded page stays) · `S-deny` page outside outlet scope → `S-404` · `S-empty` "No pages yet. Pages appear as Munim learns your business." · `S-abst` per sentence (that
sentence is replaced by "Cannot verify: …") · `S-aioff` "The wiki is paused." (last compiled pages stay
readable) · route not fixed — T-057 (gap).
