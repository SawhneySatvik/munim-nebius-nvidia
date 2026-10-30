# 14 · Munim Cares: food at risk, a simulated recipient, the hand-over, the impact

Read 00, 20, 01, 02 and 03 first. Everything here is **synthetic**. Every recipient is a **simulated** organisation
whose name ends in "(simulated)". No food goes to a real organisation, no real person is contacted, and no money
changes hands.

| | |
|---|---|
| Route | `/staff/cares` (one route, 00 §1) |
| Who | Owner (everything), manager (everything except publishing and deciding), counter and kitchen staff (listings and hand-overs only) |
| Width | 1024 × 768 and 1280 × 800 landscape; every screen at 200 % zoom. 390 px is not required here, but nothing may be lost there. |
| Look | 02 §1: the scallop and swash title in the header; cards; no ticker band |
| Labels | "Measured on synthetic data", "to simulated recipients", "Simulated recipient" beside every recipient name, "Check your local food-donation rules" (20 §2) |

The flow this screen carries, end to end:

1. Munim's watcher finds a batch that will expire before it is used (an `inventory.expiry_risk` finding).
2. Where Cares is on, it drafts a donation (`cares.listing.publish.v1`) to the simulated recipient that core ranks
   first (`cares.recipient_match`). The **code** picks the recipient; no model chooses it.
3. The owner reads the proposal: the quantity carries its source chip, and so do the pickup window and the ranked
   recipients. The owner then approves it, approves it with their own quantity, or rejects it.
4. At pickup, anyone on the outlet's staff records the hand-over. Core closes the listing once everything has gone.
5. The impact ("Food shared this month") is a snapshot the screen mints. Each figure carries its chip, and the block
   says "Measured on synthetic data".

The owner can also list food themselves (§5.4). Nothing is published, handed over or withdrawn without a named
person's tap.

## 1 · Purpose and who uses it

The owner gives away food that would otherwise be thrown out, and every gram of it traces to the books. Managers can
see everything the owner sees, but core refuses them the decisions: `cares.listing.publish.v1` is owner and judge
only (0028 `command_authority`), and approving or rejecting a draft also needs the draft's own command type (core's
`roleAllowed`). Staff at the counter or in the kitchen see tonight's listings and record what they hand over.

| Panel or action | owner | manager | staff | judge | Grounded in |
|---|---|---|---|---|---|
| Open `/staff/cares` | yes | yes | yes | yes | `CAN.cares` (01 §8). An advisor gets "role-not-allowed" |
| Listings and their hand-overs (`GET /v1/cares/listings`) | yes | yes | yes | yes | Rows inside the person's outlets |
| Food at risk, ranked recipients, AI proposals, impact | yes | yes | **hidden** | yes | Every template here is manager and up: a staff mint or open is 404, so the screen never calls it for staff |
| Approve, approve with my edits, reject a proposal | yes | **no** (core 403) | no | yes | `cares.listing.publish.v1` is `{owner, judge}` |
| Publish own listing | yes | no | no | yes | Same row; the mock answers 403 `book_write_refused` |
| Withdraw a listing | yes | yes | no | yes | `cares.listing.withdraw.v1` is `{owner, manager, judge}` |
| Record a hand-over | yes | yes | yes | yes | `cares.handover.record.v1` is `{owner, manager, staff, judge}` |

`caresCan(role, action)` in `lib/munim/cares-flow.ts` (§7) is this table. It hides what would be refused. The API is
still the guard, and every refusal has its copy (§4.4).

## 2 · Route and layout

`app/staff/cares/page.tsx` is a thin page that renders `CaresScreen` from `components/staff/pages/cares.tsx` (02 §3).
`CaresScreen` (§7) carries this section and §3–§6, built from the components in §7. It reads `session`, `client`,
`outlet` and `handleAuth` from `useStaff()`. `fmt` is `{ locale: SITE.locale, currency: tenant.base_currency }` and
`tz` is `outlet.tz`.

Top to bottom, in `.staff-main`:

1. **Header.** A swash `.section-title` with "Munim Cares", the `.scallop` edge, then one line: "Surplus food to
   simulated recipients · Measured on synthetic data · Check your local food-donation rules". Then the profile strip:
   the business's `profile.public_name`, "Pickup hours {pickup_from}–{pickup_to}" for this outlet (local times from
   `GET /v1/cares/profile`, shown as stored), and the city (`titleCase(city_code)`). On the right: "Refresh" and,
   while live updates are off, the muted line "Live updates are off. Tap Refresh to update." (02 §9).
2. **"Food at risk"** (insight roles): one row per `inventory.expiry_risk` row.
3. **"Proposed by Munim"** (insight roles): one `ListingDraftCard` per proposal.
4. **"List food yourself"** (owner, judge): the button "List food yourself", which opens `OwnListingForm` in place.
   Each at-risk row's "List this" opens the form for that row's batch.
5. **"Listings"**: "Waiting for pickup" (`status: "published"`), then "Earlier" (`closed`, `withdrawn`), newest first
   (the API's order), one `ListingCard` each.
6. **"Food shared this month"** (insight roles): the impact cells.

**At 1280 × 800 and 1024 × 768:** from 1100 px wide, two columns, `grid-template-columns: minmax(0, 2fr)
minmax(320px, 1fr)`. The main column holds 2–5; the side column is sticky (`top: 132px`, under the staff bar) and holds
the profile strip and the impact card. Below 1100 px (1024 × 768 included) it is one column: header, impact, food at
risk, proposals, own listing, listings. Cards are full width, and buttons are at least 48 px tall (they are not POS
actions, so 64 px is not required). At 390 px the same single column holds, with each card's buttons wrapping.

Staff see only 1 and 5, so their screen is the header and the listings.

## 3 · Data loading

All calls go through `client` from `useStaff()`. Pass every failed result to `handleAuth` first, which signs out on a
401.

| When | Calls (in parallel unless numbered) | Then |
|---|---|---|
| Mount, and each time `outlet` changes | `getCaresProfile()`, `getTenant()`, `getMenu(outlet.id, "counter")` (gives `business_date` and the cooked items' names), `listIngredients()`, `listRecipients(outlet.id)`, `listListings({ outlet: outlet.id })` | `gate = caresGate(profile, outlet.id)` |
| …and when `gate === "on"` and `caresCan(role, "insight")` | `mintSnapshot({ template_id: "inventory.expiry_risk", params: atRiskParams(outlet.id, menu.business_date) })`, `mintSnapshot({ template_id: "cares.impact", params: impactParams(outlet.id, menu.business_date) })`, and (1) `listDrafts({ status: "proposed", outlet: outlet.id })`, kept with `isListingDraft`; (2) `getDraft(id)` for each; (3) `getSnapshot(listingDraftView(...).matchSnapshotId)` for each | A failed `getSnapshot` makes that card's ranking "The ranking can't be opened."; the card still shows |
| "Find simulated recipients" in the own-listing form | `mintSnapshot({ template_id: "cares.recipient_match", params: matchParams(form) })` | Shown under the form; any change to the form clears it |
| After any of the person's own commands succeeds (publish, hand-over, withdraw) | `listListings({ outlet })`; for insight roles, the impact mint again | A new impact snapshot (its chip opens the new rows) |
| After any decision outcome on a proposal (§5.1) | The proposals chain (1)–(3), `listListings`, and the impact mint | |
| Live wake-up (owner and manager only): `watchFor(session, [topic.inbox(session.tenantId)], wake, setLive)` | The proposals chain (1)–(3) | The `inbox:` topic carries `inbox.draft` and `inbox.finding`. **Never** open it for staff: it would make the whole stream 404 (01 §7) |
| The tab becomes visible again (`visibilitychange`), and "Refresh" | `listListings`; for insight roles, the proposals chain too | Snapshots are **not** re-minted on focus: each mint writes a snapshot row. Re-mint only on load, on outlet change and after a command |

- **There is no live topic for listings or hand-overs.** Core's `munim.cares.*` events reach no member stream topic
  (01 §7 lists `kds:`, `order:` and `inbox:` only). A hand-over recorded on another tablet therefore shows after
  "Refresh", a focus or the next own action. That is why the screen has "Refresh".
- "Today" is `menu.business_date`, never the tablet's clock. `monthStart` is a string edit, not date arithmetic.
- Names: listing lines and rows carry ids only. Cooked items get their name from the counter menu (`lineName`) and
  stock from `GET /v1/inventory/ingredients`. Recipient names come from `listRecipients` (and, in a ranking, from the
  snapshot's own `name` cell). `published_by`, `recorded_by` and `received_by` are member ids, and no member route
  is in the staff client: show "recorded by you" when the id is `session.me.member_id`, and nothing otherwise.
- The snapshot drawer (02 §4) is mounted once on the page: `onOpen(snapshotId, ref)` opens it. Its `label` gets the
  template words: `inventory.expiry_risk` "Stock close to its use-by date", `cares.recipient_match` "Simulated
  recipients that can take this food", `cares.impact` "Food shared" (02 §4; all three in 12's
  `lib/munim/template-words.ts`).

## 4 · Every state

### 4.1 Page states

| State | Shows |
|---|---|
| loading | The header, then skeleton cards at their final size for each panel the role sees. `role="status"` "Loading" |
| error (one call failed) | That panel only: `ErrorNote` with `staffErrorText(error, "cares")`, then "Try again" (`.btn-plain`). Other panels still render |
| 401 | `handleAuth` signs out (back to `/staff/sign-in`) |
| 404 on a listing or the outlet | `FullPage` "Not found." with "It may have been removed, or it isn't in your outlets." (02 §9) |
| offline (`useOnline()` false, or a call failed with kind `network`) | `.offline-bar` "You're offline. Showing the last update." The last data stays. A command tapped while offline fails with "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." (`staffWriteErrorText`), and its attempt is kept for the retry |
| live updates off (stream `"refused"` or reconnecting) | "Live updates are off. Tap Refresh to update." beside the title |
| role-not-allowed (an advisor, or any role `can(session, "cares")` refuses) | `FullPage` "Munim Cares isn't part of your role." with "Ask the owner if you need it." No call is made |
| `cares_not_available` (`profile.available` false) | In place of panels 2–4 and 6: a card "Munim Cares isn't available in this country yet." Listings (5) still show, if there are any |
| `cares_not_enabled` | The same card: "Munim Cares isn't switched on for this business yet." |
| `cares_paused` (no profile, or `profile.status: "paused"`) | The same card: "Munim Cares is paused for this business." |
| `cares_not_opted_in` (this outlet is not an active Cares outlet) | The same card: "This outlet hasn't joined Munim Cares." |
| empty: no listings | `.state-box` "No food listed today." (02 §9) |
| empty: nothing at risk | "Nothing at {outlet.name} is close to its use-by date." |
| empty: no proposals | "No proposals waiting." |
| empty: no recipient fits | "No simulated recipient can take this food at this outlet's pickup times." (from `RecipientRanking`) |

The profile is read-only here: `cares.profile.set.v1` is not in the staff client, and turning Cares on is the
owner's setup step, not this screen's.

### 4.2 Statuses

| Thing | Status → word (tone) |
|---|---|
| Listing (`LISTING_STATUS`) | `published` "Waiting for pickup" (new) · `allocated` "Claimed" (work, offers only, which this screen never makes) · `closed` "Handed over" (done) · `withdrawn` "Withdrawn" (stop) |
| Proposal (`DRAFT_STATUS`, `DRAFT_TONE`) | `proposed` "Waiting for you" is the only status the panel lists. After a decision the card leaves the list on refetch, and the listing appears under "Listings" |
| Hand-over | `recorded` shows as "Handed over {day time}"; a `voided` hand-over is not shown (voiding is not built here) |
| Ranking row | "Best match" on the first row (row order is core's rank); "Chosen" on the proposal's or the owner's choice; "Has room for this" / "May not have room for all of it" from `capacity_fit` |

### 4.3 "Cannot verify" and source chips

| Where | Traced value (source chip) | "Cannot verify" when |
|---|---|---|
| Food at risk | Each row's at-risk quantity (`at_risk_qty_milli`) and value at cost (`at_risk_minor`), each `SourcedValue` with `snapRef(snapshot_id, row, column)` | The cell is missing (`cellOf` undefined) |
| Proposal quantity | `DraftField` with `draftValue(...)` (`listingDraftView`): proposed ref → value + chip | The ref is not in `resolved_refs`, or is in `unverified_refs`. It is a snapshot cell, and core re-reads the cells a draft is based on under the approver's access, so typing over it cannot pass: the bar offers Reject only (`approveGate` `untraceable`, 01 §6.1) |
| Proposal pickup | The pickup window with the chip of its `based_on` cell (`pickupRef`), only when that cell equals the payload's `pickup_from` | No such cell: the times show without a chip (they are plain ids and dates, not numbers the AI wrote) |
| Ranked recipients | Distance (`distance_m`), overlap (`overlap_min`) and the pickup window, each with its chip | A cell is missing |
| Impact | `handovers`, `portions_milli`, `units_milli`, `weight_g`, `value_at_cost_minor` of row 0, each with its chip, under "Measured on synthetic data" | The mint failed, or row 0 or a cell is missing: that figure (or the whole card) shows "Cannot verify" |
| Drawer | | `GET /v1/snapshots/{id}` 404: "Cannot verify — These rows can't be opened." |

Listing quantities (`lines[].qty_milli`, hand-over lines) are **row fields** of the books, shown as they are with
`qtyText`. They are not AI numbers and need no chip. Nothing on this screen is added up: there is no "listed minus
handed", no "this month's total" worked out in the browser, and no weight converted.

### 4.4 Refusals, by code and reason

`staffErrorText(error, "cares")` (01 §9) gives each line. These are the ones this screen meets:

| Answer | When | Copy (literal) | Then |
|---|---|---|---|
| 403 `forbidden` / `book_write_refused` + `authority_denied` | A role that may not publish, decide or withdraw | "Your role can't do this. Ask the owner." | Nothing changes |
| 422 `invalid_payload` + `recipient_ineligible` | The recipient does not take this food kind, or is not active in the city | "That simulated recipient can't take this food. Choose another." | Own listing: choose another row. Proposal: reject it |
| 422 `invalid_payload` + `listing_expired` | The pickup window is over | "The pickup time has passed. Choose a later time." | Own listing: "Find simulated recipients" again (the next window) |
| 422 `invalid_payload` + `cooked_hold_exceeded` (real API only) | A cooked pickup that starts later than the pack's hold allows | "Cooked food can't be held that long. Choose an earlier pickup." | |
| 422 `invalid_payload` + `line_expired` (real API only) | Use-by date earlier than pickup day + the pack's minimum | "An item is past its date." | |
| 409 `conflict` + `qty_exceeds_on_hand` (real API only) | More stock listed than is on hand | "That's more than is in stock." | |
| 409 `conflict` + `qty_exceeds_listed` | A hand-over larger than what is left on that line | "That's more than was listed." | Type a smaller quantity |
| 409 `conflict` + `cares_not_enabled` / `cares_not_opted_in`; 422 `out_of_pack_scope` + `cares_not_available` | Cares was switched off, or the outlet left Cares, after the page loaded | The `reasonText` line for that code | Refetch the profile: the gate card shows |
| 400 `bad_request` + `unit_mismatch` (real API only) | A unit core cannot convert to the stock's base unit | "That unit doesn't match the item's stock unit." | |
| 409 `illegal_transition` | Hand-over or withdraw on a listing that is no longer `published` | "This changed on another screen. It has been refreshed." | Refetch the listings |
| 409 `already_decided` | Someone decided the proposal first | Toast "Someone else already decided this. It has been refreshed." | Refetch the proposals |
| 409 `stale_draft` | The cells behind the proposal changed (the ranking re-runs against now, so a proposal goes stale once its pickup window has passed) | Toast "The numbers behind this changed since it was proposed. It can no longer be approved or rejected; a new proposal will replace it." | Refetch: a stale draft leaves the list (core lets nobody decide it again) |
| 422 `cannot_verify` + `unresolved_ref` | A number no longer traces for this person | Toast "Cannot verify — some numbers in this draft no longer trace to their source rows." | Refetch the draft: its field shows "Cannot verify" |
| 422 `execution_failed` | Approved but not applied | `ErrorNote` "It was approved but could not be applied. Nothing changed." | |
| 409 `idempotency_conflict` | Same key, different body (a bug) | "That didn't go through. Please try again." | The attempt is dropped; the next tap is a new attempt |
| 429 | Rate limited | "Too many requests. Please wait a moment and try again." The button reads "Try again in {s} s" until `Retry-After` has passed | Then the same attempt |
| network / 5xx | | "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." (`staffWriteErrorText`: the command may have landed) / "Something went wrong on our side. Try again." | The same attempt on the next tap |

Core sends `recipient_ineligible`, `listing_expired`, `cooked_hold_exceeded` and `line_expired` as **422
`invalid_payload`** with the reason, not 409 (01 §2, 03 §3). The copy is chosen by `reasonCode`.

### 4.5 Simulated labels (a missing one is a bug)

- Every recipient name, wherever it appears (proposal, ranking, listing card, own-listing choice, toast), is followed
  by `SimulatedRecipient` ("Simulated recipient"). The name keeps its "(simulated)".
- The header line carries "Surplus food to simulated recipients · Measured on synthetic data · Check your local
  food-donation rules".
- The impact card carries "Measured on synthetic data" and "to simulated recipients" (the API's `labels`, shown
  as sent).
- Above "Publish as …": "Shown to the simulated recipient only. Check your local food-donation rules."

## 5 · Every action

No update is optimistic. Each action is confirmed by the API, then the screen refetches (§3). Every button is disabled
while its request is in flight and reads "Saving…".

### 5.1 Decide a proposal (owner, judge)

`ListingDraftCard` (§7) with 02 §5's `DecisionBar` on 01 §6.1's `lib/munim/drafts.ts`, the same bar as the draft page
(12) and the purchase-order card (15). Which buttons show is `approveGate`'s answer:

| Tap | Sends | Attempt rule |
|---|---|---|
| "Approve as {name}" (only while nothing is unverified and nothing is typed) | `POST /v1/drafts/{id}:approve` with `drafts.approve.v1` `{ draft_id, command_type, edited_payload: null, reason: null }` | `approveAttempt`: the same inputs again = the same envelope |
| "Edit", then a quantity typed, "Why you changed it", then "Approve with my edits as {name}" | `edited_payload` = `withEdits(payload, { "/lines/0/qty_milli": typed }, me.member_id)`: the line's `qty_milli` becomes `{ value, typed_by }`; every other field is unchanged; `reason` = the text typed | A new attempt whenever the typed value or the reason changes |
| "Reject", a reason ("Why reject it?", `REJECT_REASONS`, first option "Choose a reason") and "What's wrong?" (1–500 characters), then "Reject as {name}" | `POST /v1/drafts/{id}:reject` with `drafts.reject.v1` `{ draft_id, reason, reason_code }` | `rejectAttempt` |

The approve answer's `type` is `cares.listing.publish.v1` and its `entity_id` is the new listing. Toast "Approved. The
listing is published." Then refetch (§3); the listing shows under "Waiting for pickup" with the approver as
publisher. A manager sees the card with "Only the owner can approve or reject a donation." and no buttons (core's
rule: `cares.listing.publish.v1` is owner and judge, 01 §6.1). Outcomes
other than `done` follow §4.4.

The owner may lower the quantity, for example after keeping some loaves for the staff meal. The edit shows as "{value}
Edited by {name}" beside the struck-through proposal and its chip (02 §5). The recipient and the pickup window cannot
be edited. To give the food to someone else, reject the proposal and list the food yourself.

### 5.2 Record a hand-over (owner, manager, staff, judge)

On a `published` listing (`ListingCard`):

- **"Hand over everything listed as {name}"**: offered only while the listing has no recorded hand-over
  (`canHandOverAll`). Sends each line at its own listed `qty_milli`.
- **"Hand over part of it"** (or **"Record a hand-over"** once some has gone): one input per line, "{food}: how much
  was handed over? ({unit})". Lines left empty are not sent. Then "Record hand-over as {name}".

It sends `POST /v1/cares/handovers` with `cares.handover.record.v1` `{ handover_id, listing_id, allocation_id: null,
lines }` (`handoverAttempt`). There is no `handed_at`: core stamps it. Core closes the listing when every line has gone,
and the next fetch shows "Handed over". Toast "Hand-over recorded." The person types every part quantity. The screen
never works out "what's left".

### 5.3 Withdraw (owner, manager, judge)

"Withdraw", then the confirm line "Withdraw this listing? The simulated recipient will no longer see it.", then
"Withdraw as {name}" or "Keep it". It sends `POST /v1/cares/listings/{id}:withdraw` with `cares.listing.withdraw.v1`
`{ listing_id }` (path id = payload id, `withdrawAttempt`). Toast "Listing withdrawn."

### 5.4 List food yourself (owner, judge)

`OwnListingForm` (§7):

1. Choose "What are you giving away?": "Cooked food from the menu", "Raw stock" or "Packaged stock". Cooked food is
   picked from the counter menu (one entry per item). Stock is picked from the ingredients list. "List this" on a
   food-at-risk row fills the stock item, its batch, its unit and its use-by date. **It never fills the quantity.**
   The at-risk quantity stays visible on its row, with its chip.
2. "How much?" (typed; `parseTyped` with `qty_milli`), the unit (cooked food: portions; stock: its base unit or the
   larger unit), and "Use by (optional)".
3. **"Find simulated recipients"** mints `cares.recipient_match` for exactly these inputs. This is not a command; it
   is safe to retry, and it never runs on its own. The ranked rows appear with "Choose {name}". Changing anything in
   the form clears the ranking and the choice.
4. **"Publish as {name}"** sends `POST /v1/cares/listings` with `cares.listing.publish.v1`: a donation to the chosen
   recipient, with `pickup_from` and `pickup_to` taken from the chosen row's cells (`publishAttempt`). The listing and
   line ids are minted inside the attempt. The form closes and, in its place, the confirmation "Listed. {recipient}
   [Simulated recipient] can pick it up {day} from {time}." (inline, not a toast: a toast is text only and cannot carry
   the badge). The listing then appears under "Waiting for pickup".
5. **"Cancel"** closes the form at any step; nothing is published.

For cooked food the form says: "Cooked food can only be listed for a pickup that starts soon. Munim will say if this
one is too far off." The limit is the country pack's (`cooked_max_hold_min`), and the browser does not read it. Core
refuses with `cooked_hold_exceeded`. **Cooked food never arrives as an AI proposal**: the database refuses a cooked
line under a draft, so only the owner's own command lists it.

### 5.5 Other taps

| Tap | Does |
|---|---|
| A source chip | Opens the snapshot drawer on that cell (02 §4) |
| "Refresh" | §3's refresh row |
| "Try again" on a failed panel | That panel's calls again. A mint is not a command, so it is safe |

## 6 · Copy

Literal strings, in "double quotes". Strings already in 01 §9 (`staffErrorText`, `reasonText`, `LISTING_STATUS`,
`DRAFT_STATUS`, `REJECT_REASONS`) and 02 (`DraftField`, drawer, states) are used as they are, not repeated here.

| Where | Copy |
|---|---|
| Header | "Munim Cares" · "Surplus food to simulated recipients · Measured on synthetic data · Check your local food-donation rules" · "Pickup hours {from}–{to}" · "Refresh" |
| Gate card | "Munim Cares isn't available in this country yet." · "Munim Cares isn't switched on for this business yet." · "Munim Cares is paused for this business." · "This outlet hasn't joined Munim Cares." |
| Role | "Munim Cares isn't part of your role." · "Ask the owner if you need it." |
| Food at risk | Title "Food at risk" · per row "{stock name}" · "Use by {date}" · "At risk: {qty} [Source]" · "Worth {money} at cost [Source]" · "A donation is proposed" (when a proposal's `batch_id` equals the row's) · button "List this" · empty "Nothing at {outlet} is close to its use-by date." |
| Proposals | Title "Proposed by Munim" · card title "Give food at risk to a simulated recipient" · rows "Food", "Quantity ({unit})", "To", "Pickup" · `<summary>` "Simulated recipients that could take it" · "The ranking can't be opened." · lineage "Proposed by Stock & Purchasing · {time}" + " · from a finding: Food at risk of going to waste" + once decided " · Approved with edits by {name} · {time}" · manager "Only the owner can approve or reject a donation." · empty "No proposals waiting." |
| Decision bar | 02 §5's `DecisionBar`: "Approve as {name}" · "Edit" · "Approve with my edits as {name}" · "Why you changed it" · "Cancel" · "Reject" · "Why reject it?" · "Choose a reason" · "What's wrong?" · "Reject as {name}" · "Saving…" · "Try again" · "Try again in {s} s" · "Some numbers this draft relies on can't be opened with your access, so it can't be approved. You can reject it." · "Only the owner can approve or reject a donation." |
| Ranking | "Best match" · "Chosen" · "Pickup {day} {from} – {to} [Source]" · "Distance {m} m [Source]" · "Overlap with your pickup hours {min} min [Source]" · "Has room for this" · "May not have room for all of it" · "Choose {name}" · "No simulated recipient can take this food at this outlet's pickup times." |
| Own listing | Button "List food yourself" · title "List food yourself" · "What are you giving away?" · "Cooked food from the menu" · "Raw stock" · "Packaged stock" · "Item" · "Choose an item" · "Stock item" · "Choose a stock item" · "How much? ({unit})" · "Unit" · "Use by (optional)" · "Type the quantity as a number." · "Cooked food can only be listed for a pickup that starts soon. Munim will say if this one is too far off." · "Find simulated recipients" · "Finding…" · "Publish as {name}" · "Cancel" · "Shown to the simulated recipient only. Check your local food-donation rules." · confirmation "Listed. {recipient} [Simulated recipient] can pick it up {day} from {time}." |
| Listing card | "Pickup {day} {from} – {to}" · "To {recipient}" · "{Cooked/Raw/Packaged}" badge · "{food} · {qty}" · "use by {date}" · "Handed over {day time}" + " · recorded by you" · "Hand over everything listed as {name}" · "Hand over part of it" · "Record a hand-over" · "{food}: how much was handed over? ({unit})" · "Record hand-over as {name}" · "Withdraw" · "Withdraw this listing? The simulated recipient will no longer see it." · "Withdraw as {name}" · "Keep it" · "a simulated recipient that is no longer listed" |
| Listings | Titles "Listings", "Waiting for pickup", "Earlier" · empty "No food listed today." |
| Impact | Title "Food shared this month" · "Hand-overs" · "Portions" · "Packed items" (the first three as on owner home, 12) · "By weight" (+ " g") · "Value at cost" · "Measured on synthetic data" · "to simulated recipients" |
| Toasts | "Approved. The listing is published." · "Hand-over recorded." · "Listing withdrawn." · plus the 01 §9 lines for 409s. (No toast names a recipient: a toast cannot carry the badge) |
| Units (`qtyText`, `unitLabel`) | "piece" / "pieces", "portion" / "portions"; every other unit as its code ("g", "kg", "ml", "l") |

## 7 · Code

Save each block at its path. They typecheck against the 0.2.0 SDK, Cobnut's code and 01–03 (§10). The decision
pieces are 01 §6.1's `lib/munim/drafts.ts` and 02 §5's `components/staff/decision.tsx`, shared with 12 and 15.
`components/staff/use-command.ts` is printed in 14 and 15, byte-identical: save it once.

```ts
// file: lib/munim/cares-flow.ts
// Munim Cares on the staff side (14): who may do what, whether Cares is on for the outlet, the snapshot params the
// screen mints, reading an AI listing proposal, the ranked simulated recipients, and the command attempts for
// publishing, handing over and withdrawing. Every recipient is simulated; every quantity on screen is a row field or a
// snapshot cell; nothing here adds up a quantity. Plain TypeScript, no React.
import { attemptFor, type CommandAttempt } from "./commands";
import { formatQty, shownName } from "./format";
import { draftValue, parseRef, type DraftValue, type Snapshot } from "./refs";
import type { Role } from "./session";
import type { Schemas } from "./types";
import { uuidv7 } from "./uuid";

export type CaresProfile = Schemas["V1CaresProfile"];
export type Listing = Schemas["V1CaresListings"]["items"][number];
export type Recipient = Schemas["V1CaresRecipients"]["items"][number];
type Draft = Schemas["V1Draft"];
type Menu = Schemas["V1CatalogueMenu"];
type Ingredient = Schemas["V1InventoryIngredients"]["items"][number];

// ---- who may do what (core.command_authority, 0028; every snapshot template here is manager and up) ----
const ROLES = {
  /** Food at risk, ranked recipients, AI listing proposals, impact. Staff never see these panels (404 for them). */
  insight: ["owner", "manager", "judge"],
  /** Publish a listing, or approve / reject an AI listing proposal. A manager is refused (403), so they never see it. */
  publish: ["owner", "judge"],
  withdraw: ["owner", "manager", "judge"],
  handover: ["owner", "manager", "staff", "judge"],
} as const satisfies Record<string, readonly Role[]>;
export type CaresAction = keyof typeof ROLES;
export const caresCan = (role: Role, action: CaresAction): boolean => (ROLES[action] as readonly Role[]).includes(role);

// ---- is Cares on here? ----
export type CaresGate = "on" | "cares_not_available" | "cares_not_enabled" | "cares_paused" | "cares_not_opted_in";
/** In the order core refuses: the country pack, the operator's switch, the business's profile, the outlet. */
export function caresGate(p: CaresProfile, outletId: string): CaresGate {
  if (!p.available) return "cares_not_available";
  if (!p.enabled) return "cares_not_enabled";
  if (!p.profile || p.profile.status !== "active") return "cares_paused";
  return p.outlets.some((o) => o.outlet_id === outletId && o.active) ? "on" : "cares_not_opted_in";
}
export const GATE_TEXT: Record<Exclude<CaresGate, "on">, string> = {
  cares_not_available: "Munim Cares isn't available in this country yet.",
  cares_not_enabled: "Munim Cares isn't switched on for this business yet.",
  cares_paused: "Munim Cares is paused for this business.",
  cares_not_opted_in: "This outlet hasn't joined Munim Cares.",
};

// ---- snapshot params (the business date comes from GET /v1/catalogue/menu, never the tablet's clock) ----
/** "2026-10-14" -> "2026-10-01": a string edit, not date arithmetic. */
export const monthStart = (businessDate: string): string => `${businessDate.slice(0, 8)}01`;
/** Batches at this outlet expiring within the watcher's horizon (seven days) that may not be used in time. */
export const atRiskParams = (outletId: string, businessDate: string) => ({ outlet_id: outletId, days: 7, as_of: businessDate });
/** Food shared this month at this outlet: row 0 is the total. */
export const impactParams = (outletId: string, businessDate: string) => ({ outlet_id: outletId, from: monthStart(businessDate), to: businessDate });

/** The impact cells shown, in order, with the words around each (the first three as on owner home, 12). Every value
 *  is a cell of cares.impact row 0. */
export const IMPACT_CELLS = [
  { column: "handovers", label: "Hand-overs", after: "" },
  { column: "portions_milli", label: "Portions", after: "" },
  { column: "units_milli", label: "Packed items", after: "" },
  { column: "weight_g", label: "By weight", after: " g" },
  { column: "value_at_cost_minor", label: "Value at cost", after: "" },
] as const;

// ---- food at risk (inventory.expiry_risk rows) ----
export interface AtRiskRow {
  row: number;
  batchId: string;
  ingredientId: string;
  unit: string;
  expiresOn: string;
  /** A shop SKU is listed as packaged food; anything else as raw. */
  foodKind: "raw" | "packaged";
}
export function atRiskRows(s: Snapshot): AtRiskRow[] {
  return s.rows.flatMap((r, row) =>
    typeof r.batch_id === "string" && typeof r.ingredient_id === "string" && typeof r.unit === "string" && typeof r.expiry_on === "string"
      ? [{ row, batchId: r.batch_id, ingredientId: r.ingredient_id, unit: r.unit, expiresOn: r.expiry_on, foodKind: r.is_sku === true ? ("packaged" as const) : ("raw" as const) }]
      : [],
  );
}

// ---- ranked simulated recipients (cares.recipient_match rows; the row order IS the rank, best first) ----
export interface MatchRow {
  row: number;
  recipientId: string;
  /** The recipient's own name, which says "(simulated)". */
  name: string;
  fits: boolean;
  pickupFrom: string;
  pickupTo: string;
  pickupOn: string;
}
/** Only simulated rows (core lists no other kind; a row that says otherwise is never shown). */
export function matchRows(s: Snapshot): MatchRow[] {
  return s.rows.flatMap((r, row) =>
    r.simulated === true && typeof r.recipient_id === "string" && typeof r.name === "string" && typeof r.pickup_from === "string" && typeof r.pickup_to === "string" && typeof r.pickup_on === "string"
      ? [{ row, recipientId: r.recipient_id, name: r.name, fits: r.capacity_fit === true, pickupFrom: r.pickup_from, pickupTo: r.pickup_to, pickupOn: r.pickup_on }]
      : [],
  );
}

// ---- an AI listing proposal (cares.listing.publish.v1 draft) ----
export type ListingPayload = Extract<Draft["payload"], { listing_id: string; recipient_id: string | null }>;
export type ListingDraft = Draft & { payload: ListingPayload };
export const isListingDraft = (d: Draft): d is ListingDraft => d.command_type === "cares.listing.publish.v1";

export interface ListingDraftView {
  lines: { index: number; line: ListingPayload["lines"][number]; qty: DraftValue }[];
  /** The ranked recipients the proposal chose from (its based_on cites them), or null. */
  matchSnapshotId: string | null;
  /** The based_on ref of the pickup start, when it is the very value the payload carries (shown as its source). */
  pickupRef: string | null;
}

/** Reads a proposal: each quantity is a ref (or "Cannot verify"); the recipient and pickup times are plain values the
 *  code copied from the match row, cited in based_on. `unverified` = GET /v1/drafts/{id} unverified_refs. */
export function listingDraftView(d: ListingDraft, unverified: readonly string[]): ListingDraftView {
  const match = d.based_on.filter((b) => b.template_id === "cares.recipient_match");
  const first = match[0] ? parseRef(match[0].ref) : null;
  const pickup = match.find((b) => {
    const p = parseRef(b.ref);
    return p?.kind === "snap" && p.column === "pickup_from" && b.expected === d.payload.pickup_from;
  });
  return {
    lines: d.payload.lines.map((line, index) => ({ index, line, qty: draftValue(line.qty_milli, `/lines/${index}/qty_milli`, d.resolved_refs, unverified) })),
    matchSnapshotId: first?.kind === "snap" ? first.snapshotId : null,
    pickupRef: pickup?.ref ?? null,
  };
}

// ---- the owner's own listing (cares.listing.publish.v1, owner and judge) ----
export interface OwnListing {
  outletId: string;
  food: { kind: "cooked"; itemId: string } | { kind: "raw" | "packaged"; ingredientId: string; batchId: string | null };
  /** As typed, in thousandths of `unit` (parseTyped with a *_milli column). */
  qtyMilli: number;
  unit: string;
  expiresOn: string | null;
}
/** cares.recipient_match params for what the owner wants to list. */
export const matchParams = (f: OwnListing) => ({
  outlet_id: f.outletId,
  needs_cooked: f.food.kind === "cooked",
  needs_raw: f.food.kind === "raw",
  needs_packaged: f.food.kind === "packaged",
  qty_milli: f.qtyMilli,
  unit: f.unit,
  expires_on: f.expiresOn,
});

export type PublishAttempt = CommandAttempt<"cares.listing.publish.v1", Schemas["CaresListingPublishV1"]>;
/** A donation to the chosen simulated recipient, at the pickup window its match row gives (no time maths here). */
export function publishAttempt(prev: PublishAttempt | null, f: OwnListing, pick: MatchRow): PublishAttempt {
  return attemptFor(prev, JSON.stringify(["publish", f, pick.recipientId, pick.pickupFrom, pick.pickupTo]), "cares.listing.publish.v1", () => ({
    listing_id: uuidv7(),
    outlet_id: f.outletId,
    kind: "donation" as const,
    recipient_id: pick.recipientId,
    pickup_from: pick.pickupFrom,
    pickup_to: pick.pickupTo,
    lines: [{
      line_id: uuidv7(),
      food_kind: f.food.kind,
      item_id: f.food.kind === "cooked" ? f.food.itemId : null,
      ingredient_id: f.food.kind === "cooked" ? null : f.food.ingredientId,
      batch_id: f.food.kind === "cooked" ? null : f.food.batchId,
      qty_milli: f.qtyMilli,
      unit: f.unit,
      expires_on: f.expiresOn,
      unit_price_minor: null,
      currency: null,
    }],
  }));
}

/** Units a person may list in: cooked food in portions; stock in its base unit or the larger one core converts. */
export const unitsFor = (food: OwnListing["food"]["kind"], baseUnit: string | null): string[] =>
  food === "cooked" ? ["portion"] : baseUnit === "g" ? ["g", "kg"] : baseUnit === "ml" ? ["ml", "l"] : baseUnit ? [baseUnit] : [];

// ---- hand-over and withdraw ----
export const recordedHandovers = (l: Listing) => l.handovers.filter((h) => h.status === "recorded");
/** "Hand over everything listed" sends each line's listed quantity, so it is offered only while nothing has been
 *  handed over yet: anything else would need "listed minus handed", which the browser never works out. */
export const canHandOverAll = (l: Listing): boolean => l.status === "published" && recordedHandovers(l).length === 0;

export type HandoverAttempt = CommandAttempt<"cares.handover.record.v1", Schemas["CaresHandoverRecordV1"]>;
/** `typed` = "all", or the quantity typed per listing line id (thousandths; empty lines left out). Core checks the
 *  total against what was listed (409 qty_exceeds_listed) and closes the listing when everything is handed over. */
export function handoverAttempt(prev: HandoverAttempt | null, l: Listing, typed: "all" | Readonly<Record<string, number>>): HandoverAttempt {
  const lines = typed === "all"
    ? l.lines.map((x) => ({ listing_line_id: x.line_id, qty_milli: x.qty_milli }))
    : l.lines.flatMap((x) => (typed[x.line_id] ? [{ listing_line_id: x.line_id, qty_milli: typed[x.line_id]! }] : []));
  return attemptFor(prev, JSON.stringify(["handover", l.listing_id, lines]), "cares.handover.record.v1", () => ({
    handover_id: uuidv7(),
    listing_id: l.listing_id,
    allocation_id: null,
    lines,
  }));
}

export type WithdrawAttempt = CommandAttempt<"cares.listing.withdraw.v1", Schemas["CaresListingWithdrawV1"]>;
export const withdrawAttempt = (prev: WithdrawAttempt | null, listingId: string): WithdrawAttempt =>
  attemptFor(prev, JSON.stringify(["withdraw", listingId]), "cares.listing.withdraw.v1", () => ({ listing_id: listingId }));

// ---- words ----
export const FOOD_KIND: Record<string, string> = { cooked: "Cooked", raw: "Raw", packaged: "Packaged" };
const UNIT_WORDS: Record<string, [one: string, many: string]> = { piece: ["piece", "pieces"], portion: ["portion", "portions"] };
/** The unit in words for a label: "pieces", "portions", "g". */
export const unitLabel = (unit: string): string => (UNIT_WORDS[unit] ?? [unit, unit])[1];
/** "12 pieces", "1 portion", "400 ml": a row field or cell shown with its unit word. */
export const qtyText = (qtyMilli: number, unit: string, locale: string): string =>
  `${formatQty(qtyMilli, locale)} ${(UNIT_WORDS[unit] ?? [unit, unit])[qtyMilli === 1000 ? 0 : 1]}`;
/** A listing line's food: the menu's display name (cooked) or the ingredient's name (stock). Lines carry ids only. */
export function lineName(line: { item_id: string | null; ingredient_id: string | null }, menu: Menu | null, ingredients: readonly Ingredient[]): string {
  if (line.item_id) {
    const e = menu?.entries.find((x) => x.item_id === line.item_id);
    return e ? shownName(e) : "Menu item";
  }
  return ingredients.find((x) => x.ingredient_id === line.ingredient_id)?.name ?? "Stock item";
}
```

```ts
// file: components/staff/use-command.ts
"use client";
// One person's command from a form (publish a listing, record a hand-over, withdraw, place a purchase order, receive
// goods): one frozen attempt per thing confirmed (01 §4). Tapping the same button again after a network error, 429
// or 5xx resends the same envelope (the attempt's fingerprint is unchanged); any change to the form is a new attempt.
// A 429 disables the button for Retry-After and shows the wait. A network failure may have reached core, so its line is
// the write one (01 §9 staffWriteErrorText): the same tap is safe.
import { useRef, useState } from "react";
import { useCountdown } from "@/lib/hooks";
import type { MunimError, Result } from "@/lib/munim/client";
import { retryable, type CommandAttempt, type Envelope } from "@/lib/munim/commands";
import { staffWriteErrorText, type StaffWhere } from "@/lib/munim/staff-copy";
import type { Schemas } from "@/lib/munim/types";

export function useCommand<T extends string, P>(where: StaffWhere, onAuth: (e: MunimError) => boolean) {
  const attempt = useRef<CommandAttempt<T, P> | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const wait = useCountdown(retryAt, () => setRetryAt(null));

  /** Builds (or reuses) the attempt and sends it. null = a send was already in flight (a double tap). */
  const send = async (
    make: (prev: CommandAttempt<T, P> | null) => CommandAttempt<T, P>,
    call: (body: Envelope<T, P>) => Promise<Result<Schemas["CommandResult"]>>,
    text: (e: MunimError) => string = (e) => staffWriteErrorText(e, where),
  ): Promise<Result<Schemas["CommandResult"]> | null> => {
    if (inFlight.current) return null;
    const a = make(attempt.current);
    attempt.current = a;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const r = await call(a.body);
    inFlight.current = false;
    setBusy(false);
    if (r.ok || !retryable(r.error)) attempt.current = null;
    if (!r.ok && !onAuth(r.error)) {
      setError(text(r.error));
      if (r.error.retryAfterMs) setRetryAt(Date.now() + r.error.retryAfterMs);
    }
    return r;
  };
  return { busy, error, wait, send, reset: () => { attempt.current = null; setError(null); } };
}
```

```tsx
// file: components/staff/cares/recipients.tsx
"use client";
// Simulated recipients ranked by core (a cares.recipient_match snapshot: the row order is the rank, best first; the
// browser never re-sorts or scores them). Each figure is a cell with its source chip. Used read-only under an AI
// proposal, and as the picker for the owner's own listing.
import { cellOf, formatCell, snapRef, type CellFormat, type Snapshot } from "@/lib/munim/refs";
import { dayLabel, formatTime } from "@/lib/munim/format";
import { matchRows, type MatchRow } from "@/lib/munim/cares-flow";
import { CannotVerify, SimulatedRecipient, SourcedValue, StatusPill } from "../source";

export function RecipientRanking({ snapshot, fmt, tz, chosen, onChoose, onOpen }: {
  snapshot: Snapshot;
  fmt: CellFormat;
  tz: string;
  /** The recipient the proposal (or the owner) chose. */
  chosen: string | null;
  /** Present for the owner's own listing: each row gets "Choose". */
  onChoose?: (m: MatchRow) => void;
  onOpen: (snapshotId: string, refToken: string) => void;
}) {
  const rows = matchRows(snapshot);
  if (rows.length === 0) return <p className="state-box">No simulated recipient can take this food at this outlet&apos;s pickup times.</p>;
  const cell = (row: number, column: string, after: string) => {
    const v = cellOf(snapshot, { kind: "snap", snapshotId: snapshot.snapshot_id, row, column });
    return v === undefined ? <CannotVerify /> : <SourcedValue text={`${formatCell(v, column, fmt)}${after}`} refToken={snapRef(snapshot.snapshot_id, row, column)} onOpen={onOpen} />;
  };
  return (
    <ol className="grid gap-3" aria-label="Simulated recipients, best match first">
      {rows.map((m, i) => (
        <li key={m.recipientId} className="card grid gap-2 p-4" aria-current={chosen === m.recipientId ? "true" : undefined}>
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {m.name} <SimulatedRecipient />
            {i === 0 && <StatusPill tone="new">Best match</StatusPill>}
            {chosen === m.recipientId && <StatusPill tone="ready">Chosen</StatusPill>}
          </p>
          <p>
            Pickup {dayLabel(m.pickupFrom, tz, fmt.locale)}{" "}
            <SourcedValue text={`${formatTime(m.pickupFrom, tz, fmt.locale)} – ${formatTime(m.pickupTo, tz, fmt.locale)}`} refToken={snapRef(snapshot.snapshot_id, m.row, "pickup_from")} onOpen={onOpen} />
          </p>
          <p className="text-[15px] text-muted">
            Distance {cell(m.row, "distance_m", " m")} · Overlap with your pickup hours {cell(m.row, "overlap_min", " min")} · {m.fits ? "Has room for this" : "May not have room for all of it"}
          </p>
          {onChoose && (
            <button type="button" className="btn btn-secondary justify-self-start" aria-pressed={chosen === m.recipientId} onClick={() => onChoose(m)}>
              {chosen === m.recipientId ? "Chosen" : `Choose ${m.name}`}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
```

```tsx
// file: components/staff/cares/listing-draft.tsx
"use client";
// An AI proposal to give food at risk to a simulated recipient (a cares.listing.publish.v1 draft). It changes nothing
// until the owner taps "Approve as …"; a manager sees it but cannot decide it (core: owner and judge only, which
// 01 §6.1's approveGate follows, so the bar shows no buttons for them).
// The quantity is a ref with its source chip, or "Cannot verify"; an edit is labelled as the owner's.
import { useState } from "react";
import { FOOD_KIND, lineName, listingDraftView, unitLabel, type ListingDraft, type Recipient } from "@/lib/munim/cares-flow";
import { approveGate, findingTitle, lineageLine, numericFields, withEdits, type Outcome } from "@/lib/munim/drafts";
import { dayLabel, formatDate, formatDayTime, formatTime } from "@/lib/munim/format";
import type { CellFormat, Snapshot } from "@/lib/munim/refs";
import type { Session } from "@/lib/munim/session";
import type { StaffClient } from "@/lib/munim/staff";
import { DRAFT_STATUS, specialistName } from "@/lib/munim/staff-copy";
import type { Schemas } from "@/lib/munim/types";
import { DecisionBar, useDecision } from "../decision";
import { DraftField } from "../draft-field";
import { DRAFT_TONE, SimulatedRecipient, SourcedValue, StatusPill } from "../source";
import { RecipientRanking } from "./recipients";

type Detail = Schemas["V1DraftDetail"] & { draft: ListingDraft };

export function ListingDraftCard({ detail, match, recipients, menu, ingredients, session, client, fmt, tz, onOpen, onOutcome }: {
  detail: Detail;
  /** The cares.recipient_match snapshot the proposal cites (GET /v1/snapshots/{id}); null while loading or unopenable. */
  match: Snapshot | null | "failed";
  recipients: readonly Recipient[];
  menu: Schemas["V1CatalogueMenu"] | null;
  ingredients: readonly Schemas["V1InventoryIngredients"]["items"][number][];
  session: Session;
  client: StaffClient;
  fmt: CellFormat;
  tz: string;
  onOpen: (snapshotId: string, refToken: string) => void;
  /** Refetch the proposals (and listings) for every settled answer; the page shows the toasts. */
  onOutcome: (o: Outcome) => void;
}) {
  const d = detail.draft;
  const view = listingDraftView(d, detail.unverified_refs);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const dec = useDecision(client, d, "cares", onOutcome);
  const gate = approveGate(detail, numericFields(detail), session.me);
  const qtyPath = (index: number) => `/lines/${index}/qty_milli`;
  const recipient = recipients.find((r) => r.recipient_id === d.payload.recipient_id);
  const when = (iso: string) => formatDayTime(iso, tz, fmt.locale);
  const pickup = `${formatTime(d.payload.pickup_from, tz, fmt.locale)} – ${formatTime(d.payload.pickup_to, tz, fmt.locale)}`;

  return (
    <article className="card grid gap-3 p-5" aria-label="Proposed donation">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-[22px]">Give food at risk to a simulated recipient</h3>
        <StatusPill tone={DRAFT_TONE[d.status] ?? "new"}>{DRAFT_STATUS[d.status] ?? d.status}</StatusPill>
        <span className="text-muted">· {specialistName(d.source.replace(/^intel:/, ""))}</span>
      </header>

      {view.lines.map(({ index, line, qty }) => (
        <div key={line.line_id}>
          <div className="draft-field">
            <p className="font-semibold">Food</p>
            <p>{lineName(line, menu, ingredients)} · {FOOD_KIND[line.food_kind]}{line.expires_on ? ` · use by ${formatDate(line.expires_on, fmt.locale)}` : ""}</p>
          </div>
          <DraftField
            label={`Quantity (${unitLabel(line.unit)})`} value={qty} column="qty_milli" fmt={fmt} onOpen={onOpen}
            edit={edits[qtyPath(index)] ?? null} editorName={session.me.name} editing={editing}
            onEdit={(v) => setEdits((e) => { const n = { ...e }; if (v === null) delete n[qtyPath(index)]; else n[qtyPath(index)] = v; return n; })}
          />
        </div>
      ))}
      <div className="draft-field">
        <p className="font-semibold">To</p>
        <p className="flex flex-wrap items-center gap-2">{recipient?.name ?? "A simulated recipient that is no longer listed"} <SimulatedRecipient /></p>
      </div>
      <div className="draft-field">
        <p className="font-semibold">Pickup</p>
        <p>
          {dayLabel(d.payload.pickup_from, tz, fmt.locale)}{" "}
          {view.pickupRef ? <SourcedValue text={pickup} refToken={view.pickupRef} onOpen={onOpen} /> : <span className="src-value">{pickup}</span>}
        </p>
      </div>

      <details>
        <summary className="min-h-12 cursor-pointer font-semibold">Simulated recipients that could take it</summary>
        <div className="mt-3">
          {match === null ? <div className="skeleton h-24" role="status" aria-label="Loading" />
            : match === "failed" ? <p className="text-muted">The ranking can&apos;t be opened.</p>
            : <RecipientRanking snapshot={match} fmt={fmt} tz={tz} chosen={d.payload.recipient_id} onOpen={onOpen} />}
        </div>
      </details>

      <p className="lineage">{lineageLine(detail, when, findingTitle("inventory.expiry_risk"))}</p>

      <DecisionBar
        name={session.me.name} gate={gate} commandType={d.command_type} edits={edits} editing={editing}
        onEdit={(on) => { setEditing(on); if (!on) setEdits({}); }}
        busy={dec.busy} error={dec.error} retry={dec.retry} wait={dec.wait}
        onApprove={() => dec.approve(null, null)}
        onApproveEdited={(reason) => dec.approve(withEdits(d.payload, edits, session.me.member_id), reason)}
        onReject={dec.reject}
      />
    </article>
  );
}
```

```tsx
// file: components/staff/cares/own-listing.tsx
"use client";
// The owner lists surplus food themselves (cares.listing.publish.v1, owner and judge). The owner says what and how much;
// core ranks the simulated recipients that can take it (a cares.recipient_match snapshot minted for this form) and the
// chosen row gives the pickup window, so the browser does no ranking and no time maths. Nothing is published until the
// owner taps "Publish as …".
import { useState } from "react";
import type { MunimError } from "@/lib/munim/client";
import { matchParams, publishAttempt, unitLabel, unitsFor, type AtRiskRow, type MatchRow, type OwnListing } from "@/lib/munim/cares-flow";
import { dayLabel, formatTime, shownName } from "@/lib/munim/format";
import { parseTyped, type CellFormat, type Snapshot } from "@/lib/munim/refs";
import type { Session } from "@/lib/munim/session";
import type { StaffClient } from "@/lib/munim/staff";
import { staffErrorText } from "@/lib/munim/staff-copy";
import type { Schemas } from "@/lib/munim/types";
import { ErrorNote } from "../../ui";
import { useCommand } from "../use-command";
import { RecipientRanking } from "./recipients";

type Kind = OwnListing["food"]["kind"];

export function OwnListingForm({ outletId, prefill, menu, ingredients, session, client, fmt, tz, onOpen, onAuth, onPublished, onCancel }: {
  outletId: string;
  /** "List this" on a food-at-risk row: the batch, its unit and use-by date (never its quantity). */
  prefill: AtRiskRow | null;
  menu: Schemas["V1CatalogueMenu"] | null;
  ingredients: readonly Schemas["V1InventoryIngredients"]["items"][number][];
  session: Session;
  client: StaffClient;
  fmt: CellFormat;
  tz: string;
  onOpen: (snapshotId: string, refToken: string) => void;
  onAuth: (e: MunimError) => boolean;
  /** Published: the chosen recipient's name and when it picks up, for the confirmation (shown with its badge). */
  onPublished: (listed: { name: string; when: string }) => void;
  /** "Cancel": close the form; nothing is published. */
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<Kind>(prefill?.foodKind ?? "packaged");
  const [itemId, setItemId] = useState("");
  const [ingredientId, setIngredientId] = useState(prefill?.ingredientId ?? "");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(prefill?.unit ?? "");
  const [expiresOn, setExpiresOn] = useState(prefill?.expiresOn ?? "");
  const [match, setMatch] = useState<Snapshot | "loading" | "failed" | null>(null);
  const [chosen, setChosen] = useState<MatchRow | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const cmd = useCommand<"cares.listing.publish.v1", Schemas["CaresListingPublishV1"]>("cares", onAuth);

  const items = (menu?.entries ?? []).filter((e, i, all) => all.findIndex((x) => x.item_id === e.item_id) === i);
  const base = ingredients.find((x) => x.ingredient_id === ingredientId)?.base_unit ?? null;
  const units = unitsFor(kind, base);
  const shownUnit = units.includes(unit) ? unit : (units[0] ?? "");
  const qtyMilli = parseTyped(qty, "qty_milli", fmt.currency);
  const food: OwnListing["food"] | null = kind === "cooked" ? (itemId ? { kind, itemId } : null) : ingredientId ? { kind, ingredientId, batchId: prefill && prefill.ingredientId === ingredientId ? prefill.batchId : null } : null;
  const form: OwnListing | null = food && qtyMilli && shownUnit ? { outletId, food, qtyMilli, unit: shownUnit, expiresOn: kind === "cooked" || expiresOn === "" ? null : expiresOn } : null;
  // Any change to what is listed makes the ranking (and the chosen recipient) out of date.
  const changed = <V,>(set: (v: V) => void) => (v: V) => { set(v); setMatch(null); setChosen(null); cmd.reset(); };

  const find = async () => {
    if (!form) return;
    setMatch("loading");
    setFindError(null);
    const r = await client.mintSnapshot({ template_id: "cares.recipient_match", params: matchParams(form) });
    if (r.ok) setMatch(r.data);
    else if (!onAuth(r.error)) { setMatch("failed"); setFindError(staffErrorText(r.error, "cares")); }
  };
  const publish = async () => {
    if (!form || !chosen) return;
    const r = await cmd.send((prev) => publishAttempt(prev, form, chosen), (body) => client.publishListing(body));
    if (r?.ok) onPublished({ name: chosen.name, when: `${dayLabel(chosen.pickupFrom, tz, fmt.locale)} from ${formatTime(chosen.pickupFrom, tz, fmt.locale)}` });
  };

  return (
    <section className="card grid gap-4 p-5" aria-labelledby="own-listing">
      <h3 id="own-listing" className="text-[22px]">List food yourself</h3>
      <fieldset className="grid gap-2">
        <legend className="font-semibold">What are you giving away?</legend>
        {([["cooked", "Cooked food from the menu"], ["raw", "Raw stock"], ["packaged", "Packaged stock"]] as const).map(([k, text]) => (
          <label key={k} className="choice"><input type="radio" name="food-kind" checked={kind === k} onChange={() => changed(setKind)(k)} /> {text}</label>
        ))}
      </fieldset>
      {kind === "cooked" ? (
        <label className="block font-semibold">
          Item
          <select value={itemId} onChange={(e) => changed(setItemId)(e.target.value)}>
            <option value="">Choose an item</option>
            {items.map((e) => <option key={e.item_id} value={e.item_id}>{shownName(e)}</option>)}
          </select>
        </label>
      ) : (
        <label className="block font-semibold">
          Stock item
          <select value={ingredientId} onChange={(e) => changed(setIngredientId)(e.target.value)}>
            <option value="">Choose a stock item</option>
            {ingredients.filter((i) => i.active).map((i) => <option key={i.ingredient_id} value={i.ingredient_id}>{i.name}</option>)}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="block font-semibold">
          How much? {shownUnit && `(${unitLabel(shownUnit)})`}
          <input inputMode="decimal" value={qty} onChange={(e) => changed(setQty)(e.target.value)} />
        </label>
        {units.length > 1 && (
          <label className="block font-semibold">
            Unit
            <select value={shownUnit} onChange={(e) => changed(setUnit)(e.target.value)}>
              {units.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
            </select>
          </label>
        )}
        {kind !== "cooked" && (
          <label className="block font-semibold">
            Use by (optional)
            <input type="date" value={expiresOn} onChange={(e) => changed(setExpiresOn)(e.target.value)} />
          </label>
        )}
      </div>
      {qty !== "" && qtyMilli === null && <p className="text-danger">Type the quantity as a number.</p>}
      {kind === "cooked" && <p className="text-muted">Cooked food can only be listed for a pickup that starts soon. Munim will say if this one is too far off.</p>}

      <button type="button" className="btn btn-secondary justify-self-start" disabled={!form || match === "loading"} onClick={() => void find()}>
        {match === "loading" ? "Finding…" : "Find simulated recipients"}
      </button>
      {findError && <ErrorNote>{findError}</ErrorNote>}
      {match && match !== "loading" && match !== "failed" && (
        <RecipientRanking snapshot={match} fmt={fmt} tz={tz} chosen={chosen?.recipientId ?? null} onChoose={setChosen} onOpen={onOpen} />
      )}

      {chosen && <p className="text-[14px] text-muted">Shown to the simulated recipient only. Check your local food-donation rules.</p>}
      <div className="flex flex-wrap items-center gap-3">
        {chosen && (
          <button type="button" className="btn btn-primary" disabled={cmd.busy || cmd.wait > 0} onClick={() => void publish()}>
            {cmd.busy ? "Saving…" : cmd.wait > 0 ? `Try again in ${cmd.wait} s` : `Publish as ${session.me.name}`}
          </button>
        )}
        <button type="button" className="btn btn-plain" disabled={cmd.busy} onClick={onCancel}>Cancel</button>
      </div>
      {cmd.error && <ErrorNote>{cmd.error}</ErrorNote>}
    </section>
  );
}
```

```tsx
// file: components/staff/cares/listing-card.tsx
"use client";
// One listing (GET /v1/cares/listings): what, how much, to which simulated recipient, when, its hand-overs, and the
// person's own commands on it: record a hand-over (owner, manager, staff) and withdraw (owner, manager). Every quantity
// is a row field shown as it is; "Hand over everything listed" only before any hand-over (no "listed minus handed").
import { useState } from "react";
import type { MunimError } from "@/lib/munim/client";
import { canHandOverAll, caresCan, FOOD_KIND, handoverAttempt, lineName, qtyText, recordedHandovers, unitLabel, withdrawAttempt, type Listing, type Recipient } from "@/lib/munim/cares-flow";
import { dayLabel, formatDate, formatDayTime, formatTime } from "@/lib/munim/format";
import { parseTyped } from "@/lib/munim/refs";
import type { Session } from "@/lib/munim/session";
import type { StaffClient } from "@/lib/munim/staff";
import { LISTING_STATUS } from "@/lib/munim/staff-copy";
import type { Schemas } from "@/lib/munim/types";
import { ErrorNote } from "../../ui";
import { SimulatedRecipient, StatusPill, type PillTone } from "../source";
import { useCommand } from "../use-command";

const TONE: Record<string, PillTone> = { published: "new", allocated: "work", closed: "done", withdrawn: "stop" };

export function ListingCard({ listing: l, recipients, menu, ingredients, session, client, tz, locale, currency, onAuth, onChanged }: {
  listing: Listing;
  recipients: readonly Recipient[];
  menu: Schemas["V1CatalogueMenu"] | null;
  ingredients: readonly Schemas["V1InventoryIngredients"]["items"][number][];
  session: Session;
  client: StaffClient;
  tz: string;
  locale: string;
  currency: string;
  onAuth: (e: MunimError) => boolean;
  /** Refetch the listings (and impact); `text` is the toast, null when the error note already says it. */
  onChanged: (text: string | null) => void;
}) {
  const [mode, setMode] = useState<"idle" | "part" | "withdraw">("idle");
  const [typed, setTyped] = useState<Record<string, string>>({});
  const hand = useCommand<"cares.handover.record.v1", Schemas["CaresHandoverRecordV1"]>("cares", onAuth);
  const withdraw = useCommand<"cares.listing.withdraw.v1", Schemas["CaresListingWithdrawV1"]>("cares", onAuth);
  const recipient = recipients.find((r) => r.recipient_id === l.recipient_id);
  const parsed = Object.fromEntries(Object.entries(typed).flatMap(([id, t]) => { const v = parseTyped(t, "qty_milli", currency); return v ? [[id, v]] : []; }));
  const partReady = Object.keys(parsed).length > 0 && Object.entries(typed).every(([, t]) => t.trim() === "" || parseTyped(t, "qty_milli", currency));
  const open = l.status === "published";

  const handOver = async (what: "all" | Record<string, number>) => {
    const r = await hand.send((prev) => handoverAttempt(prev, l, what), (body) => client.recordHandover(body));
    if (r?.ok) { setMode("idle"); setTyped({}); onChanged("Hand-over recorded."); }
    else if (r && !r.ok && r.error.code === "illegal_transition") onChanged(null);
  };
  const doWithdraw = async () => {
    const r = await withdraw.send((prev) => withdrawAttempt(prev, l.listing_id), (body) => client.withdrawListing(l.listing_id, body));
    if (r?.ok) { setMode("idle"); onChanged("Listing withdrawn."); }
    else if (r && !r.ok && r.error.code === "illegal_transition") onChanged(null);
  };

  return (
    <article className="card grid gap-3 p-5" aria-label={`Listing for ${dayLabel(l.pickup_from, tz, locale)}`}>
      <header className="flex flex-wrap items-center gap-2">
        <StatusPill tone={TONE[l.status] ?? "new"}>{LISTING_STATUS[l.status] ?? l.status}</StatusPill>
        <span className="font-semibold">Pickup {dayLabel(l.pickup_from, tz, locale)} {formatTime(l.pickup_from, tz, locale)} – {formatTime(l.pickup_to, tz, locale)}</span>
      </header>
      <p className="flex flex-wrap items-center gap-2">To {recipient?.name ?? "a simulated recipient that is no longer listed"} <SimulatedRecipient /></p>
      <ul className="grid gap-1">
        {l.lines.map((x) => (
          <li key={x.line_id}>
            <span className="badge">{FOOD_KIND[x.food_kind]}</span> {lineName(x, menu, ingredients)} · <span className="num">{qtyText(x.qty_milli, x.unit, locale)}</span>
            {x.expires_on && <span className="text-muted"> · use by {formatDate(x.expires_on, locale)}</span>}
          </li>
        ))}
      </ul>
      {recordedHandovers(l).map((h) => (
        <p key={h.handover_id} className="text-[15px] text-muted">
          Handed over {formatDayTime(h.handed_at, tz, locale)}{h.recorded_by === session.me.member_id ? " · recorded by you" : ""}:{" "}
          {h.lines.map((hl) => { const line = l.lines.find((x) => x.line_id === hl.listing_line_id); return line ? `${lineName(line, menu, ingredients)} ${qtyText(hl.qty_milli, line.unit, locale)}` : qtyText(hl.qty_milli, "", locale); }).join(" · ")}
        </p>
      ))}

      {open && mode === "part" && (
        <div className="grid gap-3">
          {l.lines.map((x) => (
            <label key={x.line_id} className="block font-semibold">
              {lineName(x, menu, ingredients)}: how much was handed over? ({unitLabel(x.unit)})
              <input inputMode="decimal" value={typed[x.line_id] ?? ""} onChange={(e) => { setTyped((t) => ({ ...t, [x.line_id]: e.target.value })); hand.reset(); }} />
            </label>
          ))}
        </div>
      )}
      {open && mode === "withdraw" && <p className="font-semibold">Withdraw this listing? The simulated recipient will no longer see it.</p>}

      {open && (
        <div className="flex flex-wrap gap-3">
          {mode === "idle" && caresCan(session.me.role, "handover") && canHandOverAll(l) && (
            <button type="button" className="btn btn-primary" disabled={hand.busy || hand.wait > 0} onClick={() => void handOver("all")}>
              {hand.busy ? "Saving…" : `Hand over everything listed as ${session.me.name}`}
            </button>
          )}
          {mode === "idle" && caresCan(session.me.role, "handover") && (
            <button type="button" className="btn btn-plain" onClick={() => setMode("part")}>{canHandOverAll(l) ? "Hand over part of it" : "Record a hand-over"}</button>
          )}
          {mode === "part" && (
            <>
              <button type="button" className="btn btn-primary" disabled={!partReady || hand.busy || hand.wait > 0} onClick={() => void handOver(parsed)}>
                {hand.busy ? "Saving…" : `Record hand-over as ${session.me.name}`}
              </button>
              <button type="button" className="btn btn-plain" disabled={hand.busy} onClick={() => { setMode("idle"); setTyped({}); hand.reset(); }}>Cancel</button>
            </>
          )}
          {mode === "idle" && caresCan(session.me.role, "withdraw") && (
            <button type="button" className="btn btn-plain text-danger" onClick={() => setMode("withdraw")}>Withdraw</button>
          )}
          {mode === "withdraw" && (
            <>
              <button type="button" className="btn btn-plain text-danger" disabled={withdraw.busy || withdraw.wait > 0} onClick={() => void doWithdraw()}>
                {withdraw.busy ? "Saving…" : `Withdraw as ${session.me.name}`}
              </button>
              <button type="button" className="btn btn-plain" disabled={withdraw.busy} onClick={() => setMode("idle")}>Keep it</button>
            </>
          )}
        </div>
      )}
      {hand.error && <ErrorNote>{hand.error}</ErrorNote>}
      {withdraw.error && <ErrorNote>{withdraw.error}</ErrorNote>}
    </article>
  );
}
```

The page: `CaresScreen` (the loads in §3, the panels in §2, the food-at-risk rows, the impact card, the toasts and the
drawer) and its thin `page.tsx`. The screen for one outlet is keyed by the outlet's id, so an outlet change starts
every panel, form and pending answer afresh.

```tsx
// file: components/staff/pages/cares.tsx
"use client";
// /staff/cares: Munim Cares (14). Food at risk at this outlet, Munim's proposals to give it to a simulated recipient,
// the owner's own listing, the listings with their hand-overs, and the food shared this month. Every figure is a cell
// of a snapshot this screen minted (on load, on an outlet change and after a command only: each mint writes a snapshot
// row) or a row field shown as it is; nothing is added up here. Staff see the header and the listings only, and make
// no snapshot, draft or inbox-stream call. No live topic carries listings or hand-overs, so the screen refetches on
// focus, on "Refresh" and after each action.
import { useCallback, useEffect, useState } from "react";
import { useOnline } from "@/lib/hooks";
import type { MunimError } from "@/lib/munim/client";
import {
  atRiskParams, atRiskRows, caresCan, caresGate, GATE_TEXT, IMPACT_CELLS, impactParams, isListingDraft, listingDraftView, unitLabel,
  type AtRiskRow, type CaresProfile, type Listing, type ListingDraft, type Recipient,
} from "@/lib/munim/cares-flow";
import type { Outcome } from "@/lib/munim/drafts";
import { formatDate, titleCase } from "@/lib/munim/format";
import { cellOf, formatCell, snapRef, type CellFormat, type Snapshot } from "@/lib/munim/refs";
import { can } from "@/lib/munim/session";
import { watchFor } from "@/lib/munim/staff-app";
import { staffErrorText } from "@/lib/munim/staff-copy";
import { topic, type LiveState } from "@/lib/munim/staff-stream";
import { templateWords } from "@/lib/munim/template-words";
import type { Schemas } from "@/lib/munim/types";
import { SITE } from "@/lib/site";
import { ListingCard } from "../cares/listing-card";
import { ListingDraftCard } from "../cares/listing-draft";
import { OwnListingForm } from "../cares/own-listing";
import { useStaff } from "../shell";
import { CannotVerify, SimulatedRecipient, SnapshotDrawer, SourcedValue, StatusPill } from "../source";
import { ErrorNote, FullPage, Toast, useToast } from "../../ui";

type Outlet = Schemas["V1Outlets"]["outlets"][number];
type Detail = Schemas["V1DraftDetail"] & { draft: ListingDraft };
type OpenRef = (snapshotId: string, refToken: string) => void;
/** What every panel needs first: the Cares profile, the tenant, the counter menu (the business date and the cooked
 *  items' names), the stock items and the simulated recipients. */
interface Base {
  profile: CaresProfile;
  tenant: Schemas["V1Tenant"];
  menu: Schemas["V1CatalogueMenu"];
  ingredients: Schemas["V1InventoryIngredients"]["items"];
  recipients: Recipient[];
}
type PanelName = "base" | "listings" | "atRisk" | "proposals" | "impact";

const DECIDED_ELSEWHERE = "Someone else already decided this. It has been refreshed.";
const STALE = "The numbers behind this changed since it was proposed. It can no longer be approved or rejected; a new proposal will replace it.";
const NO_LONGER_TRACES = "Cannot verify — some numbers in this draft no longer trace to their source rows.";

/** One cell of a snapshot this screen minted, with its source chip; "Cannot verify" when the cell is not there. */
function SnapCell({ snapshot, row, column, after, fmt, onOpen }: { snapshot: Snapshot; row: number; column: string; after: string; fmt: CellFormat; onOpen: OpenRef }) {
  const v = cellOf(snapshot, { kind: "snap", snapshotId: snapshot.snapshot_id, row, column });
  return v === undefined ? <CannotVerify /> : <SourcedValue text={`${formatCell(v, column, fmt)}${after}`} refToken={snapRef(snapshot.snapshot_id, row, column)} onOpen={onOpen} />;
}

/** A panel that has no data yet: its error with "Try again", or a skeleton at the panel's size. */
function PanelWait({ error, onRetry, height }: { error: MunimError | undefined; onRetry: () => void; height: string }) {
  if (!error) return <div className={`skeleton ${height}`} role="status" aria-label="Loading" />;
  return (
    <div className="space-y-2">
      <ErrorNote>{staffErrorText(error, "cares")}</ErrorNote>
      <button type="button" className="btn btn-plain" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function CaresScreen() {
  const { session, outlet } = useStaff();
  if (!can(session, "cares")) {
    return (
      <FullPage title="Munim Cares isn't part of your role.">
        <p>Ask the owner if you need it.</p>
      </FullPage>
    );
  }
  if (!outlet) return <main className="wrap staff-main"><div className="state-box" role="status">Loading</div></main>;
  // A new outlet starts from nothing: every panel, form and pending answer belongs to the outlet it was loaded for.
  return <CaresOutlet key={outlet.id} outlet={outlet} />;
}

function CaresOutlet({ outlet }: { outlet: Outlet }) {
  const { session, client, handleAuth } = useStaff();
  const me = session.me;
  const insight = caresCan(me.role, "insight");
  // inbox:<tenant> is owner and manager only: opening it for anyone else would make the whole stream 404.
  const watches = me.role === "owner" || me.role === "manager";
  const [base, setBase] = useState<Base | null>(null);
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [atRisk, setAtRisk] = useState<Snapshot | null>(null);
  const [impact, setImpact] = useState<Snapshot | null>(null);
  const [proposals, setProposals] = useState<Detail[] | null>(null);
  const [matches, setMatches] = useState<Record<string, Snapshot | "failed">>({});
  const [errors, setErrors] = useState<Partial<Record<PanelName, MunimError>>>({});
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<AtRiskRow | "blank" | null>(null);
  // The owner's last own listing, confirmed in place (a toast cannot carry the recipient's badge).
  const [listed, setListed] = useState<{ name: string; when: string } | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");
  const [drawer, setDrawer] = useState<{ snapshotId: string; refToken: string } | null>(null);
  const [toast, setToast] = useToast();
  const online = useOnline();

  /** A failed call: a 401 signs out; a 404 on the outlet's own data is "Not found."; anything else is that panel's
   *  error. The panel's last data stays. */
  const fail = useCallback((panel: PanelName, e: MunimError) => {
    if (handleAuth(e)) return;
    if (e.kind === "not_found" && (panel === "base" || panel === "listings")) setNotFound(true);
    else setErrors((x) => ({ ...x, [panel]: e }));
  }, [handleAuth]);
  const done = useCallback((panel: PanelName) => setErrors((x) => ({ ...x, [panel]: undefined })), []);

  const loadBase = useCallback(async (): Promise<Base | null> => {
    const [p, t, m, i, r] = await Promise.all([client.getCaresProfile(), client.getTenant(), client.getMenu(outlet.id, "counter"), client.listIngredients(), client.listRecipients(outlet.id)]);
    if (!(p.ok && t.ok && m.ok && i.ok && r.ok)) {
      const bad = [p, t, m, i, r].find((x) => !x.ok);
      if (bad && !bad.ok) fail("base", bad.error);
      return null;
    }
    const b: Base = { profile: p.data, tenant: t.data, menu: m.data, ingredients: i.data.items, recipients: r.data.items };
    setBase(b);
    done("base");
    return b;
  }, [client, outlet.id, fail, done]);

  const loadListings = useCallback(async () => {
    const r = await client.listListings({ outlet: outlet.id });
    if (!r.ok) return fail("listings", r.error);
    setListings(r.data.items);
    done("listings");
  }, [client, outlet.id, fail, done]);

  /** "Today" is the menu's business date, never the tablet's clock. */
  const mint = useCallback(async (panel: "atRisk" | "impact", businessDate: string) => {
    const r = await client.mintSnapshot(panel === "atRisk"
      ? { template_id: "inventory.expiry_risk", params: atRiskParams(outlet.id, businessDate) }
      : { template_id: "cares.impact", params: impactParams(outlet.id, businessDate) });
    if (!r.ok) return fail(panel, r.error);
    (panel === "atRisk" ? setAtRisk : setImpact)(r.data);
    done(panel);
  }, [client, outlet.id, fail, done]);

  /** The proposals chain: (1) proposed drafts at this outlet, kept when they list food; (2) each one's detail (only it
   *  carries unverified_refs); (3) the ranking each one cites. */
  const loadProposals = useCallback(async () => {
    const r = await client.listDrafts({ status: "proposed", outlet: outlet.id });
    if (!r.ok) return fail("proposals", r.error);
    const got = await Promise.all(r.data.items.map((i) => i.draft).filter(isListingDraft).map((d) => client.getDraft(d.draft_id)));
    const bad = got.find((x) => !x.ok);
    if (bad && !bad.ok) return fail("proposals", bad.error);
    const details: Detail[] = got.flatMap((x) => (x.ok && isListingDraft(x.data.draft) ? [{ ...x.data, draft: x.data.draft }] : []));
    setProposals(details);
    done("proposals");
    const ranked = await Promise.all(details.map(async (d) => {
      const id = listingDraftView(d.draft, d.unverified_refs).matchSnapshotId;
      const s = id ? await client.getSnapshot(id) : null;
      if (s && !s.ok) handleAuth(s.error);
      return [d.draft.draft_id, s?.ok ? s.data : "failed"] as const;
    }));
    setMatches(Object.fromEntries(ranked));
  }, [client, outlet.id, fail, done, handleAuth]);

  const loadAll = useCallback(async () => {
    void loadListings();
    const b = await loadBase();
    if (!b || !insight || caresGate(b.profile, outlet.id) !== "on") return;
    void mint("atRisk", b.menu.business_date);
    void mint("impact", b.menu.business_date);
    void loadProposals();
  }, [loadListings, loadBase, insight, outlet.id, mint, loadProposals]);

  const gate = base ? caresGate(base.profile, outlet.id) : null;
  const on = gate === "on";

  /** "Refresh" and focus: the listings, and for insight roles the proposals. Snapshots are not minted again here. */
  const refresh = useCallback(() => {
    void loadListings();
    if (insight && on) void loadProposals();
  }, [loadListings, insight, on, loadProposals]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the responses
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const onShow = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [refresh]);

  useEffect(() => {
    if (!watches || !on) return;
    return watchFor(session, [topic.inbox(session.tenantId)], () => void loadProposals(), setLive);
  }, [watches, on, session, loadProposals]);

  if (notFound) {
    return (
      <FullPage title="Not found.">
        <p>It may have been removed, or it isn&apos;t in your outlets.</p>
      </FullPage>
    );
  }
  if (errors.base && !base) {
    return (
      <main className="wrap staff-main space-y-3">
        <h1 className="section-title">Munim Cares</h1>
        <ErrorNote>{staffErrorText(errors.base, "cares")}</ErrorNote>
        <button type="button" className="btn btn-plain" onClick={() => void loadAll()}>Try again</button>
      </main>
    );
  }

  const tz = outlet.tz;
  const fmt: CellFormat | null = base ? { locale: SITE.locale, currency: base.tenant.base_currency } : null;
  const day = base?.menu.business_date ?? null;
  const open: OpenRef = (snapshotId, refToken) => setDrawer({ snapshotId, refToken });
  const offline = !online || Object.values(errors).some((e) => e?.kind === "network");
  const liveOff = watches && on && live !== "open" && live !== "connecting";
  // Before the profile is known, insight roles see a skeleton for each of their panels.
  const showInsight = insight && (gate === null || on);
  const mayPublish = caresCan(me.role, "publish");
  const here = base?.profile.outlets.find((o) => o.outlet_id === outlet.id);
  const stockName = (id: string) => base?.ingredients.find((i) => i.ingredient_id === id)?.name ?? "Stock item";
  const proposedBatches = new Set((proposals ?? []).flatMap((d) => d.draft.payload.lines.flatMap((l) => (l.batch_id ? [l.batch_id] : []))));
  const riskRows = atRisk ? atRiskRows(atRisk) : [];
  const waiting = (listings ?? []).filter((l) => l.status === "published");
  const earlier = (listings ?? []).filter((l) => l.status !== "published");

  /** After the person's own publish, hand-over or withdraw: the listings again, and a new impact snapshot. */
  const afterCommand = () => {
    void loadListings();
    if (insight && on && day) void mint("impact", day);
  };
  const onOutcome = (o: Outcome) => {
    if (o.kind === "signed_out") {
      handleAuth(o.error);
      return;
    }
    if (o.kind === "done") setToast(o.type === "drafts.reject.v1" ? "Rejected. Nothing was changed." : "Approved. The listing is published.");
    if (o.kind === "decided_elsewhere") setToast(DECIDED_ELSEWHERE);
    if (o.kind === "stale") setToast(STALE);
    if (o.kind === "cannot_verify") setToast(NO_LONGER_TRACES);
    // Cares was switched off, or the outlet left it, since the page loaded: load the profile again (the gate card shows).
    if (o.kind === "refused" && o.error.reasonCode?.startsWith("cares_not_")) {
      void loadAll();
      return;
    }
    void loadProposals();
    afterCommand();
  };
  const listThis = (r: AtRiskRow) => {
    setListed(null);
    setForm(r);
    requestAnimationFrame(() => document.getElementById("own-listing")?.scrollIntoView({ block: "start" }));
  };

  return (
    <main className="wrap staff-main space-y-5">
      {offline && <div className="offline-bar" role="status">You&apos;re offline. Showing the last update.</div>}
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="section-title">Munim Cares</h1>
          <div className="flex flex-wrap items-center gap-3">
            {liveOff && <p className="text-[15px] text-muted" role="status">Live updates are off. Tap Refresh to update.</p>}
            <button type="button" className="btn btn-plain" onClick={refresh}>Refresh</button>
          </div>
        </div>
        <div className="scallop" aria-hidden="true" />
        <p className="text-muted">Surplus food to simulated recipients · Measured on synthetic data · Check your local food-donation rules</p>
      </header>

      <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <aside className="space-y-4 self-start min-[1100px]:sticky min-[1100px]:top-[132px] min-[1100px]:col-start-2 min-[1100px]:row-start-1">
          <section aria-label="Cares at this outlet" className="card space-y-1 p-5">
            {!base ? <div className="skeleton h-20" role="status" aria-label="Loading" /> : (
              <>
                {base.profile.profile && <p className="font-semibold">{base.profile.profile.public_name}</p>}
                {here && <p>Pickup hours {here.pickup_from}–{here.pickup_to}</p>}
                {here && <p className="text-muted">{titleCase(here.city_code)}</p>}
              </>
            )}
          </section>

          {showInsight && (
            <section aria-labelledby="impact-title" className="card space-y-2 p-5">
              <h2 id="impact-title" className="text-[22px]">Food shared this month</h2>
              {impact && fmt ? IMPACT_CELLS.map((c) => (
                <p key={c.column}>
                  {c.label} <SnapCell snapshot={impact} row={0} column={c.column} after={c.after} fmt={fmt} onOpen={open} />
                </p>
              )) : (
                <>
                  {errors.impact && <p><CannotVerify /></p>}
                  <PanelWait error={errors.impact} onRetry={() => day && void mint("impact", day)} height="h-32" />
                </>
              )}
              {base && <p className="text-[14px] text-muted">{base.profile.labels.data} · {base.profile.labels.recipients}</p>}
            </section>
          )}
        </aside>

        <div className="min-w-0 space-y-6 min-[1100px]:col-start-1 min-[1100px]:row-start-1">
          {insight && gate !== null && gate !== "on" && (
            <div className="card p-5"><p className="font-semibold">{GATE_TEXT[gate]}</p></div>
          )}

          {showInsight && (
            <section aria-labelledby="risk-title" className="space-y-3">
              <h2 id="risk-title" className="text-[24px]">Food at risk</h2>
              {!atRisk || !fmt ? <PanelWait error={errors.atRisk} onRetry={() => day && void mint("atRisk", day)} height="h-32" />
                : riskRows.length === 0 ? <p className="state-box">Nothing at {outlet.name} is close to its use-by date.</p>
                : (
                  <ul className="grid gap-3">
                    {riskRows.map((r) => (
                      <li key={r.batchId} className="card grid gap-2 p-4">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">
                          {stockName(r.ingredientId)}
                          {proposedBatches.has(r.batchId) && <StatusPill tone="new">A donation is proposed</StatusPill>}
                        </p>
                        <p className="text-[15px] text-muted">Use by {formatDate(r.expiresOn, SITE.locale)}</p>
                        <p>At risk: <SnapCell snapshot={atRisk} row={r.row} column="at_risk_qty_milli" after={` ${unitLabel(r.unit)}`} fmt={fmt} onOpen={open} /></p>
                        <p>Worth <SnapCell snapshot={atRisk} row={r.row} column="at_risk_minor" after="" fmt={fmt} onOpen={open} /> at cost</p>
                        {mayPublish && <button type="button" className="btn btn-secondary justify-self-start" onClick={() => listThis(r)}>List this</button>}
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          )}

          {showInsight && (
            <section aria-labelledby="proposals-title" className="space-y-3">
              <h2 id="proposals-title" className="text-[24px]">Proposed by Munim</h2>
              {!proposals || !base || !fmt ? <PanelWait error={errors.proposals} onRetry={() => void loadProposals()} height="h-48" />
                : proposals.length === 0 ? <p className="state-box">No proposals waiting.</p>
                : proposals.map((d) => (
                  <ListingDraftCard
                    key={d.draft.draft_id} detail={d} match={matches[d.draft.draft_id] ?? null} recipients={base.recipients} menu={base.menu}
                    ingredients={base.ingredients} session={session} client={client} fmt={fmt} tz={tz} onOpen={open} onOutcome={onOutcome}
                  />
                ))}
            </section>
          )}

          {mayPublish && on && base && fmt && (
            <section aria-label="List food yourself" className="space-y-3">
              {form === null ? (
                <>
                  {listed && (
                    <p className="card flex flex-wrap items-center gap-2 p-4 font-semibold" role="status">
                      Listed. {listed.name} <SimulatedRecipient /> can pick it up {listed.when}.
                    </p>
                  )}
                  <button type="button" className="btn btn-primary" onClick={() => { setListed(null); setForm("blank"); }}>List food yourself</button>
                </>
              ) : (
                <OwnListingForm
                  key={form === "blank" ? "blank" : form.batchId} outletId={outlet.id} prefill={form === "blank" ? null : form} menu={base.menu}
                  ingredients={base.ingredients} session={session} client={client} fmt={fmt} tz={tz} onOpen={open} onAuth={handleAuth}
                  onPublished={(l) => { setForm(null); setListed(l); afterCommand(); }} onCancel={() => setForm(null)}
                />
              )}
            </section>
          )}

          <section aria-labelledby="listings-title" className="space-y-3">
            <h2 id="listings-title" className="text-[24px]">Listings</h2>
            {!listings || !base ? <PanelWait error={errors.listings} onRetry={() => void loadListings()} height="h-40" />
              : listings.length === 0 ? <div className="state-box"><p>No food listed today.</p></div>
              : ([["Waiting for pickup", waiting], ["Earlier", earlier]] as const).map(([title, list]) => list.length > 0 && (
                <div key={title} className="space-y-3">
                  <h3 className="text-[20px]">{title}</h3>
                  {list.map((l) => (
                    <ListingCard
                      key={l.listing_id} listing={l} recipients={base.recipients} menu={base.menu} ingredients={base.ingredients} session={session}
                      client={client} tz={tz} locale={SITE.locale} currency={base.tenant.base_currency} onAuth={handleAuth}
                      onChanged={(text) => { if (text) setToast(text); afterCommand(); }}
                    />
                  ))}
                </div>
              ))}
          </section>
        </div>
      </div>

      {fmt && <SnapshotDrawer client={client} open={drawer} onClose={() => setDrawer(null)} fmt={fmt} tz={tz} label={templateWords} />}
      <Toast message={toast} />
    </main>
  );
}
```

```tsx
// file: app/staff/cares/page.tsx
import type { Metadata } from "next";
import { CaresScreen } from "@/components/staff/pages/cares";

export const metadata: Metadata = { title: "Munim Cares" };

export default function Page() {
  return <CaresScreen />;
}
```

## 8 · Acceptance checklist

`[mock]` = check it on the extended mock (03) · `[unit]` = a unit test or a stubbed response,
because the mock cannot produce it · `[real]` = only on the real API.

**Labels and rules**
- [ ] [mock] Every recipient name on the screen (proposal, ranking, listing cards, own-listing choice, the own-listing confirmation, the drawer's ranking rows) is followed by "Simulated recipient", and the name says "(simulated)". No toast names a recipient.
- [ ] [mock] "Measured on synthetic data", "to simulated recipients" and "Check your local food-donation rules" are visible to the owner without scrolling past the header at 1280 × 800.
- [ ] [mock] `grep -rnE "reduce|\+ *[a-z_]*(qty|_milli|_minor)" components/staff/cares components/staff/pages/cares.tsx` finds no sum over a quantity or an amount.
- [ ] [mock] No request body sent from this screen holds `tenant_id`, a member id other than `typed_by`, or a total.

**Roles**
- [ ] [mock] Signed in as Imran Siddiqui (demo): only the header and "Listings" show. The network tab shows no `POST /v1/snapshots`, no `/v1/drafts` and no `inbox:` stream request.
- [ ] [mock] As Imran: "Hand over part of it" records a hand-over (200). "Withdraw" is not shown, and a forced withdraw request is 403 `book_write_refused`, shown as "Your role can't do this. Ask the owner."
- [ ] [unit] A manager session (stub `GET /v1/me` with `role: "manager"`) sees the proposal with "Only the owner can approve or reject a donation." and no decision buttons; a stubbed approve answer of 403 `authority_denied` shows "Your role can't do this. Ask the owner."
- [ ] [unit] An advisor session shows "Munim Cares isn't part of your role." and makes no call.

**Food at risk and the proposal**
- [ ] [mock] As Nandini Mehrotra (demo), "Food at risk" lists the sourdough loaves and the cream. Each quantity and value has a "Source" chip that opens "Stock close to its use-by date" with that cell outlined.
- [ ] [mock] The sourdough row says "A donation is proposed". "Proposed by Munim" shows one card: "Sliced sourdough loaf (synthetic) · Packaged · use by {the day after pickup}", "Quantity (pieces)" with its chip, "To Riverside Night Shelter (simulated) Simulated recipient", and "Pickup Today 9:00 pm – 10:30 pm" with its chip ("Tomorrow" once it is past 9 pm at the outlet: the mock, like the template, takes the next window).
- [ ] [mock] "Simulated recipients that could take it" lists Riverside Night Shelter first ("Best match", "Chosen"), then Old Town Community Kitchen, each with distance and overlap chips.
- [ ] [mock] "Approve as Nandini Mehrotra (demo)" publishes it. Toast "Approved. The listing is published."; the card leaves the list; the listing shows under "Waiting for pickup".
- [ ] [mock] On a fresh mock: "Edit", type a quantity, "Why you changed it", then "Approve with my edits as Nandini Mehrotra (demo)". The request's `lines[0].qty_milli` is `{ "value": …, "typed_by": <Nandini's member_id> }`; the listing has the typed quantity.
- [ ] [mock] Double-tapping "Approve as …" sends one request. Going offline, tapping, then coming back online and tapping "Try again" sends a byte-identical body (same `idempotency_key`).
- [ ] [mock] A second tab signed in as Nandini approves the same proposal first: the first tab shows "Someone else already decided this. It has been refreshed."
- [ ] [mock] Mock controls "Next approve" → "stale" / "can't apply": the stale toast, then the card leaves the list; "It was approved but could not be applied. Nothing changed." (the draft is then "Couldn't apply" and leaves the list too).
- [ ] [mock] "Reject" needs both a reason and a note. "Reject as Nandini Mehrotra (demo)" sends `reason_code` and `reason`.
- [ ] [unit] A draft detail with the quantity's ref in `unverified_refs` shows "Cannot verify" and offers "Reject" only, with "Some numbers this draft relies on can't be opened with your access, so it can't be approved. You can reject it." (a snapshot cell cannot be typed over).
- [ ] [unit] A stubbed 422 `cannot_verify` on approve refetches the draft and shows the toast.

**Own listing**
- [ ] [mock] "List this" on the cream row fills "Raw stock", the cream, "ml" and the use-by date, with the quantity empty. "Find simulated recipients" (after typing a quantity) shows only Old Town Community Kitchen (simulated).
- [ ] [mock] Changing the quantity after finding clears the ranking.
- [ ] [mock] Choosing a row and "Publish as Nandini Mehrotra (demo)" sends `pickup_from` / `pickup_to` equal to that row's cells. The form closes and "Listed. {the chosen recipient, "(simulated)"} Simulated recipient can pick it up {day} from {time}." shows in its place, with no toast.
- [ ] [mock] "Cancel" closes the form at any step (before finding, after choosing) and publishes nothing; "List food yourself" opens it empty again.
- [ ] [unit] Stubbed 422 refusals `listing_expired`, `recipient_ineligible`, `cooked_hold_exceeded`, `line_expired` and 409 `qty_exceeds_on_hand` each show their 01 §9 line (01 §9's `tests/staff-copy.test.ts` covers `listing_expired` and `recipient_ineligible`).

**Hand-over and impact**
- [ ] [mock] On a new listing, "Hand over everything listed as …" closes it ("Handed over"). On another, a part hand-over leaves it "Waiting for pickup". After that, "Hand over everything listed" is gone, and typing more than is left gives "That's more than was listed."
- [ ] [mock] Each hand-over shows "Handed over {day time} · recorded by you" for your own.
- [ ] [mock] After a hand-over, "Food shared this month" is re-minted: its "Hand-overs" chip opens a newer snapshot than before.
- [ ] [mock] Two tabs: tab B hands over first; tab A's "Hand over everything listed" answers "This changed on another screen. It has been refreshed."
- [ ] [real] A hand-over recorded on the real API moves stock (an `inventory.cares_handover` movement), and `cares.impact` counts it in its pickup month.
- [ ] [real] The `inventory.expiry_risk` watcher drafts a donation for a real at-risk batch at an outlet with Cares on. The draft's recipient is row 0 of its `cares.recipient_match` snapshot.
- [ ] [real] A proposal whose pickup window has passed answers 409 `stale_draft` on approve.
- [ ] [real] An own listing publishes with the chosen `cares.recipient_match` row's `pickup_from` / `pickup_to` cells as sent (core serialises timestamptz cells as ISO 8601 with an offset, which `IsoDateTime` accepts; checked in the source, not yet on a running API).

**Gate and quality**
- [ ] [unit] Stubbed profiles with `available: false`, `enabled: false`, `profile: null` and an outlet missing from `outlets` each show their gate card. Listings still show.
- [ ] [mock] Offline (DevTools) shows "You're offline. Showing the last update."; the last data stays.
- [ ] [mock] Force 429: the panel error shows "Too many requests. Please wait a moment and try again.", and a command button reads "Try again in 5 s" until it may go.
- [ ] [mock] At 1024 × 768 and 1280 × 800 nothing overlaps and every button is at least 48 px. At 200 % zoom every action is still reachable.
- [ ] [unit] A recipient name or listing note of `<b>x</b>` renders as that literal text.

## 9 · Screenshots

Into the repo's screenshot folder, named `staff-cares-<state>-<width>.png` (00 §5), at 1024 and 1280:

`staff-cares-owner-1280.png`, `staff-cares-owner-1024.png` (all panels) · `staff-cares-loading-1280.png` ·
`staff-cares-staff-1024.png` (Imran: header and listings) · `staff-cares-proposal-1280.png` (card with the ranking
open) · `staff-cares-proposal-editing-1280.png` ("Edited by Nandini Mehrotra (demo)" beside the struck-through
proposal) · `staff-cares-proposal-cannot-verify-1280.png` (stubbed) · `staff-cares-manager-1280.png` (stubbed) ·
`staff-cares-own-listing-ranked-1024.png` · `staff-cares-handover-part-1024.png` ·
`staff-cares-qty-exceeds-listed-1024.png` · `staff-cares-closed-1280.png` · `staff-cares-withdraw-confirm-1024.png`
· `staff-cares-drawer-1280.png` (the impact chip opened) · `staff-cares-gate-not-enabled-1280.png` (stubbed) ·
`staff-cares-role-not-allowed-1280.png` (stubbed) · `staff-cares-empty-1280.png` · `staff-cares-offline-1024.png` ·
`staff-cares-429-1024.png`. No screenshot shows a token or a tenant id.

## 10 · What this file relies on in 01, 02 and 03

All merged into the foundation files:

- **01 §6.1 `lib/munim/drafts.ts`** decides the proposal (the same module as the draft page, 12, and the purchase-order
  card, 15): `approveGate` (a manager is offered no buttons on a Cares listing, as core refuses them), `withEdits`,
  `approveAttempt`, `rejectAttempt`, `outcomeOf`, `lineageLine`. **02 §5 `components/staff/decision.tsx`** is the bar.
- **03 `staff-data.ts`:** the `inventory.expiry_risk` and `cares.recipient_match` templates and rows (`caresSnapshots`,
  `matchRowsFor`), the expiry finding and the `cares.listing.publish.v1` draft. **03 `staff.ts`:** both templates'
  mint params; a draft decided only by a role its own type allows; approval creates the listing under the approver
  (`storeListing`, shared with `publishListing`); `recipient_ineligible` and `listing_expired` are 422
  `invalid_payload`, as in core.
- **02 §4 / 12's `template-words.ts`:** "Stock close to its use-by date" and "Simulated recipients that can take this
  food".

The inbox (`GET /v1/inbox`) therefore also holds the expiry finding and the fourth draft: 01 §10's staff smoke reads
"inbox: 7 item(s), 4 draft(s)".
