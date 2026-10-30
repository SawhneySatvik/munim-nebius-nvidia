# Story 1 — Morning brief → "why was this week bad?" → shortfall → negotiation → refusal → PO approved

**Refs:** PDR §7 S1; spec §8, §8.1, §9, §11; 04 §5–§6; 03-arch §1.7–§1.9, §5; D-1 `packs/inventory-purchasing.md`
(`inventory.shortfall`, `purchasing.quote_compare`, `purchasing.deal_inputs`, `moq_exceeds_need`).
**World:** Meena, 3 outlets (synthetic, badge "Sample data"). Every supplier is labelled "Simulated supplier".
Screens: `console-home-inbox-ask.md` C1–C3, `back-office.md` B1/B4, `flows/approval.md`.

| # | Screen | User does | API (03-arch §1.9) | User sees |
|---|---|---|---|---|
| 1 | (night) | — | `core-worker` `fanout` → intel `/brief` with a per-tenant run token; detectors mint snapshots via `/internal/intel/v1/snapshots`, write via `…/findings`, `…/drafts`; traces via `…/traces:batch` | — |
| 2 | Home C1 `/console` | opens the console at 08:00 | `GET /v1/findings?status=open`, `GET /v1/inbox`; SSE `inbox:<tenant>` | "MORNING BRIEF — Prepared at 06:00 from your records"; line 3: "Cooking oil runs out ⟨snap inventory.shortfall⟩ before the next delivery at Outlet B" |
| 3 | Rows drawer | taps the ⟨snap⟩ chip | `GET /v1/snapshots/{id}` | "Source rows · inventory.shortfall": need, on hand, open POs per ingredient — the ledger rows |
| 4 | Ask C3 `/console/ask` | types "Why was this week bad?" → "Ask" | `POST /v1/ask` (core mints a 15-min run token → intel `/ask`) ; SSE `trace:<run>` | "Checking your records…" with live chips "Finance", "Inventory & purchasing", "Catalogue", "Kitchen" |
| 5 | Office B1 `/console/office` (split view or tab) | watches | `GET /v1/traces/{run}` + `trace:<run>` | router at reception turns to four desks; ≤ 4 specialists work in parallel (ParallelAgent); pins on the shared board |
| 6 | Ask C3 | reads the answer | envelope validated by core (`…/answers`) | sentences with ⟨snap⟩/⟨cite⟩ chips only; "Checked: {n} sources · {m} specialists"; "Show what ran" |
| 6a | Ask C3 (branch) | — | validator fails (e.g. free digit) after one retry | "Cannot verify: the answer contained a number that does not come from your records." + "What was checked" — no partial answer |
| 7 | Home C1 | taps "Get quotes" on the shortfall line | person-initiated negotiation run — route not fixed (gap G-S1-1: no `/v1` route starts a negotiation; `/v1/ask` "get quotes for oil" is the interim path) | inbox row "Getting quotes from 3 simulated suppliers…" |
| 8 | Office B1 | watches | intel → suppliers-sim (A2A) RFQ ×3, ≤ 2 counter rounds; `…/quotes:batch`; traces `a2a_send/receive` | purchasing specialist walks to three desks, each "Simulated supplier"; bubbles "Asking Simulated supplier {name}" / "Quote received" |
| 9 | Office B4 log | opens "Console view" | `GET /v1/traces/{run}` | lines "Purchasing a2a_send → Simulated supplier …" (labels only, no model text) |
| 10 | Inventory dashboard strip | — | `snap purchasing.quote_compare` | three quote cards "Simulated supplier · {name}" with price, min order, payment days (all quote-row cells) |
| 11 | (deal review) | — | deterministic checks over `purchasing.quote_compare` + `purchasing.deal_inputs` | card for the discounter: **"Refused: {supplier} (Simulated supplier) requires a minimum order of {moq}, more than Outlet B can use before it expires."** with refs; office: "Refused" stamp on that supplier desk (a `cannot_verify` check would instead show the "Cannot verify" sign) |
| 12 | Inbox → draft C2 | taps "Review" on "Purchase order · Simulated supplier {name}" | draft get (route not fixed — T-008) | full `purchasing.po.create.v1` payload: qty ⟨`inventory.shortfall` cell⟩, unit price ⟨`quote_compare` cell⟩, "RELIES ON" stock + budget cells; supplier name with "Simulated supplier" |
| 13 | C2 | "Approve" | `POST /v1/drafts/{id}:approve` `{edited_payload: null}` | "Approved by Meena at {time}. Applied." → committed `core.purchase_order` row (opens in one tap) |
| 14 | Office B1 | — | SSE | paper leaves the owner's desk; Purchasing track record B5 counts one more approval (snapshot) |

**What the story proves:** cited fan-out answer (clause 2), a visible refusal by deal review, no book change
until step 13's approval by a named person (clause 1), simulated suppliers labelled on every surface.
**Copy rules:** no "savings" claim on any screen; if a difference between quotes is shown it is a
`quote_compare` cell, captioned "Simulated quotes — synthetic data".
