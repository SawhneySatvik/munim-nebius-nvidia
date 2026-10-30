// The mock storefront API: one fetch-style handler, dispatched from OPERATIONS (the same table the coverage gate
// compares to public.json). SIMULATED: synthetic data, nothing is paid, every response carries X-Munim-Mock: true.
import { randomBytes } from "node:crypto";
import { BUSINESSES, type Business, type Outlet } from "./catalogue";
import { MockError } from "./errors";
import { priceCart, type CartLine, type Priced } from "./pricing";
import { clock, putBooked, putIdem, putOrder, putTicket, resetBusiness, store, type StoredOrder } from "./store";
import { canonical, localParts, safeEqual, sha256, stableId, zonedInstant } from "./util";
import { PACKS } from "./packs";
import { CANCEL_CMD, PLACE_REQ, PREVIEW_REQ, RESCHEDULE_CMD, RESCHEDULE_PREVIEW_REQ } from "./validate";

export const MOCK_HEADER = "X-Munim-Mock";
const STEPS = [["accepted", 45], ["preparing", 75], ["ready", 110]] as const; // seconds after placing (allowed transitions only)
const CHANGE_WINDOW_MIN = 1;

type Who = { kind: "anon" } | { kind: "customer"; id: string } | { kind: "guest"; token: string };
type Ctx = { biz: Business; who: Who; body: unknown; params: Record<string, string>; force: string | null; now: Date; req: Request };
type Out = { status: number; body: unknown; headers?: Record<string, string> | undefined };
/** A Response is passed through as is (the event stream). */
type Handler = (c: Ctx) => Out | Response;

const iso = (d: Date) => d.toISOString();
const ok = (body: unknown, status = 200, headers?: Record<string, string>): Out => ({ status, body, headers });

// ---------- outlets, state, windows ----------
function outletOf(c: Ctx, id: string): Outlet {
  const o = c.biz.outlets.find((x) => x.id === id);
  if (!o) throw new MockError("not_found");
  return o;
}

function accepting(c: Ctx, o: Outlet) {
  const forced = ["open", "busy", "paused", "closed"].includes(c.force ?? "") ? c.force! : null;
  const state = forced ?? (o.busyExtra > 0 ? "busy" : "open");
  const l = localParts(c.now, o.tz);
  const next = new Date(Date.UTC(l.y, l.m - 1, l.d + 1));
  const nextOpen = zonedInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), o.hours[0], 0, o.tz);
  return {
    outlet_id: o.id, state, busy_extra_min: state === "busy" ? o.busyExtra || 15 : 0, default_prep_min: o.prepMin,
    next_open: state === "paused" || state === "closed" ? iso(nextOpen) : null, tz: o.tz, as_of: iso(c.now),
  };
}

type Win = { id: string; startsAt: Date; endsAt: Date; capacity: number; booked: number };
/** Today's and tomorrow's 30-minute slots (outlet-local hours). Some are already part-booked; a few are full. */
function allWindows(biz: Business, o: Outlet, now: Date): Win[] {
  const l = localParts(now, o.tz);
  const out: Win[] = [];
  for (let day = 0; day < 2; day++) {
    const d = new Date(Date.UTC(l.y, l.m - 1, l.d + day));
    const [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    for (let mins = o.hours[0] * 60; mins < o.hours[1] * 60; mins += 30) {
      const startsAt = zonedInstant(y, m, dd, Math.floor(mins / 60), mins % 60, o.tz);
      const id = stableId(`${biz.slug}:window:${o.id}:${startsAt.toISOString()}`);
      const base = Math.min(o.capacity, parseInt(id.slice(0, 4), 16) % (o.capacity + 2));
      out.push({ id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60000), capacity: o.capacity, booked: Math.min(o.capacity, base + (store.extraBooked.get(`${biz.slug}|${id}`) ?? 0)) });
    }
  }
  return out;
}

// ---------- reads ----------
const outlets: Handler = (c) => ok({
  outlets: c.biz.outlets.map((o) => ({ outlet_id: o.id, name: o.name, kind: "restaurant", tz: o.tz, address: o.address, phone: o.phone, tax_ids: o.taxIds })),
  pay_at_counter_methods: PACKS[c.biz.country].pay_at_counter_methods,
});

const menu: Handler = (c) => {
  const o = outletOf(c, c.params.outlet_id!);
  const idx = c.biz.outlets.indexOf(o);
  const pack = PACKS[c.biz.country];
  const brandId = c.biz.brands[0]?.id ?? null;
  return ok({
    outlet_id: o.id, channel_id: c.biz.channelId, channel_kind: "own_site", brands: c.biz.brands.map((b) => ({ brand_id: b.id, name: b.name })),
    prices_include_tax: pack.price_display === "inclusive", accepting: accepting(c, o),
    items: c.biz.items.filter((i) => i.active).map((i) => {
      const avail = !i.soldOutAt.includes(idx);
      return {
        item_id: i.id, name_key: `item.${i.slug}`, display_name: i.label, description: i.description, diet: i.diet, category: i.category, brand_id: brandId,
        kind: "dish", available: avail, price_minor: i.price, currency: pack.currency,
        variants: i.variants.map((v) => ({ variant_id: v.id, name_key: `variant.${i.slug}.${v.key}`, display_name: v.label, description: null, available: avail, price_minor: v.price })),
        option_groups: i.groups.map((g) => ({
          option_group_id: g.id, name_key: `group.${g.key}`, display_name: g.label, description: null, min_select: g.min, max_select: g.max, required: g.required,
          options: g.options.map((x) => ({ option_id: x.id, name_key: `option.${x.key}`, display_name: x.label, description: null, price_delta_minor: x.delta })),
        })),
      };
    }),
    deals: c.biz.deals.map((d) => ({ deal_id: d.id, name_key: d.key, kind: "percent_item", windows: [{ days: d.days, from: d.from, to: d.to }], valid_from: "2026-01-01", valid_to: null })),
    pay_at_counter: true,
    pay_at_counter_methods: pack.pay_at_counter_methods,
  });
};

const state: Handler = (c) => ok(accepting(c, outletOf(c, c.params.outlet_id!)));

const pickupWindows: Handler = (c) => {
  const o = outletOf(c, c.params.outlet_id!);
  const windows = allWindows(c.biz, o, c.now).filter((w) => w.endsAt > c.now && w.booked < w.capacity).slice(0, 24)
    .map((w) => ({ pickup_window_id: w.id, starts_at: iso(w.startsAt), ends_at: iso(w.endsAt), capacity_orders: w.capacity, booked: w.booked }));
  return ok({ outlet_id: o.id, windows });
};

const cares: Handler = (c) => ok({
  items: c.biz.cares.map((x, i) => ({
    listing_id: stableId(`${c.biz.slug}:cares:${i}`), city_code: c.biz.cityCode, business_name: c.biz.name, outlet_name: c.biz.outlets[0]!.name, tz: c.biz.outlets[0]!.tz,
    pickup_from: iso(new Date(c.now.getTime() + 2 * 3600000)), pickup_to: iso(new Date(c.now.getTime() + 4 * 3600000)),
    recipient_name: c.biz.recipient, recipient_simulated: true,
    lines: [{ line_no: 1, food_kind: "cooked", label_key: null, label: x.label, qty_milli: x.qtyMilli, unit: "portion", expires_on: null }],
  })),
});

// ---------- pricing + refusals shared by preview, place, reschedule ----------
type Req = { outlet_id: string; kind?: string; pickup_window_id: string | null; promised_at: string | null; coupon_codes: string[]; loyalty_redeem_points: number; lines: Array<CartLine & Record<string, unknown>> };

function checkWindow(c: Ctx, o: Outlet, windowId: string | null, ownWindow: string | null, promisedAt: string | null): { refusal: string | null; win: Win | null } {
  if (windowId === null) return { refusal: null, win: null };
  const win = allWindows(c.biz, o, c.now).find((w) => w.id === windowId);
  if (!win) throw new MockError("invalid_payload");
  // G-12 (as core): a promise for a chosen window lies inside it, [starts_at, ends_at); null = the window's start.
  const p = promisedAt === null ? null : Date.parse(promisedAt);
  if (p !== null && (p < win.startsAt.getTime() || p >= win.endsAt.getTime())) throw new MockError("invalid_payload", "pickup_time_outside_window");
  if (windowId === ownWindow && win.endsAt > c.now) return { refusal: null, win };
  return { refusal: win.booked >= win.capacity || win.endsAt <= c.now ? "window_full" : null, win };
}

function priceReq(c: Ctx, o: Outlet, r: Req, ownWindow: string | null = null): { priced: Priced; at: Date; win: Win | null } {
  const { refusal, win } = checkWindow(c, o, r.pickup_window_id, ownWindow, r.promised_at);
  // As core (rule 9): deals are judged at the promise, else the chosen window's start, else now — in preview and place alike.
  const at = r.promised_at ? new Date(r.promised_at) : win ? win.startsAt : c.now;
  const pricing = priceCart(c.biz, o, r.lines.map((l) => ({ item_id: l.item_id, variant_id: l.variant_id, option_ids: l.option_ids, qty_milli: l.qty_milli })), r.coupon_codes, at);
  const own: Array<{ line_no: number | null; reason_code: string }> = [];
  const st = accepting(c, o).state;
  if (st === "paused" || st === "closed") own.push({ line_no: null, reason_code: "outlet_paused" });
  if (refusal) own.push({ line_no: null, reason_code: refusal });
  return { priced: { ...pricing, refusals: [...own, ...pricing.refusals] }, at, win };
}

/** The orders preview body (the reschedule preview's `preview`): no tax components, refusals without params. */
const previewBody = (p: Priced, at: Date) => ({
  label: "preview", priced_at: iso(at), currency: p.currency, tax_rule: { pack_code: p.pack_code, pack_version: p.pack_version },
  lines: p.lines.map(({ tax_rate_bp: _r, tax_components: _c, ...l }) => l), subtotal_minor: p.subtotal_minor, discount_minor: p.discount_minor,
  tax_minor: p.tax_minor, total_minor: p.total_minor, refusals: p.refusals.map(({ params: _p, ...r }) => r),
});
/** The storefront preview (storefront.preview.response): adds per-line rates and components, order components, the pack's
 *  price display and refusal parameters. */
const storefrontPreviewBody = (p: Priced, at: Date) => ({
  ...previewBody(p, at), lines: p.lines, tax_components: p.lines.length ? p.tax_components : [], prices_include_tax: p.prices_include_tax, refusals: p.refusals,
});

const refuseLoyalty = (r: Req) => { if (r.loyalty_redeem_points > 0) throw new MockError("loyalty_refused"); };

const preview: Handler = (c) => {
  if (!PREVIEW_REQ(c.body)) throw new MockError("invalid_payload");
  const r = c.body as Req;
  const o = outletOf(c, r.outlet_id);
  refuseLoyalty(r);
  const { priced, at } = priceReq(c, o, r);
  return ok(storefrontPreviewBody(priced, at));
};

// ---------- orders ----------
function view(biz: Business, o: StoredOrder, now: Date) {
  const secs = (now.getTime() - o.createdAt.getTime()) / 1000;
  const steps = STEPS.filter(([, s]) => secs >= s);
  const statusEvents: Array<{ at: Date; from: string | null; to: string }> = [{ at: o.createdAt, from: null, to: "placed" }];
  let prev = "placed";
  if (o.cancelledAt) statusEvents.push({ at: o.cancelledAt, from: "placed", to: "cancelled" });
  else for (const [to, s] of steps) { statusEvents.push({ at: new Date(o.createdAt.getTime() + s * 1000), from: prev, to }); prev = to; }
  const status = o.cancelledAt ? "cancelled" : prev;
  const classes = PACKS[biz.country].classes;
  const events = [
    ...statusEvents.map((e) => ({ at: e.at, ev: { kind: "status", from_status: e.from, to_status: e.to, from_promised_at: null, to_promised_at: null, reason: e.to === "cancelled" ? "customer_cancelled" : null } })),
    ...o.promiseEvents.map((e) => ({ at: e.at, ev: { kind: "promised_at", from_status: null, to_status: null, from_promised_at: e.from && iso(e.from), to_promised_at: e.to && iso(e.to), reason: "customer_rescheduled" } })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime()).map((e) => ({ ...e.ev, at: iso(e.at) }));
  const p = o.priced;
  return {
    order_id: o.id, outlet_id: biz.outlets[o.outletIdx]!.id, kind: o.kind, status, ticket_no: o.ticketNo, business_date: o.businessDate,
    promised_at: o.promisedAt && iso(o.promisedAt), pickup_window_id: o.windowId, subtotal_minor: p.subtotal_minor, discount_minor: p.discount_minor,
    tax_minor: p.tax_minor, total_minor: p.total_minor, currency: p.currency, created_at: iso(o.createdAt),
    cancel_window_min: CHANGE_WINDOW_MIN, reschedule_window_min: CHANGE_WINDOW_MIN, pay_at_counter: true, prices_include_tax: p.prices_include_tax,
    lines: p.lines.map((l) => ({
      line_no: l.line_no, item_id: l.item_id, variant_id: l.variant_id, qty_milli: l.qty_milli, unit_price_minor: l.unit_price_minor, line_discount_minor: l.line_discount_minor, tax_minor: l.tax_minor,
      tax_rate_bp: classes[l.tax_class]!.rate_bp, tax_component_rates: classes[l.tax_class]!.components.map((k) => ({ code: k.code, rate_bp: k.rate_bp })),
    })),
    events,
  };
}

/** Idempotency like command_log: same key + same body -> the stored response (header X-Munim-Replayed); different body -> 409. */
function idempotent(c: Ctx, scope: string, key: string, run: () => Out, replay?: (b: unknown) => unknown): Out {
  const k = `${c.biz.slug}|${scope}|${key}`;
  const hash = sha256(canonical(c.body));
  const seen = store.idem.get(k);
  if (seen) {
    if (seen.hash !== hash) throw new MockError("idempotency_conflict");
    return ok(replay ? replay(seen.body) : seen.body, seen.status, { "X-Munim-Replayed": "true" });
  }
  const out = run();
  putIdem(k, { hash, status: out.status, body: out.body });
  return out;
}

const place: Handler = (c) => {
  if (!PLACE_REQ(c.body)) throw new MockError("invalid_payload");
  const b = c.body as { order: { idempotency_key: string; payload: Req & { order_id: string; kind: string; preview_total_minor: number | null } }; guest: unknown };
  const signedIn = c.who.kind === "customer";
  if (signedIn ? b.guest !== null : b.guest === null) throw new MockError("invalid_payload");
  return idempotent(c, "place", b.order.idempotency_key, () => {
    const r = b.order.payload;
    const o = outletOf(c, r.outlet_id);
    if (!["pickup", "takeaway"].includes(r.kind)) throw new MockError("invalid_payload");
    if (store.orders.has(r.order_id)) throw new MockError("conflict");
    refuseLoyalty(r);
    // Client totals are recorded for tamper detection only and never read: the total below is derived here.
    const { priced, win } = priceReq(c, o, r);
    if (priced.refusals[0]) throw new MockError("conflict", priced.refusals[0].reason_code, priced.refusals[0].params);
    if (r.preview_total_minor !== null && r.preview_total_minor !== priced.total_minor) throw new MockError("conflict", "preview_total_changed");
    const l = localParts(c.now, o.tz);
    const tk = `${c.biz.slug}|${o.id}|${l.date}`;
    const ticketNo = (store.tickets.get(tk) ?? 0) + 1;
    putTicket(tk, ticketNo);
    if (win) putBooked(`${c.biz.slug}|${win.id}`, (store.extraBooked.get(`${c.biz.slug}|${win.id}`) ?? 0) + 1);
    const token = signedIn ? null : `gst_${randomBytes(18).toString("hex")}`;
    const promised = r.promised_at ? new Date(r.promised_at) : win ? win.startsAt : new Date(c.now.getTime() + (o.prepMin + accepting(c, o).busy_extra_min) * 60000);
    putOrder({
      id: r.order_id, biz: c.biz.slug, outletIdx: c.biz.outlets.indexOf(o), kind: r.kind, ownerCustomer: c.who.kind === "customer" ? c.who.id : null,
      guestTokenHash: token && sha256(token), createdAt: c.now, ticketNo, businessDate: l.date, windowId: r.pickup_window_id, promisedAt: promised,
      lines: r.lines.map((x) => ({ item_id: x.item_id, variant_id: x.variant_id, option_ids: x.option_ids, qty_milli: x.qty_milli })),
      couponCodes: r.coupon_codes, priced, cancelledAt: null, promiseEvents: [],
    });
    return ok({
      order_id: r.order_id, status: "placed", ticket_no: ticketNo, total_minor: priced.total_minor, tax_minor: priced.tax_minor, prices_include_tax: priced.prices_include_tax,
      currency: priced.currency, promised_at: iso(promised), pay_at_counter: true, guest_access_token: token,
    }, 201);
  }, (stored) => ({ ...(stored as object), guest_access_token: null }));
};

function ownOrder(c: Ctx, id: string): StoredOrder {
  const o = store.orders.get(id);
  if (!o || o.biz !== c.biz.slug) throw new MockError("not_found");
  const mine = (c.who.kind === "customer" && o.ownerCustomer === c.who.id) || (c.who.kind === "guest" && o.guestTokenHash !== null && safeEqual(sha256(c.who.token), o.guestTokenHash));
  if (!mine) throw new MockError("not_found");
  return o;
}

const getOrder: Handler = (c) => ok(view(c.biz, ownOrder(c, c.params.id!), c.now));

/** Cancel / reschedule / reschedule-preview are for a signed-in customer; a guest is told to call the outlet (W2-R2). */
function signedInOwner(c: Ctx, id: string): StoredOrder {
  if (c.who.kind === "guest") throw new MockError("forbidden", "guest_cannot_change");
  if (c.who.kind !== "customer") throw new MockError("unauthenticated");
  return ownOrder(c, id);
}
const changeable = (c: Ctx, o: StoredOrder) => {
  if (view(c.biz, o, c.now).status !== "placed" || c.now.getTime() > o.createdAt.getTime() + CHANGE_WINDOW_MIN * 60000) throw new MockError("conflict", "change_window_closed");
};
const commandResult = (cmd: { command_id: string; type: string }, entity: string, now: Date) => ({ command_id: cmd.command_id, type: cmd.type, entity_id: entity, committed_at: iso(now) });

const cancel: Handler = (c) => {
  const o = signedInOwner(c, c.params.id!);
  if (!CANCEL_CMD(c.body)) throw new MockError("invalid_payload");
  const cmd = c.body as { command_id: string; type: string; idempotency_key: string; payload: { order_id: string } };
  if (cmd.payload.order_id !== o.id) throw new MockError("invalid_payload");
  return idempotent(c, `cancel:${o.id}`, cmd.idempotency_key, () => {
    changeable(c, o);
    o.cancelledAt = c.now;
    if (o.windowId) putBooked(`${c.biz.slug}|${o.windowId}`, (store.extraBooked.get(`${c.biz.slug}|${o.windowId}`) ?? 0) - 1);
    return ok(commandResult(cmd, o.id, c.now));
  });
};

function reprice(c: Ctx, o: StoredOrder, windowId: string | null, promisedAt: string) {
  const outlet = c.biz.outlets[o.outletIdx]!;
  return priceReq(c, outlet, { outlet_id: outlet.id, pickup_window_id: windowId, promised_at: promisedAt, coupon_codes: o.couponCodes, loyalty_redeem_points: 0, lines: o.lines }, o.windowId);
}

const reschedulePreview: Handler = (c) => {
  const o = signedInOwner(c, c.params.id!);
  if (!RESCHEDULE_PREVIEW_REQ(c.body)) throw new MockError("invalid_payload");
  const b = c.body as { pickup_window_id: string | null; promised_at: string };
  const { priced, at } = reprice(c, o, b.pickup_window_id, b.promised_at);
  return ok({ order_id: o.id, promised_at: b.promised_at, current_total_minor: o.priced.total_minor, preview: previewBody(priced, at) });
};

const reschedule: Handler = (c) => {
  const o = signedInOwner(c, c.params.id!);
  if (!RESCHEDULE_CMD(c.body)) throw new MockError("invalid_payload");
  const cmd = c.body as { command_id: string; type: string; idempotency_key: string; payload: { order_id: string; pickup_window_id: string | null; promised_at: string; preview_total_minor: number } };
  const p = cmd.payload;
  if (p.order_id !== o.id) throw new MockError("invalid_payload");
  return idempotent(c, `reschedule:${o.id}`, cmd.idempotency_key, () => {
    changeable(c, o);
    const { priced, win } = reprice(c, o, p.pickup_window_id, p.promised_at);
    if (priced.refusals[0]) throw new MockError("conflict", priced.refusals[0].reason_code, priced.refusals[0].params);
    if (priced.total_minor !== p.preview_total_minor) {
      throw new MockError("conflict", "deal_rejudged", { old_total_minor: p.preview_total_minor, new_total_minor: priced.total_minor, currency: priced.currency });
    }
    if (p.pickup_window_id !== o.windowId) {
      const bump = (id: string | null, n: number) => id && putBooked(`${c.biz.slug}|${id}`, (store.extraBooked.get(`${c.biz.slug}|${id}`) ?? 0) + n);
      bump(p.pickup_window_id, 1);
      bump(o.windowId, -1);
    }
    o.promiseEvents.push({ from: o.promisedAt, to: new Date(p.promised_at), at: c.now });
    o.promisedAt = new Date(p.promised_at);
    o.windowId = win ? win.id : null;
    o.priced = priced;
    return ok(commandResult(cmd, o.id, c.now));
  });
};

// ---------- the event stream: GET /v1/stream (fetch-based SSE; read it with the SDK's openStream) ----------
// As core's shopper feed: topics `order:<id>` of the caller's own orders (customer token or guest token); each event is
// `data: {"id","type":"order.status"|"order.promised_at","data":{order_id, from/to status, from/to promised_at, at}}` with
// `id: n=<events had>`; `ready` first; a fresh stream starts after the events that already exist, `Last-Event-ID: n=<k>`
// replays from the k-th. Statuses advance on the mock's clock (polled). A stream ends itself with a `reconnect` hint after
// STREAM.maxMs (a serverless function has a time limit); openStream comes back with Last-Event-ID and misses nothing.
export const STREAM = { pollMs: 1_000, heartbeatMs: 20_000, maxMs: 50_000 };
const TOPIC = /^(kds|inbox|trace|order):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

function orderEvents(biz: Business, o: StoredOrder, now: Date) {
  return view(biz, o, now).events.map((e, i) => ({
    id: stableId(`${o.id}:event:${i}`), type: `order.${e.kind}`, at: e.at,
    data: { order_id: o.id, from_status: e.from_status, to_status: e.to_status, from_promised_at: e.from_promised_at, to_promised_at: e.to_promised_at, at: e.at },
  }));
}

const stream: Handler = (c) => {
  const items = [...new Set((new URL(c.req.url).searchParams.get("topics") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (items.length === 0 || items.length > 10 || items.some((t) => !TOPIC.test(t))) throw new MockError("bad_request");
  // A shopper may read only their own orders: any other topic (kds, inbox, trace, someone else's order) is 404 for the whole request.
  const orders = items.map((t) => {
    const [, kind, id] = TOPIC.exec(t)!;
    if (kind !== "order") throw new MockError("not_found");
    return ownOrder(c, id!);
  });
  const raw = c.req.headers.get("last-event-id");
  if (raw !== null && !/^n=(0|[1-9][0-9]{0,17})$/.test(raw)) throw new MockError("bad_request");
  const all = () => orders.flatMap((o, k) => orderEvents(c.biz, o, clock.now()).map((e) => ({ ...e, k }))).sort((a, b) => a.at.localeCompare(b.at) || a.k - b.k);
  let n = raw === null ? all().length : Number(raw.slice(2));
  const enc = new TextEncoder();
  let stop = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(ctl) {
      const write = (s: string) => { try { ctl.enqueue(enc.encode(s)); } catch { /* the client has gone */ } };
      const tick = () => {
        const evs = all();
        for (; n < evs.length; n++) write(`id: n=${n + 1}\ndata: ${JSON.stringify({ id: evs[n]!.id, type: evs[n]!.type, data: evs[n]!.data })}\n\n`);
      };
      const poll = setInterval(tick, STREAM.pollMs);
      const hb = setInterval(() => write(": hb\n\n"), STREAM.heartbeatMs);
      const cap = setTimeout(() => { write(`retry: 1000\nevent: reconnect\ndata: {"reason":"max_age"}\n\n`); stop(); }, STREAM.maxMs);
      stop = () => {
        clearInterval(poll); clearInterval(hb); clearTimeout(cap);
        try { ctl.close(); } catch { /* already closed */ }
      };
      write(`retry: 1000\nid: n=${n}\nevent: ready\ndata: {}\n\n`);
      tick();
    },
    cancel() { stop(); },
  });
  c.req.signal.addEventListener("abort", () => stop(), { once: true });
  return new Response(body, {
    status: 200,
    headers: { ...CORS, [MOCK_HEADER]: "true", "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
};

// ---------- mock-only helpers (not part of public.json) ----------
const labels: Handler = (c) => {
  const l: Record<string, string> = {};
  for (const i of c.biz.items) {
    l[`item.${i.slug}`] = i.label;
    l[`category.${i.category}`] = i.category[0]!.toUpperCase() + i.category.slice(1);
    for (const v of i.variants) l[`variant.${i.slug}.${v.key}`] = v.label;
    for (const g of i.groups) { l[`group.${g.key}`] = g.label; for (const o of g.options) l[`option.${o.key}`] = o.label; }
  }
  for (const d of c.biz.deals) l[d.key] = d.label;
  return ok({
    simulated: true, business: c.biz.name, country: c.biz.country, currency: c.biz.country === "IN" ? "INR" : "AUD", tz: c.biz.tz, channel_id: c.biz.channelId,
    outlets: c.biz.outlets.map((o) => ({ outlet_id: o.id, name: o.name })), labels: l, coupons: c.biz.coupons.map((x) => ({ code: x.code, label: x.label })),
    off_sale_item_ids: c.biz.items.filter((i) => !i.active).map((i) => i.id),
  });
};
const reset: Handler = (c) => (resetBusiness(c.biz.slug), ok({ ok: true }));
/** T-128: the live storefront page. The mock's businesses publish none, so a storefront shows its own built-in look. */
const page: Handler = () => ok({ page: null });

// ---------- dispatch ----------
export type Operation = { operationId: string; method: "GET" | "POST"; path: string; handler: Handler; body: boolean; mockOnly?: boolean };
export const OPERATIONS: Operation[] = [
  { operationId: "storefrontOutlets", method: "GET", path: "/v1/storefront/outlets", handler: outlets, body: false },
  { operationId: "storefrontMenu", method: "GET", path: "/v1/storefront/outlets/{outlet_id}/menu", handler: menu, body: false },
  { operationId: "storefrontState", method: "GET", path: "/v1/storefront/outlets/{outlet_id}/state", handler: state, body: false },
  { operationId: "storefrontPickupWindows", method: "GET", path: "/v1/storefront/outlets/{outlet_id}/pickup-windows", handler: pickupWindows, body: false },
  { operationId: "storefrontPreviewOrder", method: "POST", path: "/v1/storefront/orders:preview", handler: preview, body: true },
  { operationId: "storefrontPlaceOrder", method: "POST", path: "/v1/storefront/orders", handler: place, body: true },
  { operationId: "storefrontGetOrder", method: "GET", path: "/v1/storefront/orders/{id}", handler: getOrder, body: false },
  { operationId: "storefrontCancelOrder", method: "POST", path: "/v1/storefront/orders/{id}:cancel", handler: cancel, body: true },
  { operationId: "storefrontReschedulePreview", method: "POST", path: "/v1/storefront/orders/{id}:reschedule-preview", handler: reschedulePreview, body: true },
  { operationId: "storefrontRescheduleOrder", method: "POST", path: "/v1/storefront/orders/{id}:reschedule", handler: reschedule, body: true },
  { operationId: "getStorefrontCares", method: "GET", path: "/v1/storefront/cares", handler: cares, body: false },
  { operationId: "storefrontPage", method: "GET", path: "/v1/storefront/page", handler: page, body: false },
  { operationId: "streamEvents", method: "GET", path: "/v1/stream", handler: stream, body: false },
  { operationId: "mockLabels", method: "GET", path: "/v1/_mock/labels", handler: labels, body: false, mockOnly: true },
  { operationId: "mockReset", method: "POST", path: "/v1/_mock/reset", handler: reset, body: false, mockOnly: true },
];

const ID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
const compiled = OPERATIONS.map((op) => {
  const names: string[] = [];
  const src = op.path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, (_, n: string) => (names.push(n), ID));
  return { op, names, re: new RegExp(`^${src}$`) };
});

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Munim-Storefront-Key, X-Munim-Guest-Token, Last-Event-ID, X-Mock-Force-Accepting, X-Mock-Force-429",
  "Access-Control-Expose-Headers": "X-Munim-Mock, X-Munim-Replayed, Retry-After",
};
function respond(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  const base = { ...CORS, [MOCK_HEADER]: "true", "Cache-Control": "no-store", ...extra };
  if (status === 204) return new Response(null, { status, headers: base });
  return new Response(JSON.stringify(body), { status, headers: { ...base, "Content-Type": "application/json" } });
}

/** Both keys are always compared (no early exit), so timing does not say which key was close or whether one exists. */
function businessForKey(key: string | null): Business | null {
  let hit: Business | null = null;
  for (const b of BUSINESSES) if (safeEqual(key ?? "", b.key) && key) hit = b;
  return hit;
}

function principal(req: Request): Who {
  const g = req.headers.get("x-munim-guest-token");
  if (g) return { kind: "guest", token: g };
  const a = req.headers.get("authorization");
  if (a === null) return { kind: "anon" };
  const m = /^Bearer mock-customer-([a-z0-9_-]{1,40})$/.exec(a);
  if (!m) throw new MockError("unauthenticated");
  return { kind: "customer", id: stableId(`customer:${m[1]}`) };
}

export async function handle(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const at = url.pathname.indexOf("/v1/");
    const path = at < 0 ? url.pathname : url.pathname.slice(at).replace(/\/+$/, "");
    if (req.method === "OPTIONS") return respond(204, null);
    if (path === "/v1/_mock/ping") return respond(200, { mock: true, simulated: true, note: "Synthetic data; payments are recorded, never processed." });
    let m: { op: Operation; params: Record<string, string> } | null = null;
    for (const c of compiled) {
      const x = c.re.exec(path);
      if (x && c.op.method === req.method) { m = { op: c.op, params: Object.fromEntries(c.names.map((n, i) => [n, x[i + 1]!])) }; break; }
    }
    // Capability-style key: a missing or wrong key is the same 404 as an unknown route (gotcha 16), before anything else is revealed.
    const biz = businessForKey(req.headers.get("x-munim-storefront-key"));
    if (!m || !biz) throw new MockError("not_found");
    // After the key check, so a wrong key stays a plain 404. Same status, header and body shape as core's limiter.
    if (req.headers.get("x-mock-force-429") === "1") return respond(429, new MockError("unavailable", "rate_limited").body(), { "Retry-After": "5" });
    const who = principal(req);
    let body: unknown = null;
    if (m.op.body) {
      try { body = await req.json(); } catch { throw new MockError("bad_request"); }
    }
    const out = m.op.handler({ biz, who, body, params: m.params, force: req.headers.get("x-mock-force-accepting"), now: clock.now(), req });
    return out instanceof Response ? out : respond(out.status, out.body, out.headers);
  } catch (e) {
    if (e instanceof MockError) return respond(e.status, e.body());
    return respond(500, { error: { code: "internal", message: "Something went wrong.", reason_code: null } });
  }
}
