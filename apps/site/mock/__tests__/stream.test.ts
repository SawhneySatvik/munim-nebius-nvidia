// GET /v1/stream on the mock: the order's status events as core's shopper feed sends them, read with the real SDK reader
// (packages/sdk/src/stream.ts, test-time import) through the mock's fetch handler.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openStream, type StreamEvent } from "../../../../packages/sdk/src/stream.ts";
import { StreamEvent as StreamEventSchema } from "../../../../packages/contracts/src/storefront/index.ts";
import { STREAM, handle } from "../handler";
import { clock } from "../store";
import { BASE, CUSTOMER, LANEWAY, NOW, SPICE, call, placeReq, reset, sse } from "./helpers";

const DEFAULTS = { ...STREAM };
beforeEach(() => {
  reset();
  Object.assign(STREAM, { pollMs: 5, heartbeatMs: 20_000, maxMs: 50_000 });
});
afterEach(() => { Object.assign(STREAM, DEFAULTS); });

const guestOrder = async () => {
  const p = await call(SPICE, "POST", "/v1/storefront/orders", { body: placeReq(SPICE, [{ slug: "veg_biryani" }]) });
  expect(p.status).toBe(201);
  return { id: p.body.order_id as string, token: p.body.guest_access_token as string };
};
const data = (evs: Array<{ event: string; data: string }>) => evs.filter((e) => e.event === "" && e.data !== "").map((e) => JSON.parse(e.data));
const until = (ms: number, ok: () => boolean) => new Promise<void>((done, fail) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (ok()) { clearInterval(iv); done(); } else if (Date.now() - t0 > ms) { clearInterval(iv); fail(new Error("timed out")); } }, 5);
});

describe("GET /v1/stream (mock)", () => {
  it("a fresh stream starts after the existing events (ready id n=1); Last-Event-ID n=0 replays `placed`", async () => {
    const o = await guestOrder();
    const fresh = await sse(SPICE, `order:${o.id}`, { headers: { "X-Munim-Guest-Token": o.token }, ms: 100 });
    expect(fresh.events.map((e) => [e.event, e.id])).toEqual([["ready", "n=1"]]);
    const replay = await sse(SPICE, `order:${o.id}`, { headers: { "X-Munim-Guest-Token": o.token, "Last-Event-ID": "n=0" }, until: (e) => data(e).length > 0 });
    const [ev] = data(replay.events);
    StreamEventSchema.parse(ev);
    expect([ev.type, ev.data.order_id, ev.data.from_status, ev.data.to_status]).toEqual(["order.status", o.id, null, "placed"]);
    expect(replay.events.at(-1)!.id).toBe("n=1");
  });

  it("someone else's order, a member topic, an anonymous caller or a bad cursor are refused", async () => {
    const o = await guestOrder();
    const other = await call(SPICE, "POST", "/v1/storefront/orders", { body: placeReq(SPICE, [{ slug: "veg_biryani" }], { customer: true }), headers: CUSTOMER });
    const g = { "X-Munim-Guest-Token": o.token };
    expect((await sse(SPICE, `order:${other.body.order_id}`, { headers: g })).status).toBe(404);
    expect((await sse(SPICE, `order:${o.id},order:${other.body.order_id}`, { headers: g })).status).toBe(404);
    expect((await sse(SPICE, `kds:${SPICE.outlets[0]!.id}`, { headers: g })).status).toBe(404);
    expect((await sse(SPICE, `order:${o.id}`)).status).toBe(404);
    expect((await sse(LANEWAY, `order:${o.id}`, { headers: g })).status).toBe(404);
    expect((await sse(SPICE, "order:nope", { headers: g })).status).toBe(400);
    expect((await sse(SPICE, `order:${o.id}`, { headers: { ...g, "Last-Event-ID": "o=3" } })).status).toBe(400);
    const owner = await sse(SPICE, `order:${other.body.order_id}`, { headers: CUSTOMER, ms: 50 });
    expect(owner.status).toBe(200);
  });

  it("openStream (the SDK) receives each status change as the mock clock moves, then the reader closes", async () => {
    const o = await guestOrder();
    const got: StreamEvent[] = [];
    const h = openStream({
      baseUrl: BASE, topics: [`order:${o.id}`], guestToken: o.token, headers: () => ({ "X-Munim-Storefront-Key": SPICE.key }),
      fetch: (url, init) => handle(new Request(url as string, init)), onEvent: (e) => got.push(e),
    });
    await new Promise((r) => setTimeout(r, 30));
    clock.now = () => new Date(NOW.getTime() + 80_000); // accepted at 45 s, preparing at 75 s
    await until(2000, () => got.length >= 2);
    clock.now = () => new Date(NOW.getTime() + 120_000); // ready at 110 s
    await until(2000, () => got.length >= 3);
    h.close();
    await h.done;
    expect(got.map((e) => `${(e.data as any).from_status}>${(e.data as any).to_status}`)).toEqual(["placed>accepted", "accepted>preparing", "preparing>ready"]);
    expect(got.map((e) => e.lastEventId)).toEqual(["n=2", "n=3", "n=4"]);
  });

  it("a stream that reaches its time limit sends `reconnect`; openStream resumes from Last-Event-ID and misses nothing", async () => {
    Object.assign(STREAM, { maxMs: 40 });
    const o = await guestOrder();
    const got: StreamEvent[] = [];
    const states: string[] = [];
    const h = openStream({
      baseUrl: BASE, topics: [`order:${o.id}`], guestToken: o.token, headers: () => ({ "X-Munim-Storefront-Key": SPICE.key }), initialDelayMs: 5, maxDelayMs: 10,
      fetch: (url, init) => handle(new Request(url as string, init)), onEvent: (e) => got.push(e), onState: (s) => states.push(s),
    });
    await until(2000, () => states.filter((s) => s === "open").length >= 2); // connected, hit the limit, reconnected
    clock.now = () => new Date(NOW.getTime() + 120_000);
    await until(2000, () => got.length >= 3);
    await new Promise((r) => setTimeout(r, 120)); // more reconnects: still no duplicates
    h.close();
    await h.done;
    expect(got.map((e) => (e.data as any).to_status)).toEqual(["accepted", "preparing", "ready"]);
    expect(new Set(got.map((e) => e.id)).size).toBe(3);
  });
});

