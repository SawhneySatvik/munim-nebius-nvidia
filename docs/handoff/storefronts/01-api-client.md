# 01 · The API client (no SDK; built from the OpenAPI document)

You build the client yourself from the public OpenAPI document. There is no package to install. Everything below
was checked against the API contract and run against the live mock on 13 Oct 2026.

Each code block starts with `// file: <path>`. Save it at that path in your Next.js project, exactly as written.
The `lib/munim/` folder is plain TypeScript: no React, no Next.js imports. It runs in the browser and in Node 20+.

| File | What it is |
|---|---|
| `openapi.json` | The API contract, downloaded once (§1) |
| `lib/munim/schema.d.ts` | Types generated from it (§2); never edit by hand |
| `lib/munim/types.ts` | The one place the rest of the code gets types from (§2) |
| `lib/munim/uuid.ts` | `uuidv7()`: every id you create (§4) |
| `lib/munim/client.ts` | The `fetch` client: headers, errors, 404, 429, replay (§5) |
| `lib/munim/stream.ts` | Live order updates over server-sent events, read with `fetch` (§6) |
| `lib/munim/index.ts`, `mock-controls.ts` | The app's client instance, built from env vars, plus the mock's test switches (§7) |
| `lib/munim/format.ts`, `copy.ts`, `checkout.ts`, `storage.ts`, `track.ts`, `cares.ts` | Helpers both sites share (§8) |
| `scripts/smoke.ts` | Proves the client works against the mock; run it before you build any UI (§9) |

## 1 · Get the contract

```bash
curl -fsSL https://munim-rho.vercel.app/developers/openapi.json -o openapi.json
```

This is the full public `/v1` document (OpenAPI 3.1, about 830 KB). The storefront sites use only these operations:

| Purpose | Method and path | operationId | Success |
|---|---|---|---|
| Outlets of this business | `GET /v1/storefront/outlets` | `storefrontOutlets` | 200 `StorefrontOutletsResponse` |
| Menu, deals, accepting state | `GET /v1/storefront/outlets/{outlet_id}/menu` | `storefrontMenu` | 200 `StorefrontMenuResponse` |
| Accepting state alone (cheap poll) | `GET /v1/storefront/outlets/{outlet_id}/state` | `storefrontState` | 200 `StorefrontAcceptingResponse` |
| Pickup windows with spare capacity | `GET /v1/storefront/outlets/{outlet_id}/pickup-windows` | `storefrontPickupWindows` | 200 `StorefrontPickupWindowsResponse` |
| Price a cart (writes nothing) | `POST /v1/storefront/orders:preview` | `storefrontPreviewOrder` | 200 `StorefrontPreviewResponse` |
| Place an order (guest) | `POST /v1/storefront/orders` | `storefrontPlaceOrder` | **201** `StorefrontOrderPlaced` |
| Read my order | `GET /v1/storefront/orders/{id}` | `storefrontGetOrder` | 200 `StorefrontOrderView` |
| Live updates | `GET /v1/stream?topics=order:<id>` | `streamEvents` | 200 `text/event-stream` |
| This business's food donations | `GET /v1/storefront/cares` | `getStorefrontCares` | 200 `V1StorefrontCares` |
| Network-wide donation total (no credentials) | `GET /v1/cares-network/impact` | `getCaresNetworkImpact` | 200 `V1CaresNetworkImpact` |
| Change time / cancel (signed-in customers only, not in v1 sites) | `POST /v1/storefront/orders/{id}:reschedule-preview`, `:reschedule`, `:cancel` | | 200 |

The mock serves every route above **except** `GET /v1/cares-network/impact` (it answers `404`). That is expected:
the network total stays hidden on the mock (§8, `cares.ts`).

## 2 · Generate the types (dev-time only)

```bash
npm i -D openapi-typescript@7.13.0
npx openapi-typescript ./openapi.json -o ./lib/munim/schema.d.ts
```

`openapi-typescript` is a **code generator you run on your machine**. It writes one `.d.ts` file of types and is
never imported at runtime; nothing from it ships to the browser. Re-run it whenever you download a newer
`openapi.json`. It needs TypeScript 5 (which `create-next-app` installs).

```ts
// file: lib/munim/types.ts
// The rest of lib/munim imports types only from here. Generated route: schema.d.ts comes from openapi-typescript.
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
/** Every path in the contract. The client accepts only these, so a typo in a path fails the typecheck. */
export type ApiPath = keyof paths;
```

**Fallback (no generator).** If you cannot run the generator, save the hand-written file in Appendix A as
`lib/munim/types.ts` instead. It holds the same names and fields for the routes above, so every other file in
this document compiles unchanged. The generated file is still preferred: it covers the whole contract and cannot drift.

## 3 · Rules the client enforces

| Rule | Why |
|---|---|
| Every storefront call sends `X-Munim-Storefront-Key: <key>`. | The key resolves the business **and** the sales channel. You never send a tenant id. |
| Reading or streaming a guest order also sends `X-Munim-Guest-Token: <token>`. | The token is returned **once**, by the place call. With the key, it opens only that order. |
| Never put the key or a guest token in a URL, a log line, an error report or an analytics event. | They are credentials. The client never logs. |
| Every client-made id is a **UUIDv7** (`uuidv7()`). | The API rejects every other version; `crypto.randomUUID()` makes v4 and is refused with `422`. |
| A wrong, missing or revoked key, a wrong guest token, an order that is not yours and an unknown id all return **`404`**. | Never `401`/`403`, and never a hint which part was wrong. Show the one "This link isn't valid." page. |
| `429` carries `Retry-After` (whole seconds). Wait that long, then send the **same** request again. | The 429 body is `{"error": {"code": "unavailable", "reason_code": "rate_limited"}}`. It is not listed in the OpenAPI responses, so the client checks the status before trusting the typed body. |
| Writes carry their idempotency key **in the body** (`idempotency_key`), not in a header. | Same key + same body returns the original result with the response header `X-Munim-Replayed: true`; same key + a different body is `409 idempotency_conflict`. |
| Never show the server's `error.message`. | The client drops it. Your copy is chosen by `reason_code` and `code` (§8, `copy.ts`). |
| Every fetch uses `cache: "no-store"`. | Next.js caches `fetch` in some contexts; prices and state must never come from a cache. |

**Error envelope.** Every non-2xx body is `{"error": {"code", "message", "reason_code"}}`. On the place and preview
routes (and reschedule) a refusal adds `params` beside `error`: ids and server-computed amounts only (`line_no`,
`item_id`, `variant_id`, `deal_id`, `code`, `min_spend_minor`, `shortfall_minor`, `old_total_minor`,
`new_total_minor`, `currency`), each present only when it applies.

| `code` | HTTP | Meaning for a storefront | `kind` in the client |
|---|---|---|---|
| `bad_request` | 400 | Malformed body or query: a bug in your code | `invalid` |
| `unauthenticated` | 401 | Customer token missing or expired (signed-in only) | `auth` |
| `forbidden` | 403 | With `reason_code: guest_cannot_change`: guests cannot cancel or reschedule | `refusal` |
| `not_found` | 404 | Bad key, bad guest token, not your order, unknown id | `not_found` |
| `conflict` | 409 | A named refusal: read `reason_code` | `refusal` |
| `idempotency_conflict` | 409 | Same key, different body: your bug. Build a new attempt and retry once | `key_reused` |
| `invalid_payload` | 422 | Wrong shape or value. With `reason_code: pickup_time_outside_window`: a time outside the chosen window | `invalid` / `refusal` |
| `unavailable` | 429 (`reason_code: rate_limited`) or 503 | Wait `Retry-After`, then retry the same request | `rate_limited` / `server` |
| `internal` | 500 | Try again later | `server` |
| (no response) | 0 | Offline, DNS failure, CORS block, timeout | `network` |

**Replay detection.** A replayed place answers `201` with the stored body, the header `X-Munim-Replayed: true`, and
`guest_access_token: null` (the token is shown only on the first response). The client exposes `replayed: true`.

**CORS.** The mock answers CORS for any origin. The real API answers only the exact origins its operator allows: send
your site's origin to the founder before switching `NEXT_PUBLIC_MUNIM_API`. Allowed request headers:
`X-Munim-Storefront-Key`, `X-Munim-Guest-Token`, `Last-Event-ID`, `Content-Type`, `Authorization`. Exposed response
headers: `X-Munim-Replayed`, `Retry-After`. Credentials are headers, never cookies.

## 4 · UUIDv7

```ts
// file: lib/munim/uuid.ts
// UUIDv7 for every id you create (command_id, order_id, line_id, idempotency_key). The API refuses any other
// version, so crypto.randomUUID() (v4) will not do.

/** A fresh UUIDv7 (RFC 9562): 48-bit Unix time in ms, version 7, 74 random bits, variant 10.
 *  Uses crypto.getRandomValues (every current browser; Node 20+, where Web Crypto is global). */
export function uuidv7(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let ms = Date.now();
  for (let i = 5; i >= 0; i--) {
    b[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
```

## 5 · The client

```ts
// file: lib/munim/client.ts
// Typed fetch client for Munim's storefront API. No dependencies; runs in browsers and Node 20+.
// It never logs, and never puts the storefront key or a guest token in a URL.
import type { ApiPath, Schemas } from "./types";

export const STOREFRONT_KEY_HEADER = "X-Munim-Storefront-Key";
export const GUEST_TOKEN_HEADER = "X-Munim-Guest-Token";
export const REPLAYED_HEADER = "X-Munim-Replayed";

type ErrorBody = Schemas["Error"]["error"];
export type ErrorCode = ErrorBody["code"];
export type ReasonCode = NonNullable<ErrorBody["reason_code"]>;
export type RefusalParams = NonNullable<Schemas["StorefrontRefusalError"]["params"]>;

export type ErrorKind =
  | "network" //      no response: offline, DNS, CORS block, timeout (status 0)
  | "not_found" //    404: bad key, bad guest token, not your order, unknown id. Never say which
  | "rate_limited" // 429: wait retryAfterMs, then send the SAME request again
  | "refusal" //      a named refusal: switch on reasonCode, fill your copy from params
  | "key_reused" //   409 idempotency_conflict: your bug. Build a new attempt and retry once
  | "invalid" //      400 / 409 / 422 without a reason code: your bug, the request was malformed
  | "auth" //         401 / 403 without a reason code: the customer token is missing or expired
  | "server"; //      5xx and anything else: try again later

/** A failed call, parsed. The server's `message` is deliberately not kept: never show it. */
export interface MunimError {
  kind: ErrorKind;
  status: number;
  code: ErrorCode | null;
  reasonCode: ReasonCode | null;
  /** Ids and server-computed amounts for the refusal copy; {} when the refusal has none. */
  params: RefusalParams;
  /** Set on 429 (and on a 503 that sends Retry-After): wait this long before retrying. */
  retryAfterMs: number | null;
}

export type Result<T> = { ok: true; status: number; data: T; replayed: boolean } | { ok: false; error: MunimError };

export interface MunimClientOptions {
  /** e.g. "https://munim-rho.vercel.app/mock" for the mock; the real API's URL later. */
  baseUrl: string;
  storefrontKey: string;
  /** Signed-in customers only (not used by the guest-only v1 sites). */
  customerToken?: () => string | null | Promise<string | null>;
  /** Dev only: extra request headers (the mock's X-Mock-Force-* switches, see mock-controls.ts). */
  extraHeaders?: () => Record<string, string>;
  /** Abort a call that takes longer than this (default 15 000 ms); it then fails with kind "network". */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** Commands that only a signed-in customer may send (guests get 403 guest_cannot_change). */
export type CancelCommand = { command_id: string; idempotency_key: string; type: "storefront.order.cancel.v1"; payload: Schemas["StorefrontOrderCancelV1"] };
export type RescheduleCommand = { command_id: string; idempotency_key: string; type: "storefront.order.reschedule.v1"; payload: Schemas["StorefrontOrderRescheduleV1"] };

type CallOptions = { params?: Record<string, string>; body?: unknown; guestToken?: string | null; credentials?: "storefront" | "none" };

const fail = (error: MunimError): { ok: false; error: MunimError } => ({ ok: false, error });
const networkError = (): MunimError => ({ kind: "network", status: 0, code: null, reasonCode: null, params: {}, retryAfterMs: null });

/** Retry-After in ms (whole seconds or an HTTP date), capped at 60 s; null when absent or unreadable. */
export function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("Retry-After");
  if (raw === null) return null;
  const s = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(s) && s >= 0) return Math.min(s, 60) * 1000;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.min(Math.max(at - Date.now(), 0), 60_000);
}

async function parseError(res: Response): Promise<MunimError> {
  let body: Partial<Schemas["StorefrontRefusalError"]> | null = null;
  try {
    body = (await res.json()) as Partial<Schemas["StorefrontRefusalError"]>;
  } catch {
    body = null; // not JSON (a proxy page, an empty body): classified by status alone
  }
  const s = res.status;
  const code = body?.error?.code ?? null;
  const reasonCode = body?.error?.reason_code ?? null;
  const kind: ErrorKind =
    s === 404 ? "not_found"
    : s === 429 ? "rate_limited"
    : code === "idempotency_conflict" ? "key_reused"
    : reasonCode !== null && s < 500 ? "refusal"
    : s === 400 || s === 409 || s === 422 ? "invalid"
    : s === 401 || s === 403 ? "auth"
    : "server";
  const wait = s === 429 || s === 503 ? (retryAfterMs(res) ?? (s === 429 ? 5000 : null)) : null;
  return { kind, status: s, code, reasonCode, params: body?.params ?? {}, retryAfterMs: wait };
}

export function createMunimClient(opts: MunimClientOptions) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? 15_000;

  async function call<T>(method: "GET" | "POST", path: ApiPath, o: CallOptions = {}): Promise<Result<T>> {
    const url = base + path.replace(/\{(\w+)\}/g, (_m: string, name: string) => encodeURIComponent(o.params?.[name] ?? ""));
    const headers: Record<string, string> = { Accept: "application/json" };
    if (o.credentials !== "none") {
      Object.assign(headers, opts.extraHeaders?.() ?? {});
      headers[STOREFRONT_KEY_HEADER] = opts.storefrontKey;
      if (o.guestToken) headers[GUEST_TOKEN_HEADER] = o.guestToken;
      else {
        const token = await opts.customerToken?.();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
    }
    if (o.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return fail(networkError());
    }
    if (!res.ok) return fail(await parseError(res));
    try {
      return { ok: true, status: res.status, data: (await res.json()) as T, replayed: res.headers.get(REPLAYED_HEADER) === "true" };
    } catch {
      return fail({ kind: "server", status: res.status, code: null, reasonCode: null, params: {}, retryAfterMs: null });
    }
  }

  return {
    listOutlets: () => call<Schemas["StorefrontOutletsResponse"]>("GET", "/v1/storefront/outlets"),
    getMenu: (outletId: string) =>
      call<Schemas["StorefrontMenuResponse"]>("GET", "/v1/storefront/outlets/{outlet_id}/menu", { params: { outlet_id: outletId } }),
    getState: (outletId: string) =>
      call<Schemas["StorefrontAcceptingResponse"]>("GET", "/v1/storefront/outlets/{outlet_id}/state", { params: { outlet_id: outletId } }),
    getPickupWindows: (outletId: string) =>
      call<Schemas["StorefrontPickupWindowsResponse"]>("GET", "/v1/storefront/outlets/{outlet_id}/pickup-windows", { params: { outlet_id: outletId } }),
    /** Prices a cart and writes nothing. Refusals come back inside a 200 (`refusals[]`), not as an error. */
    previewOrder: (body: Schemas["OrdersPreviewRequest"]) =>
      call<Schemas["StorefrontPreviewResponse"]>("POST", "/v1/storefront/orders:preview", { body }),
    /** 201 on success; `replayed` is true when the same body was already placed (then guest_access_token is null). */
    placeOrder: (body: Schemas["StorefrontOrderPlaceRequest"]) =>
      call<Schemas["StorefrontOrderPlaced"]>("POST", "/v1/storefront/orders", { body }),
    getOrder: (orderId: string, guestToken: string | null) =>
      call<Schemas["StorefrontOrderView"]>("GET", "/v1/storefront/orders/{id}", { params: { id: orderId }, guestToken }),
    getCares: () => call<Schemas["V1StorefrontCares"]>("GET", "/v1/storefront/cares"),
    /** Credential-free (no key, no token). Not served by the mock: expect 404 there and hide the figure. */
    getNetworkImpact: () => call<Schemas["V1CaresNetworkImpact"]>("GET", "/v1/cares-network/impact", { credentials: "none" }),
    // Signed-in customers only. Guests get 403 with reason_code guest_cannot_change.
    reschedulePreview: (orderId: string, body: Schemas["StorefrontReschedulePreviewRequest"]) =>
      call<Schemas["StorefrontReschedulePreviewResponse"]>("POST", "/v1/storefront/orders/{id}:reschedule-preview", { params: { id: orderId }, body }),
    rescheduleOrder: (orderId: string, body: RescheduleCommand) =>
      call<Schemas["CommandResult"]>("POST", "/v1/storefront/orders/{id}:reschedule", { params: { id: orderId }, body }),
    cancelOrder: (orderId: string, body: CancelCommand) =>
      call<Schemas["CommandResult"]>("POST", "/v1/storefront/orders/{id}:cancel", { params: { id: orderId }, body }),
  };
}

export type MunimClient = ReturnType<typeof createMunimClient>;
```

How a page uses it:

```ts
const r = await munim.getMenu(outletId);
if (!r.ok) {
  if (r.error.kind === "not_found") router.replace("/not-valid");
  else setError(r.error); // render copy from errorText(r.error, "menu"), never a server string
  return;
}
setMenu(r.data);
```

## 6 · Live updates (server-sent events over `fetch`)

`GET /v1/stream?topics=order:<order_id>` is a `text/event-stream`. **Do not use `EventSource`**: it cannot send the
key and guest-token headers. The reader below sends them on every (re)connect, resumes with `Last-Event-ID`, backs
off exponentially with jitter, and treats `400`/`403`/`404` as final.

What the server sends (both the mock and the real API):

| Frame | Meaning |
|---|---|
| `retry: 1000` / `id: <cursor>` / `event: ready` / `data: {}` | First frame: the stream is open. The cursor is opaque; just send it back as `Last-Event-ID`. |
| `id: <cursor>` / `data: {"id", "type", "data"}` | One change. `type` is `order.status` or `order.promised_at`; `data` holds `order_id`, `from_status`, `to_status`, `from_promised_at`, `to_promised_at`, `at`: ids and statuses only. |
| `: hb` | Heartbeat every 20 s. |
| `event: reconnect` | The server is ending the stream (real API: after 55 min; the mock: after about 50 s). The reader reconnects with `Last-Event-ID` and misses nothing. |

On **any** event, re-read the order with `GET /v1/storefront/orders/{id}`: the read model is the truth, the event is
only a wake-up. A fresh stream starts *after* the events that already exist; read the order once when you open it.

```ts
// file: lib/munim/stream.ts
// Fetch-based SSE reader for GET /v1/stream. The browser's EventSource cannot send headers, so this reads the
// response body itself, sends the credentials and Last-Event-ID on every (re)connect, and backs off exponentially
// between attempts. Runs in browsers and Node 20+ (fetch, ReadableStream, TextDecoder).

/** One delivered event: {id, type, data} as the server sends it, plus the stream position after it. */
export interface StreamEvent {
  id: string;
  type: string;
  data: unknown;
  /** The Last-Event-ID the reader will resume from after this event. */
  lastEventId: string | null;
}

export type StreamState = "connecting" | "open" | "retrying" | "closed";

export interface StreamOptions {
  /** Same base URL as the client, e.g. "https://munim-rho.vercel.app/mock". */
  baseUrl: string;
  /** For a storefront: ["order:<order id>"]. */
  topics: readonly string[];
  /** Signed-in customers: called before every (re)connect, so an expired token is replaced. */
  token?: () => string | Promise<string>;
  /** Guests: the order's access token from placement, sent as X-Munim-Guest-Token. It cannot be refreshed, so a
   *  401 or 404 stops the reader. Set exactly one of token / guestToken. */
  guestToken?: string;
  /** Extra headers per request: { "X-Munim-Storefront-Key": key } for a storefront. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  onEvent: (event: StreamEvent) => void;
  onState?: (state: StreamState, detail?: { status?: number; error?: unknown }) => void;
  /** Resume from a position saved earlier. */
  lastEventId?: string;
  signal?: AbortSignal;
  /** First retry delay; doubles per failed attempt up to maxDelayMs (with jitter). Default 500 / 30 000. */
  initialDelayMs?: number;
  maxDelayMs?: number;
  fetch?: typeof fetch;
}

/** A refusal that retrying cannot fix (400 bad topics or cursor, 403, 404 unknown or not-yours topic). */
export class StreamRefused extends Error {
  override name = "StreamRefused";
  readonly status: number;
  constructor(status: number) {
    super(`stream refused: HTTP ${status}`);
    this.status = status;
  }
}

export interface StreamHandle {
  /** Stop reading and stop reconnecting. */
  close(): void;
  /** Settles when the stream stops: resolves on close/abort, rejects with StreamRefused. */
  readonly done: Promise<void>;
  readonly lastEventId: string | null;
}

interface Parsed {
  event: string;
  data: string;
  id: string | undefined;
  retry: number | undefined;
}

/** Splits SSE text into events (WHATWG "event stream interpretation"): comments skipped, data lines joined by
 *  "\n", an id without NUL accepted, retry digits only. Returns the events and the unparsed remainder. */
export function parseSse(buffer: string): { events: Parsed[]; rest: string } {
  const events: Parsed[] = [];
  let cur: Parsed = { event: "", data: "", id: undefined, retry: undefined };
  let hasData = false;
  let start = 0;
  for (;;) {
    const m = /\r\n|\r|\n/.exec(buffer.slice(start));
    if (!m) break;
    // A lone "\r" at the very end may be the first half of "\r\n": wait for more input.
    if (m[0] === "\r" && start + m.index === buffer.length - 1) break;
    const line = buffer.slice(start, start + m.index);
    start += m.index + m[0].length;
    if (line === "") {
      if (hasData || cur.id !== undefined || cur.retry !== undefined || cur.event) events.push(cur);
      cur = { event: "", data: "", id: undefined, retry: undefined };
      hasData = false;
      continue;
    }
    if (line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") {
      cur.data = hasData ? `${cur.data}\n${value}` : value;
      hasData = true;
    } else if (field === "event") cur.event = value;
    else if (field === "id" && !value.includes("\0")) cur.id = value;
    else if (field === "retry" && /^\d+$/.test(value)) cur.retry = Number(value);
  }
  return { events, rest: buffer.slice(start) };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

const GUEST_TOKEN_HEADER = "X-Munim-Guest-Token";

/** Opens the stream and keeps it open until closed, aborted or refused. */
export function openStream(opts: StreamOptions): StreamHandle {
  if ((opts.token === undefined) === (opts.guestToken === undefined)) throw new TypeError("openStream: set exactly one of token / guestToken");
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  if (opts.signal?.aborted) ctl.abort();
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const initial = opts.initialDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 30_000;
  let lastEventId: string | null = opts.lastEventId ?? null;
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/v1/stream?topics=${encodeURIComponent(opts.topics.join(","))}`;

  const run = async () => {
    let attempt = 0;
    let serverRetry: number | undefined;
    while (!ctl.signal.aborted) {
      opts.onState?.("connecting");
      let refused: StreamRefused | null = null;
      try {
        const res = await doFetch(url, {
          headers: {
            ...(await opts.headers?.()),
            Accept: "text/event-stream",
            ...(opts.token ? { Authorization: `Bearer ${await opts.token()}` } : { [GUEST_TOKEN_HEADER]: opts.guestToken! }),
            ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
          },
          cache: "no-store",
          signal: ctl.signal,
        });
        // 401: the token expired; the next attempt asks for a fresh one (a guest token cannot be refreshed, so a
        // guest stops). 5xx: the server is restarting. Any other non-200 will not change by retrying.
        if (!res.ok && res.status < 500 && (res.status !== 401 || opts.guestToken !== undefined)) refused = new StreamRefused(res.status);
        if (!res.ok || !res.body) {
          await res.body?.cancel().catch(() => {});
          if (refused) throw refused;
          opts.onState?.("retrying", { status: res.status });
        } else {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const { events, rest } = parseSse(buffer);
            buffer = rest;
            let reconnect = false;
            for (const e of events) {
              if (e.id !== undefined) lastEventId = e.id;
              if (e.retry !== undefined) serverRetry = e.retry;
              if (e.event === "ready") {
                attempt = 0;
                opts.onState?.("open");
              } else if (e.event === "reconnect") reconnect = true;
              else if (e.event === "" && e.data !== "") {
                const msg = JSON.parse(e.data) as { id: string; type: string; data: unknown };
                opts.onEvent({ id: msg.id, type: msg.type, data: msg.data, lastEventId });
              }
            }
            if (reconnect) {
              await reader.cancel().catch(() => {});
              break;
            }
          }
          opts.onState?.("retrying");
        }
      } catch (error) {
        if (error instanceof StreamRefused) throw error;
        if (ctl.signal.aborted) break;
        opts.onState?.("retrying", { error });
      }
      // The server's retry: is the floor; failed attempts double it, with jitter so clients spread out.
      const baseDelay = Math.max(serverRetry ?? 0, initial);
      const delay = Math.min(max, baseDelay * 2 ** attempt) * (0.5 + Math.random() / 2);
      attempt++;
      await sleep(delay, ctl.signal);
    }
  };

  const done = run().finally(() => {
    opts.signal?.removeEventListener("abort", onAbort);
    opts.onState?.("closed");
  });
  return {
    close: () => ctl.abort(),
    done,
    get lastEventId() {
      return lastEventId;
    },
  };
}
```

## 7 · The app's client instance and env vars

| Env var | Mock value | Real API (later) |
|---|---|---|
| `NEXT_PUBLIC_MUNIM_API` | `https://munim-rho.vercel.app/mock` | the URL the founder sends |
| `NEXT_PUBLIC_MUNIM_STOREFRONT_KEY` | Spice Route `sfk_mock_spice_route_7f3a91c2` · Laneway `sfk_mock_laneway_cafe_c42e08d1` | the key the founder sends |
| `NEXT_PUBLIC_MUNIM_MOCK_CONTROLS` | `1` in development (shows the test panel) | unset |

The key is public by design (it ships in the browser bundle), but treat it like a password in logs.

```ts
// file: lib/munim/index.ts
// The one client instance the app uses. Switching mock -> real API is two env vars; no code changes.
import { createMunimClient } from "./client";
import { mockHeaders } from "./mock-controls";

export const API_BASE = (process.env.NEXT_PUBLIC_MUNIM_API ?? "").replace(/\/+$/, "");
export const STOREFRONT_KEY = process.env.NEXT_PUBLIC_MUNIM_STOREFRONT_KEY ?? "";
/** True when the base URL is the mock (its path ends in /mock). Test switches are sent only then. */
export const IS_MOCK = /\/mock$/.test(API_BASE);

export const munim = createMunimClient({
  baseUrl: API_BASE,
  storefrontKey: STOREFRONT_KEY,
  extraHeaders: IS_MOCK ? mockHeaders : undefined,
});
```

The mock has two test switches, sent as request headers. The real API ignores them, and this file sends them only when
the dev panel is enabled.

| Header | Effect on the mock |
|---|---|
| `X-Mock-Force-Accepting: open\|busy\|paused\|closed` | Forces the outlet's state in `state`, `menu`, `orders:preview` and `POST /orders` (paused/closed: preview refusal and place `409 outlet_paused`). |
| `X-Mock-Force-429: 1` | Any route with a valid key answers `429`, `Retry-After: 5`, body `{"error": {"code": "unavailable", "reason_code": "rate_limited", ...}}`. Nothing changes. A wrong key is still `404`. |

```ts
// file: lib/munim/mock-controls.ts
// Dev-only switches for the mock API's test headers. Sent only when the base URL is the mock (index.ts) AND
// NEXT_PUBLIC_MUNIM_MOCK_CONTROLS=1. Render a small panel (two selects) that calls writeMockControls(); never in production.
export type ForcedAccepting = "open" | "busy" | "paused" | "closed";
export interface MockControls {
  accepting: ForcedAccepting | null;
  force429: boolean;
}

const STORAGE_KEY = "munim.mock.controls";
export const MOCK_CONTROLS_ENABLED = process.env.NEXT_PUBLIC_MUNIM_MOCK_CONTROLS === "1";

export function readMockControls(): MockControls {
  const none: MockControls = { accepting: null, force429: false };
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
  return h;
}
```

## 8 · Shared helpers

### 8.1 Formatting (display only)

Money arrives as **integer minor units** (`*_minor`: paise, cents) with a separate `currency`. Quantities are
`qty_milli` (1000 = 1). Rates are basis points (`rate_bp`, 250 = 2.5%). Instants are ISO 8601 with an offset; each
outlet has an IANA `tz`. Format everything with `Intl`, using the `currency` and `tz` **from the response**, never a
hard-coded `₹`, `$`, `IST` or offset. Render times in the **outlet's** zone, not the browser's.

```ts
// file: lib/munim/format.ts
// Display-only formatting with Intl. Every input is a field from an API response; nothing here is sent back to the
// API, and nothing here adds money up.

export function formatMoney(minor: number, currency: string, locale: string): string {
  const nf = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = nf.resolvedOptions().maximumFractionDigits ?? 2;
  return nf.format(minor / 10 ** digits); // shifts the decimal point for display; never send this back
}

/** qty_milli 1000 -> "1", 500 -> "0.5". */
export const formatQty = (milli: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(milli / 1000);

/** rate_bp 250 -> "2.5%", 1000 -> "10%". */
export const formatRate = (bp: number, locale: string): string =>
  new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(bp / 10_000);

export const formatTime = (iso: string, tz: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export const formatDayTime = (iso: string, tz: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** A plain date ("2026-10-14", e.g. expires_on) without shifting it through a time zone. */
export const formatDate = (isoDate: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${isoDate}T00:00:00Z`));

/** The calendar date of an instant in a zone, "YYYY-MM-DD". */
export function dayKey(at: Date | string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "Today", "Tomorrow" or "Wednesday 14 Oct", judged in the outlet's zone (not the browser's). */
export function dayLabel(iso: string, tz: string, locale: string, now: Date = new Date()): string {
  const today = dayKey(now, tz);
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10); // calendar arithmetic, DST-safe
  const key = dayKey(iso, tz);
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "short" }).format(new Date(iso));
}

/** A time today ("10:00 am") or, on another day, with the day ("Wed 14 Oct, 10:00 am"). */
export const formatWhen = (iso: string, tz: string, locale: string, now: Date = new Date()): string =>
  dayKey(iso, tz) === dayKey(now, tz) ? formatTime(iso, tz, locale) : formatDayTime(iso, tz, locale);

/** Deal windows: ISO weekdays (1 = Monday) -> "Mon–Fri", "Every day" or "Mon, Wed". */
export function formatDays(days: number[], locale: string): string {
  const name = (d: number) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short" }).format(new Date(Date.UTC(2024, 0, d))); // 1 Jan 2024 was a Monday
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  const run = sorted.length > 2 && sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  return run ? `${name(sorted[0]!)}–${name(sorted[sorted.length - 1]!)}` : sorted.map(name).join(", ");
}

/** "item.paneer_tikka" -> "Paneer tikka". Fallback label when display_name is null. */
export const titleCase = (key: string): string =>
  key.replace(/^(item|variant|group|option|deal|category)\./, "").replace(/^[a-z0-9_]+\./, "").replaceAll(/[._]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** The owner's display name (plain text; render as text, never HTML), else a label for name_key. */
export const shownName = (x: { display_name: string | null; name_key: string }): string => x.display_name ?? titleCase(x.name_key);
```

### 8.2 Copy chosen by code (never the server's text)

The quoted strings are the approved product copy. `{…}` parts are filled only from response fields and `params`.

```ts
// file: lib/munim/copy.ts
// Every user-facing string about API state, chosen by code. The server's error.message is never shown.
import type { MunimError, RefusalParams } from "./client";
import type { Schemas } from "./types";

export interface CopyContext {
  /** The display name of a menu item id (from the menu you loaded), or null. */
  itemName: (itemId: string) => string | null;
  /** The display name of cart line N (1-based), or null. */
  lineName: (lineNo: number) => string | null;
  /** The display name of a deal id (your label for its name_key), or null. */
  dealName: (dealId: string) => string | null;
  outletName: string;
  /** next_open from GET .../state, already formatted with formatWhen, or null. */
  nextOpen: string | null;
  money: (minor: number, currency: string) => string;
}

export function refusalText(reason: string, params: RefusalParams, ctx: CopyContext): string {
  const item = (params.item_id ? ctx.itemName(params.item_id) : null) ?? (params.line_no ? ctx.lineName(params.line_no) : null) ?? "An item";
  const deal = (params.deal_id ? ctx.dealName(params.deal_id) : null) ?? "promotional";
  switch (reason) {
    case "window_full":
      return "That pickup time just filled up. Please choose another.";
    case "outlet_paused":
      return ctx.nextOpen ? `${ctx.outletName} stopped taking orders a moment ago. Back at ${ctx.nextOpen}.` : `${ctx.outletName} stopped taking orders a moment ago.`;
    case "item_sold_out":
      return `${item} just sold out. Remove it to continue.`;
    case "item_unavailable":
      return `${item} isn't available right now. Remove it to continue.`;
    case "deal_changed":
      return `The ${deal} deal was updated. Please review your cart.`;
    case "deal_rejudged":
      return params.old_total_minor !== undefined && params.new_total_minor !== undefined && params.currency
        ? `The ${deal} deal isn't available at that time. Your total changed from ${ctx.money(params.old_total_minor, params.currency)} to ${ctx.money(params.new_total_minor, params.currency)}.`
        : `The ${deal} deal isn't available at that time. Please review your total.`;
    case "preview_total_changed":
      return "The total changed since the preview. Review it and try again.";
    case "coupon_invalid":
      return "This coupon isn't valid.";
    case "coupon_expired":
      return "This coupon has expired.";
    case "coupon_out_of_scope":
      return "This coupon isn't valid at this outlet.";
    case "coupon_cap_reached":
      return "This coupon has reached its limit.";
    case "coupon_min_spend":
      return params.shortfall_minor !== undefined && params.currency
        ? `Spend ${ctx.money(params.shortfall_minor, params.currency)} more to use this coupon.`
        : "Spend a little more to use this coupon.";
    case "pickup_time_outside_window":
      return "That pickup time isn't available. Please choose another.";
    case "change_window_closed":
      return "It's too late to change this order online. Please call the outlet.";
    case "guest_cannot_change":
      return "Call the outlet to change this order";
    case "rate_limited":
      return "Too many requests. Please wait a moment and try again.";
    default:
      return "Something in your order needs another look. Please review it and try again.";
  }
}

export type Where = "menu" | "checkout" | "tracker" | "cares";

/** Copy for a failed call. kind "not_found" should send the shopper to the "This link isn't valid." page instead. */
export function errorText(e: MunimError, where: Where, ctx?: CopyContext): string {
  if (e.kind === "refusal" && e.reasonCode && ctx) return refusalText(e.reasonCode, e.params, ctx);
  if (e.kind === "rate_limited") return "Too many requests. Please wait a moment and try again.";
  if (e.kind === "not_found") return "This link isn't valid.";
  if (e.kind === "network") {
    if (where === "checkout") return "No connection. We couldn't confirm your order. Try again: it won't be placed twice.";
    if (where === "tracker") return "You're offline. Showing the last update.";
    return "You're offline. Your cart is kept on this phone.";
  }
  if (where === "checkout") return "Your order was not placed. Please try again.";
  if (where === "tracker") return "Can't load your order right now. It is still placed.";
  if (where === "cares") return "Donations couldn't load right now.";
  return "The menu couldn't load. Please try again.";
}

type Accepting = Schemas["StorefrontAcceptingResponse"];

/** The outlet state line. `nextOpen` is next_open formatted with formatWhen (null: the time part is dropped). */
export function acceptingText(a: Accepting, nextOpen: string | null): string {
  switch (a.state) {
    case "open":
      return "Open";
    case "busy":
      return `Busy — about ${a.busy_extra_min} min extra`;
    case "paused":
      return nextOpen ? `Not taking orders right now. Back at ${nextOpen}.` : "Not taking orders right now.";
    case "closed":
      return nextOpen ? `Closed. Opens ${nextOpen}.` : "Closed.";
    default:
      return "";
  }
}

/** "Ready in about N min": the outlet's prep time plus the busy extra, two row fields shown as returned. */
export const readyInMinutes = (a: Accepting): number => a.default_prep_min + (a.state === "busy" ? a.busy_extra_min : 0);

export const canOrder = (a: Accepting): boolean => a.state === "open" || a.state === "busy";

/** "Pay at the counter — cash, card or UPI." from the API's pay_at_counter_methods (null: the generic line). */
export function payAtCounterText(methods: ReadonlyArray<string> | null): string {
  const names: Record<string, string> = { cash: "cash", card: "card", upi: "UPI" };
  const known = (methods ?? []).map((m) => names[m]).filter((m): m is string => Boolean(m));
  if (known.length === 0) return "Pay at the counter.";
  const list = known.length === 1 ? known[0]! : `${known.slice(0, -1).join(", ")} or ${known[known.length - 1]!}`;
  return `Pay at the counter — ${list}.`;
}

/** Shown wherever payment is mentioned. */
export const RECORDED_ONLY = "Recorded only — Munim does not process payments.";

export const DIET_LABEL: Record<string, string> = { veg: "Veg", non_veg: "Non-veg", egg: "Egg", vegan: "Vegan" };

export const STATUS_LABEL: Record<string, string> = {
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Picked up",
  rejected: "Not accepted",
  cancelled: "Cancelled",
};
```

### 8.3 Cart, preview and checkout attempts

```ts
// file: lib/munim/checkout.ts
// Cart -> preview request -> one frozen place request per checkout attempt. No money is computed here: totals
// come only from the preview and order responses.
import type { MunimError } from "./client";
import { titleCase } from "./format";
import type { Schemas } from "./types";
import { uuidv7 } from "./uuid";

type Menu = Schemas["StorefrontMenuResponse"];

/** One cart line as the shopper built it. qty is a whole count; the API wants thousandths (qty_milli). */
export interface CartLine {
  key: string;
  itemId: string;
  variantId: string | null;
  optionIds: string[];
  qty: number;
}
/** ASAP = both null. A chosen window: its id with promisedAt null (the API then promises the window's start). */
export interface Slot {
  pickupWindowId: string | null;
  promisedAt: string | null;
}
export interface Cart {
  outletId: string;
  lines: CartLine[];
  slot: Slot;
  /** Upper case, ^[A-Z0-9][A-Z0-9-]{2,31}$, at most 5. */
  couponCodes: string[];
}
export interface Contact {
  name: string;
  /** E.164, e.g. "+919812345678"; null when the shopper gave only an email. */
  phone: string | null;
  email: string | null;
  marketing: boolean;
}

export const ASAP: Slot = { pickupWindowId: null, promisedAt: null };
export const COUPON_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
export const E164_PATTERN = /^\+[1-9][0-9]{6,14}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const newCartLine = (itemId: string, variantId: string | null, optionIds: string[], qty = 1): CartLine =>
  ({ key: uuidv7(), itemId, variantId, optionIds: [...optionIds].sort(), qty });

/** A UI limit per line (the API documents none). */
export const MAX_QTY = 20;

/** Adds a line, merging it into an identical one (same item, variant and options). */
export function addToCart(cart: Cart, line: CartLine): Cart {
  const same = cart.lines.find((l) => l.itemId === line.itemId && l.variantId === line.variantId && l.optionIds.join() === line.optionIds.join());
  if (!same) return { ...cart, lines: [...cart.lines, line] };
  return { ...cart, lines: cart.lines.map((l) => (l === same ? { ...l, qty: Math.min(l.qty + line.qty, MAX_QTY) } : l)) };
}

/** The cart badge: how many things, never how much money. */
export const cartCount = (cart: Cart): number => cart.lines.reduce((n, l) => n + l.qty, 0);

/** Why an item-modal selection cannot be added yet (empty = fine). Mirrors the API's checks, so the shopper never
 *  meets a 422 or 409 for a missing variant or option. */
export function selectionProblems(item: Menu["items"][number], variantId: string | null, optionIds: string[]): string[] {
  const out: string[] = [];
  if (item.variants.length > 0) {
    const v = item.variants.find((x) => x.variant_id === variantId);
    if (!v) out.push(`Choose one: ${item.variants.map((x) => x.display_name ?? titleCase(x.name_key)).join(" or ")}`);
    else if (!v.available) out.push(`${v.display_name ?? titleCase(v.name_key)} is sold out`);
  }
  for (const g of item.option_groups) {
    const label = g.display_name ?? titleCase(g.name_key);
    const n = g.options.filter((o) => optionIds.includes(o.option_id)).length;
    if (n < g.min_select) out.push(g.min_select === 1 ? `Choose a ${label.toLowerCase()}` : `Choose at least ${g.min_select}: ${label}`);
    if (n > g.max_select) out.push(`Choose at most ${g.max_select}: ${label}`);
  }
  return out;
}

/** Deal ids a preview line applied, read from its deal_refs ("⟨cite:row:core.deal:<id>⟩"); match them to menu.deals[].deal_id. */
export const dealIdsOf = (refs: readonly string[]): string[] => refs.flatMap((r) => /core\.deal:([0-9a-f-]{36})/.exec(r)?.[1] ?? []);

/** The order's brand: the items' brand when the whole cart is one brand's, else null. */
export function cartBrandId(cart: Cart, menu: Menu): string | null {
  const ids = new Set(cart.lines.map((l) => menu.items.find((i) => i.item_id === l.itemId)?.brand_id ?? null));
  const [only] = [...ids];
  return ids.size === 1 && only ? only : null;
}

export function previewRequest(cart: Cart, menu: Menu): Schemas["OrdersPreviewRequest"] {
  return {
    outlet_id: cart.outletId,
    channel_id: menu.channel_id, // the key's own channel; the server overwrites it anyway
    brand_id: cartBrandId(cart, menu),
    kind: "pickup",
    pickup_window_id: cart.slot.pickupWindowId,
    promised_at: cart.slot.promisedAt,
    coupon_codes: cart.couponCodes,
    loyalty_redeem_points: 0, // guests cannot redeem points
    lines: cart.lines.map((l) => ({ item_id: l.itemId, variant_id: l.variantId, option_ids: l.optionIds, qty_milli: l.qty * 1000, barcode: null })),
  };
}

/** One checkout attempt: the exact place request, built once (ids, keys and consent time included).
 *  After a network failure, timeout, 429 or 5xx, send attempt.body again UNCHANGED: the API answers with the original
 *  order (X-Munim-Replayed: true) and never places twice. After any other error, or any change to the cart, slot,
 *  coupon or contact, build a new attempt. */
export interface Attempt {
  fingerprint: string;
  body: Schemas["StorefrontOrderPlaceRequest"];
}

/** What the shopper confirmed. A different fingerprint means a new attempt. */
export const attemptFingerprint = (cart: Cart, contact: Contact, previewTotalMinor: number): string =>
  JSON.stringify([cart.outletId, cart.lines.map((l) => [l.itemId, l.variantId, l.optionIds, l.qty]), cart.slot, cart.couponCodes, contact, previewTotalMinor]);

export function newAttempt(cart: Cart, menu: Menu, contact: Contact, previewTotalMinor: number): Attempt {
  const p = previewRequest(cart, menu);
  return {
    fingerprint: attemptFingerprint(cart, contact, previewTotalMinor),
    body: {
      order: {
        command_id: uuidv7(),
        idempotency_key: uuidv7(),
        type: "orders.place.v1",
        payload: {
          order_id: uuidv7(),
          outlet_id: p.outlet_id,
          channel_id: p.channel_id,
          brand_id: p.brand_id,
          device_id: null,
          kind: "pickup",
          table_ref: null,
          pickup_window_id: p.pickup_window_id,
          promised_at: p.promised_at,
          external_ref: null,
          // Line ids belong to the attempt: a line id already used by a placed order is refused.
          lines: p.lines.map((l) => ({ line_id: uuidv7(), item_id: l.item_id, variant_id: l.variant_id, option_ids: l.option_ids, qty_milli: l.qty_milli, barcode: null, note: null })),
          coupon_codes: p.coupon_codes,
          loyalty_redeem_points: 0,
          preview_total_minor: previewTotalMinor, // the server total the shopper saw; a different re-price is refused
          client_totals: null, // the server ignores client totals
        },
      },
      guest: {
        command_id: uuidv7(),
        idempotency_key: uuidv7(),
        type: "storefront.guest.create.v1",
        payload: {
          name: contact.name.trim(),
          phone: contact.phone,
          email: contact.email,
          consent: { marketing: contact.marketing, at: new Date().toISOString() }, // frozen with the attempt
        },
      },
      contact: null,
    },
  };
}

/** True when the same attempt may be sent again unchanged. */
export const retryable = (e: MunimError): boolean => e.kind === "network" || e.kind === "rate_limited" || e.kind === "server";
```

### 8.4 Browser storage

| Key | Store | Holds |
|---|---|---|
| `munim.guest.<order_id>` | `localStorage` | The order's guest token (and nothing else about the customer). Write it **before** you render anything after placing. |
| `munim.cart.<outlet_id>` | `localStorage` | The cart (ids and counts; no prices). |
| `munim.attempt.<outlet_id>` | `sessionStorage` only | The current checkout attempt (§8.3), so a reload-and-retry reuses the same keys. It contains the shopper's name, phone and email: never copy it to `localStorage`, and delete it on success or when the attempt ends (steps 4 and 6 below). |

```ts
// file: lib/munim/storage.ts
// Browser storage for the guest token, the cart and the checkout attempt. Every call survives blocked storage
// (Safari private mode): it then returns null / does nothing.
import type { Attempt, Cart } from "./checkout";

function get(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function set(store: "local" | "session", key: string, value: string | null): boolean {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export const saveGuestToken = (orderId: string, token: string): boolean => set("local", `munim.guest.${orderId}`, token);
export const loadGuestToken = (orderId: string): string | null => get("local", `munim.guest.${orderId}`);

export const saveCart = (cart: Cart): boolean => set("local", `munim.cart.${cart.outletId}`, JSON.stringify(cart));
export function loadCart(outletId: string): Cart | null {
  const raw = get("local", `munim.cart.${outletId}`);
  try {
    return raw ? (JSON.parse(raw) as Cart) : null;
  } catch {
    return null;
  }
}
export const clearCart = (outletId: string): boolean => set("local", `munim.cart.${outletId}`, null);

export const saveAttempt = (outletId: string, a: Attempt): boolean => set("session", `munim.attempt.${outletId}`, JSON.stringify(a));
export function loadAttempt(outletId: string): Attempt | null {
  const raw = get("session", `munim.attempt.${outletId}`);
  try {
    return raw ? (JSON.parse(raw) as Attempt) : null;
  } catch {
    return null;
  }
}
export const clearAttempt = (outletId: string): boolean => set("session", `munim.attempt.${outletId}`, null);
```

The place step, in order (each site file shows where it sits in the page):

1. Keep the last preview (`StorefrontPreviewResponse`). Allow "Place order" only when it exists, its `refusals` is
   empty, and the contact form is valid.
2. `fp = attemptFingerprint(cart, contact, preview.total_minor)`. Reuse `loadAttempt(outletId)` if its `fingerprint`
   equals `fp`; else `newAttempt(cart, menu, contact, preview.total_minor)` and `saveAttempt`.
3. `const r = await munim.placeOrder(attempt.body)`; disable every input while it runs.
4. `r.ok`: if `r.data.guest_access_token` is set, `saveGuestToken(r.data.order_id, token)` **first**. If it is null
   (a replay) and `loadGuestToken(order_id)` is also null, `clearAttempt` and show "We couldn't confirm your order on
   this device. Please check with the outlet." Otherwise `clearAttempt`, `clearCart`, go to the tracker.
5. `!r.ok` and `retryable(r.error)`: keep the attempt, show `errorText(r.error, "checkout")` and "Try again" (for 429,
   count down `retryAfterMs` first).
6. Any other error: `clearAttempt`. `key_reused`: build a new attempt and retry once. `refusal`: show
   `refusalText`, re-run the preview; `window_full` also re-fetches pickup windows; `outlet_paused` re-reads the
   state. `not_found`: the "This link isn't valid." page.

### 8.5 Tracking an order

```ts
// file: lib/munim/track.ts
// Live order tracking: the stream wakes us up, the order read is the truth, polling covers stream outages.
import type { MunimClient } from "./client";
import { openStream } from "./stream";
import type { Schemas } from "./types";

export type OrderView = Schemas["StorefrontOrderView"];
const FINAL = new Set(["completed", "rejected", "cancelled"]);

export interface TrackOptions {
  client: MunimClient;
  baseUrl: string;
  storefrontKey: string;
  orderId: string;
  guestToken: string;
  onOrder: (order: OrderView) => void;
  /** true while the stream is open ("Live"); false while reconnecting or polling ("Updating…"). */
  onLive: (live: boolean) => void;
  /** Two 404s in a row: not this browser's order (or the mock forgot it). Show "This link isn't valid." */
  onNotFound: () => void;
  /** Called on a failed read that is not a 404 (offline, 5xx). Keep showing the last order. */
  onError?: (kind: "network" | "other") => void;
  pollMs?: number;
}

/** Starts tracking; returns a stop function (call it on unmount). */
export function trackOrder(o: TrackOptions): () => void {
  let stopped = false;
  let misses = 0;
  let poll: ReturnType<typeof setInterval> | undefined;
  const startPolling = () => {
    poll ??= setInterval(() => void refresh(), o.pollMs ?? 15_000);
  };
  const stopPolling = () => {
    if (poll) clearInterval(poll);
    poll = undefined;
  };

  const stream = openStream({
    baseUrl: o.baseUrl,
    topics: [`order:${o.orderId}`],
    guestToken: o.guestToken,
    headers: () => ({ "X-Munim-Storefront-Key": o.storefrontKey }),
    onEvent: () => void refresh(), // the event carries ids and statuses only: re-read the order
    onState: (s) => {
      if (stopped) return;
      o.onLive(s === "open");
      if (s === "open") stopPolling();
      else if (s !== "closed") startPolling();
    },
  });
  stream.done.catch(() => {
    if (!stopped) {
      o.onLive(false);
      startPolling(); // refused (e.g. 404): keep polling, keep showing the last update
    }
  });

  async function refresh(): Promise<void> {
    const r = await o.client.getOrder(o.orderId, o.guestToken);
    if (stopped) return;
    if (r.ok) {
      misses = 0;
      o.onOrder(r.data);
      if (FINAL.has(r.data.status)) stop(); // nothing will change any more
    } else if (r.error.kind === "not_found") {
      if (++misses >= 2) {
        stop();
        o.onNotFound();
      } else setTimeout(() => void refresh(), 2_000);
    } else o.onError?.(r.error.kind === "network" ? "network" : "other");
  }

  function stop() {
    stopped = true;
    stream.close();
    stopPolling();
  }

  void refresh();
  return stop;
}
```

Status mapping for the tracker:

| `status` | Step | Final |
|---|---|---|
| `placed` | 1 "Placed" | no |
| `accepted` | 2 "Accepted" | no |
| `preparing` | 3 "Preparing" | no |
| `ready` | 4 "Ready" | no |
| `completed` | 5 "Picked up" | yes |
| `rejected`, `cancelled` | off the path (own message) | yes |

Only the server moves status. Never advance the progress bar on a client timer. Treat an unknown status as
"placed"-level text with no step highlighted.

### 8.6 Munim Cares

```ts
// file: lib/munim/cares.ts
// Munim Cares helpers. Listings are this business's surplus food offered to SIMULATED recipients.
import type { Schemas } from "./types";

export type CaresListing = Schemas["V1StorefrontCares"]["items"][number];
export type ImpactRow = Schemas["V1CaresNetworkImpact"]["rows"][number];

/** The all-cities row (city_code null); null when absent. Never pick a row by position. */
export const impactTotal = (impact: Schemas["V1CaresNetworkImpact"]): ImpactRow | null => impact.rows.find((r) => r.city_code === null) ?? null;

export const FOOD_KIND_LABEL: Record<string, string> = { cooked: "Cooked", raw: "Raw", packaged: "Packaged" };
const UNIT_LABEL: Record<string, string> = { portion: "portions", piece: "pieces", kg: "kg", g: "g", l: "L", ml: "ml" };
export const unitLabel = (unit: string): string => UNIT_LABEL[unit] ?? unit;
```

## 9 · Smoke test (run before any UI)

```bash
npm i -D tsx
NEXT_PUBLIC_MUNIM_API=https://munim-rho.vercel.app/mock \
NEXT_PUBLIC_MUNIM_STOREFRONT_KEY=sfk_mock_spice_route_7f3a91c2 \
npx tsx scripts/smoke.ts
```

Run it once per key. Every line must say `ok`; the process exits non-zero otherwise. It places one real (mock)
order; the mock keeps at most 30 orders per business and evicts the oldest.

```ts
// file: scripts/smoke.ts
// Exercises the client against the mock: outlets, menu, preview, place, replay, read, stream, 404, 429.
import { createMunimClient, type MunimError } from "../lib/munim/client";
import { newAttempt, newCartLine, previewRequest, type Cart } from "../lib/munim/checkout";
import { openStream } from "../lib/munim/stream";
import { formatMoney } from "../lib/munim/format";

const baseUrl = process.env.NEXT_PUBLIC_MUNIM_API ?? "";
const storefrontKey = process.env.NEXT_PUBLIC_MUNIM_STOREFRONT_KEY ?? "";
const munim = createMunimClient({ baseUrl, storefrontKey });
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};
const why = (e: MunimError) => `${e.kind} ${e.status} ${e.code ?? ""} ${e.reasonCode ?? ""}`;

async function main(): Promise<void> {
  const outlets = await munim.listOutlets();
  if (!outlets.ok) throw new Error(`outlets: ${why(outlets.error)}`);
  check("outlets", outlets.data.outlets.length > 0, outlets.data.outlets.map((o) => o.name).join(", "));
  const outlet = outlets.data.outlets[0]!;

  const menu = await munim.getMenu(outlet.outlet_id);
  if (!menu.ok) throw new Error(`menu: ${why(menu.error)}`);
  const item = menu.data.items.find((i) => i.available && i.price_minor !== null && i.option_groups.every((g) => !g.required));
  if (!item) throw new Error("no simple item on the menu");
  check("menu", true, `${menu.data.items.length} items, state ${menu.data.accepting.state}, first simple item ${item.display_name ?? item.name_key}`);

  const cart: Cart = { outletId: outlet.outlet_id, lines: [newCartLine(item.item_id, null, [], 2)], slot: { pickupWindowId: null, promisedAt: null }, couponCodes: [] };
  const preview = await munim.previewOrder(previewRequest(cart, menu.data));
  if (!preview.ok) throw new Error(`preview: ${why(preview.error)}`);
  const p = preview.data;
  check("preview", p.label === "preview" && p.refusals.length === 0, `total ${formatMoney(p.total_minor, p.currency, "en")} tax ${p.tax_components.map((t) => `${t.code} ${t.amount_minor}`).join(" + ") || "none"}`);

  const attempt = newAttempt(cart, menu.data, { name: "Smoke Test", phone: null, email: "smoke@example.com", marketing: false }, p.total_minor);
  const placed = await munim.placeOrder(attempt.body);
  if (!placed.ok) throw new Error(`place: ${why(placed.error)}`);
  const token = placed.data.guest_access_token;
  check("place", placed.status === 201 && !placed.replayed && token !== null, `ticket ${placed.data.ticket_no}, status ${placed.data.status}`);

  const replay = await munim.placeOrder(attempt.body); // the SAME attempt object, sent again
  check("replay", replay.ok && replay.replayed && replay.data.order_id === placed.data.order_id && replay.data.guest_access_token === null,
    replay.ok ? `replayed=${replay.replayed}, token ${replay.data.guest_access_token === null ? "null" : "present"}` : why(replay.error));

  const order = await munim.getOrder(placed.data.order_id, token);
  check("read order", order.ok && order.data.total_minor === p.total_minor, order.ok ? `status ${order.data.status}, ${order.data.events.length} event(s)` : why(order.error));

  const noToken = await munim.getOrder(placed.data.order_id, null);
  check("read without token is 404", !noToken.ok && noToken.error.kind === "not_found");

  // Stream: wait for "ready", then for one event. The cursor "n=0" replays the mock's history so the "placed"
  // event arrives at once (a test trick for the mock only; in the app never invent a cursor).
  const got = await new Promise<string>((resolve) => {
    let open = false;
    const timer = setTimeout(() => (s.close(), resolve(open ? "ready only" : "nothing")), 15_000);
    const s = openStream({
      baseUrl,
      topics: [`order:${placed.data.order_id}`],
      guestToken: token!,
      headers: () => ({ "X-Munim-Storefront-Key": storefrontKey }),
      lastEventId: "n=0",
      onState: (st) => { if (st === "open") open = true; },
      onEvent: (e) => { clearTimeout(timer); s.close(); resolve(`${e.type} ${JSON.stringify(e.data)}`); },
    });
    s.done.catch((e: unknown) => { clearTimeout(timer); resolve(`refused ${String(e)}`); });
  });
  check("stream", got.startsWith("order.status"), got);

  const badKey = await createMunimClient({ baseUrl, storefrontKey: "sfk_wrong_key_000000" }).listOutlets();
  check("bad key is 404", !badKey.ok && badKey.error.kind === "not_found" && badKey.error.status === 404, badKey.ok ? "200?" : why(badKey.error));

  const limited = await createMunimClient({ baseUrl, storefrontKey, extraHeaders: () => ({ "X-Mock-Force-429": "1" }) }).getMenu(outlet.outlet_id);
  check("429 parsed", !limited.ok && limited.error.kind === "rate_limited" && limited.error.reasonCode === "rate_limited" && limited.error.retryAfterMs === 5000,
    limited.ok ? "200?" : `${why(limited.error)} retryAfterMs ${limited.error.retryAfterMs}`);

  const changed = newAttempt(cart, menu.data, { name: "Smoke Test", phone: null, email: "smoke@example.com", marketing: false }, p.total_minor + 1);
  const refused = await munim.placeOrder(changed.body);
  check("stale preview total refused", !refused.ok && refused.error.kind === "refusal" && refused.error.reasonCode === "preview_total_changed", refused.ok ? "placed?" : why(refused.error));

  const impact = await munim.getNetworkImpact();
  check("network impact (404 on the mock: hide it)", impact.ok || impact.error.kind === "not_found", impact.ok ? "served" : why(impact.error));

}

main().then(
  () => {
    console.log(failed === 0 ? "smoke: all ok" : `smoke: ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  },
  (e: unknown) => {
    console.log(`FAIL ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
```

## Appendix A · Hand-written types (fallback only)

Use this only if you cannot run the generator. Save it as `lib/munim/types.ts` (replacing the generated-route file).
Field names and nullability are copied from the contract; `string` stands in for the contract's id, date and
enum patterns.

```ts
// file: lib/munim/types.fallback.ts
// Hand-written subset of the contract's schemas for the storefront routes. Prefer the generated types.
type Uuid = string;
type Iso = string;
type Ref = string;
type Measured<T> = { value: T; ref: Ref };
type TaxComponentAmount = { code: string; rate_bp: number; amount_minor: number };
type RefusalParams = {
  line_no?: number;
  item_id?: Uuid;
  variant_id?: Uuid | null;
  deal_id?: Uuid;
  code?: string;
  min_spend_minor?: number;
  shortfall_minor?: number;
  old_total_minor?: number;
  new_total_minor?: number;
  currency?: string;
};
type ErrorBody = { code: string; message: string; reason_code: string | null };
type Accepting = {
  outlet_id: Uuid;
  state: "open" | "busy" | "paused" | "closed";
  busy_extra_min: number;
  default_prep_min: number;
  next_open: Iso | null;
  tz: string;
  as_of: Iso;
};
type Shown = { display_name: string | null; description: string | null };
type OrderStatus = "placed" | "accepted" | "rejected" | "preparing" | "ready" | "completed" | "cancelled";
type PreviewLine = {
  line_no: number;
  item_id: Uuid;
  variant_id: Uuid | null;
  qty_milli: number;
  unit_price_minor: number;
  options_minor: number;
  line_discount_minor: number;
  tax_class: string;
  tax_minor: number;
  line_total_minor: number;
  price_ref: Ref;
  option_refs: Ref[];
  deal_refs: Ref[];
  coupon_refs: Ref[];
};
type OrdersPreviewResponse = {
  label: "preview";
  priced_at: Iso;
  currency: string;
  tax_rule: { pack_code: string; pack_version: number };
  lines: PreviewLine[];
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  refusals: { line_no: number | null; reason_code: string }[];
};
type CaresListing = {
  listing_id: Uuid;
  city_code: string;
  business_name: string;
  outlet_name: string;
  pickup_from: Iso;
  pickup_to: Iso;
  tz: string;
  recipient_name: string;
  recipient_simulated: true;
  lines: { line_no: number; food_kind: "cooked" | "raw" | "packaged"; label_key: string | null; label: string | null; qty_milli: number; unit: string; expires_on: string | null }[];
};

export interface Schemas {
  Error: { error: ErrorBody };
  StorefrontRefusalError: { error: ErrorBody; params?: RefusalParams };
  CommandResult: { command_id: Uuid; type: string; entity_id: Uuid; committed_at: Iso };
  StorefrontAcceptingResponse: Accepting;
  StorefrontOutletsResponse: {
    outlets: {
      outlet_id: Uuid;
      name: string;
      kind: "restaurant" | "cloud_kitchen" | "store";
      tz: string;
      address: string;
      phone: string | null;
      tax_ids: { code: string; label: string; value: string }[];
    }[];
    pay_at_counter_methods: ("cash" | "card" | "upi")[] | null;
  };
  StorefrontMenuResponse: {
    outlet_id: Uuid;
    channel_id: Uuid;
    channel_kind: string;
    brands: { brand_id: Uuid; name: string }[];
    prices_include_tax: boolean;
    accepting: Accepting;
    items: ({
      item_id: Uuid;
      name_key: string;
      diet: "veg" | "non_veg" | "egg" | "vegan" | null;
      category: string;
      brand_id: Uuid | null;
      kind: "dish" | "sku" | "combo";
      available: boolean;
      price_minor: number | null;
      currency: string;
      variants: ({ variant_id: Uuid; name_key: string; available: boolean; price_minor: number } & Shown)[];
      option_groups: ({
        option_group_id: Uuid;
        name_key: string;
        min_select: number;
        max_select: number;
        required: boolean;
        options: ({ option_id: Uuid; name_key: string; price_delta_minor: number } & Shown)[];
      } & Shown)[];
    } & Shown)[];
    deals: { deal_id: Uuid; name_key: string; kind: string; windows: { days: number[]; from: string; to: string }[]; valid_from: string; valid_to: string | null }[];
    pay_at_counter: true;
    pay_at_counter_methods: ("cash" | "card" | "upi")[] | null;
  };
  StorefrontPickupWindowsResponse: {
    outlet_id: Uuid;
    windows: { pickup_window_id: Uuid; starts_at: Iso; ends_at: Iso; capacity_orders: number; booked: number }[];
  };
  OrdersPreviewRequest: {
    outlet_id: Uuid;
    channel_id: Uuid;
    brand_id: Uuid | null;
    kind: "dine_in" | "takeaway" | "pickup" | "delivery";
    pickup_window_id: Uuid | null;
    promised_at: Iso | null;
    coupon_codes: string[];
    loyalty_redeem_points: number;
    lines: { item_id: Uuid; variant_id: Uuid | null; option_ids: Uuid[]; qty_milli: number; barcode: string | null }[];
  };
  StorefrontPreviewResponse: Omit<OrdersPreviewResponse, "lines" | "refusals"> & {
    lines: (PreviewLine & { tax_rate_bp: number; tax_components: TaxComponentAmount[] })[];
    tax_components: TaxComponentAmount[];
    prices_include_tax: boolean;
    refusals: { line_no: number | null; reason_code: string; params?: RefusalParams }[];
  };
  StorefrontOrderPlaceRequest: {
    order: {
      command_id: Uuid;
      idempotency_key: string;
      type: "orders.place.v1";
      payload: {
        order_id: Uuid;
        outlet_id: Uuid;
        channel_id: Uuid;
        brand_id: Uuid | null;
        device_id: Uuid | null;
        kind: "dine_in" | "takeaway" | "pickup" | "delivery";
        table_ref: string | null;
        pickup_window_id: Uuid | null;
        promised_at: Iso | null;
        external_ref: string | null;
        lines: { line_id: Uuid; item_id: Uuid; variant_id: Uuid | null; option_ids: Uuid[]; qty_milli: number; barcode: string | null; note: string | null }[];
        coupon_codes: string[];
        loyalty_redeem_points: number;
        preview_total_minor: number | null;
        client_totals: { subtotal: { amount_minor: number; currency: string }; total: { amount_minor: number; currency: string } } | null;
      };
    };
    guest: {
      command_id: Uuid;
      idempotency_key: string;
      type: "storefront.guest.create.v1";
      payload: { name: string; phone: string | null; email: string | null; consent: { marketing: boolean; at: Iso } };
    } | null;
    contact: { name: string; phone: string | null } | null;
  };
  StorefrontOrderPlaced: {
    order_id: Uuid;
    status: OrderStatus;
    ticket_no: number;
    total_minor: number;
    tax_minor: number;
    prices_include_tax: boolean | null;
    currency: string;
    promised_at: Iso | null;
    pay_at_counter: true;
    guest_access_token: string | null;
  };
  StorefrontOrderView: {
    order_id: Uuid;
    outlet_id: Uuid;
    kind: "dine_in" | "takeaway" | "pickup" | "delivery";
    status: OrderStatus;
    ticket_no: number;
    business_date: string;
    promised_at: Iso | null;
    pickup_window_id: Uuid | null;
    subtotal_minor: number;
    discount_minor: number;
    tax_minor: number;
    total_minor: number;
    currency: string;
    created_at: Iso;
    cancel_window_min: number;
    reschedule_window_min: number;
    pay_at_counter: true;
    prices_include_tax: boolean | null;
    lines: {
      line_no: number;
      item_id: Uuid;
      variant_id: Uuid | null;
      qty_milli: number;
      unit_price_minor: number;
      line_discount_minor: number;
      tax_minor: number;
      tax_rate_bp: number | null;
      tax_component_rates: { code: string; rate_bp: number }[];
    }[];
    events: {
      kind: "status" | "promised_at";
      from_status: string | null;
      to_status: string | null;
      from_promised_at: Iso | null;
      to_promised_at: Iso | null;
      reason: string | null;
      at: Iso;
    }[];
  };
  StorefrontReschedulePreviewRequest: { pickup_window_id: Uuid | null; promised_at: Iso };
  StorefrontReschedulePreviewResponse: { order_id: Uuid; promised_at: Iso; current_total_minor: number; preview: OrdersPreviewResponse };
  StorefrontOrderCancelV1: { order_id: Uuid; reason: "changed_mind" | "ordered_by_mistake" | "wait_too_long" | "other" | null };
  StorefrontOrderRescheduleV1: { order_id: Uuid; pickup_window_id: Uuid | null; promised_at: Iso; preview_total_minor: number };
  V1StorefrontCares: { items: CaresListing[] };
  V1CaresNetworkImpact: {
    snapshot_id: Uuid;
    as_of: Iso;
    template_id: string;
    template_version: number;
    rows: {
      city_code: string | null;
      businesses: Measured<number>;
      donations: Measured<number>;
      meals_portions_milli: Measured<number>;
      weight_g: Measured<number>;
      volume_ml: Measured<number>;
      all_synthetic: Measured<boolean>;
    }[];
    labels: { data: "Measured on synthetic data"; recipients: "to simulated recipients" };
    note_key: "cares.note.check_local_rules";
  };
}

export type ApiPath =
  | "/v1/storefront/outlets"
  | "/v1/storefront/outlets/{outlet_id}/menu"
  | "/v1/storefront/outlets/{outlet_id}/state"
  | "/v1/storefront/outlets/{outlet_id}/pickup-windows"
  | "/v1/storefront/orders:preview"
  | "/v1/storefront/orders"
  | "/v1/storefront/orders/{id}"
  | "/v1/storefront/orders/{id}:cancel"
  | "/v1/storefront/orders/{id}:reschedule-preview"
  | "/v1/storefront/orders/{id}:reschedule"
  | "/v1/storefront/cares"
  | "/v1/cares-network/impact";
```
