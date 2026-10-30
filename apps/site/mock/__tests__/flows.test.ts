import { beforeEach, describe, expect, it } from "vitest";
import { CUSTOMER, LANEWAY, SPICE, call, item, nid, placeReq, previewReq, reset, NOW } from "./helpers";
import { clock } from "../store";

beforeEach(() => reset());
const P = "/v1/storefront/orders";
const err = (r: any) => [r.status, r.body.error.code, r.body.error.reason_code];

describe("auth", () => {
  it("wrong, missing and other-business-shaped keys are the same 404 as an unknown route", async () => {
    const wrong = await call(SPICE, "GET", "/v1/storefront/outlets", { key: "sfk_mock_spice_route_7f3a91c3" });
    const none = await call(null, "GET", "/v1/storefront/outlets");
    const unknown = await call(SPICE, "GET", "/v1/storefront/nothing-here");
    for (const r of [wrong, none, unknown]) expect(err(r)).toEqual([404, "not_found", null]);
    expect(wrong.body).toEqual(none.body);
    expect(wrong.headers.get("x-munim-mock")).toBe("true");
  });
  it("each key sees only its own business", async () => {
    const a = await call(SPICE, "GET", "/v1/storefront/outlets");
    const b = await call(LANEWAY, "GET", "/v1/storefront/outlets");
    expect(a.body.outlets.map((o: any) => o.name)).toEqual(["Spice Route North", "Spice Route Central", "Spice Route South"]);
    expect(b.body.outlets.map((o: any) => o.name)).toEqual(["Laneway Cafe Fitzroy"]);
    expect((await call(LANEWAY, "GET", `/v1/storefront/outlets/${SPICE.outlets[0]!.id}/menu`)).status).toBe(404);
  });
  it("every response (success, error, OPTIONS) carries X-Munim-Mock", async () => {
    for (const r of [await call(SPICE, "GET", "/v1/storefront/outlets"), await call(null, "GET", "/v1/storefront/outlets"), await call(SPICE, "GET", "/v1/_mock/ping")])
      expect(r.headers.get("x-munim-mock")).toBe("true");
  });
});

describe("placing orders", () => {
  it("re-derives totals: client totals and an old preview total are not trusted", async () => {
    const r = await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "paneer_tikka" }], { promised: "2026-10-17T19:00:00+05:30", clientTotal: 1 }) });
    expect(r.status).toBe(201);
    expect(r.body.total_minor).toBe(29400); // 28000 + 2*700, not the client's 1
    expect(r.body.guest_access_token).toMatch(/^gst_/);
    expect(r.body.pay_at_counter).toBe(true);
    const stale = await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "paneer_tikka" }], { promised: "2026-10-17T19:00:00+05:30", previewTotal: 1 }) });
    expect(err(stale)).toEqual([409, "conflict", "preview_total_changed"]);
  });
  it("refusals: unknown item, off-sale item, sold out, paused outlet, coupons", async () => {
    const mk = (ls: any, o: any = {}) => placeReq(SPICE, ls, { promised: "2026-10-17T19:00:00+05:30", ...o });
    const unknown = mk([{ slug: "paneer_tikka" }]);
    unknown.order.payload.lines[0]!.item_id = nid("ghost");
    expect(err(await call(SPICE, "POST", P, { body: unknown }))).toEqual([404, "not_found", null]);
    const off = mk([{ slug: "paneer_tikka" }]);
    off.order.payload.lines[0]!.item_id = item(SPICE, "seasonal_kulfi").id;
    expect(err(await call(SPICE, "POST", P, { body: off }))).toEqual([409, "conflict", "item_unavailable"]);
    expect(err(await call(SPICE, "POST", P, { body: mk([{ slug: "prawn_masala" }]) }))).toEqual([409, "conflict", "item_sold_out"]);
    expect(err(await call(SPICE, "POST", P, { body: mk([{ slug: "paneer_tikka" }]), headers: { "X-Mock-Force-Accepting": "paused" } }))).toEqual([409, "conflict", "outlet_paused"]);
    expect(err(await call(SPICE, "POST", P, { body: mk([{ slug: "paneer_tikka" }], { coupons: ["OLDDEAL20"] }) }))).toEqual([409, "conflict", "coupon_expired"]);
    expect(err(await call(SPICE, "POST", P, { body: mk([{ slug: "paneer_tikka" }], { coupons: ["ZZZ999"] }) }))).toEqual([409, "conflict", "coupon_invalid"]);
  });
  it("a pickup window fills up: window_full", async () => {
    const w = (await call(SPICE, "GET", `/v1/storefront/outlets/${SPICE.outlets[0]!.id}/pickup-windows`)).body.windows[0];
    const left = w.capacity_orders - w.booked;
    for (let i = 0; i < left; i++) expect((await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "paneer_tikka" }], { window: w.pickup_window_id, promised: w.starts_at }) })).status).toBe(201);
    expect(err(await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "paneer_tikka" }], { window: w.pickup_window_id, promised: w.starts_at }) }))).toEqual([409, "conflict", "window_full"]);
    const after = (await call(SPICE, "GET", `/v1/storefront/outlets/${SPICE.outlets[0]!.id}/pickup-windows`)).body.windows;
    expect(after.find((x: any) => x.pickup_window_id === w.pickup_window_id)).toBeUndefined(); // full windows are hidden
  });
  it("guest vs signed-in shape rules", async () => {
    const noGuest = placeReq(SPICE, [{ slug: "paneer_tikka" }], { customer: true });
    expect(err(await call(SPICE, "POST", P, { body: noGuest }))).toEqual([422, "invalid_payload", null]); // anonymous without a guest block
    const both = placeReq(SPICE, [{ slug: "paneer_tikka" }]);
    expect(err(await call(SPICE, "POST", P, { body: both, headers: CUSTOMER }))).toEqual([422, "invalid_payload", null]);
    const signed = await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "paneer_tikka" }], { customer: true }), headers: CUSTOMER });
    expect([signed.status, signed.body.guest_access_token]).toEqual([201, null]);
    expect(err(await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "paneer_tikka" }]), headers: { Authorization: "Bearer junk" } }))[0]).toBe(401);
  });
  it("malformed body: 400 not JSON, 422 wrong shape, extra key refused", async () => {
    const bad = await (await import("../handler")).handle(new Request("http://site.test/mock/v1/storefront/orders", { method: "POST", headers: { "X-Munim-Storefront-Key": SPICE.key }, body: "{nope" }));
    expect(bad.status).toBe(400);
    const extra: any = placeReq(SPICE, [{ slug: "paneer_tikka" }]);
    extra.order.payload.customer_id = nid("c");
    expect(err(await call(SPICE, "POST", P, { body: extra }))[0]).toBe(422);
  });
});

describe("idempotency", () => {
  it("same key + same body replays; same key + different body is 409", async () => {
    const body = placeReq(SPICE, [{ slug: "paneer_tikka" }], { key: "idem-key-0001", promised: "2026-10-17T19:00:00+05:30" });
    const first = await call(SPICE, "POST", P, { body });
    const again = await call(SPICE, "POST", P, { body });
    expect([first.status, again.status]).toEqual([201, 201]);
    expect(again.headers.get("x-munim-replayed")).toBe("true");
    expect(first.headers.get("x-munim-replayed")).toBeNull();
    expect({ ...again.body, guest_access_token: null }).toEqual({ ...first.body, guest_access_token: null });
    expect(again.body.guest_access_token).toBeNull(); // the one-time token is not shown again
    expect(first.body.guest_access_token).not.toBeNull();
    const other = placeReq(SPICE, [{ slug: "garlic_naan" }], { key: "idem-key-0001" });
    expect(err(await call(SPICE, "POST", P, { body: other }))).toEqual([409, "idempotency_conflict", null]);
    // same key in the other business is a different scope
    expect((await call(LANEWAY, "POST", P, { body: placeReq(LANEWAY, [{ slug: "latte" }], { key: "idem-key-0001" }) })).status).toBe(201);
  });
});

describe("order tracking, cancel, reschedule", () => {
  const place = async (o: any = {}) => {
    const body = placeReq(SPICE, [{ slug: "veg_biryani" }], { customer: true, promised: "2026-10-17T19:00:00+05:30", ...o });
    const r = await call(SPICE, "POST", P, { body, headers: CUSTOMER });
    expect(r.status).toBe(201);
    return r.body.order_id as string;
  };
  it("guest token reads its own order; any other token or none is 404; status advances through real transitions", async () => {
    const r = await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "veg_biryani" }]) });
    const id = r.body.order_id, tok = r.body.guest_access_token;
    expect((await call(SPICE, "GET", `${P}/${id}`)).status).toBe(404);
    expect((await call(SPICE, "GET", `${P}/${id}`, { headers: { "X-Munim-Guest-Token": tok + "x" } })).status).toBe(404);
    expect((await call(LANEWAY, "GET", `${P}/${id}`, { headers: { "X-Munim-Guest-Token": tok } })).status).toBe(404);
    const seen: string[] = [];
    for (const s of [0, 46, 80, 120]) {
      clock.now = () => new Date(NOW.getTime() + s * 1000);
      const v = await call(SPICE, "GET", `${P}/${id}`, { headers: { "X-Munim-Guest-Token": tok } });
      expect(v.status).toBe(200);
      seen.push(v.body.status);
      if (s === 120) expect(v.body.events.map((e: any) => `${e.from_status}>${e.to_status}`)).toEqual(["null>placed", "placed>accepted", "accepted>preparing", "preparing>ready"]);
    }
    expect(seen).toEqual(["placed", "accepted", "preparing", "ready"]);
  });
  it("guests cannot cancel (call the outlet); a signed-in owner can while placed; later it is change_window_closed", async () => {
    const g = await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "veg_biryani" }]) });
    const cancelCmd = (id: string, key: string) => ({ command_id: "0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee", idempotency_key: key, type: "storefront.order.cancel.v1", payload: { order_id: id, reason: "changed_mind" } });
    expect(err(await call(SPICE, "POST", `${P}/${g.body.order_id}:cancel`, { body: cancelCmd(g.body.order_id, "cancel-g-001"), headers: { "X-Munim-Guest-Token": g.body.guest_access_token } }))).toEqual([403, "forbidden", "guest_cannot_change"]);
    const id = await place();
    expect((await call(SPICE, "POST", `${P}/${id}:cancel`, { body: cancelCmd(id, "cancel-0001") })).status).toBe(401);
    const done = await call(SPICE, "POST", `${P}/${id}:cancel`, { body: cancelCmd(id, "cancel-0001"), headers: CUSTOMER });
    expect([done.status, done.body.entity_id, done.body.type]).toEqual([200, id, "storefront.order.cancel.v1"]);
    const replay = await call(SPICE, "POST", `${P}/${id}:cancel`, { body: cancelCmd(id, "cancel-0001"), headers: CUSTOMER });
    expect(replay.headers.get("x-munim-replayed")).toBe("true");
    expect((await call(SPICE, "GET", `${P}/${id}`, { headers: CUSTOMER })).body.status).toBe("cancelled");
    const id2 = await place();
    clock.now = () => new Date(NOW.getTime() + 50_000);
    expect(err(await call(SPICE, "POST", `${P}/${id2}:cancel`, { body: cancelCmd(id2, "cancel-0002"), headers: CUSTOMER }))).toEqual([409, "conflict", "change_window_closed"]);
    expect((await call(SPICE, "POST", `${P}/${id2}:cancel`, { body: cancelCmd(id2, "cancel-0002"), headers: { Authorization: "Bearer mock-customer-other" } })).status).toBe(404);
  });
  it("reschedule re-prices at the new time: preview, stale preview refused with deal_rejudged, then success", async () => {
    const id = await place(); // Saturday 19:00, no deal: 24000 + 1200 tax = 25200
    const lunch = "2026-10-19T12:30:00+05:30"; // Monday lunch: 10% deal -> 21600 + 540*2 = 22680
    clock.now = () => NOW;
    const pv = await call(SPICE, "POST", `${P}/${id}:reschedule-preview`, { body: { pickup_window_id: null, promised_at: lunch }, headers: CUSTOMER });
    expect([pv.status, pv.body.current_total_minor, pv.body.preview.total_minor]).toEqual([200, 25200, 22680]);
    const cmd = (total: number, key: string) => ({ command_id: nid("c"), idempotency_key: key, type: "storefront.order.reschedule.v1", payload: { order_id: id, pickup_window_id: null, promised_at: lunch, preview_total_minor: total } });
    expect(err(await call(SPICE, "POST", `${P}/${id}:reschedule`, { body: cmd(25200, "resched-001"), headers: CUSTOMER }))).toEqual([409, "conflict", "deal_rejudged"]);
    expect((await call(SPICE, "POST", `${P}/${id}:reschedule`, { body: cmd(22680, "resched-002"), headers: CUSTOMER })).status).toBe(200);
    const v = (await call(SPICE, "GET", `${P}/${id}`, { headers: CUSTOMER })).body;
    expect([v.total_minor, v.promised_at, v.events.at(-1).kind]).toEqual([22680, "2026-10-19T07:00:00.000Z", "promised_at"]);
  });
});

describe("state, menu and cares reads", () => {
  it("accepting state: Central is busy, forced header changes it, paused has next_open", async () => {
    const st = async (i: number, h: Record<string, string> = {}) => (await call(SPICE, "GET", `/v1/storefront/outlets/${SPICE.outlets[i]!.id}/state`, { headers: h })).body;
    expect((await st(0)).state).toBe("open");
    expect(await st(1)).toMatchObject({ state: "busy", busy_extra_min: 15 });
    const p = await st(0, { "X-Mock-Force-Accepting": "paused" });
    expect([p.state, p.next_open]).toEqual(["paused", "2026-10-18T04:30:00.000Z"]);
  });
  it("menu hides off-sale items and shows sold-out ones as unavailable; prices come from worldgen", async () => {
    const m = (await call(SPICE, "GET", `/v1/storefront/outlets/${SPICE.outlets[0]!.id}/menu`)).body;
    const by = (s: string) => m.items.find((i: any) => i.item_id === item(SPICE, s).id);
    expect(by("seasonal_kulfi")).toBeUndefined();
    expect(by("prawn_masala").available).toBe(false);
    expect([by("paneer_tikka").price_minor, by("butter_chicken").price_minor, by("veg_biryani").price_minor]).toEqual([28000, 36000, 24000]);
    expect(by("mango_lassi").price_minor).toBeNull();
    const c = (await call(SPICE, "GET", `/v1/storefront/outlets/${SPICE.outlets[1]!.id}/menu`)).body;
    expect(c.items.find((i: any) => i.item_id === item(SPICE, "chef_special").id).available).toBe(false);
    expect(m.items.find((i: any) => i.item_id === item(SPICE, "chef_special").id).available).toBe(true);
  });
  it("labels helper resolves every name_key the menu emits", async () => {
    for (const b of [SPICE, LANEWAY]) {
      const labels = (await call(b, "GET", "/v1/_mock/labels")).body.labels;
      const m = (await call(b, "GET", `/v1/storefront/outlets/${b.outlets[0]!.id}/menu`)).body;
      const keys = m.items.flatMap((i: any) => [i.name_key, ...i.variants.map((v: any) => v.name_key), ...i.option_groups.flatMap((g: any) => [g.name_key, ...g.options.map((o: any) => o.name_key)])]);
      expect(keys.length).toBeGreaterThan(15);
      for (const k of [...keys, ...m.deals.map((d: any) => d.name_key)]) expect(labels[k], k).toBeTruthy();
    }
  });
  it("cares listing is simulated", async () => {
    const r = (await call(LANEWAY, "GET", "/v1/storefront/cares")).body;
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((i: any) => i.recipient_simulated === true)).toBe(true);
  });
});

// T-099 additions, mirrored from core (services/core-api/src/modules/storefront). Expected values are written out here.
describe("display text, outlet details, tax display, refusal params (T-099)", () => {
  it("outlets carry phone and the receipt tax ids; the pack's pay-at-counter methods (IN cash/card/upi, AU cash/card)", async () => {
    const a = (await call(SPICE, "GET", "/v1/storefront/outlets")).body;
    expect(a.pay_at_counter_methods).toEqual(["cash", "card", "upi"]);
    expect(a.outlets[0].phone).toBe("+919000000101");
    expect(a.outlets[0].tax_ids.map((t: any) => t.label)).toEqual(["GSTIN", "FSSAI Lic. No."]);
    expect([a.outlets[2].phone, a.outlets[2].tax_ids]).toEqual([null, []]);
    const b = (await call(LANEWAY, "GET", "/v1/storefront/outlets")).body;
    expect([b.pay_at_counter_methods, b.outlets[0].tax_ids.map((t: any) => t.code)]).toEqual([["cash", "card"], ["ABN"]]);
  });
  it("menu: display names, descriptions and diet marks (null = not marked), channel id, brands, price display", async () => {
    const m = (await call(SPICE, "GET", `/v1/storefront/outlets/${SPICE.outlets[0]!.id}/menu`)).body;
    const by = (s: string) => m.items.find((i: any) => i.item_id === item(SPICE, s).id);
    expect([by("butter_chicken").display_name, by("butter_chicken").diet, by("paneer_tikka").diet]).toEqual(["Butter Chicken", "non_veg", "veg"]);
    expect([by("chef_special").description, by("chef_special").diet, by("gulab_jamun").diet]).toEqual([null, null, null]);
    expect(by("butter_chicken").option_groups[0].options.map((o: any) => o.display_name)).toEqual(["Mild", "Medium", "Hot"]);
    expect(by("mango_lassi").variants.map((v: any) => v.display_name)).toEqual(["Regular", "Large"]);
    expect([m.channel_id, m.brands.length, by("veg_biryani").brand_id, m.prices_include_tax, m.pay_at_counter_methods]).toEqual([SPICE.channelId, 1, m.brands[0].brand_id, false, ["cash", "card", "upi"]]);
    const l = (await call(LANEWAY, "GET", `/v1/storefront/outlets/${LANEWAY.outlets[0]!.id}/menu`)).body;
    const toast = l.items.find((i: any) => i.item_id === item(LANEWAY, "avocado_toast").id);
    expect([toast.display_name, toast.diet, l.brands, toast.brand_id, l.prices_include_tax]).toEqual(["Smashed Avocado on Sourdough", "vegan", [], null, true]);
  });
  it("placed order and order view carry tax_minor, prices_include_tax and each line's rates (CGST + SGST halves)", async () => {
    const r = await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "paneer_tikka" }], { promised: "2026-10-17T19:00:00+05:30" }) });
    expect([r.body.total_minor, r.body.tax_minor, r.body.prices_include_tax]).toEqual([29400, 1400, false]);
    const v = (await call(SPICE, "GET", `${P}/${r.body.order_id}`, { headers: { "X-Munim-Guest-Token": r.body.guest_access_token } })).body;
    expect([v.prices_include_tax, v.lines[0].tax_rate_bp, v.lines[0].tax_component_rates]).toEqual([false, 500, [{ code: "CGST", rate_bp: 250 }, { code: "SGST", rate_bp: 250 }]]);
  });
  it("a promise outside the chosen window is 422 pickup_time_outside_window; inside it or null is accepted", async () => {
    const w = (await call(SPICE, "GET", `/v1/storefront/outlets/${SPICE.outlets[0]!.id}/pickup-windows`)).body.windows[0];
    const out = await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "paneer_tikka" }], { window: w.pickup_window_id, promised: w.ends_at }) });
    expect(err(out)).toEqual([422, "invalid_payload", "pickup_time_outside_window"]);
    expect(err(await call(SPICE, "POST", "/v1/storefront/orders:preview", { body: previewReq(SPICE, [{ slug: "paneer_tikka" }], { window: w.pickup_window_id, promised: new Date(Date.parse(w.starts_at) - 60_000).toISOString() }) }))[2]).toBe("pickup_time_outside_window");
    const asap = await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "paneer_tikka" }], { window: w.pickup_window_id, promised: null }) });
    expect([asap.status, asap.body.promised_at]).toEqual([201, new Date(w.starts_at).toISOString()]);
  });
  it("place and reschedule refusals carry their params beside `error`", async () => {
    const short = await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "paneer_tikka" }], { promised: "2026-10-17T19:00:00+05:30", coupons: ["SPICE10"] }) });
    expect([short.status, short.body.error.reason_code, short.body.params]).toEqual([409, "coupon_min_spend", { code: "SPICE10", min_spend_minor: 30000, shortfall_minor: 2000, currency: "INR" }]);
    const id = (await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "veg_biryani" }], { customer: true, promised: "2026-10-17T19:00:00+05:30" }), headers: CUSTOMER })).body.order_id;
    const lunch = "2026-10-19T12:30:00+05:30"; // the deal applies: 25200 -> 22680
    const stale = await call(SPICE, "POST", `${P}/${id}:reschedule`, { headers: CUSTOMER, body: { command_id: nid("c"), idempotency_key: "resched-params-1", type: "storefront.order.reschedule.v1", payload: { order_id: id, pickup_window_id: null, promised_at: lunch, preview_total_minor: 25200 } } });
    expect([stale.status, stale.body.error.reason_code, stale.body.params]).toEqual([409, "deal_rejudged", { old_total_minor: 25200, new_total_minor: 22680, currency: "INR" }]);
  });
});

describe("deals are judged at the chosen window's start when promised_at is null (as core's judgedAt)", () => {
  it("now is outside the lunch deal, the window is inside it: preview and place agree on the deal price", async () => {
    // Wed 14 Oct 2026 10:30 IST (deal Mon–Fri 12:00–15:00 closed now); the 12:30 window is inside it.
    const wed = new Date("2026-10-14T05:00:00Z");
    reset(wed);
    const ws = (await call(SPICE, "GET", `/v1/storefront/outlets/${SPICE.outlets[0]!.id}/pickup-windows`)).body.windows;
    const w = ws.find((x: any) => x.starts_at === "2026-10-14T07:00:00.000Z"); // 12:30 IST
    expect(w).toBeDefined();
    const asap = await call(SPICE, "POST", "/v1/storefront/orders:preview", { body: previewReq(SPICE, [{ slug: "veg_biryani" }]) });
    const pv = await call(SPICE, "POST", "/v1/storefront/orders:preview", { body: previewReq(SPICE, [{ slug: "veg_biryani" }], { window: w.pickup_window_id, promised: null }) });
    // 24000 -> 25200 now; at 12:30 the 10% deal: 21600 + 540*2 = 22680, priced at the window's start.
    expect([asap.body.total_minor, pv.body.total_minor, pv.body.priced_at]).toEqual([25200, 22680, "2026-10-14T07:00:00.000Z"]);
    const placed = await call(SPICE, "POST", P, { body: placeReq(SPICE, [{ slug: "veg_biryani" }], { window: w.pickup_window_id, promised: null, previewTotal: pv.body.total_minor }) });
    expect([placed.status, placed.body.total_minor, placed.body.promised_at]).toEqual([201, 22680, "2026-10-14T07:00:00.000Z"]);
  });
});
