import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CUSTOMER, LANEWAY, SPICE, call, placeReq, reset } from "./helpers";
import { LIMITS, store } from "../store";
import { RefusalErrorResponse } from "../../../../packages/contracts/src/shared/error.ts";

const P = "/v1/storefront/orders";
const WIN = (b = SPICE) => `/v1/storefront/outlets/${b.outlets[0]!.id}/pickup-windows`;
const saved = { ...LIMITS };
beforeEach(() => reset());
afterEach(() => Object.assign(LIMITS, saved));

const placeN = async (n: number, extra: Parameters<typeof placeReq>[2] = {}) => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const body = placeReq(SPICE, [{ slug: "paneer_tikka" }], { promised: "2026-10-17T19:00:00+05:30", ...extra });
    expect((await call(SPICE, "POST", P, { body })).status).toBe(201);
    ids.push(body.order.payload.order_id);
  }
  return ids;
};

describe("bounded state", () => {
  it("one business keeps at most ordersPerBusiness orders, oldest evicted, and another business is not touched", async () => {
    const lane = placeReq(LANEWAY, [{ slug: "flat_white" }], { promised: "2026-10-17T14:00:00+11:00" });
    expect((await call(LANEWAY, "POST", P, { body: lane })).status).toBe(201);
    const ids = await placeN(LIMITS.ordersPerBusiness + 2);
    expect([...store.orders.values()].filter((o) => o.biz === SPICE.slug).length).toBe(LIMITS.ordersPerBusiness);
    expect(store.orders.has(ids[0]!)).toBe(false);
    expect(store.orders.has(ids[1]!)).toBe(false);
    expect(store.orders.has(ids.at(-1)!)).toBe(true);
    expect(store.orders.has(lane.order.payload.order_id)).toBe(true);
  });

  it("an evicted order gives its pickup-window seat back, so one visitor cannot hold windows for good", async () => {
    const w = (await call(SPICE, "GET", WIN())).body.windows[0];
    await placeN(1, { window: w.pickup_window_id, promised: w.starts_at });
    const k = `${SPICE.slug}|${w.pickup_window_id}`;
    expect(store.extraBooked.get(k)).toBe(1);
    await placeN(LIMITS.ordersPerBusiness);
    expect(store.extraBooked.has(k)).toBe(false);
    const after = (await call(SPICE, "GET", WIN())).body.windows.find((x: any) => x.pickup_window_id === w.pickup_window_id);
    expect(after.booked).toBe(w.booked);
  });

  it("the global order, idempotency, ticket and window maps are capped with oldest-eviction", async () => {
    Object.assign(LIMITS, { orders: 3, idem: 4, tickets: 1, extraBooked: 1, ordersPerBusiness: 30 });
    const w = (await call(SPICE, "GET", WIN())).body.windows;
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await placeN(1, { window: w[i].pickup_window_id, promised: w[i].starts_at }))[0]!);
    expect(store.orders.size).toBe(3);
    expect([...store.orders.keys()]).toEqual(ids.slice(2));
    expect(store.idem.size).toBeLessThanOrEqual(4);
    expect(store.extraBooked.size).toBe(1);
    expect(store.tickets.size).toBe(1);
  });
});

describe("POST /v1/_mock/reset is scoped to the caller's key", () => {
  it("forgets this business's orders and leaves the other business alone", async () => {
    const lane = placeReq(LANEWAY, [{ slug: "flat_white" }], { promised: "2026-10-17T14:00:00+11:00", customer: true });
    expect((await call(LANEWAY, "POST", P, { body: lane, headers: CUSTOMER })).status).toBe(201);
    const [id] = await placeN(1);
    const w = (await call(LANEWAY, "GET", WIN(LANEWAY))).body.windows[0];
    expect((await call(SPICE, "POST", "/v1/_mock/reset")).body).toEqual({ ok: true });
    expect(store.orders.has(id!)).toBe(false);
    expect(store.orders.has(lane.order.payload.order_id)).toBe(true);
    expect([...store.idem.keys()].every((k) => k.startsWith(`${LANEWAY.slug}|`))).toBe(true);
    expect(store.idem.size).toBe(1);
    expect((await call(LANEWAY, "GET", WIN(LANEWAY))).body.windows[0].booked).toBe(w.booked);
  });
});

describe("X-Mock-Force-429", () => {
  it("answers 429 with Retry-After and the real rate_limited body, on any route, for a valid key", async () => {
    for (const [m, path] of [["GET", "/v1/storefront/outlets"], ["GET", "/v1/storefront/cares"], ["POST", P]] as const) {
      const r = await call(SPICE, m, path, { headers: { "X-Mock-Force-429": "1" }, ...(m === "POST" ? { body: {} } : {}) });
      expect(r.status).toBe(429);
      expect(r.headers.get("retry-after")).toBe("5");
      expect(r.headers.get("x-munim-mock")).toBe("true");
      expect(RefusalErrorResponse.parse(r.body).error).toMatchObject({ code: "unavailable", reason_code: "rate_limited" });
    }
    expect(store.orders.size).toBe(0);
  });
  it("is off without the header or with another value, and a wrong key stays a plain 404", async () => {
    expect((await call(SPICE, "GET", "/v1/storefront/outlets")).status).toBe(200);
    expect((await call(SPICE, "GET", "/v1/storefront/outlets", { headers: { "X-Mock-Force-429": "0" } })).status).toBe(200);
    const r = await call(SPICE, "GET", "/v1/storefront/outlets", { key: "nope", headers: { "X-Mock-Force-429": "1" } });
    expect([r.status, r.body.error.code]).toEqual([404, "not_found"]);
  });
});

describe("Cares listings carry tz", () => {
  it("every listing names its outlet's IANA zone", async () => {
    for (const [b, tz] of [[SPICE, "Asia/Kolkata"], [LANEWAY, "Australia/Melbourne"]] as const) {
      const items = (await call(b, "GET", "/v1/storefront/cares")).body.items;
      expect(items.length).toBeGreaterThan(0);
      for (const i of items) expect(i.tz).toBe(tz);
    }
  });
});
