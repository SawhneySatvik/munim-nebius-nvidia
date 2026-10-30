# 03 · Extending Cobnut's mock with the member routes

Your mock (`mock-server/`, served at `/mock/v1/[...path]`) already serves the storefront contract. This file adds the
member half the staff screens call, over the same bakery: same paths, shapes, status codes and refusals as Munim's
core, so that switching to the real API later is env vars only (plus the founder's CORS answer, 01 §2). Everything
here is synthetic and invented.

Two new files and three small edits:

| File | What |
|---|---|
| `mock-server/staff-data.ts` (new, §7) | The seed: members, outlets, counter menu, a business day of orders and tickets, receipts, the AI inbox, the snapshots behind every number, two Ask threads, Cares (food at risk, ranked simulated recipients), simulated suppliers and goods received |
| `mock-server/staff.ts` (new, §8) | The member routes: auth, books in memory, the rules core enforces, live events |
| `mock-server/handler.ts` (3 edits, §9) | Route member requests to `staff.ts`; allow the new headers; outlets are `restaurant` |
| `lib/munim/session.ts` (from 01) | The demo tokens and tenant id; the mock imports them so the two never drift |

Every fixture in §7 was parsed with the contract's own strict schemas (`SCHEMAS[...]` of Munim's contracts; an
extra or missing field fails), every AI sentence was checked for free digits, and every ref in it was checked to
name a cell of a seeded snapshot whose value equals the value served beside it, as does every draft's `based_on` cell
(111 checks, all passing; the check fails when a field is planted). You do not have the contracts package; the
`satisfies Schemas[...]` and typed constants in the files keep TypeScript checking the shapes as you change them.

## 1 · The demo people

| Demo sign-in | Token (public, mock only) | `role` | `outlet_ids` | Lands on |
|---|---|---|---|---|
| "Nandini Mehrotra (demo)", owner | `mock_member_owner_c0b1_7f2e9a14` | `owner` | `"*"` (both outlets) | `/staff/home` |
| "Imran Siddiqui (demo)", counter | `mock_member_counter_c0b1_3b8d5e60` | `staff` | Cobnut Hazratganj | `/staff/counter` |
| "Kavya Tandon (demo)", kitchen | `mock_member_kitchen_c0b1_91c4a2d7` | `staff` | Cobnut Hazratganj | `/staff/kitchen` |

Tenant id (`X-Munim-Tenant`): `019a0c5e-7e11-7a00-8c0b-0000000c0b17`. A request without one of these tokens is 401;
with one but another tenant id (or none) is 404. These are test values like the storefront key: they may appear in
the README, never real ones.

## 2 · What this mock can and cannot do

It keeps its books **in memory, per server instance**, seeded on the first request from the current time.

- `npm run dev` (one process): everything persists until you restart; every flow in the screen files works end to
  end.
- **Serverless hosting (your Vercel preview):** each request may reach a different instance, and an instance forgets
  everything when it is recycled. A placed counter order, an approval or a hand-over can vanish on the next request,
  and a live event is only seen by a stream on the same instance. The seeded day is identical everywhere (it is built
  from the clock), so screens always have data. Screenshots and the staff smoke are taken against `npm run dev`.
- **A shopper's storefront order does not reach this mock kitchen.** The storefront mock keeps each order inside its
  signed guest token (stateless), so the staff side never sees it. The mock kitchen shows the seeded tickets, the
  counter orders placed on the same instance, and web orders made with the Mock controls button **"Simulate a web
  order"** (§6). On the real API a storefront order appears on the kitchen display at once: that is a `[real]` check.
- Snapshots are fixtures; minted figures are computed from the mock's own books (or fixed rows for figures it does
  not model, such as weekly net sales).
- Ask answers from two canned answers (cake tickets, butter waste) and abstains for anything else. No model is
  called.
- `GET /v1/drafts/{id}/lineage` is not served (404): build the lineage line from `GET /v1/drafts/{id}` (12).
  `GET /v1/lineage` is served for purchase orders only, with the audit, decision and draft hops (the finding, run and
  snapshot hops empty).
- "Approve with my edits" never changes the draft: as in core, the final payload stays on the decision record, which
  no member route serves (00 §7 question 15). A reloaded draft shows the proposal; the typed value is on the purchase
  order or the listing.
- Members mint only the templates the screens use. The run-minted ones (kitchen ticket times, prep need, and the
  negotiation's shortfall, last price and deal inputs) can be opened, not minted (404).
- Goods received move no stock (stock levels are not modelled); `cares.impact` ignores its `from` / `to` and counts
  every recorded hand-over; a listing is not checked against cooked-food hold times or stock on hand; a member's
  minted snapshot takes its outlet scope from its params.
- Not modelled: shifts, voids, refunds, B2B offers and claims, recipe and price changes.

## 3 · Routes

All under `/mock/v1`. Auth for every row: `Authorization: Bearer <demo token>` + `X-Munim-Tenant`. "Scope" means the
person's `outlet_ids`. Refusals are listed in the order they are checked.

| Method and path | Contract | Behaviour | Refusals |
|---|---|---|---|
| `GET /v1/me/tenants` | `TenancyMeTenants` | The demo tenant with the token's role (token only, no tenant header) | 401 |
| `GET /v1/me` | `V1Me` | The person | 401, 404 |
| `GET /v1/tenant` | `V1Tenant` | Cobnut, INR, `Asia/Kolkata` | |
| `GET /v1/outlets` | `V1Outlets` | **Both** outlets, `kind: "restaurant"`, whatever the person's scope (core does the same today; screens filter by `GET /v1/me`) | |
| `GET /v1/channels`, `GET /v1/devices` | `V1Channels`, `V1Devices` | Counter + own-site channels (the whole business); a POS and a KDS device per outlet, only the person's outlets' (core's row-level security on devices) | |
| `GET /v1/catalogue/menu?outlet&channel_kind` | `V1CatalogueMenu` | 18 entries (item × variant) with display names, options, availability | 400 no `channel_kind` / bad outlet; 404 out of scope |
| `POST /v1/orders:preview` | `OrdersPreviewRequest` → `OrdersPreviewResponse` | The storefront pricing (deal, GST 2.5 + 2.5); with refusals: `lines: []`, totals 0 | 422 a field the contract does not name (a line `note`, say: the body and its lines are strict); 404 outlet out of scope; 422 bad variant or options |
| `POST /v1/orders` | `orders.place.v1` → 201 `CommandResult` | Order `placed`, next ticket number, invoice number when `device_id` is set, one kitchen ticket per station (`kitchen`, `bar`), events | 422 envelope / ids / note > 200 / points; 403 outlet out of scope; 404 channel; 409 `conflict` + first pricing refusal; 409 `preview_total_changed`; replay / 409 `idempotency_conflict` |
| `GET /v1/orders?outlet&status&business_date` | `V1OrdersList` | Newest first, `next_cursor: null` | 404 outlet out of scope |
| `GET /v1/orders/{id}` | `V1Order` | With tenders, `paid_minor`, `remaining_minor` | 404 |
| `GET /v1/orders/{id}/receipt` | `V1OrderReceipt` | A GST "Tax Invoice" (CGST + SGST per line, number = the POS device's series + invoice no.) | 404; 409 `conflict` `tax_id_missing` when the outlet lacks its GSTIN or FSSAI number (Gomti Nagar; core also says so for a malformed one) |
| `POST /v1/orders/{id}:accept` | `orders.order.accept.v1` | placed → accepted | 422 id mismatch; 409 `illegal_transition` |
| `POST /v1/orders/{id}:reject` | `orders.order.reject.v1` | placed → rejected | 422 `reason_required`; 409 `illegal_transition`; 409 `refund_first` if paid |
| `POST /v1/orders/{id}:advance` | `orders.order.advance.v1` | accepted → preparing → ready → completed; placed / accepted → cancelled | 422 `reason_required` for cancel; 409 `illegal_transition` (stale `from_status` or a skipped step); 409 `refund_first` |
| `POST /v1/orders/{id}/tenders` | `orders.tender.record.v1` | Cash: amount = remaining rounded to ₹1, change and rounding recorded; partial cash allowed. Card / UPI: amount ≤ remaining | 422 shape / id mismatch; 409 `illegal_transition` (cancelled); 422 `currency_mismatch`; 409 `conflict` (nothing due); 409 `cash_below_rounding`; 422 card over remaining |
| `GET /v1/kitchen/board?outlet&station` | `V1KdsBoard` | Live tickets; amber from due − 3 min, red at due; lane `later` while the promised time minus the outlet's prep minutes is ahead; sorted red, amber, due, number; `stations` = the stations of the outlet's live tickets, sorted | 400 bad outlet; 404 out of scope |
| `POST /v1/kitchen/tickets/{id}:advance` | `kitchen.ticket.advance.v1` | One step forward; the order follows (first start → preparing; all ready → ready; all done → completed, even unpaid) | 422 id mismatch; 404; 409 `illegal_transition` |
| `GET /v1/inbox` | `V1InboxResponse` | Open findings + proposed drafts in scope, newest first; draft items carry no `unverified_refs`; every value beside a ref only from a cell this person may open | |
| `GET /v1/drafts?status&outlet`, `GET /v1/drafts/{id}` | `V1DraftsResponse`, `V1DraftDetail` | A draft shows when its outlets overlap the person's (one with no outlets: every outlet only). With `decision`, `history`, and `resolved_refs`, `based_on` and `unverified_refs` worked out for this person (a cell they cannot open is unverified, and left out of `based_on`); the list is newest first (`updated_at`), and `outlet` keeps drafts naming that outlet | 404 not in scope |
| `POST /v1/drafts/{id}:approve` | `drafts.approve.v1` | Applies the final payload (refs → their values, edits → what was typed) under the approver, keeps it on the decision record and leaves the draft's payload as proposed; answers the executed command's `type` and `entity_id` | 422 `draft_id` ≠ path; 404; 403 `authority_denied` (a role that `drafts.approve.v1` or the draft's own type does not allow: staff, and a manager on a Cares listing; or a person without every one of the draft's outlets, and of the outlets its payload writes to, none meaning the whole business); 409 `stale_draft` / 422 `execution_failed` again on a draft already stale or failed; 409 `already_decided`; 422 `command_type` ≠ draft's; 422 an edit not `{value: number, typed_by: <approver>}` or a moved ref; **422 `cannot_verify`** + `refs` while a payload ref does not open for the approver, and without `refs` when a `based_on` cell does not; forced 409 `stale_draft` + `changes`, 422 `execution_failed` (the draft becomes `failed`) (§6) |
| `POST /v1/drafts/{id}:reject` | `drafts.reject.v1` | Status `rejected`, decision recorded; answers `drafts.reject.v1` with the draft id | 422 id mismatch / reason 1–500; 404; 403 (as approve, over the draft's outlets only); 409 `already_decided` |
| `POST /v1/findings/{id}:dismiss` | `findings.dismiss.v1` | Status `dismissed` | 422 id mismatch; 404; 403 staff; 409 not open |
| `POST /v1/snapshots` | `V1SnapshotsRequest` → 201 `Snapshot` | Templates of 01 §6 plus `purchasing.quote_compare`, `inventory.expiry_risk` and `cares.recipient_match` (14); rows from the mock's books; `minted_by_member_id` set | 404 unknown template or role below manager; 422 params not exactly the template's; 403 outlet out of scope |
| `GET /v1/snapshots/{id}` | `Snapshot` | Seeded or minted | 404 unknown, role below manager, or scope wider than the person's |
| `POST /v1/ask` | `V1AskRequest` → `V1AskResponse` | Leading `@Name` (core's aliases) addresses a specialist; canned cited answers or an abstention; appends a turn. `resolved_refs` holds only cells this person may open, so a staff member's answers carry none (every cell they cite is manager and up) | 400 bad body; 404 unknown thread, or one outside the person's scope; 503 forced (§6) |
| `GET /v1/threads`, `GET /v1/threads/{id}` | `V1ThreadsResponse`, `V1Thread` | Every thread whose outlet scope the person's covers, a teammate's included (one scoped to every outlet: owner, advisor or judge with every outlet only); answers filtered by role as above | 404 |
| `GET /v1/specialists` | `V1SpecialistsResponse` | The Manager and the eight specialists with aliases (detectors, templates and draftables left empty) | |
| `GET /v1/cares/profile`, `GET /v1/cares/recipients?outlet` | `V1CaresProfile`, `V1CaresRecipients` | Cares on, both outlets in `lucknow`; two simulated recipients | 400 no `outlet`; 404 |
| `GET /v1/cares/listings`, `GET /v1/cares/listings/{id}` | `V1CaresListings`, `V1CaresListing` | Tonight's open donation, yesterday's handed-over one | 404 |
| `POST /v1/cares/listings` | `cares.listing.publish.v1` | Donation published (also what approving a Cares proposal runs, under the approver) | 403 `book_write_refused` (not owner or judge); 404; 422 lines; 409 `offer_not_enabled`; 422 `invalid_payload` + `listing_expired`; 422 `invalid_payload` + `recipient_ineligible` (as core) |
| `POST /v1/cares/listings/{id}:withdraw` | `cares.listing.withdraw.v1` | published → withdrawn | 422 id mismatch; 403 staff; 404; 409 `illegal_transition` |
| `POST /v1/cares/handovers` | `cares.handover.record.v1` | Records it; the last line handed over closes the listing (counts in `cares.impact`) | 403; 404; 409 `illegal_transition`; 409 `qty_exceeds_listed` |
| `GET /v1/suppliers`, `GET /v1/suppliers/{id}` | `V1Suppliers`, `V1Supplier` | Two simulated suppliers with `label: "Simulated supplier"`; staff get `prices: []` | 404 |
| `GET /v1/purchase-orders`, `GET /v1/purchase-orders/{id}` | `V1PurchaseOrders`, `V1PurchaseOrder` | Last week's butter PO and any approved or created | 404 |
| `POST /v1/purchase-orders` | `purchasing.po.create.v1` → 201 | Committed, total computed | 403 `book_write_refused` + `authority_denied` (staff, or an outlet out of scope: core's book guard); 400 unknown or inactive supplier |
| `GET /v1/inventory/ingredients`, `GET /v1/inventory/reorder-levels?outlet` | `V1InventoryIngredients`, `V1InventoryReorderLevels` | Five ingredients; Hazratganj's min / par | 400 no `outlet`; 404 |
| `GET /v1/goods-received`, `GET /v1/goods-received/{id}` | `V1GoodsReceivedList`, `V1GoodsReceived` | Goods-received notes in the person's outlets, newest first (last week's butter) | 404 |
| `POST /v1/goods-received` | `purchasing.grn.receive.v1` → 201 | Recorded against a committed PO; a null cost takes the PO line's price; the PO turns `received` once every line has come in (for someone who sees all its outlets) | 422 shape; 403 `book_write_refused` (role / outlet); 400 unknown supplier, a line not on the PO, a batch missing for batch-tracked stock (or given for other stock); 409 `conflict` (PO not committed) |
| `GET /v1/lineage?row=core.purchase_order:<id>` | `V1LineageRow` | One chain per audit entry on the order, oldest first; an approved proposal's chain carries the decision (verdict, `decided_by` with the name) and the draft | 400 malformed `row`; 404 another table, an unknown order, or one outside scope |
| `GET /v1/stream?topics=` | SSE | `kds:<outlet>`, `order:<id>`, `inbox:<tenant>` (owner / manager); events as core sends them | 400 none, > 10 topics, a malformed topic or two `inbox:` topics; **404 if any topic is not the person's** |
| `POST /v1/_mock/web-order` | mock only | A synthetic pickup order (two croissants, an oat cold coffee with a note) on the own-site channel, for pickup in 15 minutes (it lands in Now) | 404 out of scope |

Commands share core's idempotency: the same `idempotency_key` with the same person, `command_id`, `type` and payload
returns the stored answer with `X-Munim-Replayed: true`; anything else under that key is 409 `idempotency_conflict`.
A refused command stores nothing, so a retry runs it again. Authority is checked before a replay, as core does.

## 4 · The seeded day (built from the clock on first request)

| Outlet | # | Status | What | Why it is there |
|---|---|---|---|---|
| Hazratganj | 1, 2 | completed, paid (card, cash) | Croissants and hot chocolate; pain au chocolat and an oat cold coffee | Order history, tender rows |
| Hazratganj | 3 | ready, paid (UPI) | Three cookies | A "Ready" ticket and order |
| Hazratganj | 4 | preparing, promised 4 min ago | Two mousse cups | A **red** ("Late") ticket |
| Hazratganj | 5 | preparing, pickup in 35 min | **Hazelnut Praline Cake, 1 kg, Eggless sponge**, note "Happy 60th, Nani! — with love, Zoya" | Options and a cake message on the ticket |
| Hazratganj | 6 | placed, due in 2 min | Two cardamom knots (kitchen) and a dairy cold coffee (bar) | An **amber** ticket; two stations |
| Hazratganj | 7 | placed, pickup in 3 h | A truffle tin | Lane **later** |
| Gomti Nagar | 1 | completed, paid | Four cookies | |
| Gomti Nagar | 2 | preparing | Build-a-Box of 9, three flavours, gift wrap, note "For Mr Rastogi — thank you for everything" | Many options + a card message |
| Gomti Nagar | 3 | placed | Two large hot chocolates (bar) | A bar ticket at the other outlet |

The inbox: three findings and four drafts, each with its snapshots.

| Item | Specialist | What it says or proposes | Numbers come from | On approve |
|---|---|---|---|---|
| Finding `inventory.waste_spike` | Stock & Purchasing | Butter written off this week vs a usual week | `inventory.waste_week` cells | Dismiss only |
| Finding `kitchen.ticket_drift` | Kitchen | Cake tickets ran late; slowest fifth vs set prep time | `kitchen.ticket_times` cells | Dismiss only |
| Draft `kitchen.prep_time.set.v1` | Kitchen | Set the cake's prep time to the observed slow-fifth time | `kitchen.ticket_times` `p80_sec` | Approve as proposed works |
| Draft `kitchen.prep_list.create.v1` | Kitchen | Tomorrow's prep: butter and hazelnuts | `kitchen.prep_need` `prep_qty_milli` | Approve as proposed works |
| Finding `inventory.expiry_risk` | Stock & Purchasing | Sliced sourdough loaves that will not be used before they expire | `inventory.expiry_risk` cells | Dismiss only |
| Draft `purchasing.po.create.v1` | Stock & Purchasing | Hazelnuts from "Lalbagh Nut & Spice (simulated)", quantity and price from round two of the quote comparison (as core's negotiation review drafts it) | `purchasing.quote_compare` `qty_milli` and `unit_price_minor`; `based_on` also cites `inventory.shortfall` `shortfall_qty_milli`, `purchasing.price_creep` `latest_minor` (the last price; UNVERIFIED which template core's negotiation reads it from) and `purchasing.deal_inputs` `budget_left_minor` | Approve as proposed works; "Approve with my edits" to change the price |
| Draft `cares.listing.publish.v1` | Stock & Purchasing | The at-risk sourdough to the top-ranked simulated recipient, Riverside Night Shelter (simulated), at its next pickup window | quantity: `inventory.expiry_risk` `at_risk_qty_milli`; recipient and pickup: `cares.recipient_match` row 0 | Owner or judge only (a manager gets 403); creates the listing under the approver |

Ask threads: "@Kitchen how are the cake tickets doing this week?" (answered, five cited values, signed "Kitchen ·
via Manager") and "What will we sell on Diwali night?" (abstained, `insufficient_history`). Cares: Cares on, two
simulated recipients, tonight's sourdough donation (published) and yesterday's (handed over); food at risk at
Hazratganj (twelve sourdough loaves, some cream) and the recipients core would rank for it: Riverside Night Shelter
(simulated) first, then Old Town Community Kitchen (simulated). Suppliers: "Riverbank Dairy (simulated)" and "Lalbagh
Nut & Spice (simulated)", a quote comparison with three rounds, last week's received butter PO and its goods-received
note, Hazratganj's reorder levels (hazelnuts are below their minimum). Receipts: every Hazratganj order prints one;
Gomti Nagar has no tax ids, so its receipts are 409 `tax_id_missing`.

## 5 · Rules copied from core (do not make the mock kinder)

- Order steps follow core's table: placed → accepted | rejected | cancelled; accepted → preparing | cancelled;
  preparing → ready; ready → completed. `from_status` must be the current status. Cancel and reject need a
  `reason_code` and are refused while payments stand.
- Tickets move one step forward. The **order follows its tickets** and completes when the last ticket is done, even
  if it is unpaid: the till takes payment before it hands over (10).
- Card and UPI may not exceed what is left; only cash records change.
- A draft decides once. `draft_id` must equal the path id (422). An edit is `{value, typed_by}` and `typed_by` must be
  the approver. A ref left in an edited payload must be the proposed ref at the same path. `cannot_verify` is a
  **422**, with `refs` when a payload ref does not open for the approver and without them when a cell the draft was
  based on does not; `stale_draft` a 409 with `changes`. A retry on a draft that went stale or failed gets that answer
  again, not `already_decided`. Approving never changes the draft's payload: the final payload stays on the decision.
- A draft is decided only by a role its own command type allows, as well as `drafts.approve.v1` (core's
  `roleAllowed`): `cares.listing.publish.v1` is owner and judge, the other seeded types owner, manager and judge. The
  person must also have every one of the draft's outlets (none = the whole business), and, to approve, every outlet
  its payload writes to.
- A draft shows to anyone whose outlets overlap its own. Its values, `based_on` and `unverified_refs` are worked out
  for the person reading it, as are the values beside the refs of findings and answers: a cell they may not open is
  "Cannot verify" for them.
- History rows made from the audit (`executed`, `stale`, `failed`) name the role (`{member_id, role}`: "Applied ·
  Owner"); the decision row names the person.
- A purchase-order draft cites its quote comparison's cells for both quantity and price, as core's negotiation
  review drafts it. The comparison is minted under the negotiation run's own outlet scope; the mock scopes it to every
  outlet, so the numbers trace for the owner. (When a real run covers every outlet, a manager of one outlet cannot
  open it and is offered Reject only.)
- `GET /v1/inbox` draft items carry no `unverified_refs`; `GET /v1/drafts` and `GET /v1/drafts/{id}` do.
- `GET /v1/outlets` lists the whole business; the outlets a person works in come from `GET /v1/me`. `GET /v1/devices`
  lists only the person's outlets' devices.
- Every template these screens mint or cite is manager and up; a staff member minting or opening one gets 404.
  (Core has one template open to staff, `cares.listings`, which these screens do not use.) So a staff member's Ask
  answers carry no values.
- Cares refusals of a listing (`recipient_ineligible`, `listing_expired`) are 422 `invalid_payload` with the reason.
- A purchase order or goods received that the role or outlet may not write is 403 `book_write_refused` (core's book
  guard), and an unknown supplier on a new order is 400.
- The order preview is strict: a field the contract does not name is 422.
- A stream with any topic the person may not read is 404 as a whole; a malformed topic is 400; `inbox:` is owner and
  manager only.
- Event data carries ids and statuses only.

## 6 · Mock controls for staff screens

The storefront's panel keeps its two selects. Add two more to the same panel (`MockPanel` in `components/ui.tsx`),
written with `writeMockControls` (01 §8), and one button on staff screens:

| Control | Sends | Mock answers |
|---|---|---|
| "Next approve" → "normal" / "stale" / "already decided" / "can't apply" | `X-Mock-Force-Decision: stale` / `already_decided` / `execution_failed` | 409 `stale_draft` + `changes` (the draft becomes `stale`) / 409 `already_decided` / 422 `execution_failed` (the draft becomes `failed`, "Couldn't apply") |
| "AI" → "normal" / "off" / "abstain" | `X-Mock-Force-Ai: off` / `abstain` | Ask: 503 (hide the AI surface) / an answer abstained with `model_blocked` |
| "Force 429" (existing) | `X-Mock-Force-429: 1` | 429 with `Retry-After: 5` on staff routes too |
| Button **"Simulate a web order"** (kitchen and counter screens, mock only) | `POST /v1/_mock/web-order` via `simulateWebOrder` (01 §8) | A pickup order with two tickets appears on the board (live event) |

Offline is the browser's own (DevTools → Network → Offline). A second browser tab signed in as another demo person
produces the real 409s (`illegal_transition`, `already_decided`).

## 7 · The seed: `mock-server/staff-data.ts`

```ts
// file: mock-server/staff-data.ts
// The staff side of the synthetic bakery: members, outlets as the member API shows them, the counter menu, a business
// day of orders and kitchen tickets, the AI inbox (findings and drafts), the snapshots behind every number, two Ask
// threads, Cares and simulated suppliers. All invented. Every object here has the exact shape of a Munim response and
// is checked against the contract (03 §7). Times are built from `now`, so the board always has fresh tickets.
import { createHash } from "node:crypto";
import type { Schemas } from "@munim/sdk";
import { DEMO_PEOPLE, DEMO_TENANT_ID } from "@/lib/munim/session";
import { CHANNEL_ID, CURRENCY, DEALS, ITEMS, OUTLETS, PREP_MIN, TAX, TAX_CLASS, TZ, TZ_OFFSET_MIN, groupId, id7, itemId, optionId, variantId } from "./data";
import { price } from "./pricing";

type S = Schemas;
export type Order = S["V1Order"];
export type Snapshot = S["Snapshot"];
export type Draft = S["V1Draft"];
export type Finding = S["V1Finding"];

export const HAZRATGANJ = OUTLETS[0]!.outlet_id;
export const GOMTI_NAGAR = OUTLETS[1]!.outlet_id;

// ---------------------------------------------------------------- who
export const MEMBERS = DEMO_PEOPLE.map((p) => ({
  token: p.token,
  me: {
    member_id: id7(`member:${p.key}`),
    tenant_id: DEMO_TENANT_ID,
    name: p.name,
    role: p.role,
    outlet_ids: p.role === "owner" ? ("*" as const) : [HAZRATGANJ],
  } satisfies S["V1Me"],
}));
export const OWNER_ID = MEMBERS[0]!.me.member_id;

export const TENANT: S["V1Tenant"] = {
  tenant_id: DEMO_TENANT_ID, name: "Cobnut Bakehouse (synthetic)", country_code: "IN", base_currency: CURRENCY, fy_start_month: 4,
  status: "active", is_demo: true, onboarded_at: "2026-09-01T04:30:00Z", home_tz: TZ,
};

export const MEMBER_OUTLETS: S["V1Outlets"] = {
  outlets: OUTLETS.map((o) => ({
    id: o.outlet_id, name: o.name, kind: "restaurant" as const, tz: TZ, address: o.address,
    tax_ids: Object.fromEntries(o.tax_ids.map((t) => [t.code, t.value])),
    accepting_orders: o.state, busy_extra_min: o.busy_extra_min, default_prep_min: PREP_MIN, cancel_window_min: 1, reschedule_window_min: 1,
    pickup_slot_min: 15, pickup_lead_min: 0, upi_vpa: null, business_day_cutoff: "04:00:00", phone: o.phone,
  })),
};

export const COUNTER_CHANNEL_ID = id7("channel:counter");
export const CHANNELS: S["V1Channels"] = {
  channels: [
    { id: COUNTER_CHANNEL_ID, name: "Counter", kind: "counter", active: true },
    { id: CHANNEL_ID, name: "Website (pickup)", kind: "own_site", active: true },
  ],
};
export const posDevice = (outletId: string) => id7(`device:pos:${outletId}`);
export const DEVICES: S["V1Devices"] = {
  devices: OUTLETS.flatMap((o, i) => [
    { id: posDevice(o.outlet_id), outlet_id: o.outlet_id, kind: "pos" as const, invoice_series: i === 0 ? "HZG" : "GMT", last_seen_at: null },
    { id: id7(`device:kds:${o.outlet_id}`), outlet_id: o.outlet_id, kind: "kds" as const, invoice_series: null, last_seen_at: null },
  ]),
};

// ---------------------------------------------------------------- the day
/** The outlet's calendar date at `at` (India has no daylight saving: a fixed offset is exact). */
export const businessDate = (at: Date) => new Date(at.getTime() + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const mins = (now: Date, m: number) => new Date(now.getTime() + m * 60_000).toISOString();

/** Kitchen station of an item: drinks at the bar, everything else in the kitchen. */
export const stationOf = (slug: string) => (ITEMS.find((i) => i.slug === slug)?.category === "drinks" ? "bar" : "kitchen");

// ---------------------------------------------------------------- the counter menu
export function menuFor(outletId: string, channelKind: string, now: Date): S["V1CatalogueMenu"] {
  const outlet = OUTLETS.find((o) => o.outlet_id === outletId)!;
  const entries: S["V1CatalogueMenu"]["entries"] = [];
  for (const i of ITEMS) {
    const variants = i.variants.length > 0 ? i.variants : [null];
    for (const v of variants) {
      entries.push({
        item_id: itemId(i.slug), variant_id: v ? variantId(i.slug, v.slug) : null, kind: i.kind, name_key: `item.${i.slug}`,
        variant_name_key: v ? `variant.${v.slug}` : null, category: i.category, brand_id: null, display_name: i.name, description: i.description,
        diet: i.diet, variant_display_name: v ? v.name : null, variant_description: null, barcode: null,
        price_id: id7(`price:${i.slug}:${v?.slug ?? "-"}:${outletId}:${channelKind}`), price_minor: (v ? v.price : i.price)!, currency: CURRENCY,
        tax_class: TAX_CLASS, mrp_minor: null, available: !(i.soldOut || outlet.soldOut.includes(i.slug)),
        option_groups: i.groups.map((g) => ({
          option_group_id: groupId(i.slug, g.slug), name_key: `group.${g.slug}`, min_select: g.min, max_select: g.max, required: g.min > 0,
          display_name: g.name, description: g.description,
          options: g.options.map((o) => ({ option_id: optionId(i.slug, g.slug, o.slug), name_key: `option.${o.slug}`, price_delta_minor: o.delta, currency: CURRENCY, display_name: o.name, description: null })),
        })),
        deals: DEALS.filter((d) => d.items.includes(i.slug)).map((d) => ({ deal_id: d.deal_id, name_key: d.name_key, kind: d.kind, windows: d.windows })),
      });
    }
  }
  return { outlet_id: outletId, channel_kind: channelKind, business_date: businessDate(now), entries };
}

export const INGREDIENTS: S["V1InventoryIngredients"] = {
  items: [
    { ingredient_id: id7("ing:butter"), name: "Butter (synthetic)", base_unit: "g", shelf_life_days: 20, tracked_by_batch: true, active: true },
    { ingredient_id: id7("ing:hazelnuts"), name: "Roasted hazelnuts (synthetic)", base_unit: "g", shelf_life_days: 90, tracked_by_batch: true, active: true },
    { ingredient_id: id7("ing:flour"), name: "Bread flour (synthetic)", base_unit: "g", shelf_life_days: 180, tracked_by_batch: false, active: true },
    { ingredient_id: id7("ing:cream"), name: "Fresh cream (synthetic)", base_unit: "ml", shelf_life_days: 5, tracked_by_batch: true, active: true },
    { ingredient_id: id7("ing:sourdough"), name: "Sliced sourdough loaf (synthetic)", base_unit: "piece", shelf_life_days: 3, tracked_by_batch: true, active: true },
  ],
  next_cursor: null,
};
export const ING = (slug: string) => id7(`ing:${slug}`);

// ---------------------------------------------------------------- orders and tickets
export interface LineInput {
  slug: string;
  variant?: string;
  options?: [group: string, option: string][];
  qty?: number;
  note?: string | null;
}
export interface OrderInput {
  outletId: string;
  ticketNo: number;
  channelId?: string;
  kind?: "takeaway" | "dine_in" | "pickup";
  status: Order["status"];
  createdMin: number; // minutes from now (negative = earlier today)
  promisedMin?: number | null;
  paid?: "card" | "cash" | "upi" | null;
  lines: LineInput[];
}
export interface TicketRow {
  ticket_id: string;
  order_id: string;
  outlet_id: string;
  station: string;
  status: "queued" | "preparing" | "ready" | "done";
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  due_at: string | null;
  line_nos: number[];
}
export interface Placed {
  order: Order;
  /** line_id -> note (the order read model has no notes; the kitchen ticket does). */
  notes: Record<string, string | null>;
  tickets: TicketRow[];
}

const TICKET_OF: Record<Order["status"], TicketRow["status"]> = { placed: "queued", accepted: "queued", preparing: "preparing", ready: "ready", completed: "done", rejected: "done", cancelled: "done" };

/** A line as the API takes it (orders.place.v1 lines[]). */
export interface ApiLine {
  line_id: string;
  item_id: string;
  variant_id: string | null;
  option_ids: string[];
  qty_milli: number;
  note: string | null;
}
export interface OrderSpec {
  orderId: string;
  outletId: string;
  ticketNo: number;
  channelId: string;
  deviceId: string | null;
  invoiceNo: number | null;
  kind: Order["kind"];
  tableRef: string | null;
  status: Order["status"];
  createdAt: string;
  promisedAt: string | null;
  lines: ApiLine[];
}

/** Kitchen station of an item id. */
const stationOfId = (itemIdValue: string) => stationOf(ITEMS.find((i) => itemId(i.slug) === itemIdValue)?.slug ?? "");

/** Prices the lines with the mock's pricing (the only place money is added up) and builds the order, its notes and
 *  one kitchen ticket per station. Used for the seeded day, the till's orders and "Simulate a web order". Throws
 *  BadRequest (pricing.ts) for a variant or option the item does not have. */
export function buildOrder(spec: OrderSpec, now: Date): { placed: Placed; refusal: string | null; totalMinor: number } {
  const outlet = OUTLETS.find((o) => o.outlet_id === spec.outletId)!;
  const req = spec.lines.map((l) => ({ item_id: l.item_id, variant_id: l.variant_id, option_ids: l.option_ids, qty_milli: l.qty_milli, barcode: null }));
  const { preview } = price({ outlet_id: spec.outletId, channel_id: CHANNEL_ID, brand_id: null, kind: "pickup", pickup_window_id: null, promised_at: null, coupon_codes: [], loyalty_redeem_points: 0, lines: req }, outlet, "open", now);
  const lines = preview.lines.map((l, i) => ({
    line_id: spec.lines[i]!.line_id, line_no: l.line_no, item_id: l.item_id, variant_id: l.variant_id, option_ids: spec.lines[i]!.option_ids, qty_milli: l.qty_milli,
    unit_price_minor: l.unit_price_minor + l.options_minor, line_discount_minor: l.line_discount_minor, tax_minor: l.tax_minor,
  }));
  const order: Order = {
    order_id: spec.orderId, outlet_id: spec.outletId, channel_id: spec.channelId, device_id: spec.deviceId,
    kind: spec.kind, table_ref: spec.tableRef, status: spec.status, business_date: businessDate(new Date(spec.createdAt)), ticket_no: spec.ticketNo,
    invoice_fy: spec.invoiceNo ? 2026 : null, invoice_no: spec.invoiceNo, promised_at: spec.promisedAt, pickup_window_id: null,
    subtotal_minor: preview.subtotal_minor, discount_minor: preview.discount_minor, tax_minor: preview.tax_minor, total_minor: preview.total_minor,
    loyalty_minor: 0, paid_minor: 0, remaining_minor: preview.total_minor, currency: CURRENCY, lines, tenders: [], created_at: spec.createdAt,
  };
  const notes = Object.fromEntries(spec.lines.map((l) => [l.line_id, l.note]));
  const status = TICKET_OF[spec.status];
  const created = Date.parse(spec.createdAt);
  const due = spec.promisedAt ?? new Date(created + PREP_MIN * 60_000).toISOString();
  const tickets = [...new Set(spec.lines.map((l) => stationOfId(l.item_id)))].map((station) => ({
    ticket_id: id7(`ticket:${spec.orderId}:${station}`), order_id: spec.orderId, outlet_id: spec.outletId, station, status, created_at: spec.createdAt,
    accepted_at: status === "queued" ? null : new Date(created + 120_000).toISOString(), ready_at: status === "ready" || status === "done" ? new Date(created + 720_000).toISOString() : null,
    due_at: due, line_nos: lines.filter((_, i) => stationOfId(spec.lines[i]!.item_id) === station).map((l) => l.line_no),
  }));
  return { placed: { order, notes, tickets }, refusal: preview.refusals[0]?.reason_code ?? null, totalMinor: preview.total_minor };
}

/** A seed line by slugs: the API line it stands for. */
export function apiLine(l: LineInput, lineId: string): ApiLine {
  return {
    line_id: lineId, item_id: itemId(l.slug), variant_id: l.variant ? variantId(l.slug, l.variant) : null,
    option_ids: (l.options ?? []).map(([g, o]) => optionId(l.slug, g, o)), qty_milli: (l.qty ?? 1) * 1000, note: l.note ?? null,
  };
}

/** Today at both outlets: three picked-up orders, one ready, two being made (one of them late), two new (one due
 *  in two minutes), a cake for tonight with a piped message, and a scheduled pickup for later. */
export const SEED_ORDERS: OrderInput[] = [
  { outletId: HAZRATGANJ, ticketNo: 1, status: "completed", createdMin: -190, paid: "card", lines: [{ slug: "hazelnut_croissant", qty: 2 }, { slug: "hazelnut_hot_chocolate", variant: "regular" }] },
  { outletId: HAZRATGANJ, ticketNo: 2, status: "completed", createdMin: -150, paid: "cash", lines: [{ slug: "pain_au_chocolat" }, { slug: "cold_coffee", options: [["milk", "oat"]] }] },
  { outletId: HAZRATGANJ, ticketNo: 3, status: "ready", createdMin: -25, paid: "upi", lines: [{ slug: "brown_butter_cookie", qty: 3 }] },
  { outletId: HAZRATGANJ, ticketNo: 4, status: "preparing", createdMin: -24, promisedMin: -4, lines: [{ slug: "gianduja_mousse", qty: 2 }] },
  {
    outletId: HAZRATGANJ, ticketNo: 5, kind: "pickup", status: "preparing", createdMin: -40, promisedMin: 35,
    lines: [{ slug: "praline_celebration_cake", variant: "one_kg", options: [["sponge", "eggless"]], note: "Happy 60th, Nani! — with love, Zoya" }],
  },
  { outletId: HAZRATGANJ, ticketNo: 6, status: "placed", createdMin: -10, promisedMin: 2, lines: [{ slug: "cardamom_knot", qty: 2 }, { slug: "cold_coffee", options: [["milk", "dairy"]] }] },
  { outletId: HAZRATGANJ, ticketNo: 7, kind: "pickup", status: "placed", createdMin: -5, promisedMin: 180, lines: [{ slug: "truffle_tin" }] },
  { outletId: GOMTI_NAGAR, ticketNo: 1, status: "completed", createdMin: -120, paid: "card", lines: [{ slug: "oat_jaggery_cookie", qty: 4 }] },
  {
    outletId: GOMTI_NAGAR, ticketNo: 2, kind: "pickup", status: "preparing", createdMin: -15, promisedMin: 20,
    lines: [{ slug: "build_a_box", variant: "box_9", options: [["flavours", "hazelnut_praline"], ["flavours", "salted_caramel"], ["flavours", "kesar_badam"], ["gift_wrap", "ribbon_card"]], note: "For Mr Rastogi — thank you for everything" }],
  },
  { outletId: GOMTI_NAGAR, ticketNo: 3, status: "placed", createdMin: -3, promisedMin: 12, lines: [{ slug: "hazelnut_hot_chocolate", variant: "large", qty: 2 }] },
];

export function seedOrders(now: Date): Placed[] {
  return SEED_ORDERS.map((o, n) => {
    const orderId = id7(`order:seed:${n}`);
    const { placed } = buildOrder({
      orderId, outletId: o.outletId, ticketNo: o.ticketNo, channelId: o.channelId ?? COUNTER_CHANNEL_ID, deviceId: posDevice(o.outletId), invoiceNo: 40 + n,
      kind: o.kind ?? "takeaway", tableRef: null, status: o.status, createdAt: mins(now, o.createdMin),
      promisedAt: o.promisedMin === undefined || o.promisedMin === null ? null : mins(now, o.promisedMin), lines: o.lines.map((l, i) => apiLine(l, id7(`line:seed:${n}:${i}`))),
    }, now);
    if (o.paid) {
      const order = placed.order;
      const t = o.paid === "cash"
        ? { method: "cash" as const, amount_minor: order.total_minor, tendered_minor: order.total_minor, change_minor: 0, rounding_minor: 0, ref: null }
        : { method: o.paid, amount_minor: order.total_minor, tendered_minor: null, change_minor: null, rounding_minor: null, ref: "SLIP-SYN" };
      order.tenders.push({ tender_id: id7(`tender:${orderId}`), order_id: orderId, currency: CURRENCY, recorded_by: MEMBERS[1]!.me.member_id, at: mins(now, o.createdMin + 1), ...t });
      order.paid_minor = order.total_minor;
      order.remaining_minor = 0;
    }
    return placed;
  });
}

/** The list row of an order (GET /v1/orders items). */
export const orderListItem = (o: Order): S["V1OrdersList"]["items"][number] => ({
  order_id: o.order_id, outlet_id: o.outlet_id, channel_id: o.channel_id, device_id: o.device_id, kind: o.kind, table_ref: o.table_ref, status: o.status,
  business_date: o.business_date, ticket_no: o.ticket_no, subtotal_minor: o.subtotal_minor, discount_minor: o.discount_minor, tax_minor: o.tax_minor,
  total_minor: o.total_minor, currency: o.currency, promised_at: o.promised_at, created_at: o.created_at,
});

/** GET /v1/orders/{id}/receipt as the IN pack prints it: a GST tax invoice, every line split into its CGST and SGST.
 *  An outlet without both its GSTIN and FSSAI numbers cannot print one: core answers 409 tax_id_missing (Gomti
 *  Nagar here). Money is added up only here, in the mock, from the order's own line fields. */
export function receiptOf(o: Order): S["V1OrderReceipt"] | null {
  const outlet = OUTLETS.find((x) => x.outlet_id === o.outlet_id)!;
  if (!["GSTIN", "FSSAI"].every((c) => outlet.tax_ids.some((t) => t.code === c))) return null;
  const split = (taxable: number) => TAX.components.map((c) => ({ code: c.code, rate_bp: c.rateBp, amount_minor: Math.round((taxable * c.rateBp) / 10_000) }));
  const lines = o.lines.map((l) => {
    const amount = Math.round((l.qty_milli * l.unit_price_minor) / 1000);
    const net = amount - l.line_discount_minor;
    const slug = ITEMS.find((i) => itemId(i.slug) === l.item_id)!.slug;
    return {
      line_no: l.line_no, item_id: l.item_id, name_key: `item.${slug}`, qty_milli: l.qty_milli, unit_price_minor: l.unit_price_minor, amount_minor: amount,
      discount_minor: l.line_discount_minor, net_minor: net, tax_minor: l.tax_minor, total_minor: net + l.tax_minor, tax_class: TAX_CLASS, components: split(net),
    };
  });
  const series = DEVICES.devices.find((d) => d.id === o.device_id)?.invoice_series;
  const [y, m, d] = businessDate(new Date(o.created_at)).split("-");
  return {
    order_id: o.order_id, kind: "tax_invoice", title: "Tax Invoice", operator: null, seller: { name: outlet.name, address: outlet.address }, tax_ids: outlet.tax_ids,
    number: series && o.invoice_no !== null ? `${series}-${o.invoice_no}` : String(o.ticket_no), date: `${d}/${m}/${y}`, currency: o.currency, lines,
    net_minor: lines.reduce((s, l) => s + l.net_minor, 0), tax_minor: o.tax_minor, total_minor: o.total_minor,
    components: TAX.components.map((c) => ({ code: c.code, rate_bp: c.rateBp, amount_minor: lines.reduce((s, l) => s + l.components.find((x) => x.code === c.code)!.amount_minor, 0) })),
  };
}

/** The board as core builds it: live tickets (not done; order not completed, rejected or cancelled), amber from
 *  due − 3 min, red at or after due (queued and preparing only), lane "later" while promised − prep is ahead. */
export function boardOf(outletId: string, station: string | null, orders: Map<string, Placed>, now: Date): S["V1KdsBoard"] {
  const tickets: S["V1KdsBoard"]["tickets"] = [];
  // As core: the stations of the outlet's live tickets (before the station filter), sorted.
  const stations = new Set<string>();
  for (const p of orders.values()) {
    if (p.order.outlet_id !== outletId || ["completed", "rejected", "cancelled"].includes(p.order.status)) continue;
    for (const t of p.tickets) {
      if (t.status === "done") continue;
      stations.add(t.station);
      if (station && t.station !== station) continue;
      const due = t.due_at ? Date.parse(t.due_at) : null;
      const coloured = t.status === "queued" || t.status === "preparing";
      const colour = !coloured || due === null ? "normal" : now.getTime() >= due ? "red" : now.getTime() >= due - 180_000 ? "amber" : "normal";
      const surface = p.order.promised_at ? new Date(Date.parse(p.order.promised_at) - PREP_MIN * 60_000) : null;
      tickets.push({
        ticket_id: t.ticket_id, order_id: t.order_id, ticket_no: p.order.ticket_no, business_date: p.order.business_date, station: t.station,
        status: t.status, kind: p.order.kind, table_ref: p.order.table_ref, channel_kind: p.order.channel_id === COUNTER_CHANNEL_ID ? "counter" : "own_site",
        started_at: t.accepted_at ?? t.created_at, accepted_at: t.accepted_at, ready_at: t.ready_at, due_at: t.due_at, promised_at: p.order.promised_at,
        lane: surface && surface.getTime() > now.getTime() ? "later" : "now", surface_at: surface ? surface.toISOString() : null, colour,
        lines: p.order.lines.filter((l) => t.line_nos.includes(l.line_no)).map((l) => {
          const item = ITEMS.find((i) => itemId(i.slug) === l.item_id)!;
          const options = item.groups.flatMap((g) => g.options.filter((o) => l.option_ids.includes(optionId(item.slug, g.slug, o.slug))).map((o) => ({ option_id: optionId(item.slug, g.slug, o.slug), name_key: `option.${o.slug}` })));
          return { line_no: l.line_no, item_id: l.item_id, name_key: `item.${item.slug}`, qty_milli: l.qty_milli, options, note: p.notes[l.line_id] ?? null };
        }),
      });
    }
  }
  const rank = { red: 0, amber: 1, normal: 2 } as const;
  tickets.sort((a, b) => rank[a.colour] - rank[b.colour] || (a.due_at ?? "").localeCompare(b.due_at ?? "") || a.ticket_no - b.ticket_no);
  return { outlet_id: outletId, as_of: now.toISOString(), stations: [...stations].sort(), tickets };
}

// ---------------------------------------------------------------- snapshots (the only source of AI numbers)
export const RUN = { waste: id7("run:waste"), kitchen: id7("run:kitchen"), negotiation: id7("run:negotiation"), ask: id7("run:ask") };
const sha = (rows: unknown) => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const col = (name: string, type: "integer" | "text" | "uuid" | "date" | "boolean" | "timestamptz" = "integer") => ({ name, type });

export function snapshotOf(id: string, template_id: string, params: Snapshot["params"], columns: ReturnType<typeof col>[], rows: Snapshot["rows"], who: { run?: string; member?: string }, scope: Snapshot["outlet_scope"], at: string): Snapshot {
  return {
    snapshot_id: id, template_id, params, run_id: who.run ?? null, minted_by_member_id: who.member ?? null, minted_by_operator_id: null,
    outlet_scope: scope, columns, rows, row_count: rows.length, sha256: sha(rows), created_at: at,
  };
}

/** Columns of the real templates the mock serves (same names and order as core's). */
export const TEMPLATE_COLUMNS: Record<string, ReturnType<typeof col>[]> = {
  "inventory.waste_week": [col("ingredient_id", "uuid"), col("waste_minor"), col("median_minor"), col("excess_minor")],
  "kitchen.ticket_times": [col("station", "text"), col("item_id", "uuid"), col("slot_start", "text"), col("tickets"), col("p50_sec"), col("p80_sec"), col("late_tickets"), col("configured_prep_sec")],
  "kitchen.prep_need": [col("ingredient_id", "uuid"), col("forecast_qty_milli"), col("on_hand_qty_milli"), col("par_qty_milli"), col("prep_qty_milli")],
  "kitchen.ticket_coverage": [col("tickets"), col("timed_tickets"), col("coverage_bp")],
  "people.labour_pct": [col("iso_week", "text"), col("labour_minor"), col("net_sales_minor"), col("labour_bp"), col("target_bp"), col("excess_labour_minor")],
  "cares.impact": [col("kind", "text"), col("handovers"), col("portions_milli"), col("weight_g"), col("volume_ml"), col("units_milli"), col("value_at_cost_minor")],
  "inventory.below_reorder": [col("outlet_id", "uuid"), col("ingredient_id", "uuid"), col("ingredient_name", "text"), col("on_hand_milli"), col("min_qty_milli"), col("par_qty_milli")],
  "purchasing.quote_compare": [col("quote_id", "uuid"), col("supplier_id", "uuid"), col("round"), col("unit_price_minor"), col("qty_milli"), col("min_order_qty_milli"), col("payment_days")],
  "inventory.expiry_risk": [col("batch_id", "uuid"), col("expiry_on", "date"), col("days_to_expiry"), col("is_sku", "boolean"), col("remaining_qty_milli"), col("use_before_expiry_qty_milli"), col("at_risk_qty_milli"), col("at_risk_minor"), col("ingredient_id", "uuid"), col("unit", "text"), col("supplier_id", "uuid")],
  "cares.recipient_match": [col("recipient_id", "uuid"), col("name", "text"), col("simulated", "boolean"), col("distance_m"), col("capacity_fit", "boolean"), col("overlap_min"), col("pickup_from", "timestamptz"), col("pickup_to", "timestamptz"), col("pickup_on", "date")],
  // The negotiation's other inputs, which its purchase-order draft also cites (run-minted only on the mock).
  "inventory.shortfall": [col("ingredient_id", "uuid"), col("need_qty_milli"), col("proposed_min_qty_milli"), col("proposed_par_qty_milli"), col("on_hand_qty_milli"), col("open_po_qty_milli"), col("shortfall_qty_milli"), col("stockout_on", "date")],
  "purchasing.price_creep": [col("supplier_id", "uuid"), col("ingredient_id", "uuid"), col("baseline_minor"), col("latest_minor"), col("creep_bp"), col("observations"), col("creep_impact_minor")],
  "purchasing.deal_inputs": [col("quote_total_minor"), col("quote_payment_days"), col("budget_left_minor"), col("open_commit_qty_milli"), col("need_qty_milli"), col("use_in_shelf_life_qty_milli"), col("margin_at_quote_bp"), col("margin_floor_bp"), col("min_payment_days"), col("margin_rule_applies", "boolean")],
};
/** Who may mint each template (core's min_role: staff < manager < advisor < owner/judge). */
export const TEMPLATE_MIN_ROLE: Record<string, "staff" | "manager" | "advisor" | "owner"> = Object.fromEntries(Object.keys(TEMPLATE_COLUMNS).map((t) => [t, "manager"]));

export const SUPPLIER = { dairy: id7("supplier:dairy"), nuts: id7("supplier:nuts") };
export const QUOTE = { nutsR1: id7("quote:nuts:1"), nutsR2: id7("quote:nuts:2"), dairyR1: id7("quote:dairy:1") };

/** The run-minted snapshots behind the seeded findings, drafts and Ask answer. */
export function seedSnapshots(now: Date): Snapshot[] {
  const today = businessDate(now);
  const weekStart = addDays(today, -6);
  const at = mins(now, -60);
  const H = [HAZRATGANJ];
  return [
    snapshotOf(id7("snap:waste"), "inventory.waste_week", { outlet_id: HAZRATGANJ, week_start: weekStart }, TEMPLATE_COLUMNS["inventory.waste_week"]!, [
      { ingredient_id: ING("butter"), waste_minor: 486000, median_minor: 152000, excess_minor: 334000 },
      { ingredient_id: ING("cream"), waste_minor: 61000, median_minor: 58000, excess_minor: 3000 },
    ], { run: RUN.waste }, H, at),
    snapshotOf(id7("snap:times"), "kitchen.ticket_times", { outlet_id: HAZRATGANJ, from: weekStart, to: today }, TEMPLATE_COLUMNS["kitchen.ticket_times"]!, [
      { station: "kitchen", item_id: itemId("praline_celebration_cake"), slot_start: "16:00", tickets: 14, p50_sec: 1680, p80_sec: 2460, late_tickets: 5, configured_prep_sec: 1800 },
      { station: "kitchen", item_id: itemId("hazelnut_croissant"), slot_start: "08:00", tickets: 96, p50_sec: 240, p80_sec: 330, late_tickets: 2, configured_prep_sec: 300 },
    ], { run: RUN.kitchen }, H, at),
    snapshotOf(id7("snap:prep"), "kitchen.prep_need", { outlet_id: HAZRATGANJ, business_date: addDays(today, 1) }, TEMPLATE_COLUMNS["kitchen.prep_need"]!, [
      { ingredient_id: ING("butter"), forecast_qty_milli: 7_400_000, on_hand_qty_milli: 2_100_000, par_qty_milli: 6_000_000, prep_qty_milli: 5_300_000 },
      { ingredient_id: ING("hazelnuts"), forecast_qty_milli: 3_900_000, on_hand_qty_milli: 3_200_000, par_qty_milli: 4_000_000, prep_qty_milli: 700_000 },
    ], { run: RUN.kitchen }, H, at),
    // Rows in core's order for this template: round, then supplier id.
    snapshotOf(id7("snap:quotes"), "purchasing.quote_compare", { negotiation_run_id: RUN.negotiation }, TEMPLATE_COLUMNS["purchasing.quote_compare"]!, [
      { quote_id: QUOTE.nutsR1, supplier_id: SUPPLIER.nuts, round: 1, unit_price_minor: 152000, qty_milli: 9000, min_order_qty_milli: 5000, payment_days: 7 },
      { quote_id: QUOTE.dairyR1, supplier_id: SUPPLIER.dairy, round: 1, unit_price_minor: 158000, qty_milli: 9000, min_order_qty_milli: 10000, payment_days: 0 },
      { quote_id: QUOTE.nutsR2, supplier_id: SUPPLIER.nuts, round: 2, unit_price_minor: 141000, qty_milli: 9000, min_order_qty_milli: 5000, payment_days: 15 },
    ], { run: RUN.negotiation }, ["*"], at),
    snapshotOf(id7("snap:below"), "inventory.below_reorder", {}, TEMPLATE_COLUMNS["inventory.below_reorder"]!, [
      { outlet_id: HAZRATGANJ, ingredient_id: ING("hazelnuts"), ingredient_name: "Roasted hazelnuts (synthetic)", on_hand_milli: 3_200_000, min_qty_milli: 5_000_000, par_qty_milli: 12_000_000 },
    ], { run: RUN.negotiation }, ["*"], at),
    ...caresSnapshots(now),
    // What the negotiation started from and was checked against: the shortfall it asked to fill, the last price its
    // bounds came from, and the deal inputs of the winning quote (budget left).
    snapshotOf(id7("snap:shortfall"), "inventory.shortfall", { outlet_id: HAZRATGANJ, lead_days: 7 }, TEMPLATE_COLUMNS["inventory.shortfall"]!, [
      { ingredient_id: ING("hazelnuts"), need_qty_milli: 3_900_000, proposed_min_qty_milli: 5_000_000, proposed_par_qty_milli: 12_000_000, on_hand_qty_milli: 3_200_000, open_po_qty_milli: 0, shortfall_qty_milli: 8_800_000, stockout_on: addDays(today, 5) },
    ], { run: RUN.negotiation }, ["*"], at),
    snapshotOf(id7("snap:lastprice"), "purchasing.price_creep", { as_of: today }, TEMPLATE_COLUMNS["purchasing.price_creep"]!, [
      { supplier_id: SUPPLIER.nuts, ingredient_id: ING("hazelnuts"), baseline_minor: 145_000, latest_minor: 148_000, creep_bp: 207, observations: 1, creep_impact_minor: 0 },
    ], { run: RUN.negotiation }, ["*"], at),
    snapshotOf(id7("snap:deal"), "purchasing.deal_inputs", { quote_id: QUOTE.nutsR2, as_of: today }, TEMPLATE_COLUMNS["purchasing.deal_inputs"]!, [
      { quote_total_minor: 1_269_000, quote_payment_days: 15, budget_left_minor: 2_500_000, open_commit_qty_milli: 0, need_qty_milli: 3_900_000, use_in_shelf_life_qty_milli: 9_000_000, margin_at_quote_bp: 6_200, margin_floor_bp: 5_500, min_payment_days: 7, margin_rule_applies: true },
    ], { run: RUN.negotiation }, ["*"], at),
  ];
}

/** "2026-10-14" -> "2026-W42": the ISO week holding that date (the week of its Thursday). */
function isoWeek(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86_400_000);
  const week = Math.floor((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / (7 * 86_400_000)) + 1;
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Rows for a template a member mints on the mock (owner home's stat cards), from the mock's own books. */
export function mintRows(template: string, params: Snapshot["params"], orders: Map<string, Placed>, listings: S["V1CaresListing"][], now: Date): Snapshot["rows"] | null {
  const outlet = typeof params.outlet_id === "string" ? params.outlet_id : null;
  switch (template) {
    case "kitchen.ticket_coverage": {
      const from = String(params.from), to = String(params.to);
      const ts = [...orders.values()].filter((p) => (!outlet || p.order.outlet_id === outlet) && p.order.business_date >= from && p.order.business_date <= to).flatMap((p) => p.tickets);
      const timed = ts.filter((t) => t.accepted_at && t.ready_at).length;
      return [{ tickets: ts.length, timed_tickets: timed, coverage_bp: ts.length ? Math.floor((timed * 10000) / ts.length) : null }];
    }
    case "people.labour_pct":
      return [{ iso_week: isoWeek(businessDate(now)), labour_minor: 4_180_000, net_sales_minor: outlet === GOMTI_NAGAR ? 7_930_000 : outlet ? 12_450_000 : 20_380_000, labour_bp: 2051, target_bp: 2200, excess_labour_minor: 0 }];
    case "inventory.waste_week":
      return seedSnapshots(now)[0]!.rows;
    case "inventory.below_reorder":
      return seedSnapshots(now)[4]!.rows;
    case "purchasing.quote_compare":
      return params.negotiation_run_id === RUN.negotiation ? seedSnapshots(now)[3]!.rows : [];
    case "cares.impact": {
      const recorded = listings.filter((l) => (!outlet || l.outlet_id === outlet) && l.handovers.some((h) => h.status === "recorded"));
      const row = (kind: string, ls: typeof recorded) => {
        const hs = ls.flatMap((l) => l.handovers.filter((h) => h.status === "recorded").map((h) => ({ l, h })));
        const qty = (unit: (u: string) => boolean) => hs.reduce((s, { l, h }) => s + h.lines.reduce((t, x) => t + (unit(l.lines.find((y) => y.line_id === x.listing_line_id)!.unit) ? x.qty_milli : 0), 0), 0);
        return { kind, handovers: hs.length, portions_milli: qty((u) => u === "portion"), weight_g: 0, volume_ml: 0, units_milli: qty((u) => u !== "portion"), value_at_cost_minor: hs.length * 61_500 };
      };
      return [row("total", recorded), row("donation", recorded.filter((l) => l.kind === "donation")), row("offer", recorded.filter((l) => l.kind === "offer"))];
    }
    case "inventory.expiry_risk":
      return params.outlet_id === HAZRATGANJ ? caresSnapshots(now)[0]!.rows : [];
    case "cares.recipient_match":
      return matchRowsFor(params, now);
    default:
      return null;
  }
}

// ---------------------------------------------------------------- the AI inbox
export const snap = (key: string, row: number, column: string) => `⟨snap:${id7(`snap:${key}`)}·${row}·${column}⟩`;
const bare = (key: string) => `snap:${id7(`snap:${key}`)}`;

/** Findings: what the specialists noticed. Text never holds a digit; every number is a ref. */
export function seedFindings(now: Date): Finding[] {
  const at = mins(now, -55);
  const value = (key: string, row: number, c: string) => ({ ref: snap(key, row, c), value: seedSnapshots(now).find((s) => s.snapshot_id === id7(`snap:${key}`))!.rows[row]![c]! });
  return [
    {
      finding_id: id7("finding:butter"), run_id: RUN.waste, pack: "inventory_purchasing", type: "inventory.waste_spike", severity: "medium", status: "open",
      confidence_bp: 8200, dedupe_key: `inventory.waste_spike:${HAZRATGANJ}:butter`,
      envelope: {
        finding_id: id7("finding:butter"), impact_ref: snap("waste", 0, "excess_minor"), abstained: false, reason_code: null,
        segments: [
          { text: `Butter written off at Cobnut Hazratganj this week came to ${snap("waste", 0, "waste_minor")}, against a usual week of ${snap("waste", 0, "median_minor")}.`, refs: [bare("waste")] },
          { text: `That is ${snap("waste", 0, "excess_minor")} more than usual.`, refs: [bare("waste")] },
        ],
      },
      resolved_refs: [value("waste", 0, "waste_minor"), value("waste", 0, "median_minor"), value("waste", 0, "excess_minor")],
      created_at: at, updated_at: at,
    },
    {
      finding_id: id7("finding:cake"), run_id: RUN.kitchen, pack: "kitchen", type: "kitchen.ticket_drift", severity: "low", status: "open",
      confidence_bp: 7400, dedupe_key: `kitchen.ticket_drift:${HAZRATGANJ}:cake`,
      envelope: {
        finding_id: id7("finding:cake"), impact_ref: snap("times", 0, "late_tickets"), abstained: false, reason_code: null,
        segments: [
          { text: `Hazelnut Praline Cake tickets ran late ${snap("times", 0, "late_tickets")} times this week. The slowest fifth took longer than ${snap("times", 0, "p80_sec")}; the set prep time is ${snap("times", 0, "configured_prep_sec")}.`, refs: [bare("times")] },
        ],
      },
      resolved_refs: [value("times", 0, "late_tickets"), value("times", 0, "p80_sec"), value("times", 0, "configured_prep_sec")],
      created_at: at, updated_at: at,
    },
    expiryFinding(now),
  ];
}

/** Drafts: what the specialists propose. Each changes nothing until a named person approves it. Which refs trace is
 *  worked out per viewer when a draft is served (staff.ts), as core does. */
export function seedDrafts(now: Date): Draft[] {
  const today = businessDate(now);
  const at = mins(now, -50);
  const cell = (key: string, row: number, c: string) => seedSnapshots(now).find((s) => s.snapshot_id === id7(`snap:${key}`))!.rows[row]![c]!;
  const based = (key: string, row: number, c: string, template: string) => ({ ref: snap(key, row, c), template_id: template, params: seedSnapshots(now).find((s) => s.snapshot_id === id7(`snap:${key}`))!.params, expected: cell(key, row, c) });
  const common = (id: string, run: string, finding: string | null, outlets: string[]) => ({
    draft_id: id, outlet_ids: outlets, source: "", finding_id: finding, run_id: run, status: "proposed" as const, created_at: at, updated_at: at,
  });
  return [
    {
      ...common(id7("draft:prep_time"), RUN.kitchen, id7("finding:cake"), [HAZRATGANJ]), source: "intel:kitchen",
      command_type: "kitchen.prep_time.set.v1",
      payload: { outlet_id: HAZRATGANJ, item_id: itemId("praline_celebration_cake"), station: "kitchen", prep_sec: snap("times", 0, "p80_sec"), valid_from: addDays(today, 1) },
      resolved_refs: [{ path: "/prep_sec", ref: snap("times", 0, "p80_sec"), value: cell("times", 0, "p80_sec") }],
      evidence: [bare("times")], based_on: [based("times", 0, "p80_sec", "kitchen.ticket_times")],
    },
    {
      ...common(id7("draft:prep_list"), RUN.kitchen, null, [HAZRATGANJ]), source: "intel:kitchen",
      command_type: "kitchen.prep_list.create.v1",
      payload: {
        prep_list_id: id7("prep_list:tomorrow"), outlet_id: HAZRATGANJ, business_date: addDays(today, 1),
        lines: [
          { ingredient_id: ING("butter"), qty_milli: snap("prep", 0, "prep_qty_milli"), unit: "g" },
          { ingredient_id: ING("hazelnuts"), qty_milli: snap("prep", 1, "prep_qty_milli"), unit: "g" },
        ],
      },
      resolved_refs: [
        { path: "/lines/0/qty_milli", ref: snap("prep", 0, "prep_qty_milli"), value: cell("prep", 0, "prep_qty_milli") },
        { path: "/lines/1/qty_milli", ref: snap("prep", 1, "prep_qty_milli"), value: cell("prep", 1, "prep_qty_milli") },
      ],
      evidence: [bare("prep")], based_on: [based("prep", 0, "prep_qty_milli", "kitchen.prep_need"), based("prep", 1, "prep_qty_milli", "kitchen.prep_need")],
    },
    {
      // As core's negotiation review drafts it: quantity and price are cells of the run's quote comparison (round two
      // of the simulated nut supplier, row 2). based_on also holds the shortfall the run asked to fill, the last price
      // its bounds came from and the budget left, in core's order. The mock scopes these snapshots to every outlet, so
      // they trace for the owner; a manager of one outlet could not open them and would be offered Reject only (01 §6.1).
      ...common(id7("draft:po_nuts"), RUN.negotiation, null, [HAZRATGANJ]), source: "intel:inventory_purchasing",
      command_type: "purchasing.po.create.v1",
      payload: {
        po_id: id7("po:draft:nuts"), supplier_id: SUPPLIER.nuts, outlet_ids: [HAZRATGANJ], currency: CURRENCY, expected_on: addDays(today, 2), negotiation_run_id: RUN.negotiation,
        lines: [{ ingredient_id: ING("hazelnuts"), qty_milli: snap("quotes", 2, "qty_milli"), unit: "kg", unit_price_minor: snap("quotes", 2, "unit_price_minor") }],
      },
      resolved_refs: [
        { path: "/lines/0/qty_milli", ref: snap("quotes", 2, "qty_milli"), value: cell("quotes", 2, "qty_milli") },
        { path: "/lines/0/unit_price_minor", ref: snap("quotes", 2, "unit_price_minor"), value: cell("quotes", 2, "unit_price_minor") },
      ],
      evidence: [bare("quotes"), bare("deal"), bare("shortfall"), bare("lastprice")],
      based_on: [
        based("shortfall", 0, "shortfall_qty_milli", "inventory.shortfall"), based("lastprice", 0, "latest_minor", "purchasing.price_creep"),
        based("deal", 0, "budget_left_minor", "purchasing.deal_inputs"), based("quotes", 2, "unit_price_minor", "purchasing.quote_compare"),
        based("quotes", 2, "qty_milli", "purchasing.quote_compare"),
      ],
    },
    {
      // Food at risk (inventory.expiry_risk) offered to the top simulated recipient of cares.recipient_match, by code:
      // the quantity is a ref; the recipient and pickup are the match row's own cells, each also in based_on.
      ...common(id7("draft:cares_sourdough"), CARES_RUN, id7("finding:expiry"), [HAZRATGANJ]), source: "intel:inventory_purchasing",
      command_type: "cares.listing.publish.v1",
      payload: {
        listing_id: id7("listing:draft:sourdough"), outlet_id: HAZRATGANJ, kind: "donation",
        recipient_id: String(cell("match", 0, "recipient_id")), pickup_from: String(cell("match", 0, "pickup_from")), pickup_to: String(cell("match", 0, "pickup_to")),
        lines: [{
          line_id: id7("listing_line:draft:sourdough:1"), food_kind: "packaged", item_id: null, ingredient_id: ING("sourdough"), batch_id: SOURDOUGH_BATCH,
          qty_milli: snap("expiry", 0, "at_risk_qty_milli"), unit: "piece", expires_on: String(cell("expiry", 0, "expiry_on")), unit_price_minor: null, currency: null,
        }],
      },
      resolved_refs: [{ path: "/lines/0/qty_milli", ref: snap("expiry", 0, "at_risk_qty_milli"), value: cell("expiry", 0, "at_risk_qty_milli") }],
      evidence: [bare("expiry"), bare("match")],
      based_on: [
        based("expiry", 0, "at_risk_qty_milli", "inventory.expiry_risk"), based("expiry", 0, "expiry_on", "inventory.expiry_risk"),
        ...["recipient_id", "pickup_from", "pickup_to", "pickup_on"].map((c) => based("match", 0, c, "cares.recipient_match")),
      ],
    },
  ];
}

// ---------------------------------------------------------------- Ask Munim
export type SpecialistId = NonNullable<S["V1Thread"]["specialist"]>;
const SPECIALIST_ALIASES: [SpecialistId, string[]][] = [
  ["catalogue", ["catalogue", "menu", "pricing", "menu_pricing"]], ["kitchen", ["kitchen", "chef"]],
  ["inventory_purchasing", ["inventory", "purchasing", "stock", "inventory_purchasing"]], ["finance", ["finance", "accounts", "accounting"]],
  ["people", ["people", "staff", "hr"]], ["customers", ["customers", "growth", "customers_growth"]],
  ["compliance", ["compliance", "assets", "compliance_assets"]], ["market", ["market", "strategy", "market_strategy"]],
];
export const SPECIALISTS: S["V1SpecialistsResponse"] = {
  items: [["manager", ["manager"]] as [string, string[]], ...SPECIALIST_ALIASES].map(([id, aliases]) => ({
    id, kind: id === "manager" ? ("manager" as const) : ("specialist" as const), name_key: `specialist.${id}.name`,
    desk_key: id === "manager" ? "desk.reception" : `desk.${id === "inventory_purchasing" ? "purchasing" : id}`,
    aliases, detectors: [], templates: [], draftables: [], workflow_draftables: [],
  })),
};
/** core's rule: only a leading @token counts, matched case-insensitively against the eight specialists' aliases. */
export function addressedTo(question: string): SpecialistId | null {
  const m = /^@([A-Za-z_]+)(?=[\s,:;]|$)/.exec(question.trim());
  if (!m) return null;
  const a = m[1]!.toLowerCase();
  return SPECIALIST_ALIASES.find(([, as]) => as.includes(a))?.[0] ?? null;
}

type Answer = S["V1AskResponse"]["answer"];
/** The mock's answers: a cited one about cake tickets or waste, else an honest abstention. */
export function answerFor(question: string, addressed: SpecialistId | null, answerId: string, now: Date): Answer {
  const q = question.toLowerCase();
  const signature = (sp: SpecialistId | null): Answer["signature"] =>
    sp ? { key: "answer.signature.via_manager", specialist: sp, name_key: `specialist.${sp}.name` } : { key: "answer.signature.manager", specialist: "manager", name_key: "specialist.manager.name" };
  const v = (key: string, row: number, c: string) => ({ ref: snap(key, row, c), value: seedSnapshots(now).find((s) => s.snapshot_id === id7(`snap:${key}`))!.rows[row]![c]! });
  if (/cake|ticket|kitchen|late/.test(q)) {
    return {
      answer_id: answerId, signature: signature(addressed ?? "kitchen"),
      envelope: { answer_id: answerId, abstained: false, reason_code: null, follow_up: null, segments: [
        { text: `Cobnut Hazratganj made ${snap("times", 0, "tickets")} Hazelnut Praline Cake tickets this week; half were ready within ${snap("times", 0, "p50_sec")}.`, refs: [bare("times")] },
        { text: `${snap("times", 0, "late_tickets")} of them were late. The set prep time is ${snap("times", 0, "configured_prep_sec")}, and the slowest fifth took longer than ${snap("times", 0, "p80_sec")}.`, refs: [bare("times")] },
      ] },
      resolved_refs: [v("times", 0, "tickets"), v("times", 0, "p50_sec"), v("times", 0, "late_tickets"), v("times", 0, "configured_prep_sec"), v("times", 0, "p80_sec")],
    };
  }
  if (/waste|butter|thrown|written off/.test(q)) {
    return {
      answer_id: answerId, signature: signature(addressed ?? "inventory_purchasing"),
      envelope: { answer_id: answerId, abstained: false, reason_code: null, follow_up: null, segments: [
        { text: `Butter written off at Cobnut Hazratganj this week came to ${snap("waste", 0, "waste_minor")}; a usual week is ${snap("waste", 0, "median_minor")}.`, refs: [bare("waste")] },
      ] },
      resolved_refs: [v("waste", 0, "waste_minor"), v("waste", 0, "median_minor")],
    };
  }
  return {
    answer_id: answerId, signature: signature(addressed),
    envelope: { answer_id: answerId, abstained: true, reason_code: "insufficient_history", follow_up: null, segments: [] },
    resolved_refs: [],
  };
}

export function seedThreads(now: Date): S["V1Thread"][] {
  const at = mins(now, -90);
  const thread = (key: string, question: string, specialist: SpecialistId | null) => {
    const answer = answerFor(question, addressedTo(question), id7(`answer:${key}`), now);
    return {
      thread_id: id7(`thread:${key}`), specialist, created_by: OWNER_ID, outlet_scope: ["*"] as ["*"], created_at: at, updated_at: at,
      summary: answer.envelope.abstained ? [] : [{ turn_no: 1, answer_id: answer.answer_id, segment: 0, refs: answer.envelope.segments[0]!.refs }],
      turns: [{ turn_id: id7(`turn:${key}:1`), turn_no: 1, member_id: OWNER_ID, addressed_to: addressedTo(question), tainted: false, question, answer, created_at: at }],
    };
  };
  return [thread("cake", "@Kitchen how are the cake tickets doing this week?", "kitchen"), thread("diwali", "What will we sell on Diwali night?", null)];
}

// ---------------------------------------------------------------- Munim Cares (simulated recipients)
const CARES_LABELS = { labels: { data: "Measured on synthetic data" as const, recipients: "to simulated recipients" as const }, note_key: "cares.note.check_local_rules" as const };
export const CARES_PROFILE: S["V1CaresProfile"] = {
  available: true, enabled: true, profile: { status: "active", public_name: "Cobnut Bakehouse (synthetic)", b2b_enabled: false },
  outlets: [
    { outlet_id: HAZRATGANJ, city_code: "lucknow", lat_e6: 26_850_000, lng_e6: 80_946_000, pickup_from: "21:00", pickup_to: "22:30", active: true },
    { outlet_id: GOMTI_NAGAR, city_code: "lucknow", lat_e6: 26_852_000, lng_e6: 81_000_000, pickup_from: "21:00", pickup_to: "22:30", active: true },
  ],
  ...CARES_LABELS,
};
export const RECIPIENT = { shelter: id7("recipient:shelter"), kitchen: id7("recipient:kitchen") };
export const RECIPIENTS: S["V1CaresRecipients"] = {
  items: [
    { recipient_id: RECIPIENT.shelter, city_code: "lucknow", name: "Riverside Night Shelter (simulated)", kind: "ngo", simulated: true, accepts_cooked: true, accepts_raw: false, accepts_packaged: true, capacity_kg_per_day: 40, capacity_portions_per_day: 120, receiving_from: "20:30", receiving_to: "23:00", lat_e6: 26_848_000, lng_e6: 80_950_000 },
    { recipient_id: RECIPIENT.kitchen, city_code: "lucknow", name: "Old Town Community Kitchen (simulated)", kind: "food_bank", simulated: true, accepts_cooked: false, accepts_raw: true, accepts_packaged: true, capacity_kg_per_day: 150, capacity_portions_per_day: 0, receiving_from: "09:00", receiving_to: "22:00", lat_e6: 26_870_000, lng_e6: 80_910_000 },
  ],
  ...CARES_LABELS,
};

/** Tonight's open donation at Hazratganj, and yesterday's, handed over (it counts in cares.impact). */
export function seedListings(now: Date): S["V1CaresListing"][] {
  const today = businessDate(now);
  const yesterday = addDays(today, -1);
  const local = (date: string, hhmm: string) => new Date(Date.parse(`${date}T${hhmm}:00Z`) - TZ_OFFSET_MIN * 60_000).toISOString();
  const line = (key: string, no: number, kind: "cooked" | "packaged", qty: number, unit: string, item: string | null, ing: string | null) => ({
    line_id: id7(`listing_line:${key}:${no}`), line_no: no, food_kind: kind, item_id: item, ingredient_id: ing, batch_id: null, qty_milli: qty, unit, expires_on: kind === "packaged" ? addDays(today, 1) : null, unit_price_minor: null, currency: null,
  });
  const tonight = [line("tonight", 1, "packaged", 8000, "piece", null, ING("sourdough"))];
  const last = [line("yesterday", 1, "cooked", 18000, "portion", itemId("cardamom_knot"), null), line("yesterday", 2, "packaged", 6000, "piece", null, ING("sourdough"))];
  return [
    { listing_id: id7("listing:tonight"), outlet_id: HAZRATGANJ, kind: "donation", status: "published", recipient_id: RECIPIENT.kitchen, pickup_from: local(today, "21:00"), pickup_to: local(today, "22:30"), pickup_on: today, published_by: OWNER_ID, published_at: mins(now, -30), lines: tonight, handovers: [], ...CARES_LABELS },
    {
      listing_id: id7("listing:yesterday"), outlet_id: HAZRATGANJ, kind: "donation", status: "closed", recipient_id: RECIPIENT.shelter, pickup_from: local(yesterday, "21:00"), pickup_to: local(yesterday, "22:30"), pickup_on: yesterday, published_by: OWNER_ID, published_at: local(yesterday, "19:40"), lines: last,
      handovers: [{ handover_id: id7("handover:yesterday"), allocation_id: null, status: "recorded", handed_at: local(yesterday, "21:20"), recorded_by: MEMBERS[1]!.me.member_id, voided_by: null, void_reason_code: null, lines: last.map((l) => ({ listing_line_id: l.line_id, qty_milli: l.qty_milli })) }],
      ...CARES_LABELS,
    },
  ];
}

// ---------------------------------------------------------------- simulated suppliers
export function seedSuppliers(now: Date): S["V1Supplier"][] {
  const at = mins(now, -60 * 24 * 3);
  return [
    { supplier_id: SUPPLIER.dairy, name: "Riverbank Dairy (simulated)", kind: "simulated", label: "Simulated supplier", a2a_card_url: null, payment_days: 0, notes: null, active: true,
      prices: [{ price_id: id7("sp:dairy:butter"), ingredient_id: ING("butter"), unit: "kg", unit_price_minor: 56000, currency: CURRENCY, observed_at: at, source_ref: "Price list (synthetic)" }] },
    { supplier_id: SUPPLIER.nuts, name: "Lalbagh Nut & Spice (simulated)", kind: "simulated", label: "Simulated supplier", a2a_card_url: null, payment_days: 7, notes: null, active: true,
      prices: [{ price_id: id7("sp:nuts:hazel"), ingredient_id: ING("hazelnuts"), unit: "kg", unit_price_minor: 148000, currency: CURRENCY, observed_at: at, source_ref: "Price list (synthetic)" }] },
  ];
}
/** Last week's butter order, already received. */
export function seedPurchaseOrders(now: Date): S["V1PurchaseOrder"][] {
  const [dairy] = seedSuppliers(now);
  return [{
    po_id: id7("po:butter"), supplier: { supplier_id: dairy!.supplier_id, name: dairy!.name, kind: "simulated", label: "Simulated supplier" }, outlet_ids: [HAZRATGANJ],
    status: "received", currency: CURRENCY, total_minor: 560000, expected_on: addDays(businessDate(now), -5), negotiation_run_id: null, created_at: mins(now, -60 * 24 * 7),
    lines: [{ po_line_id: id7("po_line:butter:1"), line_no: 1, ingredient_id: ING("butter"), qty_milli: 10000, unit: "kg", unit_price_minor: 56000 }],
  }];
}
export function reorderLevels(outletId: string, now: Date): S["V1InventoryReorderLevels"] {
  return {
    reorder_levels: outletId === HAZRATGANJ
      ? [
          { reorder_level_id: id7("rl:hzg:hazel"), outlet_id: HAZRATGANJ, ingredient_id: ING("hazelnuts"), min_qty_milli: 5_000_000, par_qty_milli: 12_000_000, updated_at: mins(now, -60 * 24 * 30) },
          { reorder_level_id: id7("rl:hzg:butter"), outlet_id: HAZRATGANJ, ingredient_id: ING("butter"), min_qty_milli: 4_000_000, par_qty_milli: 10_000_000, updated_at: mins(now, -60 * 24 * 30) },
        ]
      : [],
  };
}


// ---------------------------------------------------------------- Cares: food at risk and ranked recipients
export const CARES_RUN = id7("run:expiry");
export const SOURDOUGH_BATCH = id7("batch:sourdough:1013");
const CREAM_BATCH = id7("batch:cream:1011");
/** An instant from the outlet's calendar date and a "HH:MM" wall time (India: a fixed offset is exact). */
const localAt = (date: string, hhmm: string) => new Date(Date.parse(`${date}T${hhmm}:00Z`) - TZ_OFFSET_MIN * 60_000).toISOString();
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** The next overlap of two wall-time windows after now: today's when it starts later today, else tomorrow's (as the template). */
function nextWindow(now: Date, from: string, to: string) {
  const today = businessDate(now);
  const on = Date.parse(localAt(today, from)) > now.getTime() ? today : addDays(today, 1);
  return { from: localAt(on, from), to: localAt(on, to), on };
}
/** Synthetic distances from Cobnut Hazratganj (the template works them out from coordinates). */
const DISTANCE_M: Record<string, number> = { [RECIPIENT.shelter]: 455, [RECIPIENT.kitchen]: 4208 };

/** cares.recipient_match as core ranks it: simulated recipients in the outlet's city that take every food kind asked for,
 *  whose receiving hours overlap the outlet's pickup hours, an expiry at least one day after pickup (the pack's
 *  min_days_left_at_pickup); fitting first, then the longest overlap, then the nearest. */
export function matchRowsFor(p: Snapshot["params"], now: Date): Snapshot["rows"] {
  const outlet = CARES_PROFILE.outlets.find((o) => o.outlet_id === p.outlet_id && o.active);
  if (!outlet) return [];
  const qty = Number(p.qty_milli);
  const rows = RECIPIENTS.items
    .filter((r) => (!p.needs_cooked || r.accepts_cooked) && (!p.needs_raw || r.accepts_raw) && (!p.needs_packaged || r.accepts_packaged))
    .flatMap((r) => {
      const from = outlet.pickup_from > r.receiving_from ? outlet.pickup_from : r.receiving_from;
      const to = outlet.pickup_to < r.receiving_to ? outlet.pickup_to : r.receiving_to;
      if (to <= from) return [];
      const w = nextWindow(now, from, to);
      if (typeof p.expires_on === "string" && p.expires_on < addDays(w.on, 1)) return [];
      const fit = p.unit === "g" || p.unit === "ml" ? qty <= r.capacity_kg_per_day * 1_000_000 : p.unit === "kg" || p.unit === "l" ? qty <= r.capacity_kg_per_day * 1000 : p.unit === "portion" ? qty <= r.capacity_portions_per_day * 1000 : true;
      return [{ recipient_id: r.recipient_id, name: r.name, simulated: true, distance_m: DISTANCE_M[r.recipient_id] ?? 0, capacity_fit: fit, overlap_min: minutesOf(to) - minutesOf(from), pickup_from: w.from, pickup_to: w.to, pickup_on: w.on }];
    });
  return rows.sort((a, b) => Number(b.capacity_fit) - Number(a.capacity_fit) || b.overlap_min - a.overlap_min || a.distance_m - b.distance_m);
}

/** Tonight's food at risk at Hazratganj (12 sourdough loaves expire the day after the next pickup), and the recipients
 *  core would rank for it. Run-minted by the watcher; the finding and the listing draft cite them. */
export function caresSnapshots(now: Date): Snapshot[] {
  const at = mins(now, -60);
  const pickupOn = nextWindow(now, "21:00", "22:30").on;
  const expiry = [
    { batch_id: SOURDOUGH_BATCH, expiry_on: addDays(pickupOn, 1), days_to_expiry: pickupOn === businessDate(now) ? 1 : 2, is_sku: true, remaining_qty_milli: 14_000, use_before_expiry_qty_milli: 2_000, at_risk_qty_milli: 12_000, at_risk_minor: 54_000, ingredient_id: ING("sourdough"), unit: "piece", supplier_id: null },
    { batch_id: CREAM_BATCH, expiry_on: addDays(businessDate(now), 4), days_to_expiry: 4, is_sku: false, remaining_qty_milli: 2_000_000, use_before_expiry_qty_milli: 1_600_000, at_risk_qty_milli: 400_000, at_risk_minor: 9_000, ingredient_id: ING("cream"), unit: "ml", supplier_id: SUPPLIER.dairy },
  ];
  const ask = { outlet_id: HAZRATGANJ, needs_cooked: false, needs_raw: false, needs_packaged: true, qty_milli: 12_000, unit: "piece", expires_on: expiry[0]!.expiry_on };
  return [
    snapshotOf(id7("snap:expiry"), "inventory.expiry_risk", { outlet_id: HAZRATGANJ, days: 7, as_of: businessDate(now) }, TEMPLATE_COLUMNS["inventory.expiry_risk"]!, expiry, { run: CARES_RUN }, [HAZRATGANJ], at),
    snapshotOf(id7("snap:match"), "cares.recipient_match", ask, TEMPLATE_COLUMNS["cares.recipient_match"]!, matchRowsFor(ask, now), { run: CARES_RUN }, [HAZRATGANJ], at),
  ];
}

/** The finding behind the listing draft. Text holds no digit; every number is a ref. */
export function expiryFinding(now: Date): Finding {
  const at = mins(now, -55);
  const s = caresSnapshots(now)[0]!;
  const value = (c: string) => ({ ref: snap("expiry", 0, c), value: s.rows[0]![c]! });
  return {
    finding_id: id7("finding:expiry"), run_id: CARES_RUN, pack: "inventory_purchasing", type: "inventory.expiry_risk", severity: "low", status: "open",
    confidence_bp: 8000, dedupe_key: `inventory.expiry_risk:${HAZRATGANJ}:${SOURDOUGH_BATCH}`,
    envelope: {
      finding_id: id7("finding:expiry"), impact_ref: snap("expiry", 0, "at_risk_minor"), abstained: false, reason_code: null,
      segments: [{ text: `Sliced sourdough loaves at Cobnut Hazratganj: ${snap("expiry", 0, "at_risk_qty_milli")} of this batch are not expected to be used before it expires on ${snap("expiry", 0, "expiry_on")}, worth ${snap("expiry", 0, "at_risk_minor")} at cost.`, refs: [bare("expiry")] }],
    },
    resolved_refs: [value("at_risk_qty_milli"), value("expiry_on"), value("at_risk_minor")],
    created_at: at, updated_at: at,
  };
}

/** Last week's butter, received against its purchase order. */
export function seedGoodsReceived(now: Date): S["V1GoodsReceived"][] {
  const [po] = seedPurchaseOrders(now);
  return [{
    grn_id: id7("grn:butter"), outlet_id: HAZRATGANJ, supplier: po!.supplier, po_id: po!.po_id, received_at: mins(now, -60 * 24 * 5), received_by: MEMBERS[1]!.me.member_id, note: null,
    lines: [{ grn_line_id: id7("grn_line:butter:1"), po_line_id: po!.lines[0]!.po_line_id, ingredient_id: ING("butter"), batch_id: id7("batch:butter:1001"), qty_milli: 10_000, unit: "kg", unit_cost_minor: 56_000, currency: CURRENCY }],
  }];
}
```

## 8 · The member routes: `mock-server/staff.ts`

```ts
// file: mock-server/staff.ts
// The member half of the mock: the routes the staff screens call, served at /mock/v1/* beside the storefront routes.
// It keeps the books in memory, per server instance (03 §2 says what that cannot do), and copies core's rules where
// a screen depends on them: who may do what, 401 / 404 / 403, one-step transitions with 409s, idempotency replay,
// draft approval (cannot_verify, already_decided, stale_draft), ids-only live events. Synthetic data only.
import { createHash } from "node:crypto";
import type { Schemas } from "@munim/sdk";
import { DEMO_TENANT_ID } from "@/lib/munim/session";
import { CHANNEL_ID, CURRENCY, ITEMS, PREP_MIN, id7, itemId } from "./data";
import { BadRequest, outletById, price } from "./pricing";
import {
  CARES_PROFILE, CHANNELS, COUNTER_CHANNEL_ID, DEVICES, INGREDIENTS, MEMBERS, MEMBER_OUTLETS, RECIPIENTS, SPECIALISTS, TEMPLATE_COLUMNS, TEMPLATE_MIN_ROLE, TENANT,
  addressedTo, answerFor, boardOf, buildOrder, businessDate, menuFor, mintRows, orderListItem, posDevice, receiptOf, reorderLevels, seedDrafts, seedFindings, seedListings,
  seedGoodsReceived, seedOrders, seedPurchaseOrders, seedSnapshots, seedSuppliers, seedThreads, snapshotOf, type Placed,
} from "./staff-data";

type S = Schemas;
type Me = S["V1Me"];
type ErrorCode = S["Error"]["error"]["code"];
type Json = Record<string, unknown>;

const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY = /^[A-Za-z0-9_.:-]{8,100}$/;
const RANK: Record<string, number> = { staff: 1, manager: 2, advisor: 3, owner: 4, judge: 4 };

// ---------------------------------------------------------------- responses
const H = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Munim-Mock": "true" };
export const staffJson = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...H, ...extra } });
const MESSAGE: Partial<Record<ErrorCode, string>> = { unauthenticated: "Sign in again.", not_found: "Not found.", forbidden: "You are not allowed to do this." };
const fail = (status: number, code: ErrorCode, reason: string | null = null, extra: Json = {}) =>
  staffJson(status, { error: { code, message: MESSAGE[code] ?? "This request was refused.", reason_code: reason }, ...extra });
const notFound = () => fail(404, "not_found");
class Refuse extends Error {
  constructor(readonly res: Response) {
    super("refused");
  }
}
const refuse = (status: number, code: ErrorCode, reason: string | null = null, extra: Json = {}): never => {
  throw new Refuse(fail(status, code, reason, extra));
};

// ---------------------------------------------------------------- the books (one copy per server instance)
interface DraftState {
  draft: S["V1Draft"];
  decision: S["V1DraftDetail"]["decision"];
  /** The payload the decision approved (core.decision.final_payload): edits stay here, never in the draft. No member
   *  route serves it (00 §7 question 15). */
  final: unknown;
  history: S["V1DraftDetail"]["history"];
}
/** One audit entry on a purchase order (core.audit_log, entity core.purchase_order), for GET /v1/lineage. */
interface PoAudit {
  action: string;
  at: string;
  actor: { member_id: string; role: string };
  /** The draft whose approval made it, or null for a person's own command. */
  draftId: string | null;
}
interface LiveEvent {
  seq: number;
  outletId: string | null;
  orderId: string | null;
  inbox: boolean;
  body: { id: string; type: string; data: Json };
}
interface World {
  orders: Map<string, Placed>;
  ticketNo: Map<string, number>;
  invoiceNo: Map<string, number>;
  usedLineIds: Set<string>;
  findings: Map<string, S["V1Finding"]>;
  drafts: Map<string, DraftState>;
  snapshots: Map<string, S["Snapshot"]>;
  threads: Map<string, S["V1Thread"]>;
  listings: Map<string, S["V1CaresListing"]>;
  pos: Map<string, S["V1PurchaseOrder"]>;
  poAudits: Map<string, PoAudit[]>;
  grns: Map<string, S["V1GoodsReceived"]>;
  log: Map<string, { hash: string; status: number; body: unknown }>;
  events: LiveEvent[];
}
let world: World | null = null;

function books(now: Date): World {
  if (world) return world;
  const orders = seedOrders(now);
  world = {
    orders: new Map(orders.map((p) => [p.order.order_id, p])),
    ticketNo: new Map(), invoiceNo: new Map(), usedLineIds: new Set(orders.flatMap((p) => p.order.lines.map((l) => l.line_id))),
    findings: new Map(seedFindings(now).map((f) => [f.finding_id, f])),
    drafts: new Map(seedDrafts(now).map((draft) => [draft.draft_id, { draft, decision: null, final: null, history: [{ event: "proposed", at: draft.created_at, by: draft.source }] }])),
    snapshots: new Map(seedSnapshots(now).map((s) => [s.snapshot_id, s])),
    threads: new Map(seedThreads(now).map((t) => [t.thread_id, t])),
    listings: new Map(seedListings(now).map((l) => [l.listing_id, l])),
    pos: new Map(seedPurchaseOrders(now).map((p) => [p.po_id, p])),
    // Last week's butter order: placed by the owner, then received at the counter (one audit entry each).
    poAudits: new Map(seedPurchaseOrders(now).map((p) => [p.po_id, [
      { action: "purchasing.po.create.v1", at: p.created_at, actor: { member_id: MEMBERS[0]!.me.member_id, role: "owner" }, draftId: null },
      ...seedGoodsReceived(now).filter((g) => g.po_id === p.po_id).map((g) => ({ action: "purchasing.grn.receive.v1", at: g.received_at, actor: { member_id: g.received_by, role: MEMBERS.find((x) => x.me.member_id === g.received_by)!.me.role }, draftId: null })),
    ]])),
    grns: new Map(seedGoodsReceived(now).map((g) => [g.grn_id, g])),
    log: new Map(), events: [],
  };
  for (const p of orders) world.ticketNo.set(p.order.outlet_id, Math.max(world.ticketNo.get(p.order.outlet_id) ?? 0, p.order.ticket_no));
  return world;
}

function emit(w: World, type: string, data: Json, where: { outletId?: string | null; orderId?: string | null; inbox?: boolean }) {
  w.events.push({ seq: w.events.length + 1, outletId: where.outletId ?? null, orderId: where.orderId ?? null, inbox: where.inbox ?? false, body: { id: id7(`event:${w.events.length}:${Date.now()}`), type, data } });
}

// ---------------------------------------------------------------- who is asking
type Who = { m: Me; token: string };
/** 401 without a token the mock knows; 404 for a known token in the wrong (or no) tenant. */
function member(req: Request): Who {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const found = MEMBERS.find((x) => x.token === token);
  if (!found) refuse(401, "unauthenticated");
  if (req.headers.get("X-Munim-Tenant") !== DEMO_TENANT_ID) refuse(404, "not_found");
  return { m: found!.me, token };
}
const sees = (m: Me, outletId: string) => m.outlet_ids === "*" || m.outlet_ids.includes(outletId);
const seesAll = (m: Me, outletIds: readonly string[]) => outletIds.length === 0 ? m.outlet_ids === "*" : outletIds.every((o) => sees(m, o));
/** Role may run this command (core.command_authority); else 403 authority_denied. */
function allow(m: Me, roles: readonly string[], code: ErrorCode = "forbidden") {
  if (!roles.includes(m.role)) refuse(403, code, "authority_denied");
}
const ORDER_ROLES = ["owner", "manager", "staff", "judge"];
const DECIDE_ROLES = ["owner", "manager", "judge"];
/** core's roleAllowed: a draft is decided only by a role its own command type also allows (core.command_authority).
 *  A type not listed here is refused, as core refuses a type with no authority row. */
const DRAFT_TYPE_ROLES: Record<string, readonly string[]> = {
  "kitchen.prep_time.set.v1": DECIDE_ROLES, "kitchen.prep_list.create.v1": DECIDE_ROLES, "purchasing.po.create.v1": DECIDE_ROLES,
  "cares.listing.publish.v1": ["owner", "judge"],
};

// ---------------------------------------------------------------- commands
interface Command<P> {
  command_id: string;
  idempotency_key: string;
  type: string;
  payload: P;
}
function envelopeOf<P = Json>(body: unknown, type: string): Command<P> {
  const b = body as Partial<Command<P>> | null;
  if (!b || typeof b !== "object" || !UUID7.test(String(b.command_id)) || !KEY.test(String(b.idempotency_key)) || b.type !== type || typeof b.payload !== "object" || b.payload === null)
    refuse(422, "invalid_payload");
  return b as Command<P>;
}
/** Runs a command once per idempotency key: same key + same request = the stored answer with X-Munim-Replayed;
 *  same key + anything else = 409. A refused command stores nothing, so a retry runs it again. */
function once(w: World, who: Who, cmd: Command<unknown>, status: number, run: () => S["CommandResult"]): Response {
  const hash = createHash("sha256").update(JSON.stringify([who.m.member_id, cmd.command_id, cmd.type, cmd.payload])).digest("hex");
  const prior = w.log.get(cmd.idempotency_key);
  if (prior) return prior.hash === hash ? staffJson(prior.status, prior.body, { "X-Munim-Replayed": "true" }) : fail(409, "idempotency_conflict");
  const body = run();
  w.log.set(cmd.idempotency_key, { hash, status, body });
  return staffJson(status, body);
}
const result = (cmd: Command<unknown>, entityId: string, type = cmd.type): S["CommandResult"] => ({ command_id: cmd.command_id, type, entity_id: entityId, committed_at: new Date().toISOString() });

// ---------------------------------------------------------------- orders and the kitchen
const NEXT_TICKET: Record<string, string> = { queued: "preparing", preparing: "ready", ready: "done" };
const ORDER_STEPS: Record<string, string[]> = { accepted: ["preparing", "cancelled"], preparing: ["ready"], ready: ["completed"], placed: ["cancelled"] };

function setOrderStatus(w: World, p: Placed, to: S["V1Order"]["status"]) {
  const from = p.order.status;
  if (from === to) return;
  p.order.status = to;
  if (to === "completed" || to === "cancelled" || to === "rejected") for (const t of p.tickets) t.status = "done";
  emit(w, "munim.orders.order.status_changed.v1", { order_id: p.order.order_id, outlet_id: p.order.outlet_id, from_status: from, to_status: to }, { outletId: p.order.outlet_id, orderId: p.order.order_id });
}

function placeOrder(w: World, who: Who, body: unknown, now: Date): Response {
  const cmd = envelopeOf<S["OrdersPlaceV1"]>(body, "orders.place.v1");
  const p = cmd.payload;
  allow(who.m, ["owner", "manager", "staff", "judge"]);
  if (!outletById(p.outlet_id)) return notFound();
  if (!sees(who.m, p.outlet_id)) refuse(403, "forbidden", "authority_denied");
  const channel = CHANNELS.channels.find((c) => c.id === p.channel_id && c.active);
  if (!channel) return notFound();
  if (!UUID7.test(p.order_id) || !Array.isArray(p.lines) || p.lines.length === 0 || p.loyalty_redeem_points !== 0) refuse(422, "invalid_payload");
  const ids = p.lines.map((l) => l.line_id);
  if (ids.some((x) => !UUID7.test(x)) || new Set(ids).size !== ids.length || p.lines.some((l) => l.note !== null && (typeof l.note !== "string" || l.note.length > 200))) refuse(422, "invalid_payload");
  return once(w, who, cmd, 201, () => {
    if (ids.some((x) => w.usedLineIds.has(x)) || w.orders.has(p.order_id)) refuse(422, "invalid_payload");
    const ticketNo = (w.ticketNo.get(p.outlet_id) ?? 0) + 1;
    const invoiceNo = p.device_id ? (w.invoiceNo.get(p.device_id) ?? 100) + 1 : null;
    const built = buildOrder({
      orderId: p.order_id, outletId: p.outlet_id, ticketNo, channelId: p.channel_id, deviceId: p.device_id, invoiceNo, kind: p.kind, tableRef: p.table_ref,
      status: "placed", createdAt: now.toISOString(), promisedAt: p.promised_at, lines: p.lines.map((l) => ({ line_id: l.line_id, item_id: l.item_id, variant_id: l.variant_id, option_ids: l.option_ids, qty_milli: l.qty_milli, note: l.note })),
    }, now);
    if (built.refusal) refuse(409, "conflict", built.refusal);
    if (p.preview_total_minor !== null && p.preview_total_minor !== built.totalMinor) refuse(409, "conflict", "preview_total_changed");
    w.ticketNo.set(p.outlet_id, ticketNo);
    if (p.device_id && invoiceNo) w.invoiceNo.set(p.device_id, invoiceNo);
    ids.forEach((x) => w.usedLineIds.add(x));
    w.orders.set(p.order_id, built.placed);
    emit(w, "munim.orders.order.placed.v1", { order_id: p.order_id, outlet_id: p.outlet_id, channel_id: p.channel_id, status: "placed", placed_at: now.toISOString() }, { outletId: p.outlet_id, orderId: p.order_id });
    for (const t of built.placed.tickets) emit(w, "munim.kitchen.ticket.created.v1", { ticket_id: t.ticket_id, order_id: t.order_id, outlet_id: t.outlet_id, station: t.station, status: t.status }, { outletId: t.outlet_id, orderId: t.order_id });
    return result(cmd, p.order_id);
  });
}

/** The preview body and its lines are strict in core's contract: any other field (a line `note`, say) is 422. */
const PREVIEW_KEYS = ["outlet_id", "channel_id", "brand_id", "kind", "pickup_window_id", "promised_at", "coupon_codes", "loyalty_redeem_points", "lines"];
const PREVIEW_LINE_KEYS = ["item_id", "variant_id", "option_ids", "qty_milli", "barcode"];
function preview(body: unknown, who: Who, now: Date): Response {
  const b = body as S["OrdersPreviewRequest"];
  const only = (o: object, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));
  if (!b || typeof b !== "object" || !only(b, PREVIEW_KEYS) || !Array.isArray(b.lines) || b.lines.some((l) => !l || typeof l !== "object" || !only(l, PREVIEW_LINE_KEYS))) refuse(422, "invalid_payload");
  const outlet = outletById(b?.outlet_id);
  if (!outlet) return notFound();
  if (!sees(who.m, outlet.outlet_id)) return notFound();
  if (!["dine_in", "takeaway", "pickup", "delivery"].includes(b.kind)) refuse(422, "invalid_payload");
  const { preview: p } = price({ ...b, kind: "pickup" }, outlet, "open", now);
  const out: S["OrdersPreviewResponse"] = p.refusals.length > 0
    ? { label: "preview", priced_at: p.priced_at, currency: p.currency, tax_rule: p.tax_rule, lines: [], subtotal_minor: 0, discount_minor: 0, tax_minor: 0, total_minor: 0, refusals: p.refusals.map((r) => ({ line_no: r.line_no, reason_code: r.reason_code })) }
    : {
        label: "preview", priced_at: p.priced_at, currency: p.currency, tax_rule: p.tax_rule, refusals: [],
        lines: p.lines.map((l) => ({ line_no: l.line_no, item_id: l.item_id, variant_id: l.variant_id, qty_milli: l.qty_milli, unit_price_minor: l.unit_price_minor, options_minor: l.options_minor, line_discount_minor: l.line_discount_minor, tax_class: l.tax_class, tax_minor: l.tax_minor, line_total_minor: l.line_total_minor, price_ref: l.price_ref, option_refs: l.option_refs, deal_refs: l.deal_refs, coupon_refs: l.coupon_refs })),
        subtotal_minor: p.subtotal_minor, discount_minor: p.discount_minor, tax_minor: p.tax_minor, total_minor: p.total_minor,
      };
  return staffJson(200, out);
}

function orderCommand(w: World, who: Who, orderId: string, verb: string, body: unknown): Response {
  const type = verb === "accept" ? "orders.order.accept.v1" : verb === "reject" ? "orders.order.reject.v1" : "orders.order.advance.v1";
  const cmd = envelopeOf<{ order_id: string; from_status?: string; to_status?: string; reason_code?: string | null }>(body, type);
  if (cmd.payload.order_id !== orderId) refuse(422, "invalid_payload");
  allow(who.m, ORDER_ROLES);
  const p = w.orders.get(orderId);
  if (!p || !sees(who.m, p.order.outlet_id)) return notFound();
  return once(w, who, cmd, 200, () => {
    const from = p.order.status;
    if (verb === "accept") {
      if (from !== "placed") refuse(409, "illegal_transition");
      setOrderStatus(w, p, "accepted");
    } else if (verb === "reject") {
      if (!cmd.payload.reason_code) refuse(422, "invalid_payload", "reason_required");
      if (from !== "placed") refuse(409, "illegal_transition");
      if (p.order.tenders.length > 0) refuse(409, "conflict", "refund_first");
      setOrderStatus(w, p, "rejected");
    } else {
      const to = cmd.payload.to_status!;
      if (to === "cancelled" && !cmd.payload.reason_code) refuse(422, "invalid_payload", "reason_required");
      if (cmd.payload.from_status !== from || !(ORDER_STEPS[from] ?? []).includes(to)) refuse(409, "illegal_transition");
      if (to === "cancelled" && p.order.tenders.length > 0) refuse(409, "conflict", "refund_first");
      setOrderStatus(w, p, to as S["V1Order"]["status"]);
    }
    return result(cmd, orderId);
  });
}

/** Recorded only. Cash: core takes the due amount rounded to the pack's cash step (₹1 here) and records the change. */
function tender(w: World, who: Who, orderId: string, body: unknown, now: Date): Response {
  const cmd = envelopeOf<S["OrdersTenderRecordV1"]>(body, "orders.tender.record.v1");
  const t = cmd.payload;
  const cash = t.method === "cash";
  if (t.order_id !== orderId || !UUID7.test(t.tender_id) || !["cash", "card", "upi"].includes(t.method) || cash !== (t.tendered_minor !== null) || cash !== (t.amount_minor === null)) refuse(422, "invalid_payload");
  allow(who.m, ORDER_ROLES);
  const p = w.orders.get(orderId);
  if (!p || !sees(who.m, p.order.outlet_id)) return notFound();
  return once(w, who, cmd, 200, () => {
    const o = p.order;
    if (o.status === "cancelled" || o.status === "rejected") refuse(409, "illegal_transition");
    if (t.currency !== CURRENCY) refuse(422, "currency_mismatch");
    if (o.remaining_minor === 0) refuse(409, "conflict");
    const base = { tender_id: t.tender_id, order_id: orderId, method: t.method, currency: CURRENCY, ref: t.ref, recorded_by: who.m.member_id, at: now.toISOString() };
    if (cash) {
      const due = Math.round(o.remaining_minor / 100) * 100;
      if (due === 0) refuse(409, "conflict", "cash_below_rounding");
      const tendered = t.tendered_minor!;
      const full = tendered >= due;
      o.tenders.push({ ...base, amount_minor: full ? due : tendered, tendered_minor: tendered, change_minor: full ? tendered - due : 0, rounding_minor: full ? due - o.remaining_minor : 0, ref: null });
      o.paid_minor += full ? o.remaining_minor : tendered;
    } else {
      if (t.amount_minor! > o.remaining_minor) refuse(422, "invalid_payload");
      o.tenders.push({ ...base, amount_minor: t.amount_minor!, tendered_minor: null, change_minor: null, rounding_minor: null });
      o.paid_minor += t.amount_minor!;
    }
    o.remaining_minor = Math.max(o.total_minor - o.loyalty_minor - o.paid_minor, 0);
    emit(w, "munim.orders.tender.recorded.v1", { tender_id: t.tender_id, order_id: orderId, outlet_id: o.outlet_id, method: t.method }, { outletId: o.outlet_id, orderId });
    return result(cmd, t.tender_id);
  });
}

/** One step forward only, guarded by from_status. The order follows its tickets (core's rule): the first ticket
 *  started makes it preparing, all ready makes it ready, all done completes it (even unpaid: take payment first). */
function advanceTicket(w: World, who: Who, ticketId: string, body: unknown, now: Date): Response {
  const cmd = envelopeOf<S["KitchenTicketAdvanceV1"]>(body, "kitchen.ticket.advance.v1");
  if (cmd.payload.ticket_id !== ticketId) refuse(422, "invalid_payload");
  allow(who.m, ORDER_ROLES);
  const p = [...w.orders.values()].find((x) => x.tickets.some((t) => t.ticket_id === ticketId));
  if (!p || !sees(who.m, p.order.outlet_id)) return notFound();
  const t = p.tickets.find((x) => x.ticket_id === ticketId)!;
  return once(w, who, cmd, 200, () => {
    const { from_status, to_status } = cmd.payload;
    if (t.status !== from_status || NEXT_TICKET[from_status] !== to_status || ["rejected", "cancelled"].includes(p.order.status)) refuse(409, "illegal_transition");
    t.status = to_status;
    if (to_status === "preparing") t.accepted_at = now.toISOString();
    if (to_status === "ready") t.ready_at = now.toISOString();
    emit(w, "munim.kitchen.ticket.advanced.v1", { ticket_id: t.ticket_id, order_id: t.order_id, outlet_id: t.outlet_id, station: t.station, status: t.status, from_status }, { outletId: t.outlet_id, orderId: t.order_id });
    const all = (ok: string[]) => p.tickets.every((x) => ok.includes(x.status));
    if (to_status === "preparing" && (p.order.status === "placed" || p.order.status === "accepted")) {
      if (p.order.status === "placed") setOrderStatus(w, p, "accepted");
      setOrderStatus(w, p, "preparing");
    }
    if (all(["done"])) setOrderStatus(w, p, "completed");
    else if (all(["ready", "done"]) && p.order.status === "preparing") setOrderStatus(w, p, "ready");
    return result(cmd, ticketId);
  });
}

// ---------------------------------------------------------------- inbox and approvals
/** core's draft row-level security: a draft shows when its outlets overlap the person's (one with none: every outlet). */
const visibleDraft = (m: Me, d: DraftState) => m.outlet_ids === "*" || d.draft.outlet_ids.some((o) => sees(m, o));
/** The outlets a command writes to, from its payload (core's outletTargets): none means the whole business. */
const targetsOf = (p: Json): string[] =>
  typeof p.outlet_id === "string" ? [p.outlet_id] : Array.isArray(p.outlet_ids) ? p.outlet_ids.filter((x): x is string => typeof x === "string") : [];

type Cell = S["Snapshot"]["rows"][number][string];
const SNAP_REF = /^⟨snap:([0-9a-f-]{36})·(0|[1-9][0-9]*)·([a-z_][a-z0-9_]*)⟩$/u;
/** The cell a snap ref names, only when this person may open its snapshot (core: visibleTo, then cellOf). */
function cellFor(w: World, m: Me, ref: string): { value: Cell } | null {
  const p = SNAP_REF.exec(ref);
  const s = p ? w.snapshots.get(p[1]!) : undefined;
  const row = s && canOpen(m, s) ? s.rows[Number(p![2])] : undefined;
  return row && p![3]! in row ? { value: row[p![3]!]! } : null;
}
/** Values beside refs (findings, answers) only from cells this person may open (core resolves them per viewer). */
const seen = <T extends { ref: string }>(w: World, m: Me, refs: readonly T[]): T[] => refs.filter((r) => cellFor(w, m, r.ref) !== null);

/** A draft as this person sees it (core's view()): a payload ref they cannot open is unverified; a based_on cell they
 *  cannot open is left out of based_on and is unverified too. */
function viewOf(w: World, m: Me, d: DraftState): { draft: S["V1Draft"]; unverified: string[] } {
  const unverified: string[] = [];
  const resolved = refLeaves(d.draft.payload).flatMap(({ path, ref }) => {
    const c = cellFor(w, m, ref);
    if (!c) unverified.push(ref);
    return c ? [{ path, ref, value: c.value }] : [];
  });
  const basedOn = d.draft.based_on.filter((b) => {
    const open = cellFor(w, m, b.ref) !== null;
    if (!open) unverified.push(b.ref);
    return open;
  });
  return { draft: { ...d.draft, resolved_refs: resolved, based_on: basedOn }, unverified };
}
function detailOf(w: World, m: Me, d: DraftState): S["V1DraftDetail"] {
  const v = viewOf(w, m, d);
  return { draft: v.draft, decision: d.decision, unverified_refs: v.unverified, history: d.history };
}

/** JSON Pointer paths of every numeric leaf that is still a ref (string starting with ⟨). */
function refLeaves(x: unknown, path = ""): { path: string; ref: string }[] {
  if (typeof x === "string") return x.startsWith("⟨") ? [{ path, ref: x }] : [];
  if (Array.isArray(x)) return x.flatMap((v, i) => refLeaves(v, `${path}/${i}`));
  if (x && typeof x === "object") return Object.entries(x).flatMap(([k, v]) => ("value" in (x as Json) && "typed_by" in (x as Json) ? [] : refLeaves(v, `${path}/${k}`)));
  return [];
}
function editsOf(x: unknown, path = ""): { path: string; value: unknown; typed_by: unknown }[] {
  if (Array.isArray(x)) return x.flatMap((v, i) => editsOf(v, `${path}/${i}`));
  if (x && typeof x === "object") {
    const o = x as Json;
    if ("value" in o && "typed_by" in o) return [{ path, value: o.value, typed_by: o.typed_by }];
    return Object.entries(o).flatMap(([k, v]) => editsOf(v, `${path}/${k}`));
  }
  return [];
}
/** The final payload: each ref replaced by its resolved value, each edit by what the person typed. */
function finalOf(x: unknown, resolved: Map<string, unknown>, path = ""): unknown {
  if (typeof x === "string" && x.startsWith("⟨")) return resolved.get(path);
  if (Array.isArray(x)) return x.map((v, i) => finalOf(v, resolved, `${path}/${i}`));
  if (x && typeof x === "object") {
    const o = x as Json;
    if ("value" in o && "typed_by" in o) return o.value;
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, finalOf(v, resolved, `${path}/${k}`)]));
  }
  return x;
}

function decide(w: World, who: Who, draftId: string, verb: "approve" | "reject", body: unknown, req: Request, now: Date): Response {
  const cmd = envelopeOf<S["DraftsApproveV1"] & S["DraftsRejectV1"]>(body, verb === "approve" ? "drafts.approve.v1" : "drafts.reject.v1");
  const p = cmd.payload;
  if (p.draft_id !== draftId) refuse(422, "invalid_payload");
  const d = w.drafts.get(draftId);
  if (!d || !visibleDraft(who.m, d)) return notFound();
  allow(who.m, DECIDE_ROLES);
  allow(who.m, DRAFT_TYPE_ROLES[d.draft.command_type] ?? []);
  // core judges both verbs over every one of the draft's outlets (none = the whole business, so every outlet), and
  // approve also over the outlets its payload writes to: a manager of one outlet cannot decide a two-outlet draft.
  if (!seesAll(who.m, d.draft.outlet_ids) || (verb === "approve" && !seesAll(who.m, targetsOf(d.draft.payload as Json)))) refuse(403, "forbidden", "authority_denied");
  const by = { member_id: who.m.member_id, name: who.m.name };
  /** Audit-made history rows (executed, stale, failed) name the role, as core's do; the decision row names the person. */
  const byRole = { member_id: who.m.member_id, role: who.m.role };
  return once(w, who, cmd, 200, () => {
    const forced = req.headers.get("X-Mock-Force-Decision");
    const at = now.toISOString();
    // Like core, a retry after a stale or failed outcome gets that outcome again, not "already decided".
    if (verb === "approve" && d.draft.status === "stale") refuse(409, "stale_draft", "stale_draft");
    if (verb === "approve" && d.draft.status === "failed") refuse(422, "execution_failed");
    if (d.draft.status !== "proposed" || forced === "already_decided") refuse(409, "already_decided");
    if (verb === "reject") {
      if (typeof p.reason !== "string" || p.reason.length < 1 || p.reason.length > 500) refuse(422, "invalid_payload");
      d.draft.status = "rejected";
      d.decision = { decision_id: id7(`decision:${draftId}`), verdict: "rejected", reason: p.reason, decided_by: by, decided_at: at };
      d.history.push({ event: "rejected", at, by, reason: p.reason });
      d.draft.updated_at = at;
      emit(w, "inbox.draft", { status: "rejected", command_type: d.draft.command_type, outlet_ids: d.draft.outlet_ids, finding_id: d.draft.finding_id, updated_at: at }, { inbox: true });
      return result(cmd, draftId);
    }
    if (p.command_type !== d.draft.command_type) refuse(422, "invalid_payload");
    const edited = p.edited_payload ?? null;
    const proposed = refLeaves(d.draft.payload);
    let left = proposed;
    if (edited) {
      const edits = editsOf(edited);
      if (edits.some((e) => e.typed_by !== who.m.member_id || typeof e.value !== "number")) refuse(422, "invalid_payload");
      const kept = refLeaves(edited);
      if (kept.some((k) => !proposed.some((x) => x.path === k.path && x.ref === k.ref))) refuse(422, "invalid_payload");
      left = kept;
    }
    // As core: every ref left in the final payload must open for the approver (422 with those refs), then every cell
    // the draft was based on is read again under the approver's access (422 with no refs when one will not open).
    const unresolved = left.filter((l) => !cellFor(w, who.m, l.ref)).map((l) => l.ref);
    if (unresolved.length > 0) refuse(422, "cannot_verify", "unresolved_ref", { refs: unresolved });
    if (d.draft.based_on.some((b) => !cellFor(w, who.m, b.ref))) refuse(422, "cannot_verify", "unresolved_ref");
    if (forced === "stale") {
      const b = d.draft.based_on[0]!;
      d.draft.status = "stale";
      d.history.push({ event: "stale", at, by: byRole, decision_id: null, changes: [{ ref: b.ref, value: b.expected, now_ref: null, now: null }] });
      refuse(409, "stale_draft", "stale_draft", { changes: [{ ref: b.ref, value: b.expected, now_ref: null, now: null }] });
    }
    const verdict = edited ? ("edited" as const) : ("approved" as const);
    const decision = { decision_id: id7(`decision:${draftId}`), verdict, reason: p.reason ?? null, decided_by: by, decided_at: at };
    // Core stores the final payload on the decision and never changes the draft's own payload.
    d.final = edited ?? d.draft.payload;
    if (forced === "execution_failed") {
      // Core keeps the decision when execution fails: the draft is "failed", and the Decided list still shows who.
      d.decision = decision;
      d.draft.status = "failed";
      d.draft.updated_at = at;
      d.history.push({ event: verdict, at, by, reason: decision.reason }, { event: "failed", at, by: byRole, decision_id: decision.decision_id });
      refuse(422, "execution_failed");
    }
    const resolved = new Map<string, unknown>(proposed.map((l) => [l.path, cellFor(w, who.m, l.ref)?.value]));
    const final = finalOf(edited ?? d.draft.payload, resolved) as Json;
    const entity = execute(w, d.draft.command_type, final, now, byRole, draftId);
    d.decision = decision;
    d.draft.status = "executed";
    d.draft.updated_at = at;
    d.history.push({ event: verdict, at, by, reason: decision.reason }, { event: "executed", at, by: byRole, decision_id: decision.decision_id });
    emit(w, "inbox.draft", { status: "executed", command_type: d.draft.command_type, outlet_ids: d.draft.outlet_ids, finding_id: d.draft.finding_id, updated_at: at }, { inbox: true });
    return result(cmd, entity, d.draft.command_type);
  });
}

/** Applies an approved draft's final payload, or a person's own purchase order, under that person. Returns the entity
 *  it made. A purchase order gets its audit entry, which GET /v1/lineage reads. */
function execute(w: World, type: string, payload: Json, now: Date, actor: { member_id: string; role: string }, draftId: string | null): string {
  if (type === "cares.listing.publish.v1") return storeListing(w, payload as unknown as S["CaresListingPublishV1"], actor.member_id, now);
  if (type === "purchasing.po.create.v1") {
    const p = payload as unknown as S["PurchasingPoCreateV1"];
    const supplier = seedSuppliers(now).find((s) => s.supplier_id === p.supplier_id)!;
    w.pos.set(p.po_id, {
      po_id: p.po_id, supplier: { supplier_id: supplier.supplier_id, name: supplier.name, kind: supplier.kind, label: supplier.label }, outlet_ids: p.outlet_ids, status: "committed",
      currency: p.currency, total_minor: p.lines.reduce((s, l) => s + Math.round((l.qty_milli * l.unit_price_minor) / 1000), 0), expected_on: p.expected_on, negotiation_run_id: p.negotiation_run_id,
      created_at: now.toISOString(), lines: p.lines.map((l, i) => ({ po_line_id: id7(`po_line:${p.po_id}:${i}`), line_no: i + 1, ingredient_id: l.ingredient_id, qty_milli: l.qty_milli, unit: l.unit, unit_price_minor: l.unit_price_minor })),
    });
    w.poAudits.set(p.po_id, [{ action: "purchasing.po.create.v1", at: now.toISOString(), actor, draftId }]);
    return p.po_id;
  }
  if (type === "kitchen.prep_list.create.v1") return String(payload.prep_list_id);
  return id7(`${type}:${JSON.stringify(payload)}`); // prep_time.set: a new prep-time row
}

function inbox(w: World, m: Me): S["V1InboxResponse"] {
  const items: S["V1InboxResponse"]["items"] = [
    ...[...w.findings.values()].filter((f) => f.status === "open").map((f) => ({ kind: "finding" as const, finding: { ...f, resolved_refs: seen(w, m, f.resolved_refs) } })),
    ...[...w.drafts.values()].filter((d) => d.draft.status === "proposed" && visibleDraft(m, d)).map((d) => ({ kind: "draft" as const, draft: viewOf(w, m, d).draft })),
  ];
  const updated = (i: (typeof items)[number]) => (i.kind === "finding" ? i.finding.updated_at : i.draft.updated_at);
  items.sort((a, b) => updated(b).localeCompare(updated(a)));
  return { items, next_cursor: null };
}

/** GET /v1/lineage for a purchase order, the one table the mock serves: one chain per audit entry, oldest first, with
 *  the decision and draft hops when an approval made it. The finding, run and snapshot hops are left empty here. */
function lineage(w: World, m: Me, table: string, id: string): Response {
  const po = table === "core.purchase_order" ? w.pos.get(id) : undefined;
  const audits = po && po.outlet_ids.some((o) => sees(m, o)) ? (w.poAudits.get(id) ?? []) : [];
  if (audits.length === 0) return notFound();
  const chains = audits.map((a, i) => {
    const d = a.draftId ? w.drafts.get(a.draftId) : undefined;
    const dec = d?.decision ?? null;
    return {
      audit: { seq: i + 1, action: a.action, entity: table, entity_id: id, at: a.at, actor: { member_id: a.actor.member_id, kind: "member", role: a.actor.role }, decision_id: dec?.decision_id ?? null },
      decision: dec ? { decision_id: dec.decision_id, verdict: dec.verdict, reason: dec.reason, reason_code: null, decided_by: dec.decided_by, decided_at: dec.decided_at } : null,
      draft: d ? {
        draft_id: d.draft.draft_id, command_type: d.draft.command_type, source: d.draft.source, outlet_ids: d.draft.outlet_ids, created_at: d.draft.created_at,
        outcome: { status: d.draft.status, reason: null, reason_code: null, changes: [], sqlstate: null, failure_reason: null },
      } : null,
      finding: null, run: null, snapshots: [], unverified_refs: [],
    };
  });
  return staffJson(200, { row: { table, id }, chains } satisfies S["V1LineageRow"]);
}

// ---------------------------------------------------------------- snapshots
function mint(w: World, who: Who, body: unknown, now: Date): Response {
  const b = body as S["V1SnapshotsRequest"] | null;
  const template = b?.template_id ?? "";
  const cols = TEMPLATE_COLUMNS[template];
  if (!cols || RANK[who.m.role]! < RANK[TEMPLATE_MIN_ROLE[template]!]!) return notFound();
  const params = b?.params ?? {};
  const required: Record<string, string[]> = {
    "kitchen.ticket_coverage": ["outlet_id", "from", "to"], "people.labour_pct": ["outlet_id", "from", "to"], "cares.impact": ["outlet_id", "from", "to"],
    "inventory.waste_week": ["outlet_id", "week_start"], "inventory.below_reorder": [], "purchasing.quote_compare": ["negotiation_run_id"],
    "inventory.expiry_risk": ["outlet_id", "days", "as_of"], "cares.recipient_match": ["outlet_id", "needs_cooked", "needs_raw", "needs_packaged", "qty_milli", "unit", "expires_on"],
  };
  if (!required[template]) return notFound(); // run-minted only on the mock (03 §2)
  const keys = Object.keys(params);
  if (keys.some((k) => !required[template]!.includes(k)) || required[template]!.some((k) => !(k in params))) refuse(422, "invalid_payload");
  if (typeof params.outlet_id === "string" && !sees(who.m, params.outlet_id)) refuse(403, "forbidden");
  const rows = mintRows(template, params, w.orders, [...w.listings.values()], now)!;
  const scope = typeof params.outlet_id === "string" ? [params.outlet_id] : who.m.outlet_ids === "*" ? ["*"] : who.m.outlet_ids;
  const s = snapshotOf(id7(`snap:minted:${w.snapshots.size}:${now.getTime()}`), template, params, cols, rows, { member: who.m.member_id }, scope as S["Snapshot"]["outlet_scope"], now.toISOString());
  w.snapshots.set(s.snapshot_id, s);
  return staffJson(201, s);
}
/** core's visibleTo: the template's role or above, and a scope inside the person's (one of every outlet, "*", opens only
 *  for someone with every outlet). Every value beside a ref is read through this. */
function canOpen(m: Me, s: S["Snapshot"]): boolean {
  if (RANK[m.role]! < RANK[TEMPLATE_MIN_ROLE[s.template_id] ?? "owner"]!) return false;
  const scope = s.outlet_scope as string[];
  return m.outlet_ids === "*" || (!scope.includes("*") && scope.every((o) => sees(m, o)));
}
function openSnapshot(w: World, who: Who, id: string): Response {
  const s = w.snapshots.get(id);
  return s && canOpen(who.m, s) ? staffJson(200, s) : notFound();
}

// ---------------------------------------------------------------- Ask
/** core's answerViews: a ref resolves only for a viewer who may open its snapshot. Every template these answers cite
 *  is manager and up, so a staff member's answers carry no values ("Cannot verify" on screen). */
const forViewer = (w: World, m: Me, a: S["V1AskResponse"]["answer"]): S["V1AskResponse"]["answer"] => ({ ...a, resolved_refs: seen(w, m, a.resolved_refs) });
/** core lists a thread to anyone whose outlet scope covers the thread's, not only to the member who started it; a
 *  thread scoped to every outlet only to an owner, advisor or judge with every outlet. */
const seesThread = (m: Me, t: S["V1Thread"]) =>
  t.outlet_scope[0] === "*" ? m.outlet_ids === "*" && ["owner", "advisor", "judge"].includes(m.role) : (t.outlet_scope as string[]).every((o) => sees(m, o));
function ask(w: World, who: Who, body: unknown, req: Request, now: Date): Response {
  const b = body as S["V1AskRequest"] | null;
  const question = typeof b?.question === "string" ? b.question.trim() : "";
  if (question.length < 1 || question.length > 2000 || (b?.thread_id !== undefined && !UUID7.test(b.thread_id))) return fail(400, "bad_request");
  const forced = req.headers.get("X-Mock-Force-Ai");
  if (forced === "off") return fail(503, "unavailable");
  const existing = b?.thread_id ? w.threads.get(b.thread_id) : undefined;
  // As core (row-level security on threads): a thread outside the person's scope is 404, like an unknown one.
  if (b?.thread_id && (!existing || !seesThread(who.m, existing))) return notFound();
  const addressed = addressedTo(question) ?? existing?.specialist ?? null;
  const answerId = id7(`answer:${now.getTime()}:${w.threads.size}`);
  const answer = forced === "abstain"
    ? { answer_id: answerId, signature: { key: "answer.signature.manager" as const, specialist: "manager" as const, name_key: "specialist.manager.name" }, envelope: { answer_id: answerId, abstained: true, reason_code: "model_blocked" as const, follow_up: null, segments: [] }, resolved_refs: [] }
    : answerFor(question, addressed, answerId, now);
  const thread: S["V1Thread"] = existing ?? { thread_id: id7(`thread:${now.getTime()}`), specialist: addressedTo(question), created_by: who.m.member_id, outlet_scope: who.m.outlet_ids === "*" ? ["*"] : who.m.outlet_ids, created_at: now.toISOString(), updated_at: now.toISOString(), summary: [], turns: [] };
  const turn = { turn_id: id7(`turn:${answerId}`), turn_no: thread.turns.length + 1, member_id: who.m.member_id, addressed_to: addressed, tainted: false, question, answer, created_at: now.toISOString() };
  thread.turns.push(turn);
  thread.updated_at = now.toISOString();
  w.threads.set(thread.thread_id, thread);
  return staffJson(200, { thread_id: thread.thread_id, turn: { turn_id: turn.turn_id, turn_no: turn.turn_no, addressed_to: addressed, tainted: false }, answer: forViewer(w, who.m, answer) } satisfies S["V1AskResponse"]);
}

// ---------------------------------------------------------------- Cares and purchasing
/** A donation as core's cares.listing.publish.v1 checks it (a person's own command or an approved draft; published_by is
 *  that person). Like core, a recipient that cannot take the food and a pickup already over are 422 with a reason. */
function storeListing(w: World, p: S["CaresListingPublishV1"], by: string, now: Date): string {
  if (p.kind === "offer") refuse(409, "conflict", "offer_not_enabled");
  const r = RECIPIENTS.items.find((x) => x.recipient_id === p.recipient_id);
  const accepts = (k: string) => (k === "cooked" ? r?.accepts_cooked : k === "raw" ? r?.accepts_raw : r?.accepts_packaged);
  if (Date.parse(p.pickup_to) <= now.getTime()) refuse(422, "invalid_payload", "listing_expired");
  if (!r || p.lines.some((l) => !accepts(l.food_kind) || l.unit_price_minor !== null)) refuse(422, "invalid_payload", "recipient_ineligible");
  w.listings.set(p.listing_id, {
    listing_id: p.listing_id, outlet_id: p.outlet_id, kind: p.kind, status: "published", recipient_id: p.recipient_id, pickup_from: p.pickup_from, pickup_to: p.pickup_to,
    pickup_on: businessDate(new Date(p.pickup_from)), published_by: by, published_at: now.toISOString(),
    lines: p.lines.map((l, i) => ({ line_id: l.line_id, line_no: i + 1, food_kind: l.food_kind, item_id: l.item_id, ingredient_id: l.ingredient_id, batch_id: l.batch_id, qty_milli: l.qty_milli, unit: l.unit, expires_on: l.expires_on, unit_price_minor: null, currency: null })),
    handovers: [], ...{ labels: CARES_PROFILE.labels, note_key: CARES_PROFILE.note_key },
  });
  return p.listing_id;
}
function publishListing(w: World, who: Who, body: unknown, now: Date): Response {
  const cmd = envelopeOf<S["CaresListingPublishV1"]>(body, "cares.listing.publish.v1");
  const p = cmd.payload;
  allow(who.m, ["owner", "judge"], "book_write_refused");
  if (!outletById(p.outlet_id) || !sees(who.m, p.outlet_id)) return notFound();
  if (!Array.isArray(p.lines) || p.lines.length === 0 || p.lines.some((l) => !UUID7.test(l.line_id) || (l.item_id === null) === (l.ingredient_id === null) || (l.food_kind === "cooked" && l.unit !== "portion"))) refuse(422, "invalid_payload");
  return once(w, who, cmd, 200, () => result(cmd, storeListing(w, p, who.m.member_id, now)));
}
function withdrawListing(w: World, who: Who, id: string, body: unknown): Response {
  const cmd = envelopeOf<S["CaresListingWithdrawV1"]>(body, "cares.listing.withdraw.v1");
  if (cmd.payload.listing_id !== id) refuse(422, "invalid_payload");
  allow(who.m, ["owner", "manager", "judge"], "book_write_refused");
  const l = w.listings.get(id);
  if (!l || !sees(who.m, l.outlet_id)) return notFound();
  return once(w, who, cmd, 200, () => {
    if (l.status !== "published") refuse(409, "illegal_transition");
    l.status = "withdrawn";
    return result(cmd, id);
  });
}
function recordHandover(w: World, who: Who, body: unknown, now: Date): Response {
  const cmd = envelopeOf<S["CaresHandoverRecordV1"]>(body, "cares.handover.record.v1");
  const p = cmd.payload;
  allow(who.m, ["owner", "manager", "staff", "judge"], "book_write_refused");
  const l = w.listings.get(p.listing_id);
  if (!l || !sees(who.m, l.outlet_id)) return notFound();
  return once(w, who, cmd, 200, () => {
    if (l.status !== "published") refuse(409, "illegal_transition");
    const given = (lineId: string) => l.handovers.filter((h) => h.status === "recorded").reduce((s, h) => s + (h.lines.find((x) => x.listing_line_id === lineId)?.qty_milli ?? 0), 0);
    for (const x of p.lines) {
      const line = l.lines.find((y) => y.line_id === x.listing_line_id);
      if (!line) refuse(422, "invalid_payload");
      if (given(x.listing_line_id) + x.qty_milli > line!.qty_milli) refuse(409, "conflict", "qty_exceeds_listed");
    }
    l.handovers.push({ handover_id: p.handover_id, allocation_id: null, status: "recorded", handed_at: now.toISOString(), recorded_by: who.m.member_id, voided_by: null, void_reason_code: null, lines: p.lines });
    if (l.lines.every((y) => given(y.line_id) >= y.qty_milli)) l.status = "closed";
    return result(cmd, p.handover_id);
  });
}
/** A person's own purchase order. Core's book guard refuses a role or outlet that may not write it (403
 *  book_write_refused); an unknown or inactive supplier is 400, as core's handler answers. */
function createPo(w: World, who: Who, body: unknown, now: Date): Response {
  const cmd = envelopeOf<S["PurchasingPoCreateV1"]>(body, "purchasing.po.create.v1");
  const p = cmd.payload;
  allow(who.m, DECIDE_ROLES, "book_write_refused");
  if (!Array.isArray(p.outlet_ids) || p.outlet_ids.length === 0 || !Array.isArray(p.lines) || p.lines.length === 0) refuse(422, "invalid_payload");
  if (!p.outlet_ids.every((o) => sees(who.m, o))) refuse(403, "book_write_refused", "authority_denied");
  if (!seedSuppliers(now).some((s) => s.supplier_id === p.supplier_id && s.active)) refuse(400, "bad_request");
  return once(w, who, cmd, 201, () => result(cmd, execute(w, "purchasing.po.create.v1", p as unknown as Json, now, { member_id: who.m.member_id, role: who.m.role }, null)));
}

/** Goods in, as core's purchasing.grn.receive.v1: a batch for batch-tracked stock and none for the rest (400), a null cost
 *  takes the PO line's price, a PO that is not committed is 409, and the PO turns received once every line has come in
 *  (only for someone who sees all its outlets). Stock levels are not modelled. */
function receiveGoods(w: World, who: Who, body: unknown, now: Date): Response {
  const cmd = envelopeOf<S["PurchasingGrnReceiveV1"]>(body, "purchasing.grn.receive.v1");
  const p = cmd.payload;
  if (!UUID7.test(p.grn_id) || !Array.isArray(p.lines) || p.lines.length === 0) refuse(422, "invalid_payload");
  allow(who.m, ORDER_ROLES, "book_write_refused");
  if (!sees(who.m, p.outlet_id)) refuse(403, "book_write_refused", "authority_denied");
  return once(w, who, cmd, 201, () => {
    const supplier = seedSuppliers(now).find((s) => s.supplier_id === p.supplier_id);
    if (!supplier) refuse(400, "bad_request");
    const po = p.po_id ? w.pos.get(p.po_id) : undefined;
    if (p.po_id && (!po || po.supplier.supplier_id !== p.supplier_id || !po.outlet_ids.includes(p.outlet_id))) refuse(400, "bad_request");
    if (po && po.status !== "committed") refuse(409, "conflict");
    const lines = p.lines.map((l) => {
      const ing = INGREDIENTS.items.find((i) => i.ingredient_id === l.ingredient_id);
      if (!ing || ing.tracked_by_batch !== (l.batch !== null)) refuse(400, "bad_request");
      const pl = l.po_line_id ? po?.lines.find((x) => x.po_line_id === l.po_line_id) : undefined;
      if (l.po_line_id && (!pl || pl.ingredient_id !== l.ingredient_id)) refuse(400, "bad_request");
      const cost = l.unit_cost_minor ?? pl?.unit_price_minor ?? null;
      if (cost === null) refuse(400, "bad_request");
      return { grn_line_id: l.grn_line_id, po_line_id: l.po_line_id, ingredient_id: l.ingredient_id, batch_id: l.batch?.batch_id ?? null, qty_milli: l.qty_milli, unit: l.unit, unit_cost_minor: cost!, currency: l.currency };
    });
    w.grns.set(p.grn_id, {
      grn_id: p.grn_id, outlet_id: p.outlet_id, supplier: { supplier_id: supplier!.supplier_id, name: supplier!.name, kind: supplier!.kind, label: supplier!.label },
      po_id: p.po_id, received_at: p.received_at ?? now.toISOString(), received_by: who.m.member_id, note: p.note, lines,
    });
    if (po) {
      const got = (lineId: string) => [...w.grns.values()].flatMap((g) => g.lines).filter((g) => g.po_line_id === lineId).reduce((s, g) => s + g.qty_milli, 0);
      if (po.lines.every((l) => got(l.po_line_id) >= l.qty_milli) && seesAll(who.m, po.outlet_ids)) {
        po.status = "received";
        w.poAudits.get(po.po_id)?.push({ action: "purchasing.grn.receive.v1", at: now.toISOString(), actor: { member_id: who.m.member_id, role: who.m.role }, draftId: null });
      }
    }
    return result(cmd, p.grn_id);
  });
}

// ---------------------------------------------------------------- live updates
function stream(w: World, who: Who, url: URL, req: Request): Response {
  const topics = (url.searchParams.get("topics") ?? "").split(",").filter(Boolean);
  // As core: no topics, more than ten, a malformed one or a second inbox: is 400; a well-formed one that is not this
  // person's is 404 below.
  const TOPIC = /^(kds|inbox|trace|order):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (topics.length === 0 || topics.length > 10 || topics.some((t) => !TOPIC.test(t)) || topics.filter((t) => t.startsWith("inbox:")).length > 1) return fail(400, "bad_request");
  for (const t of topics) {
    const [kind, id] = t.split(":");
    const ok = kind === "kds" ? !!id && !!outletById(id) && sees(who.m, id)
      : kind === "order" ? !!id && w.orders.has(id) && sees(who.m, w.orders.get(id)!.order.outlet_id)
      : kind === "inbox" ? id === DEMO_TENANT_ID && (who.m.role === "owner" || who.m.role === "manager")
      : false;
    if (!ok) return notFound(); // any topic this person may not read refuses the whole request, never a 403
  }
  const wants = (e: LiveEvent) => topics.some((t) => {
    const [kind, id] = t.split(":");
    return (kind === "kds" && e.outletId === id) || (kind === "order" && e.orderId === id) || (kind === "inbox" && e.inbox);
  });
  const last = /^o=(\d+)$/.exec(req.headers.get("Last-Event-ID") ?? "");
  let cursor = last ? Number(last[1]) : w.events.length;
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(ctl) {
      const opened = Date.now();
      let beat = opened;
      const send = (s: string) => ctl.enqueue(enc.encode(s));
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = undefined;
        try {
          ctl.close();
        } catch {
          // already closed by the client
        }
      };
      send(`retry: 1000\nid: o=${cursor}\nevent: ready\ndata: {}\n\n`);
      const tick = () => {
        while (cursor < w.events.length) {
          const e = w.events[cursor]!;
          cursor++;
          if (wants(e)) send(`id: o=${cursor}\ndata: ${JSON.stringify(e.body)}\n\n`);
        }
        if (Date.now() - beat >= 20_000) {
          send(": hb\n\n");
          beat = Date.now();
        }
        if (Date.now() - opened >= 50_000) {
          send(`event: reconnect\ndata: {"reason":"max_age"}\n\n`);
          stop();
        }
      };
      timer = setInterval(tick, 500);
      req.signal.addEventListener("abort", stop, { once: true });
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "X-Munim-Mock": "true" } });
}

/** Mock only: a synthetic web order at the outlet, so the kitchen gets a pickup ticket (03 §2). */
function webOrder(w: World, who: Who, body: unknown, now: Date): Response {
  const outletId = (body as { outlet_id?: string } | null)?.outlet_id ?? "";
  if (!outletById(outletId) || !sees(who.m, outletId)) return notFound();
  const n = w.orders.size;
  const picks = [ITEMS.find((i) => i.slug === "hazelnut_croissant")!, ITEMS.find((i) => i.slug === "cold_coffee")!];
  const orderId = id7(`order:web:${n}:${now.getTime()}`);
  const ticketNo = (w.ticketNo.get(outletId) ?? 0) + 1;
  const { placed } = buildOrder({
    orderId, outletId, ticketNo, channelId: CHANNEL_ID, deviceId: null, invoiceNo: null, kind: "pickup", tableRef: null, status: "placed", createdAt: now.toISOString(),
    promisedAt: new Date(now.getTime() + PREP_MIN * 60_000).toISOString(),
    lines: [
      { line_id: id7(`line:web:${orderId}:0`), item_id: itemId(picks[0]!.slug), variant_id: null, option_ids: [], qty_milli: 2000, note: null },
      { line_id: id7(`line:web:${orderId}:1`), item_id: itemId(picks[1]!.slug), variant_id: null, option_ids: [id7(`option:${picks[1]!.slug}:milk:oat`)], qty_milli: 1000, note: "Less ice, please" },
    ],
  }, now);
  w.ticketNo.set(outletId, ticketNo);
  w.orders.set(orderId, placed);
  emit(w, "munim.orders.order.placed.v1", { order_id: orderId, outlet_id: outletId, channel_id: CHANNEL_ID, status: "placed", placed_at: now.toISOString() }, { outletId, orderId });
  for (const t of placed.tickets) emit(w, "munim.kitchen.ticket.created.v1", { ticket_id: t.ticket_id, order_id: orderId, outlet_id: outletId, station: t.station, status: t.status }, { outletId, orderId });
  return staffJson(201, { order_id: orderId, ticket_no: ticketNo, by: who.m.member_id });
}

// ---------------------------------------------------------------- routing
/** True for a request the member half answers: every /v1 path except the storefront's, the public Cares pages,
 *  and a guest's stream (which sends no Authorization). */
export const isStaffRequest = (req: Request, path: string): boolean =>
  !path.startsWith("/v1/storefront/") && !path.startsWith("/v1/cares-network/") && (path !== "/v1/stream" || req.headers.has("Authorization"));

export async function handleStaff(req: Request, path: string, url: URL, now: Date): Promise<Response> {
  try {
    if (path === "/v1/me/tenants") {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
      const found = MEMBERS.find((x) => x.token === token);
      if (!found) return fail(401, "unauthenticated");
      return staffJson(200, { tenants: [{ tenant_id: DEMO_TENANT_ID, tenant_name: TENANT.name, role: found.me.role }] } satisfies S["TenancyMeTenants"]);
    }
    const who = member(req);
    const w = books(now);
    const m = who.m;
    const q = (k: string) => url.searchParams.get(k);
    const x = (re: RegExp) => re.exec(path);
    let body: unknown = undefined;
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        return fail(400, "bad_request");
      }
    }

    if (req.method === "GET") {
      if (path === "/v1/me") return staffJson(200, m);
      if (path === "/v1/tenant") return staffJson(200, TENANT);
      // Like core today: every outlet of the business, whatever the person's scope (screens filter by GET /v1/me).
      if (path === "/v1/outlets") return staffJson(200, MEMBER_OUTLETS);
      if (path === "/v1/channels") return staffJson(200, CHANNELS);
      // Devices are outlet-scoped in core (row-level security on core.device): the person's outlets only.
      if (path === "/v1/devices") return staffJson(200, { devices: DEVICES.devices.filter((d) => sees(m, d.outlet_id)) } satisfies S["V1Devices"]);
      if (path === "/v1/catalogue/menu") {
        const outlet = q("outlet") ?? "", kind = q("channel_kind");
        if (!kind || !UUID7.test(outlet)) return fail(400, "bad_request");
        if (!outletById(outlet) || !sees(m, outlet)) return notFound();
        return staffJson(200, menuFor(outlet, kind, now));
      }
      if (path === "/v1/orders") {
        const outlet = q("outlet"), status = q("status"), date = q("business_date");
        if (outlet && !sees(m, outlet)) return notFound();
        const items = [...w.orders.values()].map((p) => p.order).filter((o) => sees(m, o.outlet_id) && (!outlet || o.outlet_id === outlet) && (!status || o.status === status) && (!date || o.business_date === date));
        items.sort((a, b) => b.created_at.localeCompare(a.created_at));
        return staffJson(200, { items: items.map(orderListItem), next_cursor: null } satisfies S["V1OrdersList"]);
      }
      let r = x(/^\/v1\/orders\/([^/:]+)$/);
      if (r) {
        const p = w.orders.get(r[1]!);
        return p && sees(m, p.order.outlet_id) ? staffJson(200, p.order) : notFound();
      }
      r = x(/^\/v1\/orders\/([^/:]+)\/receipt$/);
      if (r) {
        const p = w.orders.get(r[1]!);
        if (!p || !sees(m, p.order.outlet_id)) return notFound();
        const receipt = receiptOf(p.order);
        return receipt ? staffJson(200, receipt) : fail(409, "conflict", "tax_id_missing");
      }
      if (path === "/v1/kitchen/board") {
        const outlet = q("outlet") ?? "";
        if (!UUID7.test(outlet)) return fail(400, "bad_request");
        if (!outletById(outlet) || !sees(m, outlet)) return notFound();
        return staffJson(200, boardOf(outlet, q("station"), w.orders, now));
      }
      if (path === "/v1/inbox") return staffJson(200, inbox(w, m));
      if (path === "/v1/drafts") {
        const status = q("status") ?? "proposed";
        const outlet = q("outlet");
        const items = [...w.drafts.values()]
          .filter((d) => visibleDraft(m, d) && (!outlet || d.draft.outlet_ids.includes(outlet)) && (status === "decided" ? d.decision !== null : d.draft.status === status))
          .sort((a, b) => b.draft.updated_at.localeCompare(a.draft.updated_at))
          .map((d) => {
            const v = detailOf(w, m, d);
            return { draft: v.draft, decision: v.decision, unverified_refs: v.unverified_refs };
          });
        return staffJson(200, { items, has_more: false, next_cursor: null } satisfies S["V1DraftsResponse"]);
      }
      r = x(/^\/v1\/drafts\/([^/:]+)$/);
      if (r) {
        const d = w.drafts.get(r[1]!);
        return d && visibleDraft(m, d) ? staffJson(200, detailOf(w, m, d)) : notFound();
      }
      r = x(/^\/v1\/snapshots\/([^/:]+)$/);
      if (r) return openSnapshot(w, who, r[1]!);
      if (path === "/v1/threads") {
        const items = [...w.threads.values()].filter((t) => seesThread(m, t))
          .map((t) => ({ thread_id: t.thread_id, specialist: t.specialist, created_by: t.created_by, outlet_scope: t.outlet_scope, created_at: t.created_at, updated_at: t.updated_at }));
        return staffJson(200, { items, next_cursor: null } satisfies S["V1ThreadsResponse"]);
      }
      r = x(/^\/v1\/threads\/([^/:]+)$/);
      if (r) {
        const t = w.threads.get(r[1]!);
        return t && seesThread(m, t) ? staffJson(200, { ...t, turns: t.turns.map((x) => ({ ...x, answer: x.answer && forViewer(w, m, x.answer) })) }) : notFound();
      }
      if (path === "/v1/specialists") return staffJson(200, SPECIALISTS);
      if (path === "/v1/cares/profile") return staffJson(200, CARES_PROFILE);
      if (path === "/v1/cares/recipients") {
        const outlet = q("outlet");
        if (!outlet) return fail(400, "bad_request");
        return outletById(outlet) && sees(m, outlet) ? staffJson(200, RECIPIENTS) : notFound();
      }
      if (path === "/v1/cares/listings") {
        const outlet = q("outlet"), status = q("status"), kind = q("kind");
        if (outlet && !sees(m, outlet)) return notFound();
        const items = [...w.listings.values()].filter((l) => sees(m, l.outlet_id) && (!outlet || l.outlet_id === outlet) && (!status || l.status === status) && (!kind || l.kind === kind));
        items.sort((a, b) => b.published_at.localeCompare(a.published_at));
        const views = items.map((l) => ({
          listing_id: l.listing_id, outlet_id: l.outlet_id, kind: l.kind, status: l.status, recipient_id: l.recipient_id, pickup_from: l.pickup_from, pickup_to: l.pickup_to,
          pickup_on: l.pickup_on, published_by: l.published_by, published_at: l.published_at, lines: l.lines, handovers: l.handovers,
        }));
        return staffJson(200, { items: views, next_cursor: null, labels: CARES_PROFILE.labels, note_key: CARES_PROFILE.note_key } satisfies S["V1CaresListings"]);
      }
      r = x(/^\/v1\/cares\/listings\/([^/:]+)$/);
      if (r) {
        const l = w.listings.get(r[1]!);
        return l && sees(m, l.outlet_id) ? staffJson(200, l) : notFound();
      }
      if (path === "/v1/suppliers") return staffJson(200, { items: seedSuppliers(now).map((s) => (m.role === "staff" ? { ...s, prices: [] } : s)) } satisfies S["V1Suppliers"]);
      r = x(/^\/v1\/suppliers\/([^/:]+)$/);
      if (r) {
        const s = seedSuppliers(now).find((y) => y.supplier_id === r![1]);
        return s ? staffJson(200, m.role === "staff" ? { ...s, prices: [] } : s) : notFound();
      }
      if (path === "/v1/purchase-orders") return staffJson(200, { items: [...w.pos.values()].filter((p) => p.outlet_ids.some((o) => sees(m, o))) } satisfies S["V1PurchaseOrders"]);
      r = x(/^\/v1\/purchase-orders\/([^/:]+)$/);
      if (r) {
        const p = w.pos.get(r[1]!);
        return p && p.outlet_ids.some((o) => sees(m, o)) ? staffJson(200, p) : notFound();
      }
      if (path === "/v1/inventory/ingredients") return staffJson(200, INGREDIENTS);
      if (path === "/v1/goods-received") {
        const items = [...w.grns.values()].filter((g) => sees(m, g.outlet_id)).sort((a, b) => b.received_at.localeCompare(a.received_at));
        return staffJson(200, { items } satisfies S["V1GoodsReceivedList"]);
      }
      r = x(/^\/v1\/goods-received\/([^/:]+)$/);
      if (r) {
        const g = w.grns.get(r[1]!);
        return g && sees(m, g.outlet_id) ? staffJson(200, g) : notFound();
      }
      if (path === "/v1/inventory/reorder-levels") {
        const outlet = q("outlet");
        if (!outlet) return fail(400, "bad_request");
        return outletById(outlet) && sees(m, outlet) ? staffJson(200, reorderLevels(outlet, now)) : notFound();
      }
      if (path === "/v1/lineage") {
        const row = /^(core|intel)\.([a-z][a-z0-9_]*):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(q("row") ?? "");
        return row ? lineage(w, m, `${row[1]}.${row[2]}`, row[3]!) : fail(400, "bad_request");
      }
      if (path === "/v1/stream") return stream(w, who, url, req);
      return notFound();
    }

    if (req.method === "POST") {
      if (path === "/v1/orders:preview") return preview(body, who, now);
      if (path === "/v1/orders") return placeOrder(w, who, body, now);
      let r = x(/^\/v1\/orders\/([^/:]+):(accept|reject|advance)$/);
      if (r) return orderCommand(w, who, r[1]!, r[2]!, body);
      r = x(/^\/v1\/orders\/([^/:]+)\/tenders$/);
      if (r) return tender(w, who, r[1]!, body, now);
      r = x(/^\/v1\/kitchen\/tickets\/([^/:]+):advance$/);
      if (r) return advanceTicket(w, who, r[1]!, body, now);
      r = x(/^\/v1\/drafts\/([^/:]+):(approve|reject)$/);
      if (r) return decide(w, who, r[1]!, r[2] as "approve" | "reject", body, req, now);
      r = x(/^\/v1\/findings\/([^/:]+):dismiss$/);
      if (r) {
        const cmd = envelopeOf<S["FindingsDismissV1"]>(body, "findings.dismiss.v1");
        if (cmd.payload.finding_id !== r[1]) refuse(422, "invalid_payload");
        // core's order: 404, then 403, then 409 (findings/dismiss.ts).
        const f = w.findings.get(r[1]!);
        if (!f) return notFound();
        if (m.role === "staff") refuse(403, "forbidden", "authority_denied");
        return once(w, who, cmd, 200, () => {
          if (f.status !== "open") refuse(409, "conflict");
          f.status = "dismissed";
          f.updated_at = now.toISOString();
          emit(w, "inbox.finding", { status: "dismissed", pack: f.pack, type: f.type, severity: f.severity, outlet_ids: [], updated_at: f.updated_at }, { inbox: true });
          return result(cmd, f.finding_id);
        });
      }
      if (path === "/v1/snapshots") return mint(w, who, body, now);
      if (path === "/v1/ask") return ask(w, who, body, req, now);
      if (path === "/v1/cares/listings") return publishListing(w, who, body, now);
      r = x(/^\/v1\/cares\/listings\/([^/:]+):withdraw$/);
      if (r) return withdrawListing(w, who, r[1]!, body);
      if (path === "/v1/cares/handovers") return recordHandover(w, who, body, now);
      if (path === "/v1/purchase-orders") return createPo(w, who, body, now);
      if (path === "/v1/goods-received") return receiveGoods(w, who, body, now);
      if (path === "/v1/_mock/web-order") return webOrder(w, who, body, now);
      return notFound();
    }
    return notFound();
  } catch (e) {
    if (e instanceof Refuse) return e.res;
    if (e instanceof BadRequest) return fail(422, "invalid_payload");
    return fail(500, "internal");
  }
}

/** For tests: forget this instance's books (the next request re-seeds them). */
export const resetStaffBooks = () => {
  world = null;
};
export { COUNTER_CHANNEL_ID, posDevice };
```

## 9 · Three edits to `mock-server/handler.ts`

```ts
// 1. imports: add
import { handleStaff, isStaffRequest } from "./staff";

// 2. CORS: allow the member and mock headers (the mock is same-origin; this only matters if you call it from elsewhere)
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Munim-Tenant, X-Munim-Storefront-Key, X-Munim-Guest-Token, Last-Event-ID, X-Mock-Force-Accepting, X-Mock-Force-429, X-Mock-Force-Decision, X-Mock-Force-Ai",

// 3. in handle(), right after the OPTIONS line and the `const m = …` helper, before the network-impact line:
  // Member (staff) routes: Authorization + X-Munim-Tenant instead of the storefront key (mock-server/staff.ts).
  if (isStaffRequest(req, path)) {
    if (req.headers.get("X-Mock-Force-429") === "1") return error(429, "unavailable", "rate_limited", undefined, { "Retry-After": "5" });
    const res = await handleStaff(req, path, url, now);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  }

// and in GET /v1/storefront/outlets: the outlets are restaurants (the kitchen display needs it, and the real seed
// will say the same)
          outlets: OUTLETS.map((o) => ({ outlet_id: o.outlet_id, name: o.name, kind: "restaurant", tz: TZ, address: o.address, phone: o.phone, tax_ids: o.tax_ids })),
```

After the edits both smoke tests pass against `npm run dev`: `npm run smoke` ("smoke: all ok") and
`npm run staff-smoke` ("staff smoke: all ok").
