# 00 · Read me first: Cobnut's staff screens on Munim

**Munim** is an operating system for restaurant groups and small shops. Its core keeps the books (orders, menus,
prices, stock, payments recorded at the counter) and exposes an HTTP API. Its AI ("Munim Intelligence") explains what
happened, finds money leaks and drafts changes; a named person approves every change, and every number the AI shows
traces to a row of the books. You already built Cobnut Bakehouse's storefront on it. Now you build the screens the
bakery's own people use, **in the same repo, with the same look**, against **your own mock** extended with the member
API, so that later only env vars change (once the founder settles how a browser reaches the real member API: §7,
question 1).

## 1 · What you are building

Cobnut Bakehouse (synthetic): two outlets in Lucknow, Cobnut Hazratganj and Cobnut Gomti Nagar, both kind
`restaurant`. Four screen groups, six screen files (they follow this pack):

| Screen file | Screens | Routes (all under `/staff`, same app) | Who uses it |
|---|---|---|---|
| `10-counter.md` | The till: tiles, cart rail, preview, place, record payment, today's orders | `/staff/counter`, `/staff/counter/orders/[orderId]` | Counter staff, owner |
| `11-kitchen.md` | The kitchen display: live tickets by lane and station, one-tap steps | `/staff/kitchen` | Kitchen staff, owner |
| `12-owner-home.md` | Owner home (traced figures, what needs you) and the approvals inbox | `/staff/home`, `/staff/inbox`, `/staff/inbox/[draftId]` | Owner (and managers) |
| `13-ask-munim.md` | Ask Munim: a question, an answer whose every number has a source chip, or "Cannot verify" | `/staff/ask`, `/staff/ask/[threadId]` | Owner, anyone signed in |
| `14-cares.md` | Munim Cares: list surplus food, a simulated recipient, hand-over, impact | `/staff/cares` | Owner (staff record hand-overs) |
| `15-suppliers.md` | Suppliers: low stock, simulated supplier quotes, a purchase order (own, or an AI draft approved) | `/staff/suppliers`, `/staff/suppliers/[supplierId]`, `/staff/purchase-orders/[poId]` | Owner (and managers) |

Plus the shared pieces this pack defines: the staff shell, the "Demo sign-in" page (`/staff/sign-in`), the
source chip and snapshot drawer, the draft card fields and the one decision bar, the kitchen ticket, the till tiles
(02); the staff client, refs, the one module that decides every AI draft, live updates, session and copy (01); the
mock's member routes and seed (03).

Files 10–15 print every component and page, each as a `// file:` block to save at its path.

Reuse Cobnut's tokens, fonts and components everywhere (02 §1). The storefront keeps working unchanged.

## 2 · Read in this order

| File | What it gives you |
|---|---|
| `00-README.md` | This page: setup, done, hand-back, answers to your questions |
| `20-rules.md` | The rules: event rules, demo labels, the One Guarantee as UI rules, credentials, writes. Read before code |
| `01-api-client.md` | The SDK bump, the staff client, commands, refs, live updates, session, copy, the staff smoke |
| `02-design.md` | Cobnut's look for staff: new tokens, shell, chips, drawer, draft card, ticket, till, states |
| `03-mock-backend.md` | Your mock's member routes, the seed, the rules copied from core, mock controls |
| one of `10`–`15` | Every screen, state, string, API call and acceptance check for that group |

With an AI coding assistant: give it 00, 20, 01, 02, 03 and one screen file, and build one group at a time.

**Shared code.** A file printed in more than one place is byte-identical everywhere: save it once.
`components/staff/simulate.tsx` is printed in 10 and 11, `components/staff/use-command.ts` in 14 and 15. One file
comes from 12 and is needed by later groups: `lib/munim/template-words.ts` (the drawer's words; 13, 14 and 15 use it).
Every AI draft, on any screen, is decided through one module and one bar: `lib/munim/drafts.ts` (01 §6.1) and
`components/staff/decision.tsx` (02 §5).

## 3 · Setup

1. Switch the SDK to the new file (01 §1):
   ```bash
   npm install https://munim-rho.vercel.app/downloads/munim-sdk-0.2.0.tgz
   ```
   Check the downloaded file's sha256 before you commit the lockfile:
   `d0a16db604e03ac40fb6f17c82aa8cf5c3adf4d3a47a4a194ef5cd57a3dfb2d3` (its `package.json` says `0.2.0`). The old
   `munim-sdk.tgz` stays byte-identical, so nothing breaks before you switch.
2. Make `settle` public in `lib/munim/client.ts` (01 §3), and save every `// file:` block of 01 at its path.
3. Extend the mock: save `mock-server/staff-data.ts` and `mock-server/staff.ts`, make the three edits to
   `mock-server/handler.ts` (03 §9).
4. Env vars: **none new.** The staff screens use the same `NEXT_PUBLIC_MUNIM_API=/mock` and
   `NEXT_PUBLIC_MUNIM_MOCK_CONTROLS=1` as the storefront.
5. `npm run dev`, then both smokes, and see both pass before any staff UI:
   ```bash
   NEXT_PUBLIC_MUNIM_API=http://localhost:3000/mock NEXT_PUBLIC_MUNIM_STOREFRONT_KEY=sfk_mock_cobnut_bakehouse_5b1e7d40 npm run smoke
   NEXT_PUBLIC_MUNIM_API=http://localhost:3000/mock npm run staff-smoke
   ```
   They print "smoke: all ok" and "staff smoke: all ok". The staff smoke writes to the API it is pointed at (a counter
   order, a recorded card payment, the order handed over), so run it only against the mock or a local development
   copy of the API, never against a shared deployment.
6. Save 02's CSS and components, do the route-group move (02 §3), then open `/staff/sign-in` and use the **"Demo
   sign-in"** picker: "Nandini Mehrotra (demo)" (owner, both outlets), "Imran Siddiqui (demo)" (counter, Hazratganj),
   "Kavya Tandon (demo)" (kitchen, Hazratganj). The people are invented; their mock tokens are public test values (03
   §1).

**Later, the real API.** The founder sends the API URL, the sign-in (IdP) details and the answer on browser access to
the member routes (01 §2, "CORS"). Then `NEXT_PUBLIC_MUNIM_API` points at the real API, `NEXT_PUBLIC_MUNIM_MOCK_CONTROLS`
is removed, the picker disappears, and `session.ts` signs in with the IdP's ID token (01 §8). The screens do not
change.

## 4 · Definition of done

- [ ] Every item in each screen file's acceptance checklist is ticked: `[mock]` on the mock, `[unit]` by a unit test or
      a stubbed response, `[real]` left for the real API.
- [ ] Every rule in `20-rules.md` holds.
- [ ] The till and the kitchen display work at **1024 × 768 and 1280 × 800**; owner home and Ask Munim also at
      **390 px** wide; every screen at 200 % zoom.
- [ ] Every state named in a screen file can be reached on the mock (seed, Mock controls, a second tab signed in as
      another demo person, DevTools offline) or a stubbed response.
- [ ] `npx tsc --noEmit`, `npx eslint .`, `npm test` and `npm run build` are clean; the storefront still passes
      everything it passed before. Every route in §1's table appears in `npm run build`'s route list.
- [ ] Every file printed in more than one place (§2) is saved once, unchanged.
- [ ] `npm run staff-smoke` prints **"staff smoke: all ok"**, and `npm run smoke` still prints "smoke: all ok".

## 5 · What to send back

1. The repo (the same one), with the README extended: the staff routes, how to sign in on the mock, the art log
   entries, and anything you changed from these files and why.
2. Both smoke outputs, pasted as text.
3. Screenshots of every state in each screen file (its §9 or §10 list): the till and kitchen at 1024 and 1280 px,
   owner home and Ask at 390 and 1280 px, Cares and Suppliers at 1024 and 1280 px, named
   `staff-<screen>-<state>-<width>.png`. No screenshot shows a token or a tenant id.
4. A list of every place where the API, the mock or these files were unclear or seemed wrong. Do not work around the
   API silently.

## 6 · Answers to "Where the API or the spec was unclear" (your README)

1. **Order view has no options or notes.** Still true, and it is an **open contract question for the founder**: the
   storefront order view has neither, and the member order view (`GET /v1/orders/{id}`) has `option_ids` but no
   `note`. The kitchen ticket already carries both (`lines[].options[]` with name keys, `lines[].note`), so the kitchen
   display shows the cake's sponge and message; the tracker cannot yet.
2. **Preview request has no `note`.** Still true for both previews: their line schema is strict, so sending `note` is a
   422. Keep the 200-character cap; a too-long note is refused only at placement.
3. **SDK licence and the download URL.** The versioned tarball files are kept: `munim-sdk.tgz` (0.1.0) stays
   byte-identical at its URL and `munim-sdk-0.2.0.tgz` is a new file beside it, so a lockfile pinned to either keeps
   resolving. Installing from `munim-rho.vercel.app` at build time stays the way to get it ("not for redistribution";
   do not vendor it into the repo).
4. **01 vs the portal: which is current?** The SDK is current, installed from the tarball URL (there is no registry
   package). The storefront pack's "no SDK, hand-written client" is superseded; the founder approved the SDK. Your
   `Result` / `MunimError` wrapper is the right shape; the staff client is built on it (01).
5. **Categories and deals have keys only.** Still true, on the storefront menu and on the member menu
   (`GET /v1/catalogue/menu`: `category` and the deals' `name_key` are keys). Keep the labels in `lib/site.ts`. Items,
   variants and options do have `display_name`.
6. **Guest cancel / reschedule answer `403 guest_cannot_change`.** As designed. On the staff side, the counter cancels
   an order with `POST /v1/orders/{id}:advance` to `cancelled` with a reason code (refused with `refund_first` while a
   payment stands).

## 7 · Open questions for the founder

These are contract gaps found while writing this pack, each checked against the API's source. Build around them as
each screen file says; do not work around them in other ways.

1. **Browser access to member routes (CORS).** The real API sends CORS headers only on the storefront, stream and
   public Cares routes, and does not allow `X-Munim-Tenant`, so a page on your origin cannot call member routes
   directly today (every screen's `[real]` checks; 01 §2).
2. **No "sales today" figure.** No snapshot gives one outlet's sales for one day, so owner home shows tickets today,
   net sales this week, waste this week and food shared (12).
3. **`GET /v1/outlets` lists every outlet of the business**, not only the caller's, although its summary says "in the
   caller's scope". The shell keeps the outlets `GET /v1/me` names (02 §3.1; every screen).
4. **Kitchen ticket lines carry name keys only and no variant; order views carry no line notes.** The kitchen reads
   each ticket's order for the size and maps names through the menu, and the order page cannot show the cake message
   (10, 11).
5. **An order completes when its last kitchen ticket is done, paid or not.** The till takes payment before hand-over
   and the kitchen warns before "Handed over" (10, 11).
6. **Should the till close a shift?** Core has drawer shifts: open, close, list and get (`POST /v1/shifts`,
   `POST /v1/shifts/{id}:close`, `GET /v1/shifts[/{id}]`), and works out expected cash and the variance for a drawer
   from its device's cash tenders in the shift's time window (tenders themselves carry no shift id). These screens
   build no shift open or close: is it wanted on the till? (10)
7. **The order list has no paid or remaining amounts.** Today's orders cannot say what is still due; open an order
   to see it (10).
8. **Order reject and cancel reasons have no list.** A reason is a slug core checks (`^[a-z][a-z0-9_]*$`, never free
   text), but the contract lists no codes, so the till ships its own five (10).
9. **Refusal codes are not uniform.** "Nothing left to pay" (409 `conflict`), a card or UPI amount over what is due
   (422 `invalid_payload`) and a second dismiss of a finding (409 `conflict`) carry no reason code; `cannot_verify` is
   422, not 409. The Cares listing refusals are split: `recipient_ineligible`, `listing_expired`,
   `cooked_hold_exceeded` and `line_expired` are 422 `invalid_payload`, while `cares_not_enabled`,
   `cares_not_opted_in`, `offer_not_enabled` and `qty_exceeds_on_hand` are 409 `conflict`. The screens choose copy by
   code and reason, so they cope (10, 12, 14).
10. **The order preview has no tax components and no refusal details.** The till shows one "Tax" line and generic
    refusal copy (10).
11. **Ask's answer gives no run id.** `POST /v1/ask` returns only when the answer is stored (up to about 90 s), so Ask
    shows a waiting state, not live steps; finding the run through `GET /v1/runs` would be a workaround, not built
    (13).
12. **Ask's thread list has no question text.** `GET /v1/threads` items carry the specialist and times only, so the
    list reads each thread's first question with `GET /v1/threads/{id}` (13).
13. **Staff see "Cannot verify" for almost every number in Ask.** Every snapshot template but one (`cares.listings`)
    is manager and up, and an answer resolves only the refs its viewer may open (13).
14. **Inbox items carry no `unverified_refs`.** The inbox cannot show approve buttons; the draft's own page reads
    `GET /v1/drafts/{id}` first (12).
15. **A decided draft does not show what the approver typed.** `GET /v1/drafts/{id}` returns the proposed payload,
    not the decision's final one (core keeps that in `core.decision`, which no member route serves), so after a
    reload an "Approved with edits" draft cannot show "Edited by …"; the purchase order or listing holds the typed
    value. The mock behaves the same (12, 14, 15).
16. **A draft whose cells the approver cannot open can only be rejected.** Core re-reads every cell a draft was based
    on under the approver's access, so typing over it does not help. A negotiation's purchase order cites its run's
    quote comparison for quantity and price, and its `based_on` also cites the shortfall it asked to fill
    (`inventory.shortfall`), the last price its bounds came from and the budget left (`purchasing.deal_inputs`). When
    that run covers every outlet (the mock's case), a manager of one outlet can only reject it. How a real negotiation
    run is scoped, and which template its last price comes from (the repo's only callers are tests, which use
    `purchasing.price_creep`), could not be checked: no running copy had one (12, 15).
17. **Members are ids, not names.** Threads (`created_by`), listings (`published_by`), hand-overs (`recorded_by`) and
    goods received (`received_by`) carry member ids, and only owners may list members, so the screens say "a
    teammate" or "recorded by you" (13, 14, 15).
18. **No live updates for Cares or purchasing.** No member stream topic carries listing, hand-over, purchase-order or
    goods-received events, so those screens refresh on an action, on focus and on "Refresh" (14, 15).
19. **Staff may record goods received in core, but the Suppliers screens are hidden from them.** Deliveries usually
    come in at the counter: should staff get a receive-only view? (15)
20. **The quote comparison has no unit.** `purchasing.quote_compare` has no unit or ingredient column, so the quote
    table says "Units as quoted" (15).
21. **The cooked-food hold limit is not readable.** The country pack's limit is not served to members, so the Cares
    form learns it only from a `cooked_hold_exceeded` refusal (14).
22. **A purchase order's lineage names who approved it, not what was typed.**
    `GET /v1/lineage?row=core.purchase_order:<id>` returns the decision (verdict, `decided_by` with the name, when) and
    the draft it came from, so the purchase-order page shows "Approved by {name}". Which numbers the approver typed is not served (question 15); the order's own
    lines hold the final quantities and prices (15).
23. **Cobnut on the real API needs two setup steps.** Each outlet needs its GSTIN and FSSAI number, or its receipts
    are 409 `tax_id_missing`; and a platform operator must switch Munim Cares on for the business (10, 14).
24. **The supplier's reply behind a quoted number is not served.** A negotiation's quantity and price are read from
    simulated suppliers' replies, and Munim's design asks the approval card to show each beside the passage it came
    from; no member route serves the reply or its spans, so the card shows the quote comparison only (15).
25. **The inbox stream topic puts the tenant id in a URL.** The SDK sends topics in the stream's query string, and
    core requires `inbox:<tenant id>` (a tenant-free topic such as `inbox` is refused with 400). This is the one
    exception to "never a tenant in a URL" (20 §4). Should core take a tenant-free inbox topic, reading the tenant from
    `X-Munim-Tenant` and the token? (01 §7; 12, 14, 15)
26. **The SDK installs from a `vercel.app` URL.** Cobnut's `package.json` and lockfile pin
    `https://munim-rho.vercel.app/downloads/munim-sdk-0.2.0.tgz`. The event rules (20 §1, "Hosting") forbid only what
    runs on Vercel, but Munim's own rule for anything it enters in the Google AI Builder Cup is Google Cloud only
    (no Vercel). If these screens are entered as part of Munim, where should the SDK come from? Until then, keep the
    URL as it is and do not vendor the tarball (§6 answer 3; 01 §1).

## 8 · Checked against a local copy of the real API

On 14 Oct 2026 the same `scripts/staff-smoke.ts` ran against a local copy of the real API holding a different
synthetic business (a three-outlet restaurant group), with an owner token and a manager token (one outlet) from its
development sign-in. Nothing in the script changed between the mock run (01 §10) and this one.

How it was run (the founder's side; no token is ever printed, logged or committed):

1. Mint the development sign-in's tokens for that business into a file only the current user can read (`umask 077`).
2. Write a second file, also `umask 077`, holding `{"owner": …, "scoped": …}` (the scoped member is the manager).
3. `NEXT_PUBLIC_MUNIM_API=<the local API> STAFF_SMOKE_TOKENS=<that file> npx tsx scripts/staff-smoke.ts` (Ask is
   skipped: it would call a live model).
4. Delete both files.

```
ok   me (owner): owner, outlets all
ok   me (scoped): manager, 1 outlet(s)
ok   outlets: Spice Route North (restaurant), Spice Route Central (restaurant), Spice Route South (restaurant)
ok   counter channel: 6 channel(s)
ok   counter menu: 7 entries, business date 2026-10-14, first simple item Butter Chicken
ok   preview: total ₹378.00
ok   place: entity is the order, status 201
ok   replay: replayed=true
ok   same key, new body is 409: key_reused 409 idempotency_conflict
ok   read order: ticket 2, placed, remaining = total
ok   board: 27 live ticket(s), ours queued, normal, lane now
ok   advance ticket: queued -> preparing
ok   live event: 1 wake-up(s) after the move
ok   stale advance is 409: invalid 409 illegal_transition
ok   tender: status preparing, remaining 0
ok   hand over: ticket done, order completed
ok   inbox: 50+ item(s), 5 draft(s)
ok   draft detail: goals.task.create.v1, 0 unverified ref(s), 1 history row(s)
ok   approve with a wrong draft_id is 422: invalid 422 invalid_payload
ok   mint snapshot: Tickets today: 2
ok   open snapshot: 1 row(s)
ok   free digits are not shown (local)
ok   unknown snapshot is 404: not_found 404 not_found
skip ask: real API; set STAFF_SMOKE_ASK=1 to call the model
ok   cares profile: available true, enabled true
ok   suppliers: 2 supplier(s), 2 simulated and labelled
ok   no token is 401: auth 401 unauthenticated
ok   wrong tenant is 404: not_found 404 not_found
ok   board outside scope is 404: not_found 404 not_found
staff smoke: all ok
```

- Every call the screens make that the script covers answered as on the mock, `GET /v1/me` included. The smoke's
  order was paid and handed over, so it left no paid order waiting in the kitchen.
- Read on the same copy, without changing anything: `GET /v1/lineage?row=core.purchase_order:<id>` answered for that
  business's one purchase order (two chains, no decision: a person placed it), and a malformed `row` is 400; a
  malformed stream topic and a tenant-free `inbox` topic are both 400 (question 25). An earlier read found the
  manager's `GET /v1/devices` listing only their outlet's device, `GET /v1/outlets` listing all three outlets
  (question 3), and `GET /v1/drafts` items carrying `unverified_refs` for both people. That business had no
  purchase-order draft to read.
- Not run there: Ask (a live model). No draft was decided: the one approve request sent carried a wrong `draft_id` on
  purpose and was refused with 422.
