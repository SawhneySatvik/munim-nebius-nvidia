# 01 · The staff API client (on the SDK, beside the storefront client)

The staff screens use the same SDK, the same `Result<T>` / `MunimError`, the same `settle()` and the same env vars
as Cobnut's storefront. You do **not** write a second client: you make one word of `lib/munim/client.ts` public (§3)
and add a member client next to it. Everything below was checked against the API contract, typechecked with Cobnut's
own `lib/munim/*.ts` and `compilerOptions`, run against the extended mock (03) and, where marked, against a local
copy of the real API on 14 Oct 2026.

Each code block starts with `// file: <path>`. Save it at that path, exactly as written. `lib/munim/` stays plain
TypeScript (no React, no Next.js imports) and runs in the browser and in Node 20+.

| File | What it is |
|---|---|
| `package.json` | The SDK dependency moves to the 0.2.0 tarball (§1) |
| `lib/munim/client.ts` | One edit: `export` in front of `settle` (§3) |
| `lib/munim/commands.ts` | The command envelope and the one-attempt rule (§4) |
| `lib/munim/staff.ts` | `createStaffClient`: every call the six screens make (§5) |
| `lib/munim/refs.ts` | Refs, the "Cannot verify" rule, cell formatting, typed edits (§6) |
| `lib/munim/drafts.ts` | The one module that reads and decides AI drafts: who may decide, approve, approve with my edits, reject, every answer (§6.1) |
| `lib/munim/staff-stream.ts` | Live updates with the member token (§7) |
| `lib/munim/session.ts`, `staff-app.ts`, `mock-controls.ts` | The session seam, the app's staff wiring, the mock's new switches (§8) |
| `lib/munim/staff-copy.ts` | Every staff string about API state, chosen by code (§9) |
| `tests/staff-copy.test.ts` | Stubbed refusals the mock cannot give, each with its own line (§9) |
| `scripts/staff-smoke.ts` | Proves all of it against the mock (and the real API later) before any UI (§10) |

## 1 · The SDK: switch to 0.2.0

The founder approved the SDK, so the storefront pack's "no SDK, hand-written client" is superseded. The SDK with
`GET /v1/me` ships as a **new file**; the old URL stays byte-identical so your current lockfile keeps working.

```bash
npm install https://munim-rho.vercel.app/downloads/munim-sdk-0.2.0.tgz
```

Check the sha256 of the file you downloaded before you commit the lockfile: it is
`d0a16db604e03ac40fb6f17c82aa8cf5c3adf4d3a47a4a194ef5cd57a3dfb2d3`, and the tarball's own `package.json` says
`"version": "0.2.0"`.

This rewrites the `@munim/sdk` line in `package.json` and its integrity in `package-lock.json`; commit both. What is
new for you: the `/v1/me` path and its `Schemas["V1Me"]` type. Every path, type and helper you already use is
unchanged (the storefront smoke still prints "smoke: all ok" on 0.2.0 against the extended mock). The member calls
below use `TENANT_HEADER` (`X-Munim-Tenant`), which 0.1.0 already exported for staff apps.

## 2 · Rules the staff client follows

| Rule | Why |
|---|---|
| Every member call sends `Authorization: Bearer <ID token>` and `X-Munim-Tenant: <tenant id>`. | The token proves the person; the tenant header names the business. The SDK sets both from `token` and `tenantId`. Neither ever goes in a URL, a body, a log or a screenshot, except the `inbox:<tenant>` stream topic, which core requires (§7). |
| The tenant, the person, their role and their outlets are **never** in a request body. | Core takes them from the verified token. `GET /v1/me` tells the screen who it is; it never tells the server. |
| A missing or bad token is **401** (`unauthenticated`). | `MunimError.kind` is `"auth"`, status 401: sign the person out (`useStaff().handleAuth`). |
| A good token for someone who is not a member of that tenant, an unknown id, and anything outside the person's outlets on a **read** are **404**. | Never a hint which. Show "Not found" (or the one "This link isn't valid." page for a link). |
| A command the person's role may not run is **403** with `reason_code: "authority_denied"` (code `forbidden`, or `book_write_refused` when core's book guard refuses the write itself: Cares listings, purchase orders, goods received). | `kind` is `"refusal"`. Copy: "Your role can't do this. Ask the owner." (§9). Hide the button for roles that can't (session.ts `can()`), but the API is the guard. |
| Member refusals often have **no** `reason_code`: `illegal_transition` (409), `already_decided` (409), `idempotency_conflict` (409), `cannot_verify` (**422**), `execution_failed` (422). | `client.ts` files these under `kind: "invalid"`. Switch on `error.code` first (staff-copy.ts does). |
| Every write is a command envelope in the body (§4); `POST /v1/orders:preview`, `POST /v1/snapshots` and `POST /v1/ask` are **not** commands. | Preview and mint write nothing. Ask appends a turn every time it is sent, so it is never retried automatically (§5). |
| Every fetch uses `cache: "no-store"` and a timeout (15 s; Ask 95 s). | Core holds `POST /v1/ask` until the AI has answered (up to 90 s). |
| Never show the server's `error.message`. | `client.ts` already drops it. |
| No `EventSource`. | It cannot send the bearer token or the tenant header (§7). |

**CORS (open question for the founder).** The real API sends CORS headers only on `/v1/storefront/**`, `/v1/stream`
and `/v1/cares-network/**`, and its allowed request headers do not include `X-Munim-Tenant`. A browser page on your
origin therefore cannot call the member routes of the real API directly today. The extended mock is same-origin
(`/mock`), so nothing blocks you now. Before the switch to the real API, the founder decides how member calls reach it
(CORS for member routes, or a same-origin path); until then the `[real]` checks stay open. Do not build a proxy on
your own.

Error codes a staff screen meets:

| `code` | HTTP | When | `kind` in client.ts | What the screen does |
|---|---|---|---|---|
| `unauthenticated` | 401 | Token missing, bad or expired | `auth` | Sign out, back to `/staff/sign-in` |
| `not_found` | 404 | Not a member of the tenant; unknown id; outside the person's outlets (reads); a stream topic they may not read | `not_found` | "Not found" state; never which part |
| `forbidden` / `book_write_refused` | 403 | Role or outlet may not run this command (`authority_denied`) | `refusal` | "Your role can't do this. Ask the owner." |
| `bad_request` | 400 | Bad query value; body not JSON; Ask body wrong | `invalid` | A bug: fix the call |
| `invalid_payload` | 422 | Envelope or payload shape; a path id not equal to the payload id; a refusal with a reason (`reason_required`, `recipient_ineligible`, `listing_expired`, `cooked_hold_exceeded`, `line_expired`) | `invalid` / `refusal` | A bug, except a refusal with a reason: its copy (§9) |
| `illegal_transition` | 409 | Stale `from_status`, a step that is not allowed, a move on a cancelled order | `invalid` | "Someone already moved this…" and refetch |
| `conflict` | 409 | A named refusal (`reason_code`: `preview_total_changed`, `item_sold_out`, `refund_first`, `cash_below_rounding`, `qty_exceeds_listed`, `tax_id_missing`, …) or, without one, "nothing due" on a tender | `refusal` / `invalid` | Copy by `reason_code` (§9); refetch |
| `already_decided` | 409 | Someone decided the draft first | `invalid` | "Someone else already decided this." and refetch |
| `stale_draft` | 409 | The cells the draft relied on changed; body adds `changes[]` | `refusal` | "…can no longer be approved or rejected"; refetch the draft (its history holds the changes) |
| `cannot_verify` | 422 | A number in the draft does not trace (`reason_code: unresolved_ref`); body adds `refs[]` when the number is in the payload, and nothing when it is a cell the draft was based on | `refusal` | Show "Cannot verify" on those fields; Approve stays hidden |
| `execution_failed` | 422 | Approved but could not be applied | `invalid` | "It was approved but could not be applied. Nothing changed." |
| `idempotency_conflict` | 409 | Same key, different body: your bug | `key_reused` | "That didn't go through. Please try again."; the attempt ends, and the person's next tap is a new attempt |
| `unavailable` | 503 / 429 | AI unavailable (Ask: hide the AI surface); rate limited (`Retry-After`) | `server` / `rate_limited` | Ask: hide, never an error state. 429: wait, then the same request |
| `internal` | 500 | | `server` | "Something went wrong on our side. Try again." |

## 3 · One edit to `lib/munim/client.ts`

Make `settle` public, so the staff client shares the storefront client's error parsing:

```ts
// before
async function settle<T>(call: () => Promise<SdkAnswer<T>>): Promise<Result<T>> {
// after
export async function settle<T>(call: () => Promise<SdkAnswer<T>>): Promise<Result<T>> {
```

Nothing else in `client.ts` changes, and nothing in the storefront changes.

## 4 · Commands and attempts

```ts
// file: lib/munim/commands.ts
// Every write a staff screen makes is a command envelope: { command_id, idempotency_key, type, payload }. The tenant
// and the person are never in the body; core takes them from the verified token. One attempt = one frozen envelope:
// a retry after a network error, timeout, 429 or 5xx sends the SAME envelope (core answers with the stored result
// and X-Munim-Replayed: true); any change to what the person confirmed is a new attempt with new ids.
import type { MunimError } from "./client";
import { uuidv7 } from "./uuid";

export interface Envelope<T extends string, P> {
  command_id: string;
  idempotency_key: string;
  type: T;
  payload: P;
}

/** A fresh envelope: new command_id and idempotency_key (UUIDv7, which fits ^[A-Za-z0-9_.:-]{8,100}$). */
export const envelope = <T extends string, P>(type: T, payload: P): Envelope<T, P> => ({ command_id: uuidv7(), idempotency_key: uuidv7(), type, payload });

/** One attempt: the envelope plus a fingerprint of what the person confirmed. Keep it in component state (or
 *  sessionStorage) until it succeeds or fails for good. */
export interface CommandAttempt<T extends string, P> {
  fingerprint: string;
  body: Envelope<T, P>;
}

/** Reuses `prev` when the person confirmed the same thing again (a retry); else builds a new attempt.
 *  `build` runs only for a new attempt, so ids made inside it (order_id, line ids, tender_id) stay frozen too. */
export function attemptFor<T extends string, P>(prev: CommandAttempt<T, P> | null, fingerprint: string, type: T, build: () => P): CommandAttempt<T, P> {
  return prev && prev.fingerprint === fingerprint ? prev : { fingerprint, body: envelope(type, build()) };
}

/** True when the same envelope may be sent again unchanged. Every other failure ends the attempt. */
export const retryable = (e: MunimError): boolean => e.kind === "network" || e.kind === "rate_limited" || e.kind === "server";
```

How a screen uses it (the tender panel, for example):

```ts
// One attempt per thing the person confirmed. Keep it in state until it succeeds or fails for good.
const fp = JSON.stringify([orderId, method, typedMinor]);
const a = attemptFor(prev, fp, "orders.tender.record.v1", () => ({ tender_id: uuidv7(), order_id: orderId, method, tendered_minor: method === "cash" ? typedMinor : null, amount_minor: method === "cash" ? null : typedMinor, currency, ref: null }));
setAttempt(a);
const r = await client.recordTender(orderId, a.body);
if (r.ok) setAttempt(null); // r.replayed is true when this was a resend of an attempt that had already landed
else if (!retryable(r.error)) setAttempt(null); // show staffErrorText(r.error, "counter"), refetch the order
```

- A retry after `network`, `rate_limited` (after `retryAfterMs`) or `server` sends `a.body` again unchanged. Core
  answers with the stored result and `X-Munim-Replayed: true` (`r.replayed`); the order is never placed twice.
- The ids the payload carries (`order_id`, every `line_id`, `tender_id`, `listing_id`, `po_id`) are made inside
  `build`, so they are frozen with the attempt. A line id that a placed order already used is refused (422).
- `type` must equal the route's command (`orders.place.v1` on `POST /v1/orders`); a wrong one is 422.
- Ids in a payload that also appear in the path must be equal (`order_id`, `ticket_id`, `draft_id`, `listing_id`,
  `finding_id`); a mismatch is 422.

## 5 · The staff client

```ts
// file: lib/munim/staff.ts
// The member (staff) client: the same SDK, the same Result / MunimError and the same settle() as the storefront
// client in client.ts, with the person's token and tenant instead of the storefront key. One instance per session
// (session.ts). It never logs, and never puts the token or the tenant in a URL.
import { createMunimClient as createSdkClient } from "@munim/sdk";
import { settle } from "./client";
import type { Envelope } from "./commands";
import type { Schemas } from "./types";

export interface StaffClientOptions {
  /** Same base as the storefront: "/mock" for this app's mock, the real API's URL later. */
  baseUrl: string;
  /** The member's ID token (Authorization: Bearer). Called before every request, so a refreshed token is used. */
  token: () => string | Promise<string>;
  /** The business the person acts in (X-Munim-Tenant). */
  tenantId: string;
  /** Dev only: the mock's test headers (mock-controls.ts). */
  extraHeaders?: () => Record<string, string>;
  /** Default per-call timeout (15 000 ms). Ask always uses ASK_TIMEOUT_MS. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** POST /v1/ask is answered only after the AI has finished (core waits up to 90 s). */
export const ASK_TIMEOUT_MS = 95_000;

type Cmd<T extends string, P> = Envelope<T, P>;
export type PlaceOrderCommand = Cmd<"orders.place.v1", Schemas["OrdersPlaceV1"]>;
export type AcceptOrderCommand = Cmd<"orders.order.accept.v1", Schemas["OrdersOrderAcceptV1"]>;
export type RejectOrderCommand = Cmd<"orders.order.reject.v1", Schemas["OrdersOrderRejectV1"]>;
export type AdvanceOrderCommand = Cmd<"orders.order.advance.v1", Schemas["OrdersOrderAdvanceV1"]>;
export type TenderCommand = Cmd<"orders.tender.record.v1", Schemas["OrdersTenderRecordV1"]>;
export type AdvanceTicketCommand = Cmd<"kitchen.ticket.advance.v1", Schemas["KitchenTicketAdvanceV1"]>;
export type ApproveDraftCommand = Cmd<"drafts.approve.v1", Schemas["DraftsApproveV1"]>;
export type RejectDraftCommand = Cmd<"drafts.reject.v1", Schemas["DraftsRejectV1"]>;
export type DismissFindingCommand = Cmd<"findings.dismiss.v1", Schemas["FindingsDismissV1"]>;
export type PublishListingCommand = Cmd<"cares.listing.publish.v1", Schemas["CaresListingPublishV1"]>;
export type WithdrawListingCommand = Cmd<"cares.listing.withdraw.v1", Schemas["CaresListingWithdrawV1"]>;
export type RecordHandoverCommand = Cmd<"cares.handover.record.v1", Schemas["CaresHandoverRecordV1"]>;
export type CreatePoCommand = Cmd<"purchasing.po.create.v1", Schemas["PurchasingPoCreateV1"]>;
export type ReceiveGoodsCommand = Cmd<"purchasing.grn.receive.v1", Schemas["PurchasingGrnReceiveV1"]>;

export function createStaffClient(opts: StaffClientOptions) {
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");
  const sdk = createSdkClient({ baseUrl, token: opts.token, tenantId: opts.tenantId, fetch: opts.fetch });
  const timeoutMs = opts.timeoutMs ?? 15_000;
  /** Per-call options: never cached, time-limited, plus the dev switches. */
  const init = (ms = timeoutMs) => ({ cache: "no-store" as const, signal: AbortSignal.timeout(ms), headers: opts.extraHeaders?.() ?? {} });
  const id = (v: string) => ({ path: { id: v } });

  return {
    // ---- who and where (every screen) ----
    getMe: () => settle(() => sdk.GET("/v1/me", init())),
    getTenant: () => settle(() => sdk.GET("/v1/tenant", init())),
    listOutlets: () => settle(() => sdk.GET("/v1/outlets", init())),
    listChannels: () => settle(() => sdk.GET("/v1/channels", init())),
    listDevices: () => settle(() => sdk.GET("/v1/devices", init())),

    // ---- counter (10) ----
    /** Items for sale now at an outlet on a channel kind ("counter" for the till), with display names. */
    getMenu: (outletId: string, channelKind: string) => settle(() => sdk.GET("/v1/catalogue/menu", { params: { query: { outlet: outletId, channel_kind: channelKind } }, ...init() })),
    /** Prices a cart and writes nothing. A plain body, not a command. Refusals come back inside the 200. */
    previewOrder: (body: Schemas["OrdersPreviewRequest"]) => settle(() => sdk.POST("/v1/orders:preview", { body, ...init() })),
    /** 201 CommandResult (entity_id = the order). `replayed` is true for a resend of the same envelope. */
    placeOrder: (body: PlaceOrderCommand) => settle(() => sdk.POST("/v1/orders", { body, ...init() })),
    getOrder: (orderId: string) => settle(() => sdk.GET("/v1/orders/{id}", { params: id(orderId), ...init() })),
    listOrders: (query: { outlet?: string; status?: Schemas["V1Order"]["status"]; business_date?: string; limit?: number; cursor?: string }) =>
      settle(() => sdk.GET("/v1/orders", { params: { query }, ...init() })),
    getReceipt: (orderId: string) => settle(() => sdk.GET("/v1/orders/{id}/receipt", { params: id(orderId), ...init() })),
    acceptOrder: (orderId: string, body: AcceptOrderCommand) => settle(() => sdk.POST("/v1/orders/{id}:accept", { params: id(orderId), body, ...init() })),
    rejectOrder: (orderId: string, body: RejectOrderCommand) => settle(() => sdk.POST("/v1/orders/{id}:reject", { params: id(orderId), body, ...init() })),
    advanceOrder: (orderId: string, body: AdvanceOrderCommand) => settle(() => sdk.POST("/v1/orders/{id}:advance", { params: id(orderId), body, ...init() })),
    /** Recorded only: Munim does not process payments. Cash: tendered_minor; card / UPI: amount_minor. */
    recordTender: (orderId: string, body: TenderCommand) => settle(() => sdk.POST("/v1/orders/{id}/tenders", { params: id(orderId), body, ...init() })),

    // ---- kitchen (11) ----
    getBoard: (outletId: string, station?: string) =>
      settle(() => sdk.GET("/v1/kitchen/board", { params: { query: station ? { outlet: outletId, station } : { outlet: outletId } }, ...init() })),
    advanceTicket: (ticketId: string, body: AdvanceTicketCommand) => settle(() => sdk.POST("/v1/kitchen/tickets/{id}:advance", { params: id(ticketId), body, ...init() })),

    // ---- owner home and approvals (12) ----
    listInbox: (cursor?: string) => settle(() => sdk.GET("/v1/inbox", { params: { query: cursor ? { cursor } : {} }, ...init() })),
    listDrafts: (query: { status?: "proposed" | "executing" | "executed" | "failed" | "rejected" | "stale" | "decided"; outlet?: string; cursor?: string }) =>
      settle(() => sdk.GET("/v1/drafts", { params: { query }, ...init() })),
    /** The draft with its decision, history and unverified_refs: open this before showing any approve button. */
    getDraft: (draftId: string) => settle(() => sdk.GET("/v1/drafts/{id}", { params: id(draftId), ...init() })),
    getDraftLineage: (draftId: string) => settle(() => sdk.GET("/v1/drafts/{id}/lineage", { params: id(draftId), ...init() })),
    /** Who approved the change that made a row: `row` is "<schema>.<table>:<id>", e.g. "core.purchase_order:<po id>". */
    getRowLineage: (row: string) => settle(() => sdk.GET("/v1/lineage", { params: { query: { row } }, ...init() })),
    /** payload.draft_id must equal draftId (else 422). Returns the EXECUTED command's result (its type and entity). */
    approveDraft: (draftId: string, body: ApproveDraftCommand) => settle(() => sdk.POST("/v1/drafts/{id}:approve", { params: id(draftId), body, ...init() })),
    rejectDraft: (draftId: string, body: RejectDraftCommand) => settle(() => sdk.POST("/v1/drafts/{id}:reject", { params: id(draftId), body, ...init() })),
    dismissFinding: (findingId: string, body: DismissFindingCommand) => settle(() => sdk.POST("/v1/findings/{id}:dismiss", { params: id(findingId), body, ...init() })),
    /** Mints a snapshot of an allow-listed template (owner home's stat cards). 201 with the rows. */
    mintSnapshot: (body: Schemas["V1SnapshotsRequest"]) => settle(() => sdk.POST("/v1/snapshots", { body, ...init() })),
    /** Opens the rows behind a ref (the snapshot drawer). 404 when it is not this person's to see. */
    getSnapshot: (snapshotId: string) => settle(() => sdk.GET("/v1/snapshots/{id}", { params: id(snapshotId), ...init() })),

    // ---- Ask Munim (13) ----
    /** Not a command and NOT safe to retry: a resend can append a second turn. On a network error, refetch the thread. */
    ask: (body: Schemas["V1AskRequest"]) => settle(() => sdk.POST("/v1/ask", { body, ...init(ASK_TIMEOUT_MS) })),
    /** Newest first. `specialist`: threads addressed to that desk ("manager" = the main conversation); `cursor` pages. */
    listThreads: (query: { specialist?: Schemas["V1Thread"]["specialist"] | "manager"; cursor?: string; limit?: number } = {}) =>
      settle(() => sdk.GET("/v1/threads", { params: { query: { ...query, specialist: query.specialist ?? undefined } }, ...init() })),
    getThread: (threadId: string) => settle(() => sdk.GET("/v1/threads/{id}", { params: id(threadId), ...init() })),
    listSpecialists: () => settle(() => sdk.GET("/v1/specialists", init())),

    // ---- Cares (14) ----
    getCaresProfile: () => settle(() => sdk.GET("/v1/cares/profile", init())),
    listRecipients: (outletId: string) => settle(() => sdk.GET("/v1/cares/recipients", { params: { query: { outlet: outletId } }, ...init() })),
    listListings: (query: { outlet?: string; kind?: "donation" | "offer"; status?: "published" | "allocated" | "closed" | "withdrawn" }) =>
      settle(() => sdk.GET("/v1/cares/listings", { params: { query }, ...init() })),
    getListing: (listingId: string) => settle(() => sdk.GET("/v1/cares/listings/{id}", { params: id(listingId), ...init() })),
    publishListing: (body: PublishListingCommand) => settle(() => sdk.POST("/v1/cares/listings", { body, ...init() })),
    withdrawListing: (listingId: string, body: WithdrawListingCommand) => settle(() => sdk.POST("/v1/cares/listings/{id}:withdraw", { params: id(listingId), body, ...init() })),
    recordHandover: (body: RecordHandoverCommand) => settle(() => sdk.POST("/v1/cares/handovers", { body, ...init() })),

    // ---- suppliers (15) ----
    listSuppliers: () => settle(() => sdk.GET("/v1/suppliers", init())),
    getSupplier: (supplierId: string) => settle(() => sdk.GET("/v1/suppliers/{id}", { params: id(supplierId), ...init() })),
    listPurchaseOrders: () => settle(() => sdk.GET("/v1/purchase-orders", init())),
    getPurchaseOrder: (poId: string) => settle(() => sdk.GET("/v1/purchase-orders/{id}", { params: id(poId), ...init() })),
    /** 201. A person's own purchase order; one the AI proposed arrives as a draft and is approved in the inbox instead. */
    createPurchaseOrder: (body: CreatePoCommand) => settle(() => sdk.POST("/v1/purchase-orders", { body, ...init() })),
    listIngredients: (outletId?: string) => settle(() => sdk.GET("/v1/inventory/ingredients", { params: { query: outletId ? { outlet: outletId } : {} }, ...init() })),
    listReorderLevels: (outletId: string) => settle(() => sdk.GET("/v1/inventory/reorder-levels", { params: { query: { outlet: outletId } }, ...init() })),
    /** Goods received in the person's outlets, newest first (15). */
    listGoodsReceived: () => settle(() => sdk.GET("/v1/goods-received", init())),
    getGoodsReceived: (grnId: string) => settle(() => sdk.GET("/v1/goods-received/{id}", { params: id(grnId), ...init() })),
    /** 201. Stock in at one outlet, optionally against a purchase order (owner, manager, staff). */
    receiveGoods: (body: ReceiveGoodsCommand) => settle(() => sdk.POST("/v1/goods-received", { body, ...init() })),
  };
}

export type StaffClient = ReturnType<typeof createStaffClient>;
```

Every call the six screens make, typed by SDK path:

| Screen | Method | Path | Body or query | Answer | Notes |
|---|---|---|---|---|---|
| all | `getMe` | `GET /v1/me` | | 200 `V1Me` `{member_id, tenant_id, name, role, outlet_ids}` | `outlet_ids` is `"*"` or a list (possibly empty) |
| all | `getTenant` | `GET /v1/tenant` | | 200 `V1Tenant` | `base_currency` formats `*_minor` snapshot cells |
| all | `listOutlets` | `GET /v1/outlets` | | 200 `V1Outlets` | **Every** outlet of the business (core today, although its summary says "in the caller's scope"): keep those `me.outlet_ids` names (the shell does). `kind`, `tz`, `default_prep_min` |
| 10 | `listChannels` | `GET /v1/channels` | | 200 `V1Channels` | The till uses the active `kind: "counter"` channel |
| 10 | `listDevices` | `GET /v1/devices` | | 200 `V1Devices` | The devices of the person's outlets (core's row-level security); the chosen outlet's `kind: "pos"` device id goes in `device_id` (it numbers the invoice) |
| 10, 11 | `getMenu` | `GET /v1/catalogue/menu` | `outlet`, `channel_kind` (both required) | 200 `V1CatalogueMenu` | One entry per item and variant, `display_name`, options with `display_name`, `available`. 11 uses it for names |
| 10 | `previewOrder` | `POST /v1/orders:preview` | `OrdersPreviewRequest` (no `line_id`, no `note`) | 200 `OrdersPreviewResponse` | Writes nothing. With `refusals`, `lines` is `[]` and totals are 0: hide totals |
| 10 | `placeOrder` | `POST /v1/orders` | `orders.place.v1` envelope | **201** `CommandResult`, `entity_id` = the order | Starts `placed`; creates the kitchen tickets. `loyalty_redeem_points` must be 0 |
| 10 | `getOrder` | `GET /v1/orders/{id}` | | 200 `V1Order` | `paid_minor`, `remaining_minor` computed by core. Lines carry `option_ids` but **no `note`** |
| 10, 12 | `listOrders` | `GET /v1/orders` | `outlet`, `status`, `business_date`, `limit`, `cursor` | 200 `V1OrdersList` | Newest first. "Orders today" = `items.length` ("N+" when `next_cursor`) |
| 10 | `acceptOrder` / `rejectOrder` / `advanceOrder` | `POST /v1/orders/{id}:accept` / `:reject` / `:advance` | envelopes | 200 | One step, guarded by `from_status`; cancel and reject need a `reason_code` |
| 10 | `recordTender` | `POST /v1/orders/{id}/tenders` | `orders.tender.record.v1` | 200, `entity_id` = the tender | Cash: `tendered_minor` (core computes amount, change, rounding). Card / UPI: `amount_minor` ≤ remaining |
| 10 | `getReceipt` | `GET /v1/orders/{id}/receipt` | | 200 `V1OrderReceipt` | The bill per the country pack. 409 `tax_id_missing` when the outlet's GSTIN or FSSAI number is missing |
| 11 | `getBoard` | `GET /v1/kitchen/board` | `outlet` (required), `station` | 200 `V1KdsBoard` | Restaurants and cloud kitchens only (a store outlet is 400 `not_applicable`) |
| 11 | `advanceTicket` | `POST /v1/kitchen/tickets/{id}:advance` | `{ticket_id, from_status, to_status}` | 200 | queued → preparing → ready → done; a stale or skipped step is 409 `illegal_transition` |
| 12 | `listInbox` | `GET /v1/inbox` | `cursor` | 200 `V1InboxResponse` | Open findings and proposed drafts, newest first. Draft items carry **no** `unverified_refs` |
| 12 | `getDraft` | `GET /v1/drafts/{id}` | | 200 `V1DraftDetail` `{draft, decision, unverified_refs, history}` | Open this before showing any approve button |
| 12, 14, 15 | `listDrafts` | `GET /v1/drafts` | `status` (`proposed` default, `decided`, …), `outlet` | 200 `V1DraftsResponse` | Newest first; each item carries `unverified_refs`. "Decided" tab. Badge = `items.length`, "N+" when `has_more` |
| 12, 14, 15 | `approveDraft` / `rejectDraft` | `POST /v1/drafts/{id}:approve` / `:reject` | envelopes (§6.1) | 200 `CommandResult` | Approve answers with the **executed** command's `type` and `entity_id`; reject with `drafts.reject.v1` and the draft id. Only through §6.1 |
| 12 | `dismissFinding` | `POST /v1/findings/{id}:dismiss` | `{finding_id, reason_code}` | 200 | Owner and manager; staff get 403 |
| 12 | `getDraftLineage` | `GET /v1/drafts/{id}/lineage` | | 200 `V1LineageDraft` | Real API only (the mock answers 404: build the lineage line from `getDraft`, 12) |
| 15 | `getRowLineage` | `GET /v1/lineage` | `row` = `core.purchase_order:<po id>` | 200 `V1LineageRow` | One chain per audit entry on the row; an approved proposal's chain has `decision` (`verdict`, `decided_by.name`, `decided_at`). Not what was typed (00 §7 question 15). 404 when the row is not this person's |
| 12, 14, 15 | `mintSnapshot` | `POST /v1/snapshots` | `{template_id, params}` | **201** `Snapshot` | Owner home's figures (§6). Every template these screens use is manager and up |
| 12, 13, 14, 15 | `getSnapshot` | `GET /v1/snapshots/{id}` | | 200 `Snapshot` | The drawer behind every source chip. 404 = "Cannot verify" |
| 13 | `ask` | `POST /v1/ask` | `{question, thread_id?, deep?}` | 200 `V1AskResponse` | Not a command. 95 s timeout. **Never retry automatically**; on a network error refetch the thread. 503 = hide |
| 13 | `getThread` / `listThreads` | `GET /v1/threads/{id}` / `GET /v1/threads` | `specialist`, `cursor`, `limit` (list) | 200 | Threads in the person's outlet scope, a teammate's included. List items carry no question. Each turn: `question`, `answer.envelope.segments`, `answer.resolved_refs` (only cells this viewer may open), `answer.signature` |
| 13 | `listSpecialists` | `GET /v1/specialists` | | 200 | Ids and `aliases` for the "@Name" picker (names in staff-copy.ts) |
| 14 | `getCaresProfile` | `GET /v1/cares/profile` | | 200 `V1CaresProfile` | `available`, `enabled`, outlets' cities and pickup hours, `labels` |
| 14 | `listRecipients` | `GET /v1/cares/recipients` | `outlet` (required) | 200 | Simulated recipients only (`simulated: true`, name contains "(simulated)") |
| 14 | `listListings` / `getListing` | `GET /v1/cares/listings[/{id}]` | `outlet`, `kind`, `status` | 200 | Lines carry `item_id` / `ingredient_id`, not names |
| 14 | `publishListing` | `POST /v1/cares/listings` | `cares.listing.publish.v1` | 200 | Owner only. A donation names a recipient and has unpriced lines; cooked lines are in `portion` |
| 14 | `withdrawListing` / `recordHandover` | `POST /v1/cares/listings/{id}:withdraw`, `POST /v1/cares/handovers` | envelopes | 200 | Hand-over: staff may record it; the last line handed over closes the listing |
| 15 | `listSuppliers` / `getSupplier` | `GET /v1/suppliers[/{id}]` | | 200 | `kind: "simulated"` comes with `label: "Simulated supplier"`. Staff get `prices: []` |
| 15 | `listPurchaseOrders` / `getPurchaseOrder` | `GET /v1/purchase-orders[/{id}]` | | 200 | POs touching the person's outlets |
| 15 | `createPurchaseOrder` | `POST /v1/purchase-orders` | `purchasing.po.create.v1` | **201** | A person's own PO. An AI-proposed PO is a draft, approved in the inbox |
| 14, 15 | `listIngredients` / `listReorderLevels` | `GET /v1/inventory/ingredients`, `GET /v1/inventory/reorder-levels` | `outlet` (required for levels) | 200 | Names for ingredient ids; min and par per ingredient |
| 15 | `listGoodsReceived` / `getGoodsReceived` | `GET /v1/goods-received[/{id}]` | | 200 `V1GoodsReceivedList` / `V1GoodsReceived` | Goods received in the person's outlets, newest first |
| 15 | `receiveGoods` | `POST /v1/goods-received` | `purchasing.grn.receive.v1` | **201** | Stock in, optionally against a committed PO; a batch for batch-tracked stock; 409 `conflict` when the PO is no longer committed |

## 6 · Refs, snapshots and "Cannot verify"

```ts
// file: lib/munim/refs.ts
// Refs: the only way a number written by Munim's AI reaches the screen. AI text never carries digits; it carries
// tokens like ⟨snap:<snapshot id>·<row>·<column>⟩ that name one cell of a snapshot core-api minted from the books.
// This file splits text into plain parts and ref parts, finds each ref's value in the response's resolved_refs, and
// formats a cell for display. Anything that cannot be traced becomes { kind: "unverified" }: the UI shows
// "Cannot verify", never a guess and never the model's own words. Plain TypeScript, no React.
import { formatMoney, formatQty, formatRate } from "./format";
import type { Schemas } from "./types";

export type Snapshot = Schemas["Snapshot"];
export type Cell = string | number | boolean | null;
/** `{ ref, value }` as core resolved it for this viewer (answers, findings, drafts; drafts add a JSON Pointer `path`). */
export interface ResolvedRef {
  ref: string;
  value: Cell;
  path?: string;
}

const U = "[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SNAP = new RegExp(`^⟨snap:(${U})·(0|[1-9][0-9]*)·([a-z_][a-z0-9_]*)⟩$`, "u");
const CITE = new RegExp(`^⟨cite:(?:row:([a-z_][a-z0-9_]*\\.[a-z_][a-z0-9_]*):(${U})|(doc|msg|claim|snapshot):(${U}))(?:·(0|[1-9][0-9]*)-(0|[1-9][0-9]*))?⟩$`, "u");
/** Every ⟨…⟩ token, well-formed or not (a fresh regex each call: a shared /g regex keeps state). */
const anyToken = () => /⟨[^⟩]*⟩/gu;

export type ParsedRef =
  | { kind: "snap"; snapshotId: string; row: number; column: string }
  | { kind: "row"; table: string; id: string }
  | { kind: "doc" | "msg" | "claim" | "snapshot"; id: string };

/** One ref token -> its parts; null when it is not well-formed (render "Cannot verify"). */
export function parseRef(token: string): ParsedRef | null {
  const s = SNAP.exec(token);
  if (s) return { kind: "snap", snapshotId: s[1]!, row: Number(s[2]), column: s[3]! };
  const c = CITE.exec(token);
  if (!c) return null;
  if (c[1]) return { kind: "row", table: c[1], id: c[2]! };
  return { kind: c[3] as "doc" | "msg" | "claim" | "snapshot", id: c[4]! };
}

export type Part =
  | { kind: "text"; text: string }
  | { kind: "value"; ref: string; parsed: ParsedRef; value: Cell }
  | { kind: "unverified"; ref: string | null };

/** True when plain text (refs removed) still holds a digit: a number the model typed. Never shown. */
export const hasFreeDigits = (text: string): boolean => /\p{Nd}/u.test(text.replace(anyToken(), ""));

/** Splits one AI segment into parts. `resolved` is the response's resolved_refs. A segment with a free digit is
 *  returned as one "unverified" part, so a model-typed number can never reach the screen. */
export function renderSegment(segment: { text: string; refs: readonly string[] }, resolved: readonly ResolvedRef[]): Part[] {
  if (hasFreeDigits(segment.text)) return [{ kind: "unverified", ref: null }];
  const byRef = new Map(resolved.map((r) => [r.ref, r.value]));
  const parts: Part[] = [];
  let at = 0;
  for (const m of segment.text.matchAll(anyToken())) {
    if (m.index > at) parts.push({ kind: "text", text: segment.text.slice(at, m.index) });
    at = m.index + m[0].length;
    const parsed = parseRef(m[0]);
    if (parsed && byRef.has(m[0])) parts.push({ kind: "value", ref: m[0], parsed, value: byRef.get(m[0])! });
    else parts.push({ kind: "unverified", ref: m[0] });
  }
  if (at < segment.text.length) parts.push({ kind: "text", text: segment.text.slice(at) });
  return parts;
}

/** A draft field's value: the proposed ref (with its resolved value), a person's edit, or unverified. */
export type DraftValue =
  | { kind: "proposed"; ref: string; parsed: ParsedRef; value: Cell }
  | { kind: "edited"; value: number; typedBy: string }
  | { kind: "unverified"; ref: string };

/** Reads one numeric leaf of a draft payload. `path` is its JSON Pointer ("/lines/0/unit_price_minor"). */
export function draftValue(leaf: unknown, path: string, resolved: readonly ResolvedRef[], unverified: readonly string[]): DraftValue {
  if (typeof leaf === "object" && leaf !== null && "value" in leaf && "typed_by" in leaf) {
    const e = leaf as { value: number; typed_by: string };
    return { kind: "edited", value: e.value, typedBy: e.typed_by };
  }
  const ref = String(leaf);
  const parsed = parseRef(ref);
  const hit = resolved.find((r) => r.path === path && r.ref === ref);
  if (!parsed || !hit || unverified.includes(ref)) return { kind: "unverified", ref };
  return { kind: "proposed", ref, parsed, value: hit.value };
}

/** How to show a cell, from its column name (core's naming rule: *_minor money, *_milli thousandths, *_bp basis
 *  points). `currency` is the business's base currency (GET /v1/tenant), used only for *_minor columns. */
export interface CellFormat {
  locale: string;
  currency: string;
}
export function formatCell(value: Cell, column: string, f: CellFormat): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const n = typeof value === "number" ? value : /^-?\d+$/.test(value) ? Number(value) : null;
  if (n === null) return String(value); // text, dates and numeric strings with a fraction are shown as stored
  if (column.endsWith("_minor")) return formatMoney(n, f.currency, f.locale);
  if (column.endsWith("_milli")) return formatQty(n, f.locale);
  if (column.endsWith("_bp")) return formatRate(n, f.locale);
  if (column.endsWith("_sec")) return n < 120 ? `${n} s` : `${Math.floor(n / 60)} min${n % 60 ? ` ${n % 60} s` : ""}`;
  return new Intl.NumberFormat(f.locale).format(n);
}

/** What a person typed into a draft field, in the field's own units: "1,410.50" in a *_minor field -> 141050, "9" in a
 *  *_milli field -> 9000, "1800" in a *_sec field -> 1800. Digits are moved as text (no floating point); null when it is
 *  not a plain non-negative number or has more decimals than the unit allows. */
export function parseTyped(text: string, column: string, currency: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const digits = column.endsWith("_minor") ? (new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2) : column.endsWith("_milli") ? 3 : 0;
  return frac.length > digits ? null : Number(whole! + frac.padEnd(digits, "0"));
}

/** The column a part shows, for formatCell: the snap ref's column, or "" for a quoted span. */
export const columnOf = (p: ParsedRef): string => (p.kind === "snap" ? p.column : "");

/** A snapshot cell by ref, from an opened snapshot; undefined when the row or column is not there. */
export function cellOf(s: Snapshot, ref: ParsedRef): Cell | undefined {
  if (ref.kind !== "snap" || ref.snapshotId !== s.snapshot_id) return undefined;
  const row = s.rows[ref.row];
  return row && ref.column in row ? row[ref.column] : undefined;
}

/** The snap ref for one cell of a snapshot the screen minted itself (owner home stat cards). */
export const snapRef = (snapshotId: string, row: number, column: string): string => `⟨snap:${snapshotId}·${row}·${column}⟩`;
```

The rendering rule, everywhere AI text or an AI number appears (answers, findings, drafts):

1. AI text holds no digits. Each number is a token `⟨snap:<id>·<row>·<column>⟩` inline in `segment.text`; the
   segment's `refs[]` lists its bare ids (`snap:<id>`).
2. The response carries `resolved_refs: [{ref, value}]`: the value core read from the snapshot for **this** viewer.
   Look values up by the exact token. A token that is not in `resolved_refs` is "Cannot verify" (core leaves out what
   the viewer may not see).
3. `renderSegment` returns parts. Text parts are rendered as text nodes; value parts as `formatCell(value, column,
   fmt)` with a source chip (02 §4); unverified parts as the "Cannot verify" chip. A segment with a free digit becomes
   one "Cannot verify" part.
4. The chip opens `GET /v1/snapshots/{id}` and shows the rows with the cited cell outlined. A 404 there is "Cannot
   verify".
5. An answer with `envelope.abstained: true` shows "Cannot verify" with `abstainText(reason_code)` (§9) and no
   segments.
6. Drafts: read each numeric payload leaf with `draftValue(leaf, path, draft.resolved_refs, detail.unverified_refs)`
   (`numericFields`, §6.1). A purchase-order draft's quantity and price are cells of its negotiation's quote
   comparison, minted under the negotiation run's own outlet scope. When that run covers every outlet (the mock's
   case) they trace for an owner and land in `unverified_refs` for a manager of one outlet (15).

**Owner home's figures** are snapshots the screen mints itself (`mintSnapshot`), then shows through the same chip.
These are the real template ids and columns (manager and up):

| Figure | `template_id` | `params` | Cell to show |
|---|---|---|---|
| Kitchen tickets today | `kitchen.ticket_coverage` | `{outlet_id: <id> or null for all, from: <today>, to: <today>}` | row 0 `tickets` |
| Net sales this week | `people.labour_pct` | `{outlet_id, from: <Monday>, to: <today>}` | row 0 `net_sales_minor` (Monday to today lies inside one ISO week, so there is at most one row; "None yet" for no rows) |
| Waste this week | `inventory.waste_week` | `{outlet_id, week_start: <date>}` | one row per ingredient, ordered by ingredient id with no total row: the row with the **largest** `waste_minor`, found by comparing (or "None" for no rows) |
| Food shared this month | `cares.impact` | `{outlet_id, from: <1st>, to: <today>}` | row 0 (`kind: "total"`) `portions_milli`, `units_milli`, `handovers` |
| Low stock | `inventory.below_reorder` | `{}` | one row per ingredient below its minimum: show the list (its length is a count of rows) |

"Today" is the outlet's business date: take it from `GET /v1/catalogue/menu` (`business_date`) or an order's
`business_date`, never from the tablet's clock. There is **no** "sales today" template, and the browser must not add
one up (20 §3.1). Build the ref for a minted cell with `snapRef(snapshot_id, row, column)` and its value with
`cellOf`.

### 6.1 Drafts: one module for every decision

`lib/munim/drafts.ts` is the only code that reads a draft's numbers and decides a draft. The draft page (12), the Cares
proposal card (14) and the purchase-order proposal card (15) all use it, through 02 §5's `DecisionBar` and
`useDecision`. Nothing else builds an approve or reject envelope.

- **Who may decide (`mayDecide`, `approveGate`).** Core checks two rows of its command authority:
  - the decide verb (`drafts.approve.v1` / `drafts.reject.v1`: owner, manager, judge);
  - and the draft's own command type: owner, manager and judge for most types, but **owner and judge only** for
    `cares.listing.publish.v1`, `finance.dispute.draft.v1`, `finance.journal.adjust.v1`, `finance.period.close.v1` and
    `people.payroll_draft.create.v1`.

  A manager therefore sees a Cares proposal without buttons, and the line "Only the owner can approve or reject a
  donation." (any other owner-only type: "Only the owner can decide this one."). Staff and advisors see "Owners and
  managers decide proposals." A type the table does not list gets no buttons, as core refuses it.
- **Which outlets.** Core judges a decision over every one of the draft's outlets, and an approve also over the
  outlets its payload writes to (`outlet_id`, else `outlet_ids`; neither, or a null `outlet_id`, means the whole
  business). So a person needs all of them:
  - a draft for the whole business (no outlets, a payload naming none, or a type scoped to the whole business, such as
    ending a deal or committing an import) needs every outlet: "Only the owner can decide this one: it changes the
    whole business.";
  - a draft for outlets beyond the person's (a manager of one outlet, a two-outlet draft): "Only the owner can decide
    this one: it covers outlets beyond yours."

  Core is a little wider for Reject: it checks only the draft's own outlets, so a manager who has all of them could
  reject a draft whose payload is for the whole business. The gate offers no buttons there (stricter than core).
- **Which buttons (`approveGate`).** "Approve" only while every number traces; "Approve with my edits" once the
  person has typed every untraced value (`editsReady`); "Reject" always. A snapshot cell the approver cannot open
  offers Reject only: core re-reads every cell the draft was based on under the approver's access, so typing over it
  cannot pass.
- **Edits (`withEdits`).** Each typed number replaces its leaf, whole, with `{ value, typed_by: <the approver's
  member_id> }`. Every other ref stays exactly as proposed.
- **Sending (`approveAttempt`, `rejectAttempt`).** One frozen attempt per thing confirmed (§4). Reject always carries a
  reason code and a note.
- **Answers (`outcomeOf`).** 409 `already_decided`, 409 `stale_draft`, 422 `cannot_verify` and 422
  `execution_failed` each have their own outcome. A network error, 429 or 5xx keeps the attempt for a resend.

```ts
// file: lib/munim/drafts.ts
// The one module for AI drafts, used by the draft page (12), the Cares proposal card (14) and the purchase-order
// proposal card (15): the payload's numbers (each a ref, or a person's edit), who may decide a draft (core's rule),
// which buttons it gets, the payload sent with "Approve with my edits" ({ value, typed_by }), approve and reject as one
// frozen attempt each (01 §4), what every answer means (409 / 422), and the words for titles, sources, decisions and
// history. Nothing here decides anything by itself: every call starts from a person's tap. Nothing adds a number up:
// an edit replaces one leaf, whole, with what the person typed. Plain TypeScript, no React.
import type { MunimError, Result } from "./client";
import { attemptFor, retryable, type CommandAttempt } from "./commands";
import { titleCase } from "./format";
import { draftValue, parseRef, type DraftValue } from "./refs";
import type { Me, Role } from "./session";
import { ROLE_LABEL, specialistName, VERDICT } from "./staff-copy";
import type { Schemas } from "./types";

export type Draft = Schemas["V1Draft"];
export type DraftDetail = Schemas["V1DraftDetail"];
export type Decision = NonNullable<DraftDetail["decision"]>;
export type HistoryEntry = DraftDetail["history"][number];
export type StaleChange = NonNullable<HistoryEntry["changes"]>[number];
export type EditedPayload = NonNullable<Schemas["DraftsApproveV1"]["edited_payload"]>;
export type RejectCode = NonNullable<Schemas["DraftsRejectV1"]["reason_code"]>;
export type ApproveAttempt = CommandAttempt<"drafts.approve.v1", Schemas["DraftsApproveV1"]>;
export type RejectAttempt = CommandAttempt<"drafts.reject.v1", Schemas["DraftsRejectV1"]>;

const isEdit = (x: unknown): x is { value: number; typed_by: string } => typeof x === "object" && x !== null && "value" in x && "typed_by" in x;
const isRef = (x: unknown): x is string => typeof x === "string" && x.startsWith("⟨");

// ---------------------------------------------------------------- the numbers
export interface NumericField {
  /** JSON Pointer into the payload ("/lines/0/unit_price_minor"): the key for resolved_refs and for edits. */
  path: string;
  /** The payload field's name: formats the value (formatCell) and names the unit (unitOf). */
  column: string;
  /** The payload line the field sits on (payload.lines[i]: its ingredient or item, its unit); null at the top level. */
  line: Record<string, unknown> | null;
  value: DraftValue;
}

/** Every numeric field of a draft, in payload order. The contract admits no bare number in a draft payload: each one
 *  is a ref (as proposed) or `{value, typed_by}` (a person's edit). */
export function numericFields(d: DraftDetail): NumericField[] {
  const out: NumericField[] = [];
  const walk = (x: unknown, path: string, column: string, line: Record<string, unknown> | null): void => {
    if (isRef(x) || isEdit(x)) {
      out.push({ path, column, line, value: draftValue(x, path, d.draft.resolved_refs, d.unverified_refs) });
    } else if (Array.isArray(x)) {
      x.forEach((v, i) => walk(v, `${path}/${i}`, column, line));
    } else if (typeof x === "object" && x !== null) {
      const o = x as Record<string, unknown>;
      const isLine = /^\/lines\/\d+$/.test(path);
      for (const [k, v] of Object.entries(o)) walk(v, `${path}/${k}`, k, isLine ? o : line);
    }
  };
  walk(d.draft.payload, "", "", null);
  return out;
}

// ---------------------------------------------------------------- who may decide it
/** core's rule (approvals decide.ts): drafts.approve.v1 (or drafts.reject.v1) AND the draft's own command type must
 *  both allow the role (core.command_authority, one row per type, below: every type core can draft). Both decide verbs
 *  are owner, manager, judge. A type not listed is refused, as core refuses a type with no authority row. */
const DECIDE: readonly Role[] = ["owner", "manager", "judge"];
const OWNER: readonly Role[] = ["owner", "judge"];
const TYPE_ROLES: Record<string, readonly Role[]> = {
  "cares.listing.publish.v1": OWNER,
  "catalogue.coupon.set.v1": DECIDE,
  "catalogue.deal.end.v1": DECIDE,
  "catalogue.price.set.v1": DECIDE,
  "catalogue.recipe.version.create.v1": DECIDE,
  "compliance.maintenance.schedule.v1": DECIDE,
  "customers.campaign.create.v1": DECIDE,
  "finance.dispute.draft.v1": OWNER,
  "finance.journal.adjust.v1": OWNER,
  "finance.period.close.v1": OWNER,
  "goals.goal.create.v1": DECIDE,
  "goals.task.create.v1": DECIDE,
  "imports.format.approve.v1": DECIDE,
  "imports.run.commit.v1": DECIDE,
  "inventory.reorder_level.set.v1": DECIDE,
  "inventory.transfer.create.v1": DECIDE,
  "kitchen.prep_list.create.v1": DECIDE,
  "kitchen.prep_time.set.v1": DECIDE,
  "people.payroll_draft.create.v1": OWNER,
  "people.roster.create.v1": DECIDE,
  "purchasing.invoice.dispute.v1": DECIDE,
  "purchasing.invoice.record.v1": DECIDE,
  "purchasing.po.create.v1": DECIDE,
  "purchasing.supplier_return.create.v1": DECIDE,
};
/** Types whose authority row is scoped to the whole business: only someone with every outlet may decide them. */
const WHOLE_BUSINESS = new Set([
  "catalogue.coupon.set.v1", "catalogue.deal.end.v1", "catalogue.recipe.version.create.v1", "customers.campaign.create.v1", "finance.dispute.draft.v1",
  "finance.journal.adjust.v1", "imports.format.approve.v1", "imports.run.commit.v1", "purchasing.invoice.dispute.v1", "purchasing.invoice.record.v1",
]);

export const mayDecide = (role: Role, commandType: string): boolean => DECIDE.includes(role) && (TYPE_ROLES[commandType] ?? []).includes(role);

/** Which decision buttons a draft gets. */
export type ApproveGate =
  /** Not proposed any more: no buttons. */
  | { kind: "closed" }
  /** This person's role or outlets cannot decide it: no buttons, one line saying who can. */
  | { kind: "not_for_you"; why: "staff" | "role" | "whole_business" | "outlets" }
  /** A snapshot cell this person cannot open, or a ref no field holds: Reject only. */
  | { kind: "untraceable" }
  /** These fields do not trace: "Approve" hidden; type each one, then "Approve with my edits". */
  | { kind: "type_first"; paths: string[] }
  /** Everything traces: "Approve", or "Edit" then "Approve with my edits". */
  | { kind: "open" };

/** The outlets a payload writes to, as core reads them (approvals decide.ts outletTargets): none = the whole business. */
const targetsOf = (payload: unknown): string[] => {
  const p = payload as { outlet_id?: unknown; outlet_ids?: unknown };
  return typeof p.outlet_id === "string" ? [p.outlet_id] : Array.isArray(p.outlet_ids) ? p.outlet_ids.filter((x): x is string => typeof x === "string") : [];
};

export function approveGate(d: DraftDetail, fields: readonly NumericField[], me: Me): ApproveGate {
  if (d.draft.status !== "proposed") return { kind: "closed" };
  if (!DECIDE.includes(me.role)) return { kind: "not_for_you", why: "staff" };
  if (!mayDecide(me.role, d.draft.command_type)) return { kind: "not_for_you", why: "role" };
  // Core judges every one of the draft's outlets and every outlet its payload writes to; none means the whole
  // business, which needs every outlet, as does a whole-business command type.
  const targets = targetsOf(d.draft.payload);
  const mine = me.outlet_ids;
  if (mine !== "*" && (d.draft.outlet_ids.length === 0 || targets.length === 0 || WHOLE_BUSINESS.has(d.draft.command_type))) return { kind: "not_for_you", why: "whole_business" };
  if (mine !== "*" && [...d.draft.outlet_ids, ...targets].some((o) => !mine.includes(o))) return { kind: "not_for_you", why: "outlets" };
  const held = new Set(fields.flatMap((f) => (f.value.kind === "unverified" ? [f.value.ref] : [])));
  // Typing over a snapshot cell does not help: core re-reads the cells a draft was based on under the approver's
  // scope and refuses with cannot_verify. And a ref no field holds (a based_on cell) has nothing to type into. Only a
  // quoted value (a simulated supplier's price, ⟨cite:…⟩) can be replaced by the value the person checked.
  if (d.unverified_refs.some((r) => !held.has(r) || parseRef(r)?.kind === "snap")) return { kind: "untraceable" };
  const paths = fields.filter((f) => f.value.kind === "unverified").map((f) => f.path);
  return paths.length > 0 ? { kind: "type_first", paths } : { kind: "open" };
}

/** The line above the decision buttons, or null. */
export function gateLine(g: ApproveGate, commandType: string): string | null {
  if (g.kind === "not_for_you") {
    if (g.why === "staff") return "Owners and managers decide proposals.";
    if (g.why === "whole_business") return "Only the owner can decide this one: it changes the whole business.";
    if (g.why === "outlets") return "Only the owner can decide this one: it covers outlets beyond yours.";
    return commandType === "cares.listing.publish.v1" ? "Only the owner can approve or reject a donation." : "Only the owner can decide this one.";
  }
  if (g.kind === "untraceable") return "Some numbers this draft relies on can't be opened with your access, so it can't be approved. You can reject it.";
  if (g.kind === "type_first") return "Some numbers in this draft don't trace to your books. Type the values you checked, or reject it.";
  return null;
}

/** "Approve with my edits" is enabled once at least one value is typed, every untraced field has one, and the reason
 *  box holds 1–500 characters. `edits` is keyed by JSON Pointer path, in the field's own units (parseTyped). */
export function editsReady(gate: ApproveGate, edits: Readonly<Record<string, number>>, reason: string): boolean {
  if (gate.kind !== "open" && gate.kind !== "type_first") return false;
  const r = reason.trim();
  const covered = gate.kind === "open" || gate.paths.every((p) => p in edits);
  return Object.keys(edits).length > 0 && covered && r.length >= 1 && r.length <= 500;
}

/** The edited_payload: the proposed payload with each edited leaf replaced, whole, by {value, typed_by: <the
 *  approver's member_id>} (R26). Every other ref stays exactly as proposed (core checks that it is the same ref at the
 *  same path, and that typed_by is the person approving). */
export function withEdits(payload: Draft["payload"], edits: Readonly<Record<string, number>>, memberId: string): EditedPayload {
  const copy = structuredClone(payload) as unknown as Record<string, unknown>;
  for (const [path, value] of Object.entries(edits)) {
    const keys = path.split("/").slice(1);
    let at = copy;
    for (const k of keys.slice(0, -1)) at = at[k] as Record<string, unknown>;
    at[keys[keys.length - 1]!] = { value, typed_by: memberId };
  }
  return copy as unknown as EditedPayload;
}

// ---------------------------------------------------------------- deciding it
/** Approve as proposed (`edited` null, `reason` null) or with the person's edits (withEdits, and a reason). The same
 *  inputs again = the same attempt (a retry). */
export function approveAttempt(prev: ApproveAttempt | null, draft: { draft_id: string; command_type: string }, edited: EditedPayload | null, reason: string | null): ApproveAttempt {
  return attemptFor(prev, JSON.stringify(["approve", draft.draft_id, edited, reason]), "drafts.approve.v1", () => ({
    draft_id: draft.draft_id,
    command_type: draft.command_type,
    edited_payload: edited,
    reason,
  }));
}

/** Reject always carries a reason code and a note (1–500 characters). */
export function rejectAttempt(prev: RejectAttempt | null, draftId: string, code: RejectCode, note: string): RejectAttempt {
  return attemptFor(prev, JSON.stringify(["reject", draftId, code, note]), "drafts.reject.v1", () => ({ draft_id: draftId, reason: note, reason_code: code }));
}

/** What an approve or reject answer means for the screen that sent it. */
export type Outcome =
  /** Approve answers the EXECUTED command's type and entity (a PO, a listing); reject answers drafts.reject.v1. */
  | { kind: "done"; type: string; entityId: string }
  /** network, 429 or 5xx: the same attempt may be sent again (after error.retryAfterMs on a 429) */
  | { kind: "retry"; error: MunimError }
  /** 409 stale_draft: the cells behind it moved; the draft is now "stale" and can no longer be approved or rejected */
  | { kind: "stale" }
  /** 409 already_decided: someone else decided first */
  | { kind: "decided_elsewhere" }
  /** 422 cannot_verify: a number no longer traces; refetch the draft, its fields show "Cannot verify" */
  | { kind: "cannot_verify"; error: MunimError }
  /** 422 execution_failed: approved but not applied; nothing changed */
  | { kind: "failed_to_apply"; error: MunimError }
  | { kind: "signed_out"; error: MunimError }
  | { kind: "not_found" }
  /** any other refusal (403 authority_denied, a reason code from the command): show staffErrorText */
  | { kind: "refused"; error: MunimError };

export function outcomeOf(r: Result<Schemas["CommandResult"]>): Outcome {
  if (r.ok) return { kind: "done", type: r.data.type, entityId: r.data.entity_id };
  const e = r.error;
  if (e.status === 401) return { kind: "signed_out", error: e };
  if (e.kind === "not_found") return { kind: "not_found" };
  if (retryable(e)) return { kind: "retry", error: e };
  if (e.code === "stale_draft") return { kind: "stale" };
  if (e.code === "already_decided") return { kind: "decided_elsewhere" };
  if (e.code === "cannot_verify") return { kind: "cannot_verify", error: e };
  if (e.code === "execution_failed") return { kind: "failed_to_apply", error: e };
  return { kind: "refused", error: e };
}

/** The cells that changed since the draft was proposed (a stale draft's history), each with its old and new ref. */
export const staleChanges = (d: DraftDetail): StaleChange[] => d.history.flatMap((h) => h.changes ?? []);

// ---------------------------------------------------------------- words
const TITLE: Record<string, string> = {
  "kitchen.prep_time.set.v1": "Change an item's prep time",
  "kitchen.prep_list.create.v1": "A prep list",
  "purchasing.po.create.v1": "A purchase order",
  "purchasing.invoice.dispute.v1": "Dispute a supplier invoice",
  "purchasing.supplier_return.create.v1": "Send goods back to a supplier",
  "inventory.reorder_level.set.v1": "Change a reorder level",
  "inventory.transfer.create.v1": "Move stock between outlets",
  "catalogue.price.set.v1": "Change a price",
  "catalogue.recipe.version.create.v1": "A new recipe version",
  "catalogue.deal.end.v1": "End a deal",
  "cares.listing.publish.v1": "List surplus food on Munim Cares",
  "goals.task.create.v1": "A task for the team",
};
/** What a draft proposes, in words, from its command type. */
export const draftTitle = (commandType: string): string => TITLE[commandType] ?? "A proposed change";

const FINDING: Record<string, string> = {
  "inventory.waste_spike": "More waste than a usual week",
  "kitchen.ticket_drift": "Tickets running past their prep time",
  "inventory.expiry_risk": "Food at risk of going to waste",
};
/** What a finding is about, from its type. */
export const findingTitle = (type: string): string => FINDING[type] ?? titleCase(type);

const FIELD: Record<string, string> = {
  prep_sec: "Prep time",
  qty_milli: "Quantity",
  unit_price_minor: "Price",
  price_minor: "Price",
  min_qty_milli: "Minimum",
  par_qty_milli: "Par level",
  min_spend_minor: "Minimum spend",
};
/** A numeric field's label, from its payload name. */
export const fieldLabel = (column: string): string => FIELD[column] ?? titleCase(column);

/** Who proposed it: the specialist for "intel:<pack>", else an import or a person. */
export const sourceName = (source: string): string =>
  source.startsWith("intel:") ? specialistName(source.slice("intel:".length)) : source === "import" ? "An import" : "A team member";

/** A person as core names them; the name is null for a member who has none. */
export const personName = (p: { name: string | null }): string => p.name ?? "a team member";

const EVENT: Record<string, string> = {
  proposed: "Proposed",
  approved: "Approved",
  edited: "Approved with edits",
  rejected: "Rejected",
  executing: "Applying",
  executed: "Applied",
  failed: "Couldn't apply",
  stale: "Out of date",
};
/** One history row in words: "Approved with edits · Nandini Mehrotra (demo)". */
export function historyWords(h: HistoryEntry): string {
  const by = typeof h.by === "string" ? sourceName(h.by) : "name" in h.by ? personName(h.by) : (ROLE_LABEL[h.by.role] ?? "A team member");
  return `${EVENT[h.event] ?? titleCase(h.event)} · ${by}`;
}

/** The lineage line under a draft (02 §5): who proposed it and when, the finding it came from, and who decided it.
 *  Names come from the decision (decided_by.name), never from the model. */
export function lineageLine(d: DraftDetail, when: (iso: string) => string, finding: string | null): string {
  const parts = [`Proposed by ${sourceName(d.draft.source)} · ${when(d.draft.created_at)}`];
  if (d.draft.finding_id) parts.push(finding ? `from a finding: ${finding}` : "from a finding");
  if (d.decision) parts.push(`${VERDICT[d.decision.verdict]} by ${personName(d.decision.decided_by)} · ${when(d.decision.decided_at)}`);
  return parts.join(" · ");
}
```

## 7 · Live updates

```ts
// file: lib/munim/staff-stream.ts
// Live updates for staff screens: the SDK's fetch-based openStream with the member's bearer token and the tenant
// header (never EventSource, which cannot send them). Events carry ids and statuses only, so the screen never reads
// state from an event: every event (and every reconnect) is a wake-up to refetch the board, order or inbox.
import { TENANT_HEADER } from "@munim/sdk";
import type { Session } from "./session";
import { openStream, StreamRefused, type StreamState } from "./stream";

/** kds:<outlet> (tickets and orders of one outlet), order:<id>, inbox:<tenant> (owner and manager only). Up to 10. */
export const topic = {
  kds: (outletId: string) => `kds:${outletId}`,
  order: (orderId: string) => `order:${orderId}`,
  inbox: (tenantId: string) => `inbox:${tenantId}`,
};

export type LiveState = StreamState | "refused";

export interface WatchOptions {
  baseUrl: string;
  session: Pick<Session, "token" | "tenantId">;
  topics: readonly string[];
  /** Refetch here. Called at most once per 300 ms, and once each time the stream (re)opens. */
  onWake: () => void;
  /** "refused" = the server will not serve these topics to this person (404): show "Live updates are off" and
   *  keep the screen's Refresh button. Never retry a refused stream. */
  onState?: (s: LiveState) => void;
  extraHeaders?: () => Record<string, string>;
}

/** Starts watching; returns a stop function (call it on unmount or when the outlet changes). */
export function watch(o: WatchOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wake = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      o.onWake();
    }, 300);
  };
  const handle = openStream({
    baseUrl: o.baseUrl.replace(/\/+$/, ""),
    topics: o.topics,
    token: () => o.session.token,
    headers: () => ({ ...(o.extraHeaders?.() ?? {}), [TENANT_HEADER]: o.session.tenantId }),
    onEvent: wake,
    onState: (s) => {
      if (s === "open") wake(); // anything missed while reconnecting is refetched
      o.onState?.(s);
    },
  });
  handle.done.catch((e: unknown) => {
    if (e instanceof StreamRefused) o.onState?.("refused");
  });
  return () => {
    if (timer) clearTimeout(timer);
    handle.close();
  };
}
```

| Topic | Who may open it | Events (each `{id, type, data}`; data holds ids and statuses only) |
|---|---|---|
| `kds:<outlet id>` | Anyone whose outlets include it | `munim.kitchen.ticket.created.v1`, `munim.kitchen.ticket.advanced.v1`, `munim.orders.order.placed.v1`, `munim.orders.order.status_changed.v1`, `munim.orders.tender.recorded.v1`, and the outlet's other order events |
| `order:<order id>` | Anyone who can read the order | Every event of that order |
| `inbox:<tenant id>` | **Owner and manager only** | `inbox.draft`, `inbox.finding`, `inbox.investigation` |

- Any topic the person may not read makes the **whole** request 404 (`StreamRefused`, state `"refused"`): never mix
  `inbox:` into a staff member's topics. A malformed topic is 400.
- Topics travel in the URL (`/v1/stream?topics=…`), and core requires the `inbox:` topic to name the tenant. That is
  the one place a tenant id is in a URL (20 §4; 00 §7 question 25).
- Frames: `event: ready` first; then `id: o=<n>` / `data: {...}`; `: hb` every 20 s; `event: reconnect` before the
  server closes (the real API at 55 min, the mock at about 50 s). The SDK reconnects with `Last-Event-ID`.
- On every event and every reopen, refetch (`onWake`). Never patch the screen from the event.

## 8 · Session, the app's wiring, the mock switches

```ts
// file: lib/munim/session.ts
// The session seam: who is signed in, in which business, and the staff client for them. Two ways in:
//   - the mock: the "Demo sign-in" picker with three invented people, each with a public mock token;
//   - the real API: an IdP ID token (the founder sends the IdP details later) -> GET /v1/me/tenants -> GET /v1/me.
// The session lives in sessionStorage only (never localStorage, a URL or a log). Plain TypeScript, no React.
import { createMunimClient as createSdkClient } from "@munim/sdk";
import { settle, type Result } from "./client";
import { createStaffClient, type StaffClient } from "./staff";
import type { Schemas } from "./types";

export type Me = Schemas["V1Me"];
export type Role = Me["role"];

export interface Session {
  token: string;
  tenantId: string;
  /** GET /v1/me as core resolved it: member_id, name, role, outlet_ids ("*" = every outlet). */
  me: Me;
  /** True when signed in with the demo picker: the shell shows the "Demo sign-in" badge. */
  demo: boolean;
}

/** The mock's business. Public test values, like the storefront key; the real API never accepts them. */
export const DEMO_TENANT_ID = "019a0c5e-7e11-7a00-8c0b-0000000c0b17";

export interface DemoPerson {
  key: "owner" | "counter" | "kitchen";
  /** Shown on the picker card, then replaced by GET /v1/me's name once signed in. */
  name: string;
  role: Role;
  /** What the card says the person does. */
  blurb: string;
  /** Where the person lands after signing in. */
  home: string;
  token: string;
}

export const DEMO_PEOPLE: readonly DemoPerson[] = [
  { key: "owner", name: "Nandini Mehrotra (demo)", role: "owner", blurb: "Owner · both outlets", home: "/staff/home", token: "mock_member_owner_c0b1_7f2e9a14" },
  { key: "counter", name: "Imran Siddiqui (demo)", role: "staff", blurb: "Counter · Cobnut Hazratganj", home: "/staff/counter", token: "mock_member_counter_c0b1_3b8d5e60" },
  { key: "kitchen", name: "Kavya Tandon (demo)", role: "staff", blurb: "Kitchen · Cobnut Hazratganj", home: "/staff/kitchen", token: "mock_member_kitchen_c0b1_91c4a2d7" },
];

const SESSION_KEY = "munim.staff.session";
const OUTLET_KEY = "munim.staff.outlet";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return s && typeof s.token === "string" && typeof s.tenantId === "string" && s.me ? s : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // storage blocked: the person stays signed in for this page only
  }
}

/** Deletes the session and the chosen outlet. Call on "Sign out" and on any 401. */
export function signOut(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(OUTLET_KEY);
  } catch {
    // nothing stored
  }
}

/** The outlet the shell's switcher chose (an id, not a credential); null = not chosen yet. */
export function readOutlet(): string | null {
  try {
    return typeof window === "undefined" ? null : sessionStorage.getItem(OUTLET_KEY);
  } catch {
    return null;
  }
}
export function writeOutlet(outletId: string): void {
  try {
    sessionStorage.setItem(OUTLET_KEY, outletId);
  } catch {
    // storage blocked: the switcher falls back to the first outlet on each page
  }
}

/** The staff client for a session. `extraHeaders` = mockHeaders on the mock (index.ts), else undefined. */
export const clientFor = (baseUrl: string, s: Pick<Session, "token" | "tenantId">, extraHeaders?: () => Record<string, string>): StaffClient =>
  createStaffClient({ baseUrl, token: () => s.token, tenantId: s.tenantId, extraHeaders });

/** Signs in with a token and tenant: GET /v1/me proves both, then the session is stored. A 401 or 404 means the
 *  token or the membership is not good; the caller shows "Sign-in didn't work" and never says which. */
export async function signInWith(baseUrl: string, token: string, tenantId: string, demo: boolean): Promise<Result<Session>> {
  const me = await clientFor(baseUrl, { token, tenantId }).getMe();
  if (!me.ok) return me;
  const session: Session = { token, tenantId, me: me.data, demo };
  writeSession(session);
  return { ok: true, status: me.status, data: session, replayed: false };
}

/** The mock's "Demo sign-in" picker. */
export const signInDemo = (baseUrl: string, person: DemoPerson): Promise<Result<Session>> => signInWith(baseUrl, person.token, DEMO_TENANT_ID, true);

/** The real API: an ID token from the IdP (the founder sends its details later). Lists the businesses this sign-in
 *  belongs to (no tenant header yet); with exactly one, signs in to it; with several, the caller shows a picker and
 *  calls signInWith for the one chosen. */
export async function tenantsFor(baseUrl: string, idToken: string): Promise<Result<Schemas["TenancyMeTenants"]>> {
  const sdk = createSdkClient({ baseUrl: baseUrl.replace(/\/+$/, ""), token: () => idToken });
  return settle(() => sdk.GET("/v1/me/tenants", { cache: "no-store", signal: AbortSignal.timeout(15_000) }));
}

/** Which screens a role may open (the API is the real guard; this only hides tabs that would be refused). */
export const CAN: Record<string, readonly Role[]> = {
  counter: ["owner", "manager", "staff", "judge"],
  kitchen: ["owner", "manager", "staff", "judge"],
  home: ["owner", "manager", "judge"],
  inbox: ["owner", "manager", "judge"],
  ask: ["owner", "manager", "staff", "advisor", "judge"],
  cares: ["owner", "manager", "staff", "judge"],
  suppliers: ["owner", "manager", "judge"],
};
export const can = (s: Session | null, screen: keyof typeof CAN): boolean => s !== null && CAN[screen]!.includes(s.me.role);
```

```ts
// file: lib/munim/staff-app.ts
// The app's staff wiring, built from the same env vars as the storefront (index.ts): the client and the live
// updates for the signed-in session, plus the mock's "Simulate a web order" switch.
import { API_BASE, IS_MOCK } from "./index";
import { MOCK_CONTROLS_ENABLED, mockHeaders } from "./mock-controls";
import { clientFor, type Session } from "./session";
import { watch, type LiveState } from "./staff-stream";
import { uuidv7 } from "./uuid";

const extra = IS_MOCK ? mockHeaders : undefined;

export const staffFor = (s: Session) => clientFor(API_BASE, s, extra);

export const watchFor = (s: Session, topics: readonly string[], onWake: () => void, onState?: (st: LiveState) => void) =>
  watch({ baseUrl: API_BASE, session: s, topics, onWake, onState, extraHeaders: extra });

/** Mock only (Mock controls panel): places a synthetic web order at the outlet, so the kitchen gets a pickup ticket
 *  the way a storefront order would reach it on the real API. Not a Munim route; never called against the real API. */
export async function simulateWebOrder(s: Session, outletId: string): Promise<boolean> {
  if (!IS_MOCK || !MOCK_CONTROLS_ENABLED) return false;
  try {
    const res = await fetch(`${API_BASE}/v1/_mock/web-order`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}`, "X-Munim-Tenant": s.tenantId },
      body: JSON.stringify({ outlet_id: outletId, request_id: uuidv7() }),
    });
    return res.status === 201;
  } catch {
    return false;
  }
}
```

This replaces the storefront's `lib/munim/mock-controls.ts`; the storefront's two switches keep working unchanged:

```ts
// file: lib/munim/mock-controls.ts
// Dev-only switches for the mock API's test headers. Sent only when the base URL is the mock (index.ts) AND
// NEXT_PUBLIC_MUNIM_MOCK_CONTROLS=1. The storefront's two switches are unchanged; the staff screens add two
// (both optional, so the storefront's MockPanel keeps compiling): how the next approve is answered, and the AI's state.
export type ForcedAccepting = "open" | "busy" | "paused" | "closed";
export type ForcedDecision = "stale" | "already_decided" | "execution_failed";
export type ForcedAi = "off" | "abstain";
export interface MockControls {
  accepting: ForcedAccepting | null;
  force429: boolean;
  /** Approve answers 409 stale_draft, 409 already_decided or 422 execution_failed. */
  decision?: ForcedDecision | null;
  /** Ask answers 503 (AI unavailable: hide the surface) or an abstention (model_blocked). */
  ai?: ForcedAi | null;
}

const STORAGE_KEY = "munim.mock.controls";
export const MOCK_CONTROLS_ENABLED = process.env.NEXT_PUBLIC_MUNIM_MOCK_CONTROLS === "1";

export function readMockControls(): MockControls {
  const none: MockControls = { accepting: null, force429: false, decision: null, ai: null };
  if (!MOCK_CONTROLS_ENABLED || typeof window === "undefined") return none;
  try {
    return { ...none, ...(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<MockControls>) };
  } catch {
    return none;
  }
}

export function writeMockControls(c: MockControls): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    // storage blocked (private mode): the switches simply stay off
  }
}

export function mockHeaders(): Record<string, string> {
  const c = readMockControls();
  const h: Record<string, string> = {};
  if (c.accepting) h["X-Mock-Force-Accepting"] = c.accepting;
  if (c.force429) h["X-Mock-Force-429"] = "1";
  if (c.decision) h["X-Mock-Force-Decision"] = c.decision;
  if (c.ai) h["X-Mock-Force-Ai"] = c.ai;
  return h;
}
```

- **Mock:** `/staff/sign-in` shows the "Demo sign-in" picker (02 §3.2). `signInDemo` calls `GET /v1/me` with the
  person's mock token and stores the session in `sessionStorage`. The shell shows the "Demo sign-in" badge while
  `session.demo` is true.
- **Real API (later):** the founder sends the IdP details. The page then gets an ID token from the IdP, calls
  `tenantsFor(baseUrl, idToken)` (`GET /v1/me/tenants`, no tenant header), and `signInWith(baseUrl, idToken,
  tenantId, false)`. The picker is not shown when `IS_MOCK` is false. Nothing else changes.
- ID tokens expire (the local IdP's after one hour). A 401 anywhere signs the person out (`handleAuth`); the
  refreshed-token path arrives with the IdP details.

## 9 · Copy

```ts
// file: lib/munim/staff-copy.ts
// Every staff-screen string about API state, chosen by code. The server's message is never shown (client.ts drops
// it). Switch on `code` first: member refusals such as already_decided or illegal_transition carry no reason_code,
// so client.ts files them under kind "invalid", which is not what the person needs to hear.
import type { MunimError } from "./client";

export type StaffWhere = "counter" | "kitchen" | "home" | "inbox" | "ask" | "cares" | "suppliers" | "sign-in";

/** One line for a failed call. Callers handle kind "auth" (401: sign out) and "not_found" (404) themselves. */
export function staffErrorText(e: MunimError, where: StaffWhere): string {
  switch (e.code) {
    case "illegal_transition":
      return where === "kitchen" ? "Someone already moved this ticket. The board has been refreshed." : "This changed on another screen. It has been refreshed.";
    case "already_decided":
      return "Someone else already decided this. It has been refreshed.";
    case "stale_draft":
      return "The numbers behind this changed since it was proposed. It can no longer be approved or rejected; a new proposal will replace it.";
    case "cannot_verify":
      return "Cannot verify — some numbers in this draft no longer trace to their source rows.";
    case "execution_failed":
      return "It was approved but could not be applied. Nothing changed.";
    case "forbidden":
    case "book_write_refused":
      return "Your role can't do this. Ask the owner.";
    case "idempotency_conflict":
      return "That didn't go through. Please try again.";
    case "currency_mismatch":
      return "That amount is in the wrong currency.";
    default:
      break;
  }
  if (e.reasonCode) {
    const r = reasonText(e.reasonCode);
    if (r) return r;
  }
  if (e.kind === "rate_limited") return "Too many requests. Please wait a moment and try again.";
  if (e.kind === "network") return where === "kitchen" ? "Offline. Showing the last board; changes will need a retry." : "No connection. Nothing was changed. Try again.";
  if (e.kind === "server") return where === "ask" ? "Munim can't answer right now." : "Something went wrong on our side. Try again.";
  if (where === "sign-in") return "Sign-in didn't work. Try again.";
  return "That didn't work. Please check and try again.";
}

/** A failed WRITE (any command). A `network` failure may have reached core (a 15 s timeout counts as one), so it
 *  never says "nothing changed": the same tap is safe, because the retry resends the same envelope and core replays it. */
export function staffWriteErrorText(e: MunimError, where: StaffWhere): string {
  return e.kind === "network" ? "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." : staffErrorText(e, where);
}

/** Reason codes a staff screen can meet, in the person's words; null = use the generic line. */
export function reasonText(code: string): string | null {
  const t: Record<string, string> = {
    authority_denied: "Your role can't do this. Ask the owner.",
    item_sold_out: "An item just sold out. Remove it to continue.",
    item_unavailable: "An item isn't on sale at this counter right now.",
    preview_total_changed: "The total changed since the preview. Check it and try again.",
    price_above_mrp: "An item's price is above its MRP. It can't be sold until the price is fixed.",
    expired_batch: "An item's stock has expired. It can't be sold.",
    refund_first: "This order has payments. Refund them before cancelling.",
    reason_required: "Choose a reason first.",
    cash_below_rounding: "What's left is smaller than the smallest cash step. Take it by card or UPI.",
    order_tendered: "A payment is recorded, so the time can't be moved.",
    not_applicable: "This outlet has no kitchen display.",
    stale_draft: "The numbers behind this changed since it was proposed.",
    unresolved_ref: "Cannot verify — a number did not trace to its source rows.",
    recently_rejected: "A person rejected the same proposal recently.",
    cares_not_available: "Munim Cares isn't available in this country yet.",
    cares_not_enabled: "Munim Cares isn't switched on for this business yet.",
    cares_not_opted_in: "This outlet hasn't joined Munim Cares.",
    recipient_ineligible: "That simulated recipient can't take this food. Choose another.",
    listing_expired: "The pickup time has passed. Choose a later time.",
    cooked_hold_exceeded: "Cooked food can't be held that long. Choose an earlier pickup.",
    line_expired: "An item is past its date.",
    tax_id_missing: "This outlet's tax ids are missing, so a bill can't be printed. The sale is saved.",
    qty_exceeds_on_hand: "That's more than is in stock.",
    qty_exceeds_listed: "That's more than was listed.",
    unit_mismatch: "That unit doesn't match the item's stock unit.",
    rate_limited: "Too many requests. Please wait a moment and try again.",
  };
  return t[code] ?? null;
}

/** Why an AI answer abstained (envelope.reason_code). Always shown under "Cannot verify". */
export function abstainText(code: string | null | undefined): string {
  switch (code) {
    case "model_blocked":
      return "Munim's AI is switched off or this month's AI budget is used up.";
    case "not_applicable":
      return "That question doesn't apply to the outlets you can see.";
    case "insufficient_history":
      return "There isn't enough history to answer that yet.";
    case "number_grammar":
    case "unresolved_ref":
    case "cross_tenant_ref":
    case "missing_ref":
      return "Munim couldn't trace every number in its answer to your books, so it didn't answer.";
    default:
      return "Munim couldn't answer that from your books.";
  }
}

export const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff", advisor: "Advisor", judge: "Judge" };

export const ORDER_STATUS: Record<string, string> = {
  placed: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Picked up",
  rejected: "Not accepted",
  cancelled: "Cancelled",
};
export const TICKET_STATUS: Record<string, string> = { queued: "Waiting", preparing: "Preparing", ready: "Ready", done: "Done" };
/** The next kitchen step and its button text; null = no further step. One step forward only. */
export const TICKET_NEXT: Record<string, { to: "preparing" | "ready" | "done"; label: string } | null> = {
  queued: { to: "preparing", label: "Start" },
  preparing: { to: "ready", label: "Ready" },
  ready: { to: "done", label: "Handed over" },
  done: null,
};
export const TICKET_COLOUR: Record<string, string> = { normal: "On time", amber: "Due soon", red: "Late" };
export const DRAFT_STATUS: Record<string, string> = {
  proposed: "Waiting for you",
  executing: "Applying",
  executed: "Applied",
  failed: "Couldn't apply",
  rejected: "Rejected",
  stale: "Out of date",
};
export const VERDICT: Record<string, string> = { approved: "Approved", edited: "Approved with edits", rejected: "Rejected" };
export const LISTING_STATUS: Record<string, string> = { published: "Waiting for pickup", allocated: "Claimed", closed: "Handed over", withdrawn: "Withdrawn" };
export const PO_STATUS: Record<string, string> = { committed: "Sent", received: "Received", cancelled: "Cancelled" };
export const TENDER_METHOD: Record<string, string> = { cash: "Cash", card: "Card", upi: "UPI" };

/** Reject reasons for drafts and findings (drafts.reject.v1 reason_code, findings.dismiss.v1 reason_code). */
export const REJECT_REASONS = [
  { code: "wrong_numbers", label: "The numbers look wrong" },
  { code: "not_needed", label: "Not needed" },
  { code: "already_done", label: "Already done" },
  { code: "bad_timing", label: "Not now" },
  { code: "other", label: "Something else" },
] as const;

/** Specialist display names (GET /v1/specialists sends name keys only). */
export const SPECIALIST_NAME: Record<string, string> = {
  manager: "Manager",
  catalogue: "Menu & Pricing",
  kitchen: "Kitchen",
  inventory_purchasing: "Stock & Purchasing",
  finance: "Finance",
  people: "People",
  customers: "Customers",
  compliance: "Compliance",
  market: "Market",
};
export const specialistName = (id: string | null | undefined): string => (id ? (SPECIALIST_NAME[id] ?? id) : "Manager");

export const SIMULATED_SUPPLIER = "Simulated supplier";
export const SIMULATED_RECIPIENT = "Simulated recipient";
export const DEMO_SIGN_IN = "Demo sign-in";
export const CANNOT_VERIFY = "Cannot verify";
```

- `staffErrorText` is for reads. **Every failed command** (place, pay, a step, approve, reject, publish, hand-over,
  receive) uses `staffWriteErrorText`: a network failure there may have reached core (a 15 s timeout counts as one),
  so it says "The connection dropped before Munim answered. Tap again: it's safe and won't happen twice." and never
  "Nothing was changed". The retry is the same envelope (§4), so it can never land twice.
- A refusal with a reason (`invalid_payload` + `listing_expired`, `conflict` + `qty_exceeds_listed`, …) is
  `kind: "refusal"` in client.ts. Its `code` is not one the switch names, so the reason's own line is shown. The test
  below proves it with stubbed answers the mock cannot give (`npm test` runs it with Cobnut's own tests).

```ts
// file: tests/staff-copy.test.ts
// [unit] Staff copy for refusals the mock cannot produce: each is a stubbed answer run through Cobnut's parseError,
// then the staff copy. A refusal with a reason gets that reason's line, never a generic one or the server's message.
import { describe, expect, it } from "vitest";
import { parseError } from "@/lib/munim/client";
import { staffErrorText, staffWriteErrorText } from "@/lib/munim/staff-copy";

const answer = (status: number, code: string, reason: string | null) =>
  parseError(new Response(null, { status }), { error: { code, message: "A server message is never shown.", reason_code: reason } });

describe("staff copy by code and reason (stubbed answers)", () => {
  it("422 invalid_payload + listing_expired", () => {
    const e = answer(422, "invalid_payload", "listing_expired");
    expect(e.kind).toBe("refusal");
    expect(staffWriteErrorText(e, "cares")).toBe("The pickup time has passed. Choose a later time.");
  });
  it("422 invalid_payload + recipient_ineligible", () =>
    expect(staffWriteErrorText(answer(422, "invalid_payload", "recipient_ineligible"), "cares")).toBe("That simulated recipient can't take this food. Choose another."));
  it("422 invalid_payload + reason_required", () =>
    expect(staffWriteErrorText(answer(422, "invalid_payload", "reason_required"), "counter")).toBe("Choose a reason first."));
  it("422 invalid_payload without a reason is the generic line", () =>
    expect(staffErrorText(answer(422, "invalid_payload", null), "cares")).toBe("That didn't work. Please check and try again."));
  it("409 stale_draft", () =>
    expect(staffWriteErrorText(answer(409, "stale_draft", "stale_draft"), "inbox")).toBe("The numbers behind this changed since it was proposed. It can no longer be approved or rejected; a new proposal will replace it."));
});
```

## 10 · Staff smoke test (run before any staff UI)

```ts
// file: scripts/staff-smoke.ts
// Proves the staff client against an API before any staff UI is built: who am I, the till (menu, preview, place,
// replay, key reuse, read, tender), the kitchen (board, live event, advance, stale advance), the inbox and drafts,
// snapshots, Ask (mock only unless STAFF_SMOKE_ASK=1), Cares, suppliers, and the 401 / 404 rules.
//   Mock:     NEXT_PUBLIC_MUNIM_API=http://localhost:3000/mock npx tsx scripts/staff-smoke.ts
//   Real API: also STAFF_SMOKE_TOKENS=<path to {"owner": "<token>", "scoped": "<token>"}>. Tokens are read from that
//             file and never printed. "scoped" is a member with a list of outlets (counter staff on the mock).
// It writes to the API it is pointed at (one counter order, one card payment recorded, and that order's kitchen ticket
// moved to done, which completes the order), never decides a draft, and prints ids, statuses and counts only. Run it
// only against the mock or a local development copy of the API, never against a shared deployment.
import { readFileSync } from "node:fs";
import type { MunimError } from "../lib/munim/client";
import { attemptFor, envelope } from "../lib/munim/commands";
import { formatCell, renderSegment, snapRef } from "../lib/munim/refs";
import { DEMO_PEOPLE, DEMO_TENANT_ID, clientFor, tenantsFor } from "../lib/munim/session";
import { createStaffClient } from "../lib/munim/staff";
import { topic, watch } from "../lib/munim/staff-stream";
import { uuidv7 } from "../lib/munim/uuid";

const baseUrl = (process.env.NEXT_PUBLIC_MUNIM_API ?? "").replace(/\/+$/, "");
const tokensFile = process.env.STAFF_SMOKE_TOKENS;
const isMock = /\/mock$/.test(baseUrl);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};
const skip = (name: string, why: string) => console.log(`skip ${name}: ${why}`);
const why = (e: MunimError) => `${e.kind} ${e.status} ${e.code ?? ""} ${e.reasonCode ?? ""}`.trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function people(): Promise<{ owner: string; scoped: string; tenantId: string }> {
  if (!tokensFile) {
    const by = (k: string) => DEMO_PEOPLE.find((p) => p.key === k)!.token;
    return { owner: by("owner"), scoped: by("counter"), tenantId: DEMO_TENANT_ID };
  }
  const t = JSON.parse(readFileSync(tokensFile, "utf8")) as { owner: string; scoped: string };
  const tenants = await tenantsFor(baseUrl, t.owner);
  if (!tenants.ok || tenants.data.tenants.length === 0) throw new Error(`tenants: ${tenants.ok ? "none" : why(tenants.error)}`);
  return { ...t, tenantId: tenants.data.tenants[0]!.tenant_id };
}

async function main(): Promise<void> {
  if (!/^https?:\/\//.test(baseUrl)) throw new Error("set NEXT_PUBLIC_MUNIM_API to an absolute URL, e.g. http://localhost:3000/mock");
  const who = await people();
  const owner = clientFor(baseUrl, { token: who.owner, tenantId: who.tenantId });
  const scoped = clientFor(baseUrl, { token: who.scoped, tenantId: who.tenantId });

  // ---- who and where ----
  const me = await owner.getMe();
  if (me.ok) check("me (owner)", me.data.role === "owner" && me.data.outlet_ids === "*", `${me.data.role}, outlets ${me.data.outlet_ids === "*" ? "all" : me.data.outlet_ids.length}`);
  else check("me (owner)", false, why(me.error));
  const meScoped = await scoped.getMe();
  if (meScoped.ok) check("me (scoped)", Array.isArray(meScoped.data.outlet_ids) && meScoped.data.outlet_ids.length > 0, `${meScoped.data.role}, ${Array.isArray(meScoped.data.outlet_ids) ? meScoped.data.outlet_ids.length : "all"} outlet(s)`);
  else check("me (scoped)", false, why(meScoped.error));
  const tenant = await owner.getTenant();
  if (!tenant.ok) throw new Error(`tenant: ${why(tenant.error)}`);
  const fmt = { locale: "en-IN", currency: tenant.data.base_currency };
  const outlets = await owner.listOutlets();
  if (!outlets.ok) throw new Error(`outlets: ${why(outlets.error)}`);
  const kitchenOutlets = outlets.data.outlets.filter((o) => o.kind === "restaurant" || o.kind === "cloud_kitchen");
  check("outlets", kitchenOutlets.length > 0, outlets.data.outlets.map((o) => `${o.name} (${o.kind})`).join(", "));
  // The scoped member's outlets come from GET /v1/me (GET /v1/outlets lists every outlet of the business).
  const scopedIds = meScoped.ok && Array.isArray(meScoped.data.outlet_ids) ? meScoped.data.outlet_ids : null;
  const outlet = kitchenOutlets.find((o) => scopedIds?.includes(o.id)) ?? kitchenOutlets[0]!;
  const channels = await owner.listChannels();
  const counter = channels.ok ? channels.data.channels.find((c) => c.kind === "counter" && c.active) : undefined;
  check("counter channel", counter !== undefined, channels.ok ? `${channels.data.channels.length} channel(s)` : why(channels.error));
  if (!counter) throw new Error("no active counter channel");

  // ---- the till ----
  const menu = await owner.getMenu(outlet.id, "counter");
  if (!menu.ok) throw new Error(`menu: ${why(menu.error)}`);
  const entry = menu.data.entries.find((e) => e.available && e.option_groups.every((g) => !g.required));
  if (!entry) throw new Error("no simple item on the counter menu");
  check("counter menu", true, `${menu.data.entries.length} entries, business date ${menu.data.business_date}, first simple item ${entry.display_name ?? entry.name_key}`);
  const line = { item_id: entry.item_id, variant_id: entry.variant_id, option_ids: [] as string[], qty_milli: 1000, barcode: null };
  const previewBody = { outlet_id: outlet.id, channel_id: counter.id, brand_id: entry.brand_id, kind: "takeaway" as const, pickup_window_id: null, promised_at: null, coupon_codes: [], loyalty_redeem_points: 0, lines: [line] };
  const preview = await owner.previewOrder(previewBody);
  if (!preview.ok) throw new Error(`preview: ${why(preview.error)}`);
  check("preview", preview.data.label === "preview" && preview.data.refusals.length === 0, `total ${formatCell(preview.data.total_minor, "total_minor", { locale: "en-IN", currency: preview.data.currency })}`);

  const attempt = attemptFor(null, JSON.stringify([previewBody, preview.data.total_minor]), "orders.place.v1", () => ({
    order_id: uuidv7(), outlet_id: outlet.id, channel_id: counter.id, brand_id: entry.brand_id, device_id: null, kind: "takeaway" as const,
    table_ref: null, pickup_window_id: null, promised_at: null, external_ref: null,
    lines: [{ line_id: uuidv7(), ...line, note: null }], coupon_codes: [], loyalty_redeem_points: 0,
    preview_total_minor: preview.data.total_minor, client_totals: null,
  }));
  const placed = await owner.placeOrder(attempt.body);
  if (!placed.ok) throw new Error(`place: ${why(placed.error)}`);
  const orderId = placed.data.entity_id;
  check("place", placed.status === 201 && !placed.replayed && orderId === attempt.body.payload.order_id, `entity is the order, status ${placed.status}`);
  const again = attemptFor(attempt, JSON.stringify([previewBody, preview.data.total_minor]), "orders.place.v1", () => { throw new Error("a retry must reuse the attempt"); });
  const replay = await owner.placeOrder(again.body);
  check("replay", replay.ok && replay.replayed && replay.data.entity_id === orderId, replay.ok ? `replayed=${replay.replayed}` : why(replay.error));
  const reused = await owner.placeOrder({ ...attempt.body, payload: { ...attempt.body.payload, kind: "dine_in" } });
  check("same key, new body is 409", !reused.ok && reused.error.code === "idempotency_conflict", reused.ok ? "accepted" : why(reused.error));
  const order = await owner.getOrder(orderId);
  if (!order.ok) throw new Error(`order: ${why(order.error)}`);
  check("read order", order.data.status === "placed" && order.data.remaining_minor === order.data.total_minor, `ticket ${order.data.ticket_no}, ${order.data.status}, remaining = total`);

  // ---- the kitchen ----
  let events = 0;
  const stop = watch({ baseUrl, session: { token: who.owner, tenantId: who.tenantId }, topics: [topic.kds(outlet.id)], onWake: () => { events++; } });
  await sleep(1500);
  const opened = events;
  const board = await owner.getBoard(outlet.id);
  if (!board.ok) throw new Error(`board: ${why(board.error)}`);
  const ticket = board.data.tickets.find((t) => t.order_id === orderId);
  check("board", ticket !== undefined && ticket.status === "queued", `${board.data.tickets.length} live ticket(s), ours ${ticket ? `${ticket.status}, ${ticket.colour}, lane ${ticket.lane}` : "missing"}`);
  if (!ticket) throw new Error("our ticket is not on the board");
  const move = envelope("kitchen.ticket.advance.v1", { ticket_id: ticket.ticket_id, from_status: "queued" as const, to_status: "preparing" as const });
  const advanced = await owner.advanceTicket(ticket.ticket_id, move);
  check("advance ticket", advanced.ok, advanced.ok ? "queued -> preparing" : why(advanced.error));
  await sleep(2500);
  stop();
  check("live event", events > opened, `${events - opened} wake-up(s) after the move`);
  const stale = await owner.advanceTicket(ticket.ticket_id, envelope("kitchen.ticket.advance.v1", { ticket_id: ticket.ticket_id, from_status: "queued" as const, to_status: "preparing" as const }));
  check("stale advance is 409", !stale.ok && stale.error.status === 409 && stale.error.code === "illegal_transition", stale.ok ? "accepted" : why(stale.error));

  // ---- payment (recorded only) ----
  const due = await owner.getOrder(orderId);
  if (!due.ok) throw new Error(`order: ${why(due.error)}`);
  const tender = await owner.recordTender(orderId, envelope("orders.tender.record.v1", { tender_id: uuidv7(), order_id: orderId, method: "card" as const, tendered_minor: null, amount_minor: due.data.remaining_minor, currency: due.data.currency, ref: "SMOKE-0001" }));
  const paid = await owner.getOrder(orderId);
  check("tender", tender.ok && paid.ok && paid.data.remaining_minor === 0, tender.ok ? `status ${paid.ok ? paid.data.status : "?"}, remaining 0` : why(tender.error));
  // Hand it over (paid first): the ticket goes to done and core completes the order, so no paid order is left waiting.
  const ready = await owner.advanceTicket(ticket.ticket_id, envelope("kitchen.ticket.advance.v1", { ticket_id: ticket.ticket_id, from_status: "preparing" as const, to_status: "ready" as const }));
  const handed = ready.ok ? await owner.advanceTicket(ticket.ticket_id, envelope("kitchen.ticket.advance.v1", { ticket_id: ticket.ticket_id, from_status: "ready" as const, to_status: "done" as const })) : ready;
  const closed = await owner.getOrder(orderId);
  check("hand over", handed.ok && closed.ok && closed.data.status === "completed", handed.ok ? `ticket done, order ${closed.ok ? closed.data.status : "?"}` : why(handed.error));

  // ---- inbox, drafts, snapshots ----
  const inbox = await owner.listInbox();
  if (!inbox.ok) check("inbox", false, why(inbox.error));
  else {
    const drafts = inbox.data.items.flatMap((i) => (i.kind === "draft" ? [i.draft] : []));
    check("inbox", true, `${inbox.data.items.length}${inbox.data.next_cursor ? "+" : ""} item(s), ${drafts.length} draft(s)`);
    const d = drafts[0];
    if (!d) skip("draft detail", "no draft in the inbox");
    else {
      const detail = await owner.getDraft(d.draft_id);
      check("draft detail", detail.ok, detail.ok ? `${detail.data.draft.command_type}, ${detail.data.unverified_refs.length} unverified ref(s), ${detail.data.history.length} history row(s)` : why(detail.error));
      // Proves the approve wiring without deciding anything: a payload draft_id that is not the path id is refused.
      const wrong = await owner.approveDraft(d.draft_id, envelope("drafts.approve.v1", { draft_id: uuidv7(), command_type: d.command_type, edited_payload: null, reason: null }));
      check("approve with a wrong draft_id is 422", !wrong.ok && wrong.error.status === 422, wrong.ok ? "approved!" : why(wrong.error));
    }
  }
  const snap = await owner.mintSnapshot({ template_id: "kitchen.ticket_coverage", params: { outlet_id: outlet.id, from: order.data.business_date, to: order.data.business_date } });
  if (!snap.ok) check("mint snapshot", false, why(snap.error));
  else {
    const ref = snapRef(snap.data.snapshot_id, 0, "tickets");
    const parts = renderSegment({ text: `Tickets today: ${ref}`, refs: [`snap:${snap.data.snapshot_id}`] }, [{ ref, value: snap.data.rows[0]?.tickets ?? null }]);
    const shown = parts.map((p) => (p.kind === "text" ? p.text : p.kind === "value" ? formatCell(p.value, "tickets", fmt) : "Cannot verify")).join("");
    const tickets = snap.data.rows[0]?.tickets;
    check("mint snapshot", snap.status === 201 && snap.data.rows.length === 1 && typeof tickets === "number" && Number.isInteger(tickets) && parts.some((p) => p.kind === "value"), shown);
    const reopened = await owner.getSnapshot(snap.data.snapshot_id);
    check("open snapshot", reopened.ok && reopened.data.sha256 === snap.data.sha256, reopened.ok ? `${reopened.data.row_count} row(s)` : why(reopened.error));
  }
  // A local check of refs.ts (no call): a model-typed number never reaches the screen.
  const forged = renderSegment({ text: "Sales were 4200 today", refs: [] }, []);
  check("free digits are not shown (local)", forged.length === 1 && forged[0]!.kind === "unverified");
  const unknown = await owner.getSnapshot(uuidv7());
  check("unknown snapshot is 404", !unknown.ok && unknown.error.kind === "not_found", unknown.ok ? "opened" : why(unknown.error));

  // ---- Ask (the real API calls a live model: off unless asked for) ----
  if (!isMock && process.env.STAFF_SMOKE_ASK !== "1") skip("ask", "real API; set STAFF_SMOKE_ASK=1 to call the model");
  else {
    const asked = await owner.ask({ question: "How many kitchen tickets did we have today?" });
    if (!asked.ok) check("ask", asked.error.status === 503, `${why(asked.error)} (503 = AI unavailable: hide the surface)`);
    else {
      const a = asked.data.answer;
      const values = a.envelope.segments.flatMap((s) => renderSegment(s, a.resolved_refs)).filter((p) => p.kind === "value").length;
      check("ask", a.envelope.abstained || values > 0, a.envelope.abstained ? `abstained: ${a.envelope.reason_code}` : `${a.envelope.segments.length} segment(s), ${values} cited value(s)`);
      const thread = await owner.getThread(asked.data.thread_id);
      check("thread", thread.ok && thread.data.turns.length >= 1, thread.ok ? `${thread.data.turns.length} turn(s)` : why(thread.error));
    }
  }

  // ---- Cares and suppliers ----
  const cares = await owner.getCaresProfile();
  check("cares profile", cares.ok && cares.data.labels.data === "Measured on synthetic data", cares.ok ? `available ${cares.data.available}, enabled ${cares.data.enabled}` : why(cares.error));
  // Every supplier must be simulated and labelled (20 §2); an empty list cannot pass.
  const suppliers = await owner.listSuppliers();
  const items = suppliers.ok ? suppliers.data.items : [];
  const labelled = items.filter((s) => s.kind === "simulated" && s.label === "Simulated supplier").length;
  check("suppliers", items.length > 0 && labelled === items.length, suppliers.ok ? `${items.length} supplier(s), ${labelled} simulated and labelled` : why(suppliers.error));

  // ---- credentials and scope ----
  const noToken = await createStaffClient({ baseUrl, token: () => "", tenantId: who.tenantId }).listOutlets();
  check("no token is 401", !noToken.ok && noToken.error.status === 401, noToken.ok ? "served" : why(noToken.error));
  const wrongTenant = await clientFor(baseUrl, { token: who.owner, tenantId: uuidv7() }).listOutlets();
  check("wrong tenant is 404", !wrongTenant.ok && wrongTenant.error.kind === "not_found", wrongTenant.ok ? "served" : why(wrongTenant.error));
  const outside = scopedIds ? kitchenOutlets.find((o) => !scopedIds.includes(o.id)) : undefined;
  if (!outside) skip("board outside scope", scopedIds ? "the scoped member sees every kitchen outlet" : "GET /v1/me did not answer");
  else {
    const b = await scoped.getBoard(outside.id);
    check("board outside scope is 404", !b.ok && b.error.kind === "not_found", b.ok ? "served" : why(b.error));
  }
}

main()
  .catch((e: unknown) => {
    failed++;
    console.log(`FAIL ${e instanceof Error ? e.message : "error"}`);
  })
  .finally(() => {
    console.log(failed === 0 ? "staff smoke: all ok" : `staff smoke: ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  });
```

Add it to `package.json` scripts: `"staff-smoke": "tsx scripts/staff-smoke.ts"`. Run it with the dev server up:

```bash
NEXT_PUBLIC_MUNIM_API=http://localhost:3000/mock npm run staff-smoke
```

Expected on the extended mock (03), run on 14 Oct 2026 against `next build && next start` (yours will differ only in
ticket numbers, totals and counts):

```
ok   me (owner): owner, outlets all
ok   me (scoped): staff, 1 outlet(s)
ok   outlets: Cobnut Hazratganj (restaurant), Cobnut Gomti Nagar (restaurant)
ok   counter channel: 2 channel(s)
ok   counter menu: 18 entries, business date 2026-10-14, first simple item Hazelnut Croissant
ok   preview: total ₹189.00
ok   place: entity is the order, status 201
ok   replay: replayed=true
ok   same key, new body is 409: key_reused 409 idempotency_conflict
ok   read order: ticket 8, placed, remaining = total
ok   board: 7 live ticket(s), ours queued, normal, lane now
ok   advance ticket: queued -> preparing
ok   live event: 1 wake-up(s) after the move
ok   stale advance is 409: invalid 409 illegal_transition
ok   tender: status preparing, remaining 0
ok   hand over: ticket done, order completed
ok   inbox: 7 item(s), 4 draft(s)
ok   draft detail: kitchen.prep_time.set.v1, 0 unverified ref(s), 1 history row(s)
ok   approve with a wrong draft_id is 422: invalid 422 invalid_payload
ok   mint snapshot: Tickets today: 11
ok   open snapshot: 1 row(s)
ok   free digits are not shown (local)
ok   unknown snapshot is 404: not_found 404 not_found
ok   ask: 2 segment(s), 5 cited value(s)
ok   thread: 1 turn(s)
ok   cares profile: available true, enabled true
ok   suppliers: 2 supplier(s), 2 simulated and labelled
ok   no token is 401: auth 401 unauthenticated
ok   wrong tenant is 404: not_found 404 not_found
ok   board outside scope is 404: not_found 404 not_found
staff smoke: all ok
```

The same script was run against a local copy of the real API (a synthetic restaurant group, owner and manager
tokens from its development sign-in); every line passed there (00 §8). Against the real API it skips Ask unless
`STAFF_SMOKE_ASK=1`, because that calls a live model.
