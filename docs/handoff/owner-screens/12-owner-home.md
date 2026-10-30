# 12 · Owner home and the approvals inbox

Read 00, 20, 01, 02 and 03 first. Everything here is **synthetic**: the bakery, its people, its figures and every
supplier and recipient. Munim's AI proposes; **nothing changes until a named person approves it**, and every number on
these screens opens the rows of the books behind it, or says "Cannot verify".

| | |
|---|---|
| Routes | `/staff/home`, `/staff/inbox`, `/staff/inbox/[draftId]` |
| Who | Owner (Nandini Mehrotra (demo), both outlets) and managers (their outlets). Judges see what an owner sees |
| New files | `lib/munim/template-words.ts`, `lib/munim/owner-figures.ts`, `components/staff/pages/inbox.tsx`, `components/staff/pages/draft-detail.tsx`, `components/staff/pages/owner-home.tsx`, three thin `page.tsx` (§7) |
| Uses | `useStaff()` (02 §3.1), `StatCard`, `SourcedValue`, `CannotVerify`, `AiSegment`, `SnapshotDrawer`, `StatusPill`, `SimulatedSupplier` (02 §4), `DraftField`, `DecisionBar`, `useDecision` (02 §5), `lib/munim/drafts.ts` (01 §6.1: the one module that decides a draft), `Ribbon` (Cobnut's `components/pages/home.tsx`), `useOnline`, `useCountdown` (Cobnut's `lib/hooks.ts`), the staff client, `refs.ts`, `commands.ts`, `staff-stream.ts`, `staff-copy.ts` (01) |

## 1 · Purpose and who uses it

- **Owner home** answers "how is this outlet doing today, and what needs me?". It shows the outlet's figures, each a
  snapshot cell with its source chip, and the first three things waiting in the inbox.
- **The inbox** lists what Munim's specialists noticed (findings) and what they propose (drafts). A finding can be
  dismissed with a reason code. A draft opens its own page.
- **The draft page** is where a named person approves, approves with their own edits, or rejects a proposal.
  Nothing on any of these screens applies a change by itself.

| Role (`GET /v1/me`) | Home and inbox | Draft page |
|---|---|---|
| `owner`, `judge` | Yes, with every outlet | Decides any draft, including whole-business drafts (`outlet_ids: []`) |
| `manager` | Yes, their outlets (core's row-level security limits the inbox to them) | Decides drafts for their outlets. Whole-business drafts show "Only the owner can decide this one: it changes the whole business." |
| `staff`, `advisor` | The role-not-allowed page (`can(session, "home")` / `"inbox"` is false). The nav hides both tabs | The same page |

The API is the real guard, and the screen never relies on hiding a button:
- a staff member's snapshot mint is 404;
- their `inbox:` stream is refused (404);
- their dismiss and approve are 403 `authority_denied`.

**Outlet scope.** Home's figures are for **the outlet the shell's switcher chose** (`useStaff().outlet`). Switching
outlets mints them again. The inbox and the draft page show everything in the person's scope; core filters it, and the
screen does not filter again.

## 2 · Routes and layout

| Route | Component (§7) | Page |
|---|---|---|
| `/staff/home` | `OwnerHomePage` | Owner home |
| `/staff/inbox` | `InboxPage` | Inbox, two tabs: "Waiting for you" and "Decided" |
| `/staff/inbox/[draftId]` | `DraftDetailPage` | One draft. A `draftId` that is not a lowercase UUIDv7 shows "Not found." without calling the API |

**Owner home**, top to bottom:
1. The title `"{outlet name} today"` (`.section-title`, with the swash), then the line "Business date {date} ·
   Figures are taken from the books when this page opens." and the "Refresh figures" button on the right.
2. The ribbon (`Ribbon` from the storefront). This is the only ribbon in the staff app, and it never carries a number.
3. The figures grid (`.card.stat`).
4. "What needs you" and "Low stock".

| Width | Figures grid | "What needs you" and "Low stock" |
|---|---|---|
| 390 px | One column | Stacked: "What needs you" first. The staff bar wraps to two rows (02 §3.1) |
| 640 px and up | Two columns | Stacked |
| 1024 px and up | Three columns (two rows: five cards) | Side by side, 2 : 1 |
| 1280 px | As 1024, inside `.wrap` (1120 px max) | As 1024 |

**Inbox.**
- One column inside `.wrap`, at every width.
- At the top: the title "Inbox" with the scallop, the live line, the tab chips ("Waiting for you · 5", "Decided · 0")
  and the line "Munim's AI proposes; nothing changes until a person approves it."
- Below them, findings and drafts as full-width cards, newest first, the same at 390, 1024 and 1280 px.

**Draft page.**
- One column, 860 px max. At the top: "← Inbox", then the draft card (02 §5): the header, the rows, "Based on", the
  stale changes, the lineage line and the action bar. Below the card: "What happened" (the history).
- At 390 px the field rows keep 02's two-column `.draft-field` grid. Below 400 px that grid stacks the label above the
  value, which `minmax(120px, 1fr) 2fr` already does. Buttons wrap and stay ≥ 48 px tall.

## 3 · Data loading

### 3.1 Owner home

The shell has already called `getMe` (in the session) and `listOutlets` (filtered to `me.outlet_ids`). Then:

| Order | Call | Why |
|---|---|---|
| 1 | `getTenant()`, `listIngredients()`, `listInbox()` in parallel; open the stream with topic `inbox:<tenantId>` | Base currency for `formatCell`; ingredient names and units; "What needs you" |
| 2 | `getMenu(outlet.id, "counter")` | Its `business_date` is "today" for this outlet. The tablet's clock is never read |
| 3 | `loadOwnerFigures(client, outlet.id, business_date)` and `listOrders({ outlet, business_date, limit: 100 })` in parallel | Five snapshot mints, and the order list whose length is "Orders today" |

**What refetches.**
- Steps 2 and 3 run on load, on an outlet change and on "Refresh figures" **only**. Every mint writes a new snapshot
  row, so a live event never re-mints.
- An `inbox:` event (and every stream reopen) calls `listInbox()` again. Nothing else.
- A staff member never gets the `inbox:` topic: the page does not render for them.

The figures, with the real template ids and params. Params must be exactly these keys: anything more or less is 422.

| Card | `template_id` | `params` | Cell shown | No rows |
|---|---|---|---|---|
| "Orders today" | (not a snapshot) | `GET /v1/orders?outlet&business_date&limit=100` | `items.length`, "+" when `next_cursor` is set. No chip: it is a count of a list (20 §3.1) | "0" |
| "Kitchen tickets today" | `kitchen.ticket_coverage` | `{outlet_id, from: today, to: today}` | row 0 `tickets` | (always one row) |
| "Net sales this week" | `people.labour_pct` | `{outlet_id, from: Monday, to: today}` | row 0 `net_sales_minor`. Monday to today lies inside one ISO week, so there is at most one row | "None yet" with "No completed orders since Monday." |
| "Most waste this week" | `inventory.waste_week` | `{outlet_id, week_start: Monday}` | The row with the **largest** `waste_minor`, found by comparing. Rows are ordered by ingredient id, and there is no total row. The note names the ingredient | "None" with "No waste recorded since Monday." |
| "Food shared this month" | `cares.impact` | `{outlet_id, from: 1st of the month, to: today}` | The `kind: "total"` row: `portions_milli` ("Portions"), `units_milli` ("Packed items"), `handovers` ("Hand-overs"), each with its own chip | (always the total row) |
| "Low stock" | `inventory.below_reorder` | `{}` | The rows whose `outlet_id` is this outlet: `ingredient_name` as text, then `on_hand_milli` and `min_qty_milli` with chips and the ingredient's `base_unit` | "Nothing is below its minimum." |

"Monday" is `mondayOf(business_date)` and "the 1st" is `monthStartOf(business_date)` (§7): calendar steps on the
outlet's date. There is **no "sales today" figure** (00 §7 question 2), and the browser adds nothing up.

### 3.2 Inbox

- **On load:** `listInbox()` and `listDrafts({ status: "decided" })` in parallel, plus `getTenant()`. Then open the
  stream on `inbox:<tenantId>`.
- **On every event and every reopen:** call both lists again (`load`). The event's data is never read.
- **"Show more"** (only while `next_cursor` is set) calls `listInbox(cursor)` and appends the page.
- Tab badges are list lengths: "Waiting for you · {items.length}", with "+" while `next_cursor` is set, and
  "Decided · {items.length}", with "+" while `has_more` is true.

### 3.3 Draft page

| Order | Call | Why |
|---|---|---|
| 1 | `getDraft(draftId)`, `getTenant()`; open the stream on `inbox:<tenantId>` | The draft with `decision`, `unverified_refs` and `history`. Only this call says which numbers trace, so no button shows before it answers |
| 2 | Once per draft, in parallel: `getMenu(outlet_ids[0], "counter")` (item names) when the draft has an outlet; `listIngredients()`; `getSupplier(payload.supplier_id)` when the payload names one; `listRecipients(outlet_ids[0])` when it names a recipient; `listInbox()` when `finding_id` is set (to name the finding) | Names for the rows. Any of them may fail; the row then says "An item", "A supplier", "A simulated recipient that is no longer listed" or "from a finding" |
| On every `inbox:` event | `getDraft(draftId)` | If it was `proposed` and now is not, and this person did not just decide it: the toast "Someone else already decided this. It has been refreshed." |
| After every approve or reject (success, 409, 422 or 404) | `getDraft(draftId)` | The card shows what core says now |

`GET /v1/drafts/{id}/lineage` is not called. The mock answers 404 there (03 §2), and the lineage line is built from the
draft, its decision and its history.

## 4 · States

### 4.1 Owner home

| State | What shows |
|---|---|
| Loading | Each card shows its skeleton bar at its final size. "What needs you" and "Low stock" show skeleton blocks |
| Loaded | Five cards, each figure with its "Source" chip. The chip opens the snapshot drawer with the template in words (`templateWords`) |
| A card's mint failed, or its cell is missing | That card shows "Cannot verify". The other cards are unaffected |
| No rows | The word from §3.1 ("None yet", "None", "Nothing is below its minimum."), never a typed 0 |
| `getMenu` failed (no business date) | Every figure card shows "Cannot verify"; the line under the title reads `staffErrorText(error, "home")`; "Orders today" reads "Couldn't load. Tap Refresh figures." |
| 429 on any mint | "Too many requests. Please wait a moment and try again. You can refresh in {s} s." "Refresh figures" is disabled until then. The cards it fed show "Cannot verify" |
| Offline | The `.offline-bar` "You're offline. Showing the last update." The last figures stay |
| Live updates off (stream refused, retrying or closed) | By "What needs you": "Live updates are off. Tap Refresh to update." with "Refresh" |
| Inbox empty | "Nothing waiting for you." |
| Role not allowed (staff, advisor) | `FullPage` "This page is for owners and managers." / "Your screens are in the menu above." / "Go to my screen" (→ `/staff`) |
| No outlet chosen yet | "Loading" (`.state-box`) |
| 401 anywhere | `handleAuth` signs out, back to `/staff/sign-in` |
| Simulated labels | The ribbon says "Suppliers and recipients are simulated." "Food shared this month" always carries "To simulated recipients. Measured on synthetic data." |

### 4.2 Inbox

| State | What shows |
|---|---|
| Loading | Three skeleton cards |
| Empty ("Waiting for you") | "Nothing waiting for you." |
| Empty ("Decided") | "Nothing decided yet." |
| Error, nothing loaded yet | `staffErrorText(error, "inbox")` + "Try again" |
| Offline / live updates off / 401 / role not allowed | As 4.1 |
| A finding | A "Finding" badge, a severity pill, the specialist and time, then the title (`findingTitle(type)`). The segments are rendered with `AiSegment` (values with chips, "Cannot verify" for anything that does not trace or holds a free digit), then "Impact:" with the `impact_ref` value and chip |
| A finding that abstained | "Cannot verify" with `abstainText(reason_code)`; no segments, no impact |
| A draft (waiting) | "Proposal" badge, status pill "Waiting for you", `draftTitle(command_type)`, "{specialist} · {outlets or Whole business} · proposed {time}", button "Review" |
| A draft (decided) | Status pill by status ("Applied", "Rejected", "Couldn't apply"). The line adds " · Approved with edits by Nandini Mehrotra (demo)". Button "Open" |

Severity words and tones: low "Low" (done), medium "Medium" (warn), high "High" (late), critical "Critical" (late).
A finding's `confidence_bp` is **not shown**: it is not a cell of the books.

### 4.3 Draft page

Statuses (`DRAFT_STATUS`, `DRAFT_TONE`, 02 §6): proposed "Waiting for you", executing "Applying", executed "Applied",
failed "Couldn't apply", rejected "Rejected", stale "Out of date".

| State | What shows |
|---|---|
| Loading (no draft or tenant yet) | One skeleton block; **no buttons** |
| Not found (404, or a malformed id) | `FullPage` "Not found." / "It may have been removed, or it isn't in your outlets." / "Back to the inbox" |
| Load error | `staffErrorText(error, "inbox")` + "Try again" |
| Proposed, everything traces (`approveGate` → `open`) | Fields with chips; buttons "Approve as {name}", "Edit", "Reject" |
| Proposed, some fields don't trace (`type_first`) | Those fields show "Cannot verify". The line "Some numbers in this draft don't trace to your books. Type the values you checked, or reject it." "Approve" is hidden; "Edit" and "Reject" remain. Only a quoted value (`⟨cite:…⟩`) can be typed over; no seeded draft has one, so this is a stubbed state |
| Proposed, untraceable (`untraceable`) | A ref the person cannot open is a snapshot cell, or no field holds it (a cell the draft was based on). The line "Some numbers this draft relies on can't be opened with your access, so it can't be approved. You can reject it." Only "Reject" |
| Proposed, not this person's to decide (`not_for_you`) | No buttons. A whole-business draft (no outlets, or a payload for the whole business): "Only the owner can decide this one: it changes the whole business." A draft covering outlets beyond the person's (a manager of one outlet, a two-outlet draft): "Only the owner can decide this one: it covers outlets beyond yours." A Cares proposal for a manager: "Only the owner can approve or reject a donation." Another owner-only type: "Only the owner can decide this one." (`gateLine`, 01 §6.1) |
| Editing | Under each field, 02's input ("Type the value you checked (INR)" for a field that does not trace, "Change it (optional) (…)" for one that does; a line's quantity names the line's unit, "(kg)"). Each typed value shows as "{value} Edited by {name}" beside the struck-through proposal. Then "Why you changed it" (1–500 characters), "Approve with my edits as {name}" (enabled by `editsReady`) and "Cancel" (drops what was typed) |
| Rejecting | "Why reject it?" (a select of `REJECT_REASONS`, first option "Choose a reason"), "What's wrong?" (1–500 characters), "Reject as {name}" and "Cancel" |
| In flight | Every button is disabled; the pressed one reads "Saving…" |
| Executed (approved) | Pill "Applied". The lineage line ends "· Approved by {name} · {time}" (or "Approved with edits by"). No buttons. After a purchase order: "Open the purchase order" (→ `/staff/purchase-orders/{entity_id}`, 15) |
| Rejected | Pill "Rejected"; lineage "· Rejected by {name} · {time}". In "What happened": "Rejected · {name} · {time} · “{the note}”" |
| Stale (409 `stale_draft`, or loaded stale) | Pill "Out of date". "The numbers behind this changed since it was proposed. It can no longer be approved or rejected; a new proposal will replace it." (core refuses a reject on a stale draft with `already_decided`). Then one line per changed cell: "Was {old value + chip} · now {new value + chip}" ("Cannot verify" where `now_ref` is null). No buttons |
| Someone else decided (409 `already_decided`, or a live event) | Toast "Someone else already decided this. It has been refreshed."; the card refetches |
| Couldn't apply (422 `execution_failed`) | `ErrorNote` "It was approved but could not be applied. Nothing changed." Refetch: core (and the mock) set the draft to "Couldn't apply", and a retry gets the same answer |
| Cannot verify on approve (422 `cannot_verify`) | `ErrorNote` "Cannot verify — some numbers in this draft no longer trace to their source rows." Refetch: the new `unverified_refs` decide which fields show "Cannot verify". The error's `refs[]` never reaches the screen, because client.ts keeps no body fields |
| Role refused (403) | `ErrorNote` "Your role can't do this. Ask the owner." |
| 429 | `ErrorNote` "Too many requests. Please wait a moment and try again." and "Try again in {s} s". Every button stays disabled until the countdown ends; then "Try again" (or the same button) resends the same attempt |
| Network / 5xx | `ErrorNote` from `staffWriteErrorText` ("The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." / "Something went wrong on our side. Try again."). The attempt is kept: "Try again", or the same button, resends the same envelope |
| Offline / live updates off | As 4.1 (the live line sits by "What happened") |
| Decided with edits, read back | `GET /v1/drafts/{id}` returns the proposed payload, not the decision's final one (core and the mock alike), so after a reload the field shows the proposal. The typed price is on the purchase order itself, the typed quantity on the listing. This is an open contract question for the founder (00 §7 question 15) |
| A Cares proposal | Rows "To {recipient (simulated)}" with the "Simulated recipient" badge and "Pickup {day} {from} – {to}", besides the quantity. The approve here publishes the same listing as the Cares card (14) |
| A purchase-order proposal | Under the fields: "Munim works out the total when it is approved. Recorded only — Munim does not process payments. Simulated supplier: nothing is sent to a real business." |
| Simulated labels | The "Supplier" row shows the supplier's name and the "Simulated supplier" badge whenever `kind` is `"simulated"`; the "To" row always carries "Simulated recipient" |

## 5 · Actions

Every write is a command envelope (01 §4), sent only from a person's tap. There are no optimistic updates on these
screens: the card changes only when core's answer, and the refetch after it, say so.

| Action | Command and route | Attempt rule | After success | On 409 / 422 |
|---|---|---|---|---|
| "Refresh figures" (home) | Five `POST /v1/snapshots` (not commands) + `GET /v1/orders` | No key; disabled while loading and during a 429 wait | The cards show the new snapshots | `invalid_payload` (422) means the params are wrong: a bug |
| "Dismiss" → reason → "Dismiss as {name}" (finding) | `findings.dismiss.v1` → `POST /v1/findings/{id}:dismiss` `{finding_id, reason_code}` | One attempt per `[finding_id, reason_code]`; a retry after network/429/5xx resends it | Toast "Dismissed."; the inbox refetches | 409 `conflict` (no reason code: it was already dismissed) or 404: toast "Someone already dismissed this. The inbox has been refreshed." and refetch. 403: "Your role can't do this. Ask the owner." |
| "Approve as {name}" | `drafts.approve.v1` → `POST /v1/drafts/{id}:approve` `{draft_id, command_type, edited_payload: null, reason: null}` | `approveAttempt` (01 §6.1): one attempt per `[draftId, null, null]` | Toast "Approved and applied."; refetch; a PO adds "Open the purchase order" | §4.3: `already_decided`, `stale_draft`, `cannot_verify`, `execution_failed` each have their state; every 409 / 422 refetches. Never resend a 409 |
| "Edit" → values → "Why you changed it" → "Approve with my edits as {name}" | `drafts.approve.v1` with `edited_payload: withEdits(payload, edits, me.member_id)` and `reason` | `approveAttempt`: one attempt per `[draftId, edited_payload, reason]`; typing anything new is a new attempt with new ids | As above. The verdict is `edited` | As above. A `typed_by` that is not the approver is 422 `invalid_payload`: a bug |
| "Reject" → reason code + note → "Reject as {name}" | `drafts.reject.v1` → `POST /v1/drafts/{id}:reject` `{draft_id, reason: note, reason_code}` | `rejectAttempt`: one attempt per `[draftId, code, note]` | Toast "Rejected. Nothing was changed."; refetch | 409 `already_decided`: toast + refetch |
| "Show more" (inbox) | `GET /v1/inbox?cursor` | No key | The next page is appended | |
| Tabs, chips, "Refresh" | Reads only | | | |

- The three decision actions are 02 §5's `DecisionBar` and `useDecision` on 01 §6.1's `lib/munim/drafts.ts`, the
  same as on the Cares (14) and purchase-order (15) cards. Buttons are disabled while their request is in flight
  (`useDecision`'s in-flight guard blocks a double tap before React re-renders).
- `approveDraft` answers with the **executed** command's `type` and `entity_id`, not the draft's.
- A 409 `idempotency_conflict` ends the attempt ("That didn't go through. Please try again."). The next tap is a new
  attempt.
- There is no "approve all", no default action, no timer and no auto-apply anywhere.

## 6 · Copy

Every string here is literal. The error lines chosen by code come from `staffErrorText`, `reasonText` and
`abstainText` (01 §9). The status words come from `DRAFT_STATUS` and `VERDICT`. The template words come from
`templateWords` (§7).

| Where | Copy |
|---|---|
| Home title / sub-line | "{outlet name} today" · "Business date {date} · Figures are taken from the books when this page opens." |
| Home button | "Refresh figures" |
| Ribbon (no numbers) | "Sample shop — orders are not real." · "Demo: all data is synthetic." · "Suppliers and recipients are simulated." · "Every number opens the rows behind it." |
| Card labels | "Orders today" · "Kitchen tickets today" · "Net sales this week" · "Most waste this week" · "Food shared this month" |
| Card notes | "Counted from today's order list." + link "See them at the counter" · "Completed orders since Monday, after discounts." · "{ingredient name}, since Monday. Open the source for every ingredient." (or "One ingredient, since Monday. …" without a name) · "To simulated recipients. Measured on synthetic data." + link "Open Cares" |
| Food shared lines | "Portions {value}" · "Packed items {value}" · "Hand-overs {value}" |
| No rows | "None yet" + "No completed orders since Monday." · "None" + "No waste recorded since Monday." · "Nothing is below its minimum." |
| Orders failed | "Couldn't load. Tap Refresh figures." |
| 429 (home) | "Too many requests. Please wait a moment and try again. You can refresh in {s} s." |
| Sections | "What needs you" · "Low stock" · "On hand {value} · minimum {value}" · "Open suppliers" · "Open the inbox · {N} waiting" (N is a list length, "N+" with a cursor) |
| Home inbox rows | badge "Finding" / "Proposal · waiting for you", then the title, then "{specialist} · {time}" |
| Inbox title / tabs / line | "Inbox" · "Waiting for you · {N}" · "Decided · {N}" · "Munim's AI proposes; nothing changes until a person approves it." |
| Inbox empty | "Nothing waiting for you." · "Nothing decided yet." |
| Inbox buttons | "Review" · "Open" · "Show more" · "Try again" |
| Finding | badge "Finding" · "Impact:" · "Dismiss" · "Why dismiss it?" · "Choose a reason" · "Dismiss as {name}" · "Keep it" · toast "Dismissed." · "Someone already dismissed this. The inbox has been refreshed." |
| Draft list line | "{specialist} · {outlet names or Whole business} · proposed {time}" (+ " · {verdict} by {name}") · badge "Proposal" |
| Draft page | "← Inbox" · "Based on" · "{template words}: {value + chip}" · "What happened" |
| Draft rows | "Item" · "Outlet" · "Outlets" · "Station" · "Supplier" · "To" · "Pickup" · "For" · "Starts" · "Expected" · "Whole business" · "An item" · "A supplier" · "A simulated recipient that is no longer listed" · "Another outlet" |
| Purchase-order line | "Munim works out the total when it is approved. Recorded only — Munim does not process payments. Simulated supplier: nothing is sent to a real business." |
| Field labels (`fieldLabel`) | prep_sec "Prep time" · qty_milli "Quantity" · unit_price_minor "Price" · price_minor "Price" · min_qty_milli "Minimum" · par_qty_milli "Par level" · min_spend_minor "Minimum spend" · on a line: "{ingredient or item} · Quantity (kg)" / "{ingredient} · Price per kg" |
| Draft titles (`draftTitle`) | "Change an item's prep time" · "A prep list" · "A purchase order" · "Dispute a supplier invoice" · "Send goods back to a supplier" · "Change a reorder level" · "Move stock between outlets" · "Change a price" · "A new recipe version" · "End a deal" · "List surplus food on Munim Cares" · "A task for the team" · fallback "A proposed change" |
| Finding titles (`findingTitle`) | inventory.waste_spike "More waste than a usual week" · kitchen.ticket_drift "Tickets running past their prep time" · inventory.expiry_risk "Food at risk of going to waste" · fallback: the type in words |
| Who proposed (`sourceName`) | the specialist's name for `intel:<pack>` · "An import" · "A team member" |
| Lineage line | "Proposed by {who} · {time} · from a finding: {finding title}" (or "· from a finding") "· {Approved / Approved with edits / Rejected} by {name} · {time}" (name null: "a team member") |
| History rows (`historyWords`) | "Proposed · Kitchen" · "Approved · {name}" · "Approved with edits · {name}" · "Rejected · {name}" · "Applying" · "Applied · {name}" · "Couldn't apply" · "Out of date" (by a role: "Owner", "Manager", …) + " · {time}" + " · “{note}”" |
| Gate lines | "Some numbers in this draft don't trace to your books. Type the values you checked, or reject it." · "Some numbers this draft relies on can't be opened with your access, so it can't be approved. You can reject it." · "Only the owner can decide this one: it changes the whole business." · "Only the owner can decide this one: it covers outlets beyond yours." · "Only the owner can approve or reject a donation." · "Only the owner can decide this one." · "Owners and managers decide proposals." (all `gateLine`, 01 §6.1) |
| Buttons | "Approve as {name}" · "Edit" · "Approve with my edits as {name}" · "Cancel" · "Reject" · "Reject as {name}" · "Saving…" · "Try again" · "Try again in {s} s" · "Open the purchase order" (all but the last are 02 §5's `DecisionBar`) |
| Edit form | "Why you changed it" · (02) "Type the value you checked ({unit})" · "Change it (optional) ({unit})" · "Proposed · " · "Edited by {name}" ("Edited earlier · " only if a served payload ever holds a person's edit; neither core nor the mock serves one today) |
| Reject form | "Why reject it?" · "Choose a reason" · `REJECT_REASONS` labels · "What's wrong?" |
| Toasts | "Approved and applied." · "Rejected. Nothing was changed." · "Someone else already decided this. It has been refreshed." |
| Stale | "The numbers behind this changed since it was proposed. It can no longer be approved or rejected; a new proposal will replace it." · "Was {value} · now {value}" |
| Errors (draft) | `staffWriteErrorText` (01 §9) through `DecisionBar` |
| Role not allowed | "This page is for owners and managers." · "Your screens are in the menu above." · "Go to my screen" |
| Not found | "Not found." · "It may have been removed, or it isn't in your outlets." · "Back to the inbox" |
| Offline / live | "You're offline. Showing the last update." · "Live updates are off. Tap Refresh to update." · "Refresh" |

No string on these screens is a server `message` or model text. AI text reaches the screen only through
`AiSegment` / `DraftField`, which show cells and "Cannot verify", never a typed digit.

## 7 · Code

Save each block at its path. The library files are plain TypeScript (no React). The page components follow the
storefront's pattern: thin `page.tsx` files that render a client component.

```ts
// file: lib/munim/template-words.ts
// Plain words for snapshot templates: the snapshot drawer's `label` (02 §4). Owner home and the inbox (12) and Ask
// Munim (13) use it. A template not listed here shows its id.
const WORDS: Record<string, string> = {
  "kitchen.ticket_coverage": "Kitchen tickets",
  "kitchen.ticket_times": "Kitchen ticket times",
  "kitchen.prep_need": "What to prep",
  "people.labour_pct": "Labour and net sales by week",
  "inventory.waste_week": "Waste this week",
  "inventory.below_reorder": "Stock below its minimum",
  "purchasing.quote_compare": "Quotes from simulated suppliers",
  "cares.impact": "Food shared",
  "inventory.expiry_risk": "Stock close to its use-by date",
  "cares.recipient_match": "Simulated recipients that can take this food",
  "inventory.shortfall": "Stock short of what is needed",
  "purchasing.price_creep": "Supplier prices over time",
  "purchasing.deal_inputs": "What a quote was checked against",
};

export const templateWords = (templateId: string): string => WORDS[templateId] ?? templateId;
```

```ts
// file: lib/munim/owner-figures.ts
// Owner home's figures (12 §3). Each one is a snapshot this screen mints (POST /v1/snapshots) for the outlet the
// shell's switcher chose, and one cell of it, shown with its source chip. Nothing is added up here: the only
// operations are picking a row and comparing two cells to find the larger. Dates start from the outlet's business
// date (GET /v1/catalogue/menu) and move by whole days; the tablet's clock is never read. Plain TypeScript, no React.
import type { MunimError } from "./client";
import { cellOf, snapRef, type Cell, type Snapshot } from "./refs";
import type { StaffClient } from "./staff";

/** The Monday of the ISO week holding a date: "2026-10-14" -> "2026-10-12". */
export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}

/** The first of the month: "2026-10-14" -> "2026-10-01". */
export const monthStartOf = (isoDate: string): string => `${isoDate.slice(0, 7)}-01`;

/** One shown cell: the value, the column that says how to format it (formatCell), and the ref its chip opens. */
export interface Figure {
  ref: string;
  column: string;
  value: Cell;
}

/** A figure, "none" (the snapshot has no rows: show a word, never a typed 0), or null ("Cannot verify": the mint
 *  failed or the cell is not there). */
export type FigureState = Figure | "none" | null;

export interface LowStockRow {
  ingredientId: string | null;
  /** The ingredient's name as the snapshot holds it (a text cell, shown as plain text). */
  name: string | null;
  onHand: Figure | null;
  minimum: Figure | null;
}

export interface OwnerFigures {
  tickets: FigureState;
  netSales: FigureState;
  /** The one ingredient with the most waste since Monday. Not a total: the template has no total row. */
  waste: { amount: Figure | null; ingredientId: string | null } | "none" | null;
  shared: { portions: Figure | null; units: Figure | null; handovers: Figure | null } | null;
  lowStock: LowStockRow[] | null;
  /** The first failed call: pass it to handleAuth; a 429 shows the wait. The cards it fed show "Cannot verify". */
  error: MunimError | null;
}

/** Every card "Cannot verify" (the business date itself could not be read). */
export const noFigures = (error: MunimError | null): OwnerFigures => ({ tickets: null, netSales: null, waste: null, shared: null, lowStock: null, error });

function at(s: Snapshot, row: number, column: string): Figure | null {
  const value = cellOf(s, { kind: "snap", snapshotId: s.snapshot_id, row, column });
  return value === undefined ? null : { ref: snapRef(s.snapshot_id, row, column), column, value };
}

const text = (v: Cell | undefined): string | null => (typeof v === "string" ? v : null);
/** For comparing two cells (bigint columns may arrive as numeric strings). Never used to compute a shown value. */
const num = (v: Cell | undefined): number => (typeof v === "number" ? v : Number(v ?? 0));

/** Mints the five snapshots for one outlet's business date and picks the cells the cards show. Params are exactly
 *  each template's keys (core refuses anything else with 422). Five calls, five new snapshot rows: call this on
 *  load, on an outlet change and on "Refresh figures" only. */
export async function loadOwnerFigures(client: StaffClient, outletId: string, today: string): Promise<OwnerFigures> {
  const monday = mondayOf(today);
  const [t, n, w, c, b] = await Promise.all([
    client.mintSnapshot({ template_id: "kitchen.ticket_coverage", params: { outlet_id: outletId, from: today, to: today } }),
    client.mintSnapshot({ template_id: "people.labour_pct", params: { outlet_id: outletId, from: monday, to: today } }),
    client.mintSnapshot({ template_id: "inventory.waste_week", params: { outlet_id: outletId, week_start: monday } }),
    client.mintSnapshot({ template_id: "cares.impact", params: { outlet_id: outletId, from: monthStartOf(today), to: today } }),
    client.mintSnapshot({ template_id: "inventory.below_reorder", params: {} }),
  ]);
  const failed = [t, n, w, c, b].flatMap((r) => (r.ok ? [] : [r.error]));

  // Monday..today lies inside one ISO week, so labour_pct answers at most one row: row 0 is this week.
  const netSales: FigureState = !n.ok ? null : n.data.rows.length === 0 ? "none" : at(n.data, 0, "net_sales_minor");

  let waste: OwnerFigures["waste"] = null;
  if (w.ok) {
    // Rows come ordered by ingredient id, not by size: find the largest by comparing, never by adding.
    let top = 0;
    w.data.rows.forEach((r, i) => {
      if (num(r.waste_minor) > num(w.data.rows[top]!.waste_minor)) top = i;
    });
    waste = w.data.rows.length === 0 ? "none" : { amount: at(w.data, top, "waste_minor"), ingredientId: text(w.data.rows[top]!.ingredient_id) };
  }

  let shared: OwnerFigures["shared"] = null;
  if (c.ok) {
    const total = c.data.rows.findIndex((r) => r.kind === "total");
    shared = { portions: at(c.data, total, "portions_milli"), units: at(c.data, total, "units_milli"), handovers: at(c.data, total, "handovers") };
  }

  // below_reorder takes no params and covers every outlet the person sees: keep the chosen outlet's rows.
  const lowStock = !b.ok ? null : b.data.rows.flatMap((r, i) => (r.outlet_id !== outletId ? [] : [{
    ingredientId: text(r.ingredient_id), name: text(r.ingredient_name), onHand: at(b.data, i, "on_hand_milli"), minimum: at(b.data, i, "min_qty_milli"),
  }]));

  return { tickets: t.ok ? at(t.data, 0, "tickets") : null, netSales, waste, shared, lowStock, error: failed[0] ?? null };
}
```

```tsx
// file: components/staff/pages/inbox.tsx
"use client";
// /staff/inbox: what waits for a person (GET /v1/inbox: open findings and proposed drafts, newest first) and what was
// decided (GET /v1/drafts?status=decided). A finding reads with its source chips and can be dismissed with a reason.
// A draft opens its own page, because the list does not say which of its numbers trace (20 §3.2). Live updates on
// inbox:<tenant> wake a refetch. Owners and managers only. Also exports the pieces owner home reuses.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "@/lib/hooks";
import type { MunimError } from "@/lib/munim/client";
import { attemptFor, retryable, type CommandAttempt } from "@/lib/munim/commands";
import { draftTitle, findingTitle, personName, sourceName, type Draft, type Decision } from "@/lib/munim/drafts";
import { formatWhen } from "@/lib/munim/format";
import { columnOf, formatCell, parseRef, type CellFormat } from "@/lib/munim/refs";
import { can } from "@/lib/munim/session";
import { watchFor } from "@/lib/munim/staff-app";
import { abstainText, DRAFT_STATUS, REJECT_REASONS, specialistName, staffErrorText, staffWriteErrorText, VERDICT } from "@/lib/munim/staff-copy";
import { topic, type LiveState } from "@/lib/munim/staff-stream";
import { templateWords } from "@/lib/munim/template-words";
import type { Schemas } from "@/lib/munim/types";
import { SITE } from "@/lib/site";
import { useStaff } from "../shell";
import { AiSegment, CannotVerify, DRAFT_TONE, SnapshotDrawer, SourcedValue, StatusPill, type PillTone } from "../source";
import { ErrorNote, FullPage, Toast, useToast } from "../../ui";

type Finding = Schemas["V1Finding"];
type InboxItem = Schemas["V1InboxResponse"]["items"][number];
type ReasonCode = (typeof REJECT_REASONS)[number]["code"];
export type OpenRef = (snapshotId: string, refToken: string) => void;

const SEVERITY: Record<Finding["severity"], [string, PillTone]> = { low: ["Low", "done"], medium: ["Medium", "warn"], high: ["High", "late"], critical: ["Critical", "late"] };
const ALREADY_DISMISSED = "Someone already dismissed this. The inbox has been refreshed.";

/** Owner home, the inbox and a draft: the person's role cannot open this page. */
export function NotForRole() {
  return (
    <FullPage title="This page is for owners and managers." action={<Link href="/staff" className="btn btn-primary">Go to my screen</Link>}>
      <p>Your screens are in the menu above.</p>
    </FullPage>
  );
}

/** The line by a title when live updates are not running, with its Refresh button. */
export function LiveLine({ state, onRefresh }: { state: LiveState; onRefresh: () => void }) {
  if (state === "open" || state === "connecting") return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-[15px] text-muted" role="status">
      Live updates are off. Tap Refresh to update.
      <button type="button" className="btn btn-plain" onClick={onRefresh}>Refresh</button>
    </p>
  );
}

/** One open finding: what a specialist noticed, every number with its chip, and Dismiss with a reason code. */
export function FindingCard({ finding, fmt, tz, onOpen, onChanged }: { finding: Finding; fmt: CellFormat; tz: string; onOpen: OpenRef; onChanged: (toast: string) => void }) {
  const { session, client, handleAuth } = useStaff();
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState<ReasonCode | "">("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const attempt = useRef<CommandAttempt<"findings.dismiss.v1", Schemas["FindingsDismissV1"]> | null>(null);
  const e = finding.envelope;
  const impact = e.impact_ref ? finding.resolved_refs.find((r) => r.ref === e.impact_ref) : undefined;
  const impactRef = e.impact_ref ? parseRef(e.impact_ref) : null;
  const [sev, tone] = SEVERITY[finding.severity];
  const mayDismiss = session.me.role === "owner" || session.me.role === "manager" || session.me.role === "judge";

  const dismiss = async () => {
    if (!code || busy) return;
    const a = attemptFor(attempt.current, JSON.stringify([finding.finding_id, code]), "findings.dismiss.v1", () => ({ finding_id: finding.finding_id, reason_code: code }));
    attempt.current = a;
    setBusy(true);
    setNote(null);
    const r = await client.dismissFinding(finding.finding_id, a.body);
    setBusy(false);
    if (r.ok) {
      attempt.current = null;
      onChanged("Dismissed.");
      return;
    }
    if (handleAuth(r.error)) return;
    if (!retryable(r.error)) attempt.current = null;
    // 409 conflict (no reason code): the finding is no longer open. 404: it left this person's scope.
    if (r.error.code === "conflict" || r.error.kind === "not_found") onChanged(ALREADY_DISMISSED);
    else setNote(staffWriteErrorText(r.error, "inbox"));
  };

  return (
    <article id={`finding-${finding.finding_id}`} className="card space-y-3 p-5" aria-labelledby={`f-${finding.finding_id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge">Finding</span>
        <StatusPill tone={tone}>{sev}</StatusPill>
        <span className="text-[15px] text-muted">{specialistName(finding.pack)} · {formatWhen(finding.created_at, tz, SITE.locale)}</span>
      </div>
      <h3 id={`f-${finding.finding_id}`} className="text-[22px]">{findingTitle(finding.type)}</h3>
      {e.abstained ? (
        <p><CannotVerify /> {abstainText(e.reason_code)}</p>
      ) : (
        <>
          {e.segments.map((s, i) => <AiSegment key={i} segment={s} resolved={finding.resolved_refs} fmt={fmt} onOpen={onOpen} />)}
          <p className="font-semibold">
            Impact:{" "}
            {impact && impactRef ? <SourcedValue text={formatCell(impact.value, columnOf(impactRef), fmt)} refToken={impact.ref} onOpen={onOpen} /> : <CannotVerify />}
          </p>
        </>
      )}
      {mayDismiss && (asking ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 font-semibold">
            Why dismiss it?
            <select value={code} onChange={(ev) => setCode(ev.target.value as ReasonCode | "")} disabled={busy}>
              <option value="">Choose a reason</option>
              {REJECT_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-primary" disabled={!code || busy} onClick={() => void dismiss()}>{busy ? "Saving…" : `Dismiss as ${session.me.name}`}</button>
          <button type="button" className="btn btn-plain" disabled={busy} onClick={() => setAsking(false)}>Keep it</button>
        </div>
      ) : (
        <button type="button" className="btn btn-plain" onClick={() => setAsking(true)}>Dismiss</button>
      ))}
      {note && <ErrorNote>{note}</ErrorNote>}
    </article>
  );
}

/** One draft in a list: what it proposes, who, its status and outlet, and the way into its page. */
export function DraftRow({ draft, decision, outletName, tz }: { draft: Draft; decision: Decision | null; outletName: (id: string) => string; tz: string }) {
  const where = draft.outlet_ids.length === 0 ? "Whole business" : draft.outlet_ids.map(outletName).join(", ");
  return (
    <article className="card flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge">Proposal</span>
          <StatusPill tone={DRAFT_TONE[draft.status] ?? "new"}>{DRAFT_STATUS[draft.status] ?? draft.status}</StatusPill>
        </div>
        <h3 className="text-[22px]">{draftTitle(draft.command_type)}</h3>
        <p className="text-[15px] text-muted">
          {sourceName(draft.source)} · {where} · proposed {formatWhen(draft.created_at, tz, SITE.locale)}
          {decision && ` · ${VERDICT[decision.verdict]} by ${personName(decision.decided_by)}`}
        </p>
      </div>
      <Link href={`/staff/inbox/${draft.draft_id}`} className="btn btn-secondary">{draft.status === "proposed" ? "Review" : "Open"}</Link>
    </article>
  );
}

export function InboxPage() {
  const { session, client, outlets, handleAuth } = useStaff();
  const allowed = can(session, "inbox");
  const [tab, setTab] = useState<"waiting" | "decided">("waiting");
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [decided, setDecided] = useState<Schemas["V1DraftsResponse"] | null>(null);
  const [tenant, setTenant] = useState<Schemas["V1Tenant"] | null>(null);
  const [error, setError] = useState<MunimError | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");
  const [drawer, setDrawer] = useState<{ snapshotId: string; refToken: string } | null>(null);
  const [toast, setToast] = useToast();
  const online = useOnline();

  const load = useCallback(async () => {
    const [i, d] = await Promise.all([client.listInbox(), client.listDrafts({ status: "decided" })]);
    if ((!i.ok && handleAuth(i.error)) || (!d.ok && handleAuth(d.error))) return;
    if (i.ok) {
      setItems(i.data.items);
      setCursor(i.data.next_cursor);
      setError(null);
    } else setError(i.error);
    if (d.ok) setDecided(d.data);
  }, [client, handleAuth]);

  const loadMore = async () => {
    if (!cursor) return;
    const r = await client.listInbox(cursor);
    if (r.ok) {
      setItems((prev) => [...(prev ?? []), ...r.data.items]);
      setCursor(r.data.next_cursor);
    } else if (!handleAuth(r.error)) setError(r.error);
  };

  useEffect(() => {
    if (!allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the response
    void load();
    void client.getTenant().then((r) => r.ok && setTenant(r.data));
    // inbox:<tenant> is owner and manager only: this page never opens for anyone else.
    return watchFor(session, [topic.inbox(session.tenantId)], () => void load(), setLive);
  }, [allowed, client, load, session]);

  if (!allowed) return <NotForRole />;

  const tz = outlets[0]?.tz ?? tenant?.home_tz ?? "UTC";
  const fmt: CellFormat | null = tenant ? { locale: SITE.locale, currency: tenant.base_currency } : null;
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "Another outlet";
  const changed = (msg: string) => {
    setToast(msg);
    void load();
  };
  const waiting = items?.length ?? 0;

  return (
    <main className="wrap staff-main space-y-5">
      {!online && <div className="offline-bar" role="status">You&apos;re offline. Showing the last update.</div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="section-title">Inbox</h1>
        <LiveLine state={live} onRefresh={() => void load()} />
      </div>
      <div className="scallop" aria-hidden="true" />
      <div className="flex gap-2" role="tablist" aria-label="Inbox">
        <button type="button" role="tab" aria-selected={tab === "waiting"} className="chip" aria-current={tab === "waiting" ? "page" : undefined} onClick={() => setTab("waiting")}>
          Waiting for you{items ? ` · ${waiting}${cursor ? "+" : ""}` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "decided"} className="chip" aria-current={tab === "decided" ? "page" : undefined} onClick={() => setTab("decided")}>
          Decided{decided ? ` · ${decided.items.length}${decided.has_more ? "+" : ""}` : ""}
        </button>
      </div>
      <p className="text-[15px] text-muted">Munim&apos;s AI proposes; nothing changes until a person approves it.</p>

      {error && items === null && (
        <div className="space-y-2">
          <ErrorNote>{staffErrorText(error, "inbox")}</ErrorNote>
          <button type="button" className="btn btn-plain" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {(items === null || !fmt) && !error && <div className="grid gap-4" role="status" aria-label="Loading">{[0, 1, 2].map((k) => <div key={k} className="skeleton h-40" />)}</div>}

      {fmt && items && tab === "waiting" && (
        items.length === 0 ? (
          <div className="state-box"><p>Nothing waiting for you.</p></div>
        ) : (
          <div className="grid gap-4">
            {items.map((it) => it.kind === "finding"
              ? <FindingCard key={it.finding.finding_id} finding={it.finding} fmt={fmt} tz={tz} onOpen={(s, r) => setDrawer({ snapshotId: s, refToken: r })} onChanged={changed} />
              : <DraftRow key={it.draft.draft_id} draft={it.draft} decision={null} outletName={outletName} tz={tz} />)}
            {cursor && <button type="button" className="btn btn-plain justify-self-center" onClick={() => void loadMore()}>Show more</button>}
          </div>
        )
      )}
      {fmt && decided && tab === "decided" && (
        decided.items.length === 0 ? (
          <div className="state-box"><p>Nothing decided yet.</p></div>
        ) : (
          <div className="grid gap-4">
            {decided.items.map((d) => <DraftRow key={d.draft.draft_id} draft={d.draft} decision={d.decision} outletName={outletName} tz={tz} />)}
          </div>
        )
      )}

      {fmt && <SnapshotDrawer client={client} open={drawer} onClose={() => setDrawer(null)} fmt={fmt} tz={tz} label={templateWords} />}
      <Toast message={toast} />
    </main>
  );
}
```

```tsx
// file: components/staff/pages/draft-detail.tsx
"use client";
// /staff/inbox/[draftId]: one AI draft, decided by a named person. GET /v1/drafts/{id} first (only it carries
// unverified_refs), then the names its rows need. Every number is a DraftField: the proposed value with its chip, or
// "Cannot verify". The buttons are 02's DecisionBar on 01's drafts.ts, the same as every other draft card: "Approve"
// only while every number traces, "Approve with my edits" sends what the person typed as {value, typed_by}, Reject
// always asks for a reason. Every answer refetches the draft and shows what it says now; live updates on
// inbox:<tenant> refetch it too.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "@/lib/hooks";
import type { MunimError } from "@/lib/munim/client";
import {
  approveGate, draftTitle, fieldLabel, findingTitle, historyWords, lineageLine, numericFields, sourceName, staleChanges, withEdits,
  type DraftDetail, type NumericField, type Outcome,
} from "@/lib/munim/drafts";
import { dayLabel, formatDate, formatTime, formatWhen, titleCase } from "@/lib/munim/format";
import { columnOf, formatCell, parseRef, type CellFormat } from "@/lib/munim/refs";
import { can } from "@/lib/munim/session";
import { watchFor } from "@/lib/munim/staff-app";
import { DRAFT_STATUS, staffErrorText } from "@/lib/munim/staff-copy";
import { topic, type LiveState } from "@/lib/munim/staff-stream";
import { templateWords } from "@/lib/munim/template-words";
import type { Schemas } from "@/lib/munim/types";
import { SITE, UUID7 } from "@/lib/site";
import { DecisionBar, useDecision } from "../decision";
import { DraftField } from "../draft-field";
import { useStaff } from "../shell";
import { CannotVerify, DRAFT_TONE, SimulatedRecipient, SimulatedSupplier, SnapshotDrawer, SourcedValue, StatusPill } from "../source";
import { ErrorNote, FullPage, Toast, useToast } from "../../ui";
import { LiveLine, NotForRole } from "./inbox";

const STALE = "The numbers behind this changed since it was proposed. It can no longer be approved or rejected; a new proposal will replace it.";
const DECIDED_ELSEWHERE = "Someone else already decided this. It has been refreshed.";
const PO_LINE = "Munim works out the total when it is approved. Recorded only — Munim does not process payments. Simulated supplier: nothing is sent to a real business.";

/** What the rows need names for (the payload carries ids only). */
interface Names {
  items: Map<string, string>;
  ingredients: Map<string, string>;
  supplier: Schemas["V1Supplier"] | null;
  /** A Cares proposal's simulated recipient, by its id. */
  recipient: string | null;
  finding: string | null;
}

export function DraftDetailPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const { session, client, outlets, handleAuth } = useStaff();
  const me = session.me;
  const allowed = can(session, "inbox");
  const [detail, setDetail] = useState<DraftDetail | "not_found" | null>(null);
  const [tenant, setTenant] = useState<Schemas["V1Tenant"] | null>(null);
  const [names, setNames] = useState<Names>({ items: new Map(), ingredients: new Map(), supplier: null, recipient: null, finding: null });
  const [loadError, setLoadError] = useState<MunimError | null>(null);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ type: string; entityId: string } | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");
  const [drawer, setDrawer] = useState<{ snapshotId: string; refToken: string } | null>(null);
  const [toast, setToast] = useToast();
  const online = useOnline();
  const statusRef = useRef<string | null>(null);
  const valid = UUID7.test(draftId);

  const load = useCallback(async (): Promise<DraftDetail | null> => {
    const r = await client.getDraft(draftId);
    if (r.ok) {
      setDetail(r.data);
      setLoadError(null);
      return r.data;
    }
    if (handleAuth(r.error)) return null;
    if (r.error.kind === "not_found") setDetail("not_found");
    else setLoadError(r.error);
    return null;
  }, [client, draftId, handleAuth]);

  // Every settled approve or reject: say what happened, then show what core says now.
  const onOutcome = (o: Outcome) => {
    if (o.kind === "signed_out") {
      handleAuth(o.error);
      return;
    }
    if (o.kind === "done") {
      setResult(o);
      setEditing(false);
      setEdits({});
      setToast(o.type === "drafts.reject.v1" ? "Rejected. Nothing was changed." : "Approved and applied.");
    }
    if (o.kind === "decided_elsewhere") setToast(DECIDED_ELSEWHERE);
    void load().then((d) => { statusRef.current = d?.draft.status ?? statusRef.current; });
  };
  // The command type is known once the draft has loaded; the bar that sends with it renders only after that.
  const dec = useDecision(client, { draft_id: draftId, command_type: detail && detail !== "not_found" ? detail.draft.command_type : "" }, "inbox", onOutcome);

  useEffect(() => {
    if (!allowed || !valid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the response
    void load().then((d) => { statusRef.current = d?.draft.status ?? null; });
    void client.getTenant().then((r) => r.ok && setTenant(r.data));
    return watchFor(session, [topic.inbox(session.tenantId)], () => {
      void load().then((d) => {
        // Decided on another screen while this one was open, by someone else: say so. (This person's own decision
        // arrives here too, and is not announced twice.)
        if (d && statusRef.current === "proposed" && d.draft.status !== "proposed" && d.decision?.decided_by.member_id !== me.member_id) setToast(DECIDED_ELSEWHERE);
        statusRef.current = d?.draft.status ?? statusRef.current;
      });
    }, setLive);
  }, [allowed, valid, client, load, session, me.member_id, setToast]);

  // Names for the rows, once the draft is known: items from the outlet's menu, ingredients, the supplier, the simulated
  // recipient (from the outlet's recipients), the finding.
  const draft = detail && detail !== "not_found" ? detail.draft : null;
  const draftKey = draft?.draft_id ?? null;
  useEffect(() => {
    if (!draft) return;
    const p = draft.payload as Record<string, unknown>;
    const outletId = draft.outlet_ids[0] ?? null;
    let live = true;
    void Promise.all([
      outletId ? client.getMenu(outletId, "counter") : null,
      client.listIngredients(),
      typeof p.supplier_id === "string" ? client.getSupplier(p.supplier_id) : null,
      typeof p.recipient_id === "string" && outletId ? client.listRecipients(outletId) : null,
      draft.finding_id ? client.listInbox() : null,
    ]).then(([menu, ing, sup, rec, inbox]) => {
      if (!live) return;
      const f = inbox?.ok ? inbox.data.items.find((i) => i.kind === "finding" && i.finding.finding_id === draft.finding_id) : undefined;
      setNames({
        items: new Map(menu?.ok ? menu.data.entries.map((e) => [e.item_id, e.display_name ?? titleCase(e.name_key)]) : []),
        ingredients: new Map(ing.ok ? ing.data.items.map((i) => [i.ingredient_id, i.name]) : []),
        supplier: sup?.ok ? sup.data : null,
        recipient: rec?.ok ? (rec.data.items.find((r) => r.recipient_id === p.recipient_id)?.name ?? null) : null,
        finding: f?.kind === "finding" ? findingTitle(f.finding.type) : null,
      });
    });
    return () => { live = false; };
    // The names depend on the draft, not on each refetch of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, client]);

  if (!allowed) return <NotForRole />;
  if (!valid || detail === "not_found") {
    return (
      <FullPage title="Not found." action={<Link href="/staff/inbox" className="btn btn-primary">Back to the inbox</Link>}>
        <p>It may have been removed, or it isn&apos;t in your outlets.</p>
      </FullPage>
    );
  }
  if (loadError && !detail) {
    return (
      <main className="wrap staff-main space-y-3">
        <ErrorNote>{staffErrorText(loadError, "inbox")}</ErrorNote>
        <button type="button" className="btn btn-plain" onClick={() => void load()}>Try again</button>
      </main>
    );
  }
  if (!detail || !tenant) return <main className="wrap staff-main"><div className="skeleton h-96" role="status" aria-label="Loading" /></main>;

  const tz = outlets.find((o) => o.id === detail.draft.outlet_ids[0])?.tz ?? outlets[0]?.tz ?? tenant.home_tz ?? "UTC";
  const fmt: CellFormat = { locale: SITE.locale, currency: tenant.base_currency };
  const when = (iso: string) => formatWhen(iso, tz, SITE.locale);
  const open = (snapshotId: string, refToken: string) => setDrawer({ snapshotId, refToken });
  const fields = numericFields(detail);
  const gate = approveGate(detail, fields, me);
  const p = detail.draft.payload as Record<string, unknown>;
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "Another outlet";

  const labelOf = (f: NumericField): string => {
    const base = fieldLabel(f.column);
    if (!f.line) return base;
    const id = typeof f.line.ingredient_id === "string" ? f.line.ingredient_id : typeof f.line.item_id === "string" ? f.line.item_id : null;
    const what = id ? (names.ingredients.get(id) ?? names.items.get(id) ?? "An item") : "A line";
    const unit = typeof f.line.unit === "string" ? f.line.unit : null;
    return `${what} · ${base}${unit ? (f.column.endsWith("_minor") ? ` per ${unit}` : ` (${unit})`) : ""}`;
  };

  const changes = staleChanges(detail);
  const textRows: [string, React.ReactNode][] = [];
  if (typeof p.item_id === "string") textRows.push(["Item", names.items.get(p.item_id) ?? "An item"]);
  if (typeof p.outlet_id === "string") textRows.push(["Outlet", outletName(p.outlet_id)]);
  if (Array.isArray(p.outlet_ids)) textRows.push(["Outlets", p.outlet_ids.length === 0 ? "Whole business" : p.outlet_ids.map((o) => outletName(String(o))).join(", ")]);
  if (typeof p.station === "string") textRows.push(["Station", titleCase(p.station)]);
  if (typeof p.supplier_id === "string") textRows.push(["Supplier", names.supplier ? <>{names.supplier.name} {names.supplier.kind === "simulated" && <SimulatedSupplier />}</> : "A supplier"]);
  // A donation: who gets the food (always with its badge: every recipient is simulated) and when it is picked up.
  if (typeof p.recipient_id === "string") textRows.push(["To", <>{names.recipient ?? "A simulated recipient that is no longer listed"} <SimulatedRecipient /></>]);
  if (typeof p.pickup_from === "string" && typeof p.pickup_to === "string") {
    textRows.push(["Pickup", `${dayLabel(p.pickup_from, tz, SITE.locale)} ${formatTime(p.pickup_from, tz, SITE.locale)} – ${formatTime(p.pickup_to, tz, SITE.locale)}`]);
  }
  if (typeof p.business_date === "string") textRows.push(["For", formatDate(p.business_date, SITE.locale)]);
  if (typeof p.valid_from === "string") textRows.push(["Starts", formatDate(p.valid_from, SITE.locale)]);
  if (typeof p.expected_on === "string") textRows.push(["Expected", formatDate(p.expected_on, SITE.locale)]);

  return (
    <main className="wrap staff-main max-w-[860px] space-y-5">
      {!online && <div className="offline-bar" role="status">You&apos;re offline. Showing the last update.</div>}
      <Link href="/staff/inbox" className="btn btn-plain">← Inbox</Link>
      <article className="card space-y-4 p-6" aria-labelledby="draft-title">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={DRAFT_TONE[detail.draft.status] ?? "new"}>{DRAFT_STATUS[detail.draft.status] ?? detail.draft.status}</StatusPill>
            <span className="text-[15px] text-muted">{sourceName(detail.draft.source)} · {detail.draft.outlet_ids.length === 0 ? "Whole business" : detail.draft.outlet_ids.map(outletName).join(", ")}</span>
          </div>
          <h1 id="draft-title" className="text-[30px]">{draftTitle(detail.draft.command_type)}</h1>
        </header>

        <div>
          {textRows.map(([label, value]) => (
            <div key={label} className="draft-field"><p className="font-semibold">{label}</p><p>{value}</p></div>
          ))}
          {fields.map((f) => (
            <DraftField key={f.path} label={labelOf(f)} value={f.value} edit={edits[f.path] ?? null} editorName={me.name} fmt={fmt} column={f.column}
              lineUnit={typeof f.line?.unit === "string" ? f.line.unit : undefined} onOpen={open}
              editing={editing} onEdit={editing ? (v) => setEdits((e) => { const next = { ...e }; if (v === null) delete next[f.path]; else next[f.path] = v; return next; }) : undefined} />
          ))}
        </div>

        {detail.draft.command_type === "purchasing.po.create.v1" && <p className="text-[14px] text-muted">{PO_LINE}</p>}

        {detail.draft.based_on.length > 0 && (
          <div className="space-y-1">
            <p className="font-semibold">Based on</p>
            <ul className="space-y-1">
              {detail.draft.based_on.map((b) => {
                const ref = parseRef(b.ref);
                return (
                  <li key={b.ref}>
                    {templateWords(b.template_id)}:{" "}
                    {ref ? <SourcedValue text={formatCell(b.expected, columnOf(ref), fmt)} refToken={b.ref} onOpen={open} /> : <CannotVerify />}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {detail.draft.status === "stale" && (
          <div className="space-y-2">
            <p className="font-semibold">{STALE}</p>
            <ul className="space-y-1">
              {changes.map((c) => {
                const was = parseRef(c.ref);
                const now = c.now_ref ? parseRef(c.now_ref) : null;
                return (
                  <li key={c.ref}>
                    Was {was ? <SourcedValue text={formatCell(c.value, columnOf(was), fmt)} refToken={c.ref} onOpen={open} /> : <CannotVerify />}
                    {" · now "}
                    {now && c.now_ref ? <SourcedValue text={formatCell(c.now, columnOf(now), fmt)} refToken={c.now_ref} onOpen={open} /> : <CannotVerify />}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="lineage">{lineageLine(detail, when, names.finding)}</p>

        <DecisionBar
          name={me.name} gate={gate} commandType={detail.draft.command_type} edits={edits} editing={editing}
          onEdit={(on) => { setEditing(on); if (!on) setEdits({}); }}
          busy={dec.busy} error={dec.error} retry={dec.retry} wait={dec.wait}
          onApprove={() => dec.approve(null, null)}
          onApproveEdited={(reason) => dec.approve(withEdits(detail.draft.payload, edits, me.member_id), reason)}
          onReject={dec.reject}
        />
        {result?.type === "purchasing.po.create.v1" && <Link href={`/staff/purchase-orders/${result.entityId}`} className="btn btn-secondary">Open the purchase order</Link>}
      </article>

      <section aria-labelledby="history-title" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="history-title" className="text-[22px]">What happened</h2>
          <LiveLine state={live} onRefresh={() => void load()} />
        </div>
        <ol className="space-y-1">
          {detail.history.map((h, i) => (
            <li key={i} className="text-[15px]">
              {historyWords(h)} · {when(h.at)}{h.reason ? <> · “<span>{h.reason}</span>”</> : null}
            </li>
          ))}
        </ol>
      </section>

      <SnapshotDrawer client={client} open={drawer} onClose={() => setDrawer(null)} fmt={fmt} tz={tz} label={templateWords} />
      <Toast message={toast} />
    </main>
  );
}
```

```tsx
// file: components/staff/pages/owner-home.tsx
"use client";
// /staff/home: the chosen outlet today, in figures that each open the rows behind them, and what waits for a person.
// Figures are snapshots minted here (owner-figures.ts) on load, on an outlet change and on "Refresh figures" only:
// every mint is a new snapshot row, so a live event never re-mints. "Orders today" is a list length, not a snapshot.
// The inbox part refetches on inbox:<tenant>. Owners and managers only.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCountdown, useOnline } from "@/lib/hooks";
import { findingTitle, draftTitle, sourceName } from "@/lib/munim/drafts";
import { formatDate, formatWhen } from "@/lib/munim/format";
import { loadOwnerFigures, noFigures, type Figure, type OwnerFigures } from "@/lib/munim/owner-figures";
import { formatCell, type CellFormat } from "@/lib/munim/refs";
import { can } from "@/lib/munim/session";
import { watchFor } from "@/lib/munim/staff-app";
import { specialistName, staffErrorText } from "@/lib/munim/staff-copy";
import { topic, type LiveState } from "@/lib/munim/staff-stream";
import { templateWords } from "@/lib/munim/template-words";
import type { Schemas } from "@/lib/munim/types";
import { SITE } from "@/lib/site";
import { Ribbon } from "../../pages/home";
import { useStaff } from "../shell";
import { CannotVerify, SnapshotDrawer, SourcedValue, StatCard } from "../source";
import { LiveLine, NotForRole, type OpenRef } from "./inbox";

const RIBBON = ["Sample shop — orders are not real.", "Demo: all data is synthetic.", "Suppliers and recipients are simulated.", "Every number opens the rows behind it."];

/** A figure as text for StatCard: undefined while loading, null for "Cannot verify". */
const shown = (f: Figure | null | undefined, fmt: CellFormat): string | null | undefined => (f === undefined ? undefined : f === null ? null : formatCell(f.value, f.column, fmt));

/** A card that shows a word, not a number: the snapshot answered with no rows. */
function WordCard({ label, word, note }: { label: string; word: string; note: string }) {
  return (
    <div className="card stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{word}</p>
      <p className="text-[14px] text-muted">{note}</p>
    </div>
  );
}

/** One sourced figure inline, or "Cannot verify". */
function Inline({ f, fmt, onOpen, unit }: { f: Figure | null; fmt: CellFormat; onOpen: OpenRef; unit?: string }) {
  if (!f) return <CannotVerify />;
  const text = formatCell(f.value, f.column, fmt);
  return <SourcedValue text={unit ? `${text} ${unit}` : text} refToken={f.ref} onOpen={onOpen} />;
}

export function OwnerHomePage() {
  const { session, client, outlet, handleAuth } = useStaff();
  const allowed = can(session, "home");
  const [tenant, setTenant] = useState<Schemas["V1Tenant"] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [figures, setFigures] = useState<OwnerFigures | null>(null);
  const [orders, setOrders] = useState<{ n: number; more: boolean } | "failed" | null>(null);
  const [ingredients, setIngredients] = useState<Schemas["V1InventoryIngredients"]["items"]>([]);
  const [inbox, setInbox] = useState<Schemas["V1InboxResponse"] | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");
  const [drawer, setDrawer] = useState<{ snapshotId: string; refToken: string } | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const online = useOnline();
  const waitS = useCountdown(retryAt, () => setRetryAt(null));
  const outletId = outlet?.id ?? null;

  const loadFigures = useCallback(async () => {
    if (!outletId) return;
    setFigures(null);
    setOrders(null);
    // "Today" is the outlet's business date, as the menu reports it.
    const menu = await client.getMenu(outletId, "counter");
    if (!menu.ok) {
      if (handleAuth(menu.error)) return;
      setToday(null);
      setFigures(noFigures(menu.error));
      setOrders("failed");
      return;
    }
    const day = menu.data.business_date;
    setToday(day);
    const [f, o] = await Promise.all([loadOwnerFigures(client, outletId, day), client.listOrders({ outlet: outletId, business_date: day, limit: 100 })]);
    if (f.error && handleAuth(f.error)) return;
    if (f.error?.kind === "rate_limited") setRetryAt(Date.now() + (f.error.retryAfterMs ?? 5000));
    setFigures(f);
    setOrders(o.ok ? { n: o.data.items.length, more: o.data.next_cursor !== null } : "failed");
  }, [client, outletId, handleAuth]);

  const loadInbox = useCallback(async () => {
    const r = await client.listInbox();
    if (r.ok) setInbox(r.data);
    else handleAuth(r.error);
  }, [client, handleAuth]);

  useEffect(() => {
    if (!allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and on an outlet change
    void loadFigures();
  }, [allowed, loadFigures]);

  useEffect(() => {
    if (!allowed) return;
    void client.getTenant().then((r) => r.ok && setTenant(r.data));
    void client.listIngredients().then((r) => r.ok && setIngredients(r.data.items));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the response
    void loadInbox();
    return watchFor(session, [topic.inbox(session.tenantId)], () => void loadInbox(), setLive);
  }, [allowed, client, loadInbox, session]);

  if (!allowed) return <NotForRole />;
  if (!outlet) return <main className="wrap staff-main"><div className="state-box" role="status">Loading</div></main>;

  const tz = outlet.tz;
  const fmt: CellFormat | null = tenant ? { locale: SITE.locale, currency: tenant.base_currency } : null;
  const open: OpenRef = (snapshotId, refToken) => setDrawer({ snapshotId, refToken });
  const ing = (id: string | null) => ingredients.find((i) => i.ingredient_id === id);
  const f = fmt ? figures : null;
  const items = inbox?.items.slice(0, 3) ?? [];
  const waiting = inbox ? `${inbox.items.length}${inbox.next_cursor ? "+" : ""}` : null;

  return (
    <main className="space-y-6 pb-10">
      {!online && <div className="offline-bar" role="status">You&apos;re offline. Showing the last update.</div>}
      <div className="wrap staff-main space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="section-title">{outlet.name} today</h1>
            <p className="mt-3 text-muted">
              {today ? `Business date ${formatDate(today, SITE.locale)} · ` : ""}Figures are taken from the books when this page opens.
            </p>
          </div>
          <button type="button" className="btn btn-plain" disabled={figures === null || retryAt !== null} onClick={() => void loadFigures()}>Refresh figures</button>
        </div>
        {retryAt !== null && <p className="text-muted" role="status">Too many requests. Please wait a moment and try again. You can refresh in {waitS} s.</p>}
        {figures?.error && figures.error.kind !== "rate_limited" && !today && <p className="text-muted">{staffErrorText(figures.error, "home")}</p>}
      </div>
      <Ribbon items={RIBBON} />

      <section aria-label="Today's figures" className="wrap grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card stat">
          <p className="stat-label">Orders today</p>
          {orders === null ? <div className="skeleton h-10 w-32" aria-hidden="true" />
            : orders === "failed" ? <p className="text-muted">Couldn&apos;t load. Tap Refresh figures.</p>
            : <p className="stat-value">{new Intl.NumberFormat(SITE.locale).format(orders.n)}{orders.more ? "+" : ""}</p>}
          <p className="text-[14px] text-muted">Counted from today&apos;s order list. <Link href="/staff/counter">See them at the counter</Link></p>
        </div>

        {!f ? <StatCard label="Kitchen tickets today" value={undefined} refToken={null} onOpen={open} />
          : <StatCard label="Kitchen tickets today" value={f.tickets === "none" ? null : shown(f.tickets, fmt!)} refToken={f.tickets && f.tickets !== "none" ? f.tickets.ref : null} onOpen={open} />}

        {!f ? <StatCard label="Net sales this week" value={undefined} refToken={null} onOpen={open} />
          : f.netSales === "none" ? <WordCard label="Net sales this week" word="None yet" note="No completed orders since Monday." />
          : <StatCard label="Net sales this week" value={shown(f.netSales, fmt!)} refToken={f.netSales?.ref ?? null} note="Completed orders since Monday, after discounts." onOpen={open} />}

        {!f ? <StatCard label="Most waste this week" value={undefined} refToken={null} onOpen={open} />
          : f.waste === "none" ? <WordCard label="Most waste this week" word="None" note="No waste recorded since Monday." />
          : <StatCard label="Most waste this week" value={f.waste ? shown(f.waste.amount, fmt!) : null} refToken={f.waste?.amount?.ref ?? null}
              note={f.waste ? `${ing(f.waste.ingredientId)?.name ?? "One ingredient"}, since Monday. Open the source for every ingredient.` : undefined} onOpen={open} />}

        <div className="card stat">
          <p className="stat-label">Food shared this month</p>
          {!f ? <div className="skeleton h-10 w-32" aria-hidden="true" />
            : !f.shared ? <CannotVerify />
            : (
              <ul className="space-y-1 text-[17px] font-semibold">
                <li>Portions <Inline f={f.shared.portions} fmt={fmt!} onOpen={open} /></li>
                <li>Packed items <Inline f={f.shared.units} fmt={fmt!} onOpen={open} /></li>
                <li>Hand-overs <Inline f={f.shared.handovers} fmt={fmt!} onOpen={open} /></li>
              </ul>
            )}
          <p className="text-[14px] text-muted">To simulated recipients. Measured on synthetic data. <Link href="/staff/cares">Open Cares</Link></p>
        </div>
      </section>

      <div className="wrap grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="needs-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="needs-title" className="section-title text-[28px]">What needs you</h2>
            <LiveLine state={live} onRefresh={() => void loadInbox()} />
          </div>
          {inbox === null ? <div className="skeleton h-32" role="status" aria-label="Loading" />
            : items.length === 0 ? <div className="state-box"><p>Nothing waiting for you.</p></div>
            : (
              <ul className="grid gap-3">
                {items.map((it) => it.kind === "finding" ? (
                  <li key={it.finding.finding_id} className="card p-4">
                    <Link href={`/staff/inbox#finding-${it.finding.finding_id}`} className="grid gap-1 no-underline">
                      <span className="badge justify-self-start">Finding</span>
                      <span className="text-[19px] font-semibold">{findingTitle(it.finding.type)}</span>
                      <span className="text-[15px] text-muted">{specialistName(it.finding.pack)} · {formatWhen(it.finding.created_at, tz, SITE.locale)}</span>
                    </Link>
                  </li>
                ) : (
                  <li key={it.draft.draft_id} className="card p-4">
                    <Link href={`/staff/inbox/${it.draft.draft_id}`} className="grid gap-1 no-underline">
                      <span className="badge justify-self-start">Proposal · waiting for you</span>
                      <span className="text-[19px] font-semibold">{draftTitle(it.draft.command_type)}</span>
                      <span className="text-[15px] text-muted">{sourceName(it.draft.source)} · {formatWhen(it.draft.created_at, tz, SITE.locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          {waiting && <Link href="/staff/inbox" className="btn btn-secondary">Open the inbox · {waiting} waiting</Link>}
        </section>

        <section aria-labelledby="low-title" className="card space-y-3 p-5">
          <h2 id="low-title" className="text-[22px]">Low stock</h2>
          {!f ? <div className="skeleton h-24" aria-hidden="true" />
            : f.lowStock === null ? <CannotVerify />
            : f.lowStock.length === 0 ? <p className="text-muted">Nothing is below its minimum.</p>
            : (
              <ul className="space-y-2">
                {f.lowStock.map((r, i) => (
                  <li key={r.ingredientId ?? i}>
                    <p className="font-semibold">{r.name ?? ing(r.ingredientId)?.name ?? "An ingredient"}</p>
                    <p className="text-[15px]">
                      On hand <Inline f={r.onHand} fmt={fmt!} onOpen={open} unit={ing(r.ingredientId)?.base_unit} /> · minimum{" "}
                      <Inline f={r.minimum} fmt={fmt!} onOpen={open} unit={ing(r.ingredientId)?.base_unit} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          <Link href="/staff/suppliers" className="btn btn-plain">Open suppliers</Link>
        </section>
      </div>

      {fmt && <SnapshotDrawer client={client} open={drawer} onClose={() => setDrawer(null)} fmt={fmt} tz={tz} label={templateWords} />}
    </main>
  );
}
```

```tsx
// file: app/staff/home/page.tsx
import type { Metadata } from "next";
import { OwnerHomePage } from "@/components/staff/pages/owner-home";

export const metadata: Metadata = { title: "Owner home" };

export default function Page() {
  return <OwnerHomePage />;
}
```

```tsx
// file: app/staff/inbox/page.tsx
import type { Metadata } from "next";
import { InboxPage } from "@/components/staff/pages/inbox";

export const metadata: Metadata = { title: "Inbox" };

export default function Page() {
  return <InboxPage />;
}
```

```tsx
// file: app/staff/inbox/[draftId]/page.tsx
import type { Metadata } from "next";
import { DraftDetailPage } from "@/components/staff/pages/draft-detail";

export const metadata: Metadata = { title: "A proposal" };

export default function Page() {
  return <DraftDetailPage />;
}
```

Notes on the code:

- `numericFields`, `approveGate`, `withEdits` and the words (`draftTitle`, `lineageLine`, …) are 01 §6.1's
  `lib/munim/drafts.ts`; the buttons are 02 §5's `DecisionBar`. This page adds only its rows, names and history.
- `numericFields` walks the payload the way core does. A leaf is a number field when it is a ref string (`⟨…⟩`) or a
  person's edit `{value, typed_by}`; the contract admits no bare number in a draft. `draftValue` (01 §6) then gives
  the field "proposed" (with its resolved value), "edited" or "unverified".
- `approveGate` is 20 §3.2 in code. It also covers one case the inbox list cannot see: an unverified ref that is a
  **snapshot cell**, or that no field holds. Core re-reads the cells a draft was based on, under the approver's scope,
  before it applies anything. Typing over such a number cannot pass that check, so only Reject is offered.
- `withEdits` changes only the leaves the person typed, each to `{value, typed_by: me.member_id}`. Every other ref
  stays exactly as proposed (core checks it is the same ref at the same path).
- `parseTyped` (01 §6) turns what was typed into the field's units: "1,410.00" in a `*_minor` field is `141000`.
- No line total is shown on a purchase-order draft: quantity × price would be arithmetic in the browser. The purchase
  order's `total_minor` (15) is core's.

## 8 · Acceptance checklist

`[mock]` = check it on the mock. `[unit]` = a unit test or a stubbed response, because the mock cannot produce it.
`[real]` = only on the real API.

**Home**
- [ ] [mock] Signed in as Nandini (owner) at Cobnut Hazratganj, `/staff/home` shows the following, each with a
      "Source" chip:
      - "Kitchen tickets today";
      - "Net sales this week" (₹1,24,500.00 on the mock);
      - "Most waste this week" ₹4,860.00 with "Butter (synthetic), since Monday";
      - "Food shared this month" with Portions 18, Packed items 6, Hand-overs 1, and "To simulated recipients. Measured
        on synthetic data.";
      - "Low stock" with Roasted hazelnuts (synthetic) "On hand 3,200 g · minimum 5,000 g".
- [ ] [mock] Each chip opens "Where this number comes from" with the template in words ("Kitchen tickets", "Labour and
      net sales by week", "Waste this week", "Food shared", "Stock below its minimum"), the rows, and the cited cell
      outlined. "Most waste" outlines the butter row, not the first row.
- [ ] [mock] "Orders today" is the length of `GET /v1/orders?business_date=…` for the outlet (compare in the network
      tab) and has no chip. No figure on the page appears in the source code.
- [ ] [mock] Switching the outlet to Cobnut Gomti Nagar mints five new snapshots (five `POST /v1/snapshots` in the
      network tab) and the title becomes "Cobnut Gomti Nagar today". Its "Low stock" says "Nothing is below its
      minimum."
- [ ] [mock] A dismiss in another tab updates "What needs you" without reloading, and the network tab shows
      `GET /v1/inbox` but **no** `POST /v1/snapshots`.
- [ ] [mock] "Force 429" on, then "Refresh figures": the cards show "Cannot verify", and "Too many requests. Please
      wait a moment and try again. You can refresh in 5 s." counts down. Turn it off and refresh: the figures return.
- [ ] [mock] Signed in as Imran or Kavya (staff), `/staff/home` and `/staff/inbox` show "This page is for owners and
      managers." The nav has no "Home" or "Inbox" chip, and no `inbox:` stream is opened (network tab).
- [ ] [unit] A stubbed `people.labour_pct` with `rows: []` shows "None yet" / "No completed orders since Monday.". A
      stubbed `inventory.waste_week` with `rows: []` shows "None" / "No waste recorded since Monday.". Neither shows 0.
- [ ] [unit] A stubbed mint that fails (500) shows "Cannot verify" on that card only.
- [ ] [unit] `mondayOf("2026-10-14")`, `mondayOf("2026-10-12")` and `mondayOf("2026-10-18")` are "2026-10-12";
      `monthStartOf("2026-10-14")` is "2026-10-01".
- [ ] [mock] At 390 px: one column, the bar wraps to two rows, the ribbon scrolls (it stops with reduced motion),
      every chip is reachable and ≥ 48 px.

**Inbox and findings**
- [ ] [mock] `/staff/inbox` shows three findings and four proposals, newest first. The butter finding reads its sentences with three
      chips and "Impact:" ₹3,340.00 with a chip. No `confidence_bp` appears.
- [ ] [mock] "Dismiss" → "Not needed" → "Dismiss as Nandini Mehrotra (demo)": the toast says "Dismissed." and the
      finding leaves the list.
- [ ] [mock] Open the same finding in a second tab, and block `/v1/stream` there in DevTools so the live refetch does
      not remove it first. Dismiss it in the first tab, then in the second. The second gets "Someone already dismissed
      this. The inbox has been refreshed." (core and mock answer 409 `conflict`).
- [ ] [mock] Dismiss offers no note box (the command takes a reason code only).
- [ ] [mock] "Decided" lists every draft decided in this session with "· Approved with edits by Nandini Mehrotra
      (demo)" (or "Approved" / "Rejected"), the most recently decided first (as core).
- [ ] [mock] Inbox items carry no `unverified_refs`, so the list shows no approve button anywhere. Only the draft page
      decides.
- [ ] [unit] A finding segment "Sales were 4200 today" with `refs: []` renders as one "Cannot verify" chip.
- [ ] [unit] An abstained finding (`abstained: true, reason_code: "insufficient_history"`) shows "Cannot verify" with
      "There isn't enough history to answer that yet." and no "Impact:".
- [ ] [unit] A finding segment holding `<b>x</b>` renders the literal text.

**Draft page** (the mock seeds four drafts and decides each once: restart `npm run dev` to seed them again between
checks that decide the same draft)
- [ ] [mock] "Change an item's prep time":
      - rows: "Item: Hazelnut Praline Cake", "Outlet: Cobnut Hazratganj", "Station: Kitchen", "Starts: {tomorrow}";
      - "Prep time" "Proposed · 41 min" with a chip;
      - "Based on" "Kitchen ticket times: 41 min" with a chip;
      - the lineage "Proposed by Kitchen · {time} · from a finding: Tickets running past their prep time";
      - buttons "Approve as Nandini Mehrotra (demo)", "Edit", "Reject".
- [ ] [mock] Approving it: the button reads "Saving…", every button is disabled, then the toast says "Approved and
      applied.", the pill turns to "Applied", the lineage gains "· Approved by Nandini Mehrotra (demo) · {time}" and
      the buttons are gone.
- [ ] [mock] Double-clicking "Approve" sends one request.
- [ ] [mock] The purchase order:
      - "Supplier: Lalbagh Nut & Spice (simulated)" with "Simulated supplier";
      - "Roasted hazelnuts (synthetic) · Quantity (kg)" "Proposed · 9" with a chip;
      - "Roasted hazelnuts (synthetic) · Price per kg" "Proposed · ₹1,410.00" with a chip that opens "Quotes from
        simulated suppliers" with round two of Lalbagh outlined;
      - "Munim works out the total when it is approved. Recorded only — Munim does not process payments. Simulated
        supplier: nothing is sent to a real business.";
      - "Based on" lists five cells, each with a chip: "Stock short of what is needed", "Supplier prices over time",
        "What a quote was checked against" and the two quote cells;
      - buttons "Approve as Nandini Mehrotra (demo)", "Edit", "Reject".
- [ ] [mock] The Cares proposal opened at `/staff/inbox/{id}` (from the inbox's "Review"):
      - rows "To Riverside Night Shelter (simulated)" with "Simulated recipient", and "Pickup Today 9:00 pm – 10:30 pm"
        ("Tomorrow" once it is past 9 pm at the outlet);
      - "Sliced sourdough loaf (synthetic) · Quantity (piece)" "Proposed · 12" with a chip;
      - "Approve as Nandini Mehrotra (demo)" publishes the listing, which then shows on `/staff/cares`.
- [ ] [mock] "Edit" on the purchase order:
      - "Approve with my edits as Nandini Mehrotra (demo)" stays disabled until a value is typed **and** "Why you
        changed it" is filled; "Approve as …" is not shown while editing.
      - The quantity's input reads "Change it (optional) (kg)"; the price's "Change it (optional) (INR)".
      - Typing "1390" in the price shows "₹1,390.00 Edited by Nandini Mehrotra (demo)" beside the struck-through
        proposal and its chip.
      - Sending: the request body's `edited_payload.lines[0].unit_price_minor` is `{ "value": 139000, "typed_by":
        "<Nandini's member_id>" }`, and `qty_milli` is still the proposed ref (network tab).
      - The page then offers "Open the purchase order", and that page shows ₹1,390.00 per kg and "Approved with edits
        by Nandini Mehrotra (demo)".
      - Reloading the draft shows the proposal again ("Proposed · ₹1,410.00"): the draft keeps its proposed payload,
        and the typed price lives on the purchase order (00 §7 question 15).
- [ ] [mock] "Cancel" while editing drops the typed values and the reason; "Edit" again starts empty.
- [ ] [mock] With the network offline, tap "Approve with my edits". Bring it back and tap again: the two request
      bodies are byte-identical (same `command_id`, `idempotency_key`). Change the price and tap: new ids.
- [ ] [mock] "Reject" on the prep list:
      - "Reject as {name}" stays disabled until a reason and a note are chosen;
      - then the pill reads "Rejected", "What happened" shows "Rejected · Nandini Mehrotra (demo) · {time} · “{note}”",
        and the toast says "Rejected. Nothing was changed.";
      - a note of `<i>x</i>` shows as the literal text.
- [ ] [mock] Mock controls "Next approve: stale", then "Approve" on the prep-time draft: pill "Out of date", the stale sentence and "Was 41
      min · now Cannot verify". No buttons.
- [ ] [mock] "Next approve: already decided": toast "Someone else already decided this. It has been refreshed."
- [ ] [mock] "Next approve: can't apply": "It was approved but could not be applied. Nothing changed." and the pill
      "Couldn't apply"; no buttons. A second tap would get the same answer (core).
- [ ] [mock] Two tabs as Nandini on the same draft: approve in one. In the other, the pill and the lineage line update
      from the live event without a tap, and without a toast (it is the same person). With `/v1/stream` blocked in the
      second tab, its "Approve" tap gets the toast "Someone else already decided this. It has been refreshed." (409
      `already_decided`) instead. The mock has no second person who may decide: Imran and Kavya are staff.
- [ ] [unit] A live-event refetch that returns the draft decided by **another** member (stub `getDraft`) shows the toast
      "Someone else already decided this. It has been refreshed." without a tap.
- [ ] [mock] `/staff/inbox/not-a-uuid` and an unknown UUIDv7 both show "Not found.". The first sends no request.
- [ ] [mock] At 390 px every field, button and the drawer are usable; the drawer's table scrolls sideways.
- [ ] [unit] `approveGate` (01 §6.1):
      - a draft with `outlet_ids: []` for a manager → `not_for_you` ("… it changes the whole business.");
      - a `cares.listing.publish.v1` draft for a manager → `not_for_you` ("Only the owner can approve or reject a
        donation."), and `DecisionBar` renders no button;
      - one whose `unverified_refs` holds a `⟨snap:…⟩` ref → `untraceable` (only Reject);
      - one holding a ref that no payload leaf has → `untraceable`;
      - one whose only unverified ref is a quoted value (`⟨cite:…⟩`) on a payload leaf → `type_first`: "Approve" hidden,
        "Approve with my edits" enabled once that field and the reason are typed;
      - a two-outlet draft for a manager of one of them → `not_for_you` ("Only the owner can decide this one: it covers
        outlets beyond yours."), and `DecisionBar` renders no button (the mock and core answer that manager's approve
        with 403 `authority_denied`);
      - a draft whose payload has `outlet_id: null` for a manager → `not_for_you` ("… it changes the whole business.");
      - staff → `not_for_you` ("Owners and managers decide proposals.").
- [ ] [unit] Values are per viewer: the bodies the mock serves Imran (staff) for `GET /v1/inbox` and `GET /v1/drafts/{id}`
      carry no resolved values (findings' `resolved_refs` empty; every ref in the draft's `unverified_refs`), and
      rendered with `AiSegment` and `DraftField` every number reads "Cannot verify". (These pages are not for staff,
      so this is a render of the served bodies, not a page.)
- [ ] [unit] A stubbed approve answer 422 `cannot_verify` refetches the draft and shows "Cannot verify — some numbers
      in this draft no longer trace to their source rows."
- [ ] [unit] A decided draft whose `decision.decided_by.name` is null reads "… by a team member".
- [ ] [real] A manager can decide an outlet draft of their own outlet. A whole-business draft shows "Only the owner can
      decide this one: it changes the whole business." On the real API an approve attempt by the manager is 403.
- [ ] [real] After "Approve with my edits" on the real API, reloading the draft shows the proposal again, not the
      typed value, as on the mock (00 §7 question 15). The purchase order (15) carries the typed price.

**Rules (20)**
- [ ] [mock] `grep -rn "reduce\|+ .*_minor\|_minor *+" lib/munim/owner-figures.ts lib/munim/drafts.ts components/staff/pages`
      finds no arithmetic on money or counts.
- [ ] [mock] No `dangerouslySetInnerHTML` in these files. No token or tenant id in a URL (network tab), except the
      `inbox:<tenant>` stream topic, which core requires (20 §4).
- [ ] [mock] Every approve and reject button names the person. There is no "approve all", and nothing is decided
      without a tap.

## 9 · Screenshots

Named `staff-<screen>-<state>-<width>.png` (00 §5). Owner home at 390 and 1280; the inbox and the draft page at 390
and 1280. No screenshot shows a token or a tenant id.

| Screen | States |
|---|---|
| `home` | `loaded`, `drawer-open`, `loading`, `cannot-verify` (stubbed), `no-rows` (stubbed), `rate-limited`, `offline`, `live-off`, `role-not-allowed`, `gomti-nagar` |
| `inbox` | `waiting`, `decided`, `empty`, `finding-dismiss`, `already-dismissed`, `abstained-finding` (stubbed), `loading`, `error` |
| `draft` | `traced`, `po-traced`, `po-editing`, `po-approved-with-edits`, `type-first` (stubbed), `approved`, `rejecting`, `rejected`, `stale`, `already-decided`, `execution-failed`, `untraceable` (stubbed), `not-for-you` (stubbed or real), `not-found`, `saving` |

## 10 · Not in this screen

- No lineage page (`GET /v1/drafts/{id}/lineage` is real-API only); the lineage line comes from the draft.
- No editing of a decided draft, no undo, no "approve all", no bulk dismiss.
- No figures for "all outlets at once": the switcher's outlet is the scope. A combined view would need
  `outlet_id: null` mints, which the templates allow, if the founder wants one later.
- No sales-today figure (no snapshot gives one).
