# Manager / staff daily ops — `/console/ops/*`

**Ticket:** T-069 (UI); modules T-022 (shift), T-024 (counts, waste), T-027 (roster), T-029 (checklists,
temps), T-030 conversations (handover). **i18n prefix:** `ops.*`. **Who:** manager (all tabs, own outlets),
staff (waste, checklists, temps, handover, own roster view). **Tablet-first:** targets ≥ 48 px (steppers
64 px), inputs ≥ 16 px, numeric keypad for quantities. A member's own entry **is** its approval (R27) — no
draft — except where intel proposes (roster), which is a draft (R16). Each screen: standard states README §3.

## M1 · Stock count — `/console/ops/counts`

Purpose: record a blind physical count; core derives the adjustments. Heading: "Stock count"

```
┌ Count · Outlet A · {date}  "Blind count — expected stock is hidden"   [Save] [Submit] ┐
│ [Dry store] [Cold room] [Bar]          search [          ]                             │
│ Paneer            [ 4.5 ] kg   ▸ batch B-12 exp {date}                                  │
│ Basmati rice      [ 25  ] kg                                                            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```
- Blind by design: no expected on-hand shown (avoids anchoring, and avoids an aggregate on screen).
- Submit → `stock_count` + lines; core derives `count_adjust` movements. Result screen: per line variance =
  `row core.stock_movement.qty_milli` (kind `count_adjust`); variance value per line and in total =
  `snap inventory.count_variance` (pending D-1) — never multiplied in the client.
- Store pack: per-batch lines for `tracked_by_batch` ingredients/SKUs.
States: `S-load` list skeleton · `S-err` std · `S-abst` n/a (no intel; the variance-value snapshot reads "cannot verify" if it fails) · `S-empty` "No items to count. Add ingredients or products first." · draft saved locally between
sessions ("Saved on this tablet — not submitted.") · `S-off` on Submit (same key) · `S-deny`.

## M2 · Waste log — `/console/ops/waste`

Purpose: log what was thrown away and why. Heading: "Waste log"

Pick item/ingredient (search ≥ 16 px or scan), qty keypad, reason ("Spoiled", "Expired", "Dropped",
"Over-prepared", "Returned by customer", "Other" + note) → `waste_log` + `waste` movement
(`row core.stock_movement.qty_milli`). Today's list below (rows). Expired batch shortcut (store): "Write off
expired batch {batch}". `S-empty` "No waste logged today." Copy after save: "Logged under your name."
States: `S-load` · `S-err` std · `S-off` std (same key) · `S-deny` std · `S-abst` n/a.

## M3 · Roster — `/console/ops/roster`

Purpose: plan the week's shifts; review a proposed roster. Heading: "Roster · week of {date}"

Week grid (people × days, shifts as blocks). Manager edits are own commands (`roster_shift`).
**Intel roster proposal = draft (R16):** banner "Proposed roster for next week — {n} changes"
[Review] → draft detail (full payload, diff vs current roster, Approve / Edit / Reject with reason).
Shift hours: rows of `roster_shift` (start/end); weekly labour % = `snap people.labour_pct`
(D-1). AU pack: no payroll links (R21). Staff view: own shifts only, read-only.
States: `S-load` grid skeleton · `S-err` std · `S-off` std · `S-deny` staff → read-only own shifts · `S-empty` "No roster for this week." + "Copy last week" · `S-abst` on the proposal: "Cannot verify: …"
and no Approve · `S-aioff` banner hidden. Draft type `people.roster.create.v1` (D-1 NEW; not yet `DRAFTABLE` — gap G-PPL-1).

## M4 · Cash close — `/console/ops/cash` (shift close; R4 §E 15)

Purpose: count the drawer, close the shift, see orders vs tenders. Heading: "Close shift"

```
┌ Close shift · POS-1 · opened 09:02 by Ravi                                         ┐
│ Opening float        {money}   ← row core.shift.float                              │
│ Counted cash  [ notes/coins keypad ]  = {money}                                    │
│ [ "Close shift" ] → Expected {money} ← row core.shift.expected_cash                │
│                     Variance {money} ← row core.shift.variance  (red if ≠ 0)       │
│ Orders vs recorded tenders: Cash / Card / UPI    ⟨snap finance.shift_tenders⟩      │
│ No-shows (pickup orders never collected): list of orders (rows)                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```
- Expected is shown **after** the count is entered (blind close). Variance reason required when ≠ 0: "Explain
  the difference" (note). Reconciliation by tender method = `snap finance.shift_tenders` (pending D-1).
- No-shows listed separately (R4 §E 15): orders `ready` past promise + grace, not completed (rows).
Copy: "Payments are recorded, not processed. Card and UPI totals come from what staff entered."
States: `S-load` · `S-empty` "No open shift on this device." · `S-err` std · `S-abst` the reconciliation snapshot reads "cannot verify" if it fails · `S-deny` (staff may close own shift only, per authority) · `S-off` (same key) · already closed →
"This shift was closed by {name} at {time}." (row view).

## M5 · Checklists — `/console/ops/checklists`

Purpose: complete today's checklists. Heading: "Checklists"

Today's checklist runs (opening, closing, hygiene) from templates (compliance pack); each item a 56 px
checkbox + optional photo + note. Submit → `checklist_run` (row). Overdue → amber "Due at {time}", red
"Missed". `S-empty` "No checklists scheduled today."
States: `S-load` · `S-err` std · `S-off` std · `S-deny` n/a (any outlet member) · `S-abst` n/a.

## M6 · Temperature log — `/console/ops/temps`

Purpose: record equipment temperatures and act on excursions. Heading: "Temperatures"

Per asset (fridge, freezer, hot-hold): reading keypad (°C), time auto, "Out of range" when outside the asset's
pack/asset limits → corrective action required ("Moved stock", "Called maintenance", "Discarded", "Other").
Row `core.temp_log`. Missed slots show "Missed — {time}" (row absence; the dashboard counts them via
`snap compliance.log_coverage`). `S-empty` "No equipment set up. Add fridges and freezers in Assets."
Gap G-OPS-1: no range columns named for `asset`/`temp_log` in 02-schema.
States: `S-load` · `S-err` std · `S-off` std · `S-deny` n/a (any outlet member) · `S-abst` n/a.

## M7 · Handover — `/console/ops/handover`

Purpose: pass notes to the next shift. Heading: "Handover"

Shift notes thread per outlet (conversation/message, operational — not books). Compose (≥ 16 px), @mention,
"Pin for next shift". Notes are untrusted text: rendered as plain text only (gotcha 15), never as links/HTML.
Intel may read them (claims extraction, quarantined) but never posts here. `S-empty` "No notes yet. Leave one
for the next shift." Route not fixed — T-030 (conversations).
States: `S-load` · `S-err` std · `S-off` "Not sent — no connection." + "Retry" · `S-deny` n/a · `S-abst` n/a.
