import { BUSINESSES, type Business } from "../catalogue";
import { handle } from "../handler";
import { clock, store } from "../store";
import { stableId } from "../util";
import { RefusalErrorResponse } from "../../../../packages/contracts/src/shared/error.ts";
import { parseSse } from "../../../../packages/sdk/src/stream.ts";
import { StorefrontOrderView } from "../../../../packages/contracts/src/storefront/index.ts";

export const SPICE = BUSINESSES[0]!;
export const LANEWAY = BUSINESSES[1]!;
export const BASE = "http://site.test/mock";
// Saturday 2026-10-17 midday IST / Melbourne: no deal window is open, restaurants open.
export const NOW = new Date("2026-10-17T05:00:00Z");

export function reset(now: Date = NOW): void {
  store.orders.clear(); store.idem.clear(); store.tickets.clear(); store.extraBooked.clear();
  clock.now = () => now;
}

export type Res = { status: number; headers: Headers; body: any };
export async function call(biz: Business | null, method: "GET" | "POST", path: string, o: { body?: unknown; headers?: Record<string, string>; key?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  const key = o.key ?? biz?.key;
  if (key) headers["X-Munim-Storefront-Key"] = key;
  const res = await handle(new Request(`${BASE}${path}`, { method, headers, body: o.body === undefined ? null : JSON.stringify(o.body) }));
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  // Every error body anywhere in the suite must be the real envelope (with refusal params where the refusal has them);
  // every order view must satisfy the real schema.
  if (res.status >= 400) RefusalErrorResponse.parse(parsed);
  else if (/\/v1\/storefront\/orders\/[0-9a-f-]{36}$/.test(path) && method === "GET") StorefrontOrderView.parse(parsed);
  return { status: res.status, headers: res.headers, body: parsed };
}

export const item = (b: Business, slug: string) => b.items.find((i) => i.slug === slug)!;
export const optId = (b: Business, slug: string, opt: string) => item(b, slug).groups.flatMap((g) => g.options).find((o) => o.key === opt)!.id;
export const varId = (b: Business, slug: string, v: string) => item(b, slug).variants.find((x) => x.key === v)!.id;

export type L = { slug: string; variant?: string; opts?: string[]; qty?: number };
export const lines = (b: Business, ls: L[]) => ls.map((l) => ({
  item_id: item(b, l.slug).id, variant_id: l.variant ? varId(b, l.slug, l.variant) : null,
  option_ids: (l.opts ?? []).map((o) => optId(b, l.slug, o)), qty_milli: l.qty ?? 1000, barcode: null as string | null,
}));

export function previewReq(b: Business, ls: L[], o: { outlet?: number; promised?: string | null; window?: string | null; coupons?: string[] } = {}) {
  return {
    outlet_id: b.outlets[o.outlet ?? 0]!.id, channel_id: b.channelId, brand_id: null, kind: "pickup", pickup_window_id: o.window ?? null,
    promised_at: o.promised === undefined ? null : o.promised, coupon_codes: o.coupons ?? [], loyalty_redeem_points: 0, lines: lines(b, ls),
  };
}

let seq = 0;
export const nid = (tag: string) => stableId(`test:${tag}:${++seq}`);

export function placeReq(b: Business, ls: L[], o: { outlet?: number; promised?: string | null; window?: string | null; coupons?: string[]; key?: string; previewTotal?: number | null; customer?: boolean; clientTotal?: number } = {}) {
  const p = previewReq(b, ls, o);
  const cur = b.country === "IN" ? "INR" : "AUD";
  return {
    order: {
      command_id: nid("cmd"), idempotency_key: o.key ?? `place-${nid("k")}`, type: "orders.place.v1",
      payload: {
        order_id: nid("order"), outlet_id: p.outlet_id, channel_id: p.channel_id, brand_id: null, device_id: null, kind: "pickup", table_ref: null,
        pickup_window_id: p.pickup_window_id, promised_at: p.promised_at, external_ref: null,
        lines: p.lines.map((l) => ({ line_id: nid("line"), ...l, note: null })),
        coupon_codes: p.coupon_codes, loyalty_redeem_points: 0, preview_total_minor: o.previewTotal ?? null,
        client_totals: o.clientTotal === undefined ? null : { subtotal: { amount_minor: 1, currency: cur }, total: { amount_minor: o.clientTotal, currency: cur } },
      },
    },
    guest: o.customer ? null : { command_id: nid("g"), idempotency_key: `guest-${nid("gk")}`, type: "storefront.guest.create.v1", payload: { name: "Test Guest (synthetic)", phone: null, email: null, consent: { marketing: false, at: "2026-10-17T05:00:00Z" } } },
    contact: null,
  };
}
export const CUSTOMER = { Authorization: "Bearer mock-customer-test1" };

/** Opens GET /v1/stream on the mock and reads SSE events until `until` holds or `ms` passes, then disconnects. */
export async function sse(biz: Business, topics: string, o: { headers?: Record<string, string>; until?: (evs: ReturnType<typeof parseSse>["events"]) => boolean; ms?: number } = {}) {
  const ctl = new AbortController();
  const res = await handle(new Request(`${BASE}/v1/stream?topics=${encodeURIComponent(topics)}`, { headers: { "X-Munim-Storefront-Key": biz.key, ...(o.headers ?? {}) }, signal: ctl.signal }));
  if (res.status !== 200) return { status: res.status, headers: res.headers, events: [], body: RefusalErrorResponse.parse(JSON.parse(await res.text())) };
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  const events: ReturnType<typeof parseSse>["events"] = [];
  let buf = "";
  const deadline = Date.now() + (o.ms ?? 2000);
  while (Date.now() < deadline) {
    const r = await Promise.race([reader.read(), new Promise<null>((ok) => setTimeout(() => ok(null), Math.max(1, deadline - Date.now())))]);
    if (r === null || r.done) break;
    const p = parseSse(buf + dec.decode(r.value, { stream: true }));
    buf = p.rest;
    events.push(...p.events);
    if (o.until?.(events)) break;
  }
  ctl.abort();
  await reader.cancel().catch(() => {});
  return { status: 200, headers: res.headers, events, body: null };
}
