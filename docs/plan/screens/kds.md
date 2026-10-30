# KDS — `/kds` (kitchen display, tablet/TV, restaurants)

**Ticket:** T-062 (UI), T-023 (kitchen API). **i18n prefix:** `kds.*`. **Who:** staff, manager of the outlet.
**Device:** `core.device(kind='kds')`. Realtime: `GET /v1/stream?topics=kds:<outlet>` (fetch-SSE, 03-arch §1.9).
**Tablet:** tickets ≥ 240 px wide; action buttons ≥ 64 px (gloved/wet hands); no text inputs except the
optional reject reason (≥ 16 px). R4 §E items 11–14 are this file's contract.

## K1 · Ticket board — `/kds?station=<station>`

Purpose: every live ticket for the outlet or station, with time pressure; move tickets through legal states. Heading: "Kitchen — {outlet}"

```
┌ Outlet A · KDS  [All][Grill][Tandoor][Cold]   (•) live   Late 2   "Tap to enable sound" ┐
│ ┌ #47 ───── 06:12 ┐ ┌ #48 ── AMBER 11:40 ┐ ┌ #44 ──── RED 18:05 ┐ ┌ #50  12:30 ▸ ┐       │
│ │ Counter · Dine  │ │ QR · Table 4       │ │ Pickup · due 12:15 │ │ Scheduled    │       │
│ │ 1 Paneer tikka  │ │ 2 Dal makhani      │ │ 1 Biryani          │ │ shows 12:10  │       │
│ │  + extra cheese │ │ 1 Butter naan      │ │                    │ │              │       │
│ │ due 12:20       │ │ due 12:12          │ │ due 12:00          │ │              │       │
│ │ [ "Start" ]     │ │ [ "Ready" ]        │ │ [ "Ready" ]        │ │              │       │
│ └─────────────────┘ └────────────────────┘ └────────────────────┘ └──────────────┘       │
│ New: #51 (Pickup)   [ "Accept" ] [ "Reject" ]  ← banner repeats until acknowledged          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
Each number and its source (all **row** fields — R26):
| On screen | Source |
|---|---|
| `#47` short ticket number | `row core.order.ticket_no` (daily per outlet, outlet tz) |
| elapsed `06:12` | now − `row core.kitchen_ticket.accepted_at` (client clock, ticks each second) |
| `due 12:20` | `row core.kitchen_ticket.due_at` (= `order.promised_at` for its station), outlet tz |
| channel / table | `row core.order.kind`, `channel_id → channel.kind`, `table_ref` |
| lines, options | `row core.order_line.*` |
| "Late 2" | count of red tickets on screen (list length — README §5 rule 8) |

**Colour thresholds (the D-2 thresholds T-062 tests):**
- **Normal:** now < `due_at` − 3 min.
- **Amber** ("At risk", `kds.state.at_risk`): `due_at` − 3 min ≤ now < `due_at`.
- **Red** ("Late", `kds.state.late`): now ≥ `due_at`. Red tickets sort first; colour is never the only cue
  (label text + icon, a11y).
- **Scheduled tickets** stay in the right-hand "Later" lane and surface on the board at
  `promised_at − outlet default prep time` (gap G-KDS-1: no `default_prep_min` column on `core.outlet`).

Actions (each `kitchen.ticket.advance.v1`, route not fixed — T-023; conditional on current state via
`order_status_transition`, rule 10):
- New order banner: "Accept" (sets/confirms `promised_at`; buttons "Accept", "+5 min", "+10 min") /
  "Reject" (reason required: "Out of stock", "Too busy", "Closing", "Other" + note). Push-back changes the
  promise, re-judges deals (rule 9) and notifies the customer on `order:<id>` (R4 §E 13).
- `accepted → preparing` "Start" · `preparing → ready` "Ready" · `ready → completed` "Picked up" / "Served".
- Skip (e.g. accepted → ready) only via "Complete…" which asks "Mark #{n} complete? This is logged with your
  name." — logged in `order_event` with actor (R4 §E 11).
- Illegal transition (another device moved it first) → 409 → card flashes, toast "Already {status} on
  another screen." and the card re-renders from the row.

**New-order alert (R4 §E 14):** sound + banner + tab title "(1) New order — Munim KDS", repeating every
10 s until "Accept"/"Reject"/"Seen" is tapped. If the browser blocks audio, a full-width button "Tap to enable
sound" stays until tapped.

States: `S-err` std (board keeps the last rows, dimmed) · `S-load` (column skeletons) · `S-empty` "No tickets. New orders appear here automatically." ·
`S-sse` pill "Reconnecting…" + board dims to 60 % so staff know it may be stale; replay on reconnect ·
`S-off` on an action: "Not saved — no connection." + "Retry" (same key) · `S-deny` (e.g. reject needs
manager per authority) "Only a manager can reject orders." · cancelled while on screen → card greys,
strike-through, "Cancelled by {actor}" for 30 s then leaves. `S-abst`/`S-aioff`: n/a (no intel here; AI
prep-time proposals go to the console inbox, never onto the KDS — R16).

## K2 · Station filter

Purpose: narrow the board to one station. Heading: none (chip bar)

Chips from the outlet's stations (`kitchen_ticket.station`); "All" default; choice remembered per device
(local, not a record). Ticket counts per chip = list lengths.
States: all n/a — a client-side filter over K1's rows; K1's states apply.

## K3 · Prep list — `/kds/prep`

Purpose: today's prep quantities for the station. Heading: "Prep · Today". **A prep list is a draft until a manager approves it (R16).**
```
┌ Prep · Today {date} · Grill                     Status: "Approved by Asha at 07:40" ┐
│ Marinated paneer      {qty} kg   ⟨ref⟩    [ ] done                                  │
│ Onion masala          {qty} kg   ⟨ref⟩    [ ] done                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
- Quantities: proposed by intel as a `kitchen.prep_list.create.v1` draft (D-1 `packs/kitchen.md`, NEW command);
  each qty is a **snapshot ref** to `snap kitchen.prep_need.prep_qty_milli` (forecast − on-hand).
  A manager's edit shows "Typed by {name}".
- Not yet approved: "Today's prep list is waiting for a manager's approval." (no quantities shown to staff).
- `S-aioff`: "No prep list today." (gap G-KDS-2: `kitchen.prep_list.create.v1` is not yet in `DRAFTABLE`
  in `contracts/commands/drafts.ts`, and there is no prep-list table in 02-schema).
- "done" ticks are operational (no book change) — route not fixed — T-023.
- `S-abst` (`forecast_stale`, D-1 NEW code): "Cannot verify: there is no current forecast for {outlet} on
  {date}, so a prep list cannot be drafted." — no quantities shown, never a guess.
States: `S-load` list skeleton · `S-empty` "No prep needed today." · `S-err` std · `S-off` ticks: "Not saved — no connection." + "Retry" · `S-deny` staff cannot approve (approval lives in the console inbox).
