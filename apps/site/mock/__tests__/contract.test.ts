// Every mock storefront operation in public.json: implemented (set equality with the dispatch table) AND answering with a payload
// that validates against the real zod contract schemas in packages/contracts/src (test-time import only; runtime code has none).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { CaresStorefrontResponse } from "../../../../packages/contracts/src/cares/index.ts";
import { CommandResult } from "../../../../packages/contracts/src/shared/command.ts";
import { ErrorResponse, RefusalErrorResponse } from "../../../../packages/contracts/src/shared/error.ts";
import { OrdersPreviewRequest } from "../../../../packages/contracts/src/orders/index.ts";
import * as S from "../../../../packages/contracts/src/storefront/index.ts";
import { OPERATIONS, type Operation } from "../handler";
import { CUSTOMER, SPICE, call, nid, placeReq, previewReq, reset, sse, type Res } from "./helpers";
import { BUSINESSES } from "../catalogue";

const spec = JSON.parse(readFileSync(new URL("../../../../packages/contracts/generated/openapi/public.json", import.meta.url), "utf8"));
type SpecOp = { method: string; path: string; operationId: string };
const specOps = (): SpecOp[] => Object.entries<any>(spec.paths)
  // /v1/storefront-keys/* is the member admin surface, not the shopper surface; /v1/stream is the shopper's order tracker.
  .filter(([p]) => p.startsWith("/v1/storefront/") || p === "/v1/stream")
  .flatMap(([path, v]) => Object.entries<any>(v).map(([m, o]) => ({ method: m.toUpperCase(), path, operationId: o.operationId as string })));
const sig = (o: SpecOp) => `${o.method} ${o.path} ${o.operationId}`;

/** Spec operations the table does not implement. The gate under test. */
export const missing = (impl: Array<Pick<Operation, "method" | "path" | "operationId">>, s: SpecOp[]) => {
  const have = new Set(impl.map((o) => sig(o)));
  return s.map(sig).filter((x) => !have.has(x));
};

describe("coverage vs public.json", () => {
  it("every /v1/storefront/** operation is implemented, and nothing is invented under that prefix", () => {
    const s = specOps();
    expect(s.length).toBe(13); // 11 in storefront/index.ts (incl. GET /v1/stream) + getStorefrontCares + storefrontPage (T-128); counted from the file below too
    expect(s.length).toBe(Object.keys(spec.paths).filter((p) => p.startsWith("/v1/storefront/") || p === "/v1/stream").reduce((n, p) => n + Object.keys(spec.paths[p]).length, 0));
    expect(missing(OPERATIONS, s)).toEqual([]);
    const real = OPERATIONS.filter((o) => !o.mockOnly).map((o) => sig(o));
    expect(real.sort()).toEqual(s.map(sig).sort());
  });
  it("gate can fail: a planted missing route and a renamed route are both reported", () => {
    const s = specOps();
    expect(missing(OPERATIONS.filter((o) => o.operationId !== "storefrontCancelOrder"), s)).toEqual([sig(s.find((o) => o.operationId === "storefrontCancelOrder")!)]);
    expect(missing(OPERATIONS.map((o) => (o.path === "/v1/storefront/orders" ? { ...o, path: "/v1/storefront/order" } : o)), s)).toHaveLength(1);
  });
});

// ---- one real request per operation, response validated by the contract schema ----
type Schema = { parse(x: unknown): unknown };
const ok = (schema: Schema) => (r: Res) => { expect(r.status).toBe(200); schema.parse(r.body); };
beforeEach(() => { reset(); });

const cases: Record<string, (b: typeof SPICE) => Promise<Res>> = {
  storefrontOutlets: (b) => call(b, "GET", "/v1/storefront/outlets"),
  storefrontMenu: (b) => call(b, "GET", `/v1/storefront/outlets/${b.outlets[0]!.id}/menu`),
  storefrontState: (b) => call(b, "GET", `/v1/storefront/outlets/${b.outlets[0]!.id}/state`),
  storefrontPickupWindows: (b) => call(b, "GET", `/v1/storefront/outlets/${b.outlets[0]!.id}/pickup-windows`),
  storefrontPreviewOrder: (b) => call(b, "POST", "/v1/storefront/orders:preview", { body: previewReq(b, [{ slug: b === SPICE ? "paneer_tikka" : "latte" }]) }),
  storefrontPlaceOrder: (b) => call(b, "POST", "/v1/storefront/orders", { body: placeReq(b, [{ slug: b === SPICE ? "paneer_tikka" : "latte" }]) }),
  storefrontGetOrder: async (b) => {
    const p = await call(b, "POST", "/v1/storefront/orders", { body: placeReq(b, [{ slug: b === SPICE ? "paneer_tikka" : "latte" }]) });
    return call(b, "GET", `/v1/storefront/orders/${p.body.order_id}`, { headers: { "X-Munim-Guest-Token": p.body.guest_access_token } });
  },
  storefrontCancelOrder: async (b) => {
    const p = await call(b, "POST", "/v1/storefront/orders", { body: placeReq(b, [{ slug: b === SPICE ? "paneer_tikka" : "latte" }], { customer: true }), headers: CUSTOMER });
    return call(b, "POST", `/v1/storefront/orders/${p.body.order_id}:cancel`, { headers: CUSTOMER, body: { command_id: nid("c"), idempotency_key: "cancel-contract-1", type: "storefront.order.cancel.v1", payload: { order_id: p.body.order_id, reason: null } } });
  },
  storefrontReschedulePreview: async (b) => {
    const p = await call(b, "POST", "/v1/storefront/orders", { body: placeReq(b, [{ slug: b === SPICE ? "paneer_tikka" : "latte" }], { customer: true }), headers: CUSTOMER });
    return call(b, "POST", `/v1/storefront/orders/${p.body.order_id}:reschedule-preview`, { headers: CUSTOMER, body: { pickup_window_id: null, promised_at: "2026-10-18T12:00:00Z" } });
  },
  storefrontRescheduleOrder: async (b) => {
    const p = await call(b, "POST", "/v1/storefront/orders", { body: placeReq(b, [{ slug: b === SPICE ? "paneer_tikka" : "latte" }], { customer: true }), headers: CUSTOMER });
    const at = "2026-10-18T12:00:00Z";
    const pv = await call(b, "POST", `/v1/storefront/orders/${p.body.order_id}:reschedule-preview`, { headers: CUSTOMER, body: { pickup_window_id: null, promised_at: at } });
    return call(b, "POST", `/v1/storefront/orders/${p.body.order_id}:reschedule`, { headers: CUSTOMER, body: { command_id: nid("c"), idempotency_key: "resched-contract-1", type: "storefront.order.reschedule.v1", payload: { order_id: p.body.order_id, pickup_window_id: null, promised_at: at, preview_total_minor: pv.body.preview.total_minor } } });
  },
  getStorefrontCares: (b) => call(b, "GET", "/v1/storefront/cares"),
  storefrontPage: (b) => call(b, "GET", "/v1/storefront/page"),
  // Text/event-stream: each `data:` line is a StreamEvent (checked in the case below). Last-Event-ID n=0 replays from the start.
  streamEvents: async (b) => {
    const p = await call(b, "POST", "/v1/storefront/orders", { body: placeReq(b, [{ slug: b === SPICE ? "paneer_tikka" : "latte" }]) });
    const r = await sse(b, `order:${p.body.order_id}`, { headers: { "X-Munim-Guest-Token": p.body.guest_access_token, "Last-Event-ID": "n=0" }, until: (evs) => evs.some((e) => e.event === "" && e.data !== "") });
    return { status: r.status, headers: r.headers, body: r.events };
  },
};
const schemas: Record<string, Schema> = {
  storefrontOutlets: S.StorefrontOutletsResponse, storefrontMenu: S.StorefrontMenuResponse, storefrontState: S.StorefrontAccepting,
  storefrontPickupWindows: S.StorefrontPickupWindowsResponse, storefrontPreviewOrder: S.StorefrontPreviewResponse, storefrontGetOrder: S.StorefrontOrderView,
  storefrontCancelOrder: CommandResult, storefrontReschedulePreview: S.StorefrontReschedulePreviewResponse, storefrontRescheduleOrder: CommandResult,
  getStorefrontCares: CaresStorefrontResponse, storefrontPage: S.StorefrontPagePublic,
};

describe("responses validate against the real contract", () => {
  it("the case table covers exactly the spec operations", () => {
    expect([...Object.keys(cases), "storefrontPlaceOrder"].filter((k, i, a) => a.indexOf(k) === i).sort()).toEqual(specOps().map((o) => o.operationId).sort());
  });
  for (const biz of BUSINESSES) {
    for (const id of Object.keys(cases)) {
      it(`${biz.slug}: ${id}`, async () => {
        const r = await cases[id]!(biz);
        if (id === "storefrontPlaceOrder") { expect(r.status).toBe(201); S.StorefrontOrderPlaced.parse(r.body); }
        else if (id === "streamEvents") {
          expect([r.status, r.headers.get("content-type")]).toEqual([200, "text/event-stream; charset=utf-8"]);
          const data = (r.body as Array<{ event: string; data: string }>).filter((e) => e.event === "" && e.data !== "");
          expect(data.length).toBeGreaterThan(0);
          for (const e of data) S.StreamEvent.parse(JSON.parse(e.data));
        } else ok(schemas[id]!)(r);
        expect(r.headers.get("x-munim-mock")).toBe("true");
      });
    }
  }
  it("my request fixtures are valid requests under the real schemas (and the mock rejects what the contract rejects)", async () => {
    for (const b of BUSINESSES) {
      const p = previewReq(b, [{ slug: b === SPICE ? "butter_chicken" : "flat_white", opts: b === SPICE ? ["mild"] : [] }]);
      OrdersPreviewRequest.parse(p);
      S.StorefrontOrderPlaceRequest.parse(placeReq(b, [{ slug: b === SPICE ? "paneer_tikka" : "latte" }]));
      S.StorefrontOrderPlaceRequest.parse(placeReq(b, [{ slug: b === SPICE ? "paneer_tikka" : "latte" }], { customer: true }));
      const bad = { ...p, extra: 1 };
      expect(OrdersPreviewRequest.safeParse(bad).success).toBe(false);
      expect((await call(b, "POST", "/v1/storefront/orders:preview", { body: bad })).status).toBe(422);
      const noQty = { ...p, lines: [{ ...p.lines[0]!, qty_milli: 0 }] };
      expect(OrdersPreviewRequest.safeParse(noQty).success).toBe(false);
      expect((await call(b, "POST", "/v1/storefront/orders:preview", { body: noQty })).status).toBe(422);
    }
  });
  it("every error is the real envelope with a real reason code", async () => {
    const samples: Res[] = [
      await call(SPICE, "GET", "/v1/storefront/outlets", { key: "bad" }),
      await call(SPICE, "POST", "/v1/storefront/orders:preview", { body: previewReq(SPICE, [{ slug: "paneer_tikka" }], { coupons: [] }) }).then(async () =>
        call(SPICE, "POST", "/v1/storefront/orders", { body: placeReq(SPICE, [{ slug: "prawn_masala" }]) })),
      await call(SPICE, "POST", "/v1/storefront/orders", { body: { nope: true } }),
      await call(SPICE, "POST", "/v1/storefront/orders", { body: placeReq(SPICE, [{ slug: "paneer_tikka" }], { key: "dup-key-001" }) }).then(async () =>
        call(SPICE, "POST", "/v1/storefront/orders", { body: placeReq(SPICE, [{ slug: "garlic_naan" }], { key: "dup-key-001" }) })),
    ];
    expect(samples.map((s) => s.status)).toEqual([404, 409, 422, 409]);
    // The sold-out refusal carries its typed params beside `error` (storefront.refusal-error); the others are the plain body.
    RefusalErrorResponse.parse(samples[1]!.body);
    expect(samples[1]!.body.params).toEqual({ line_no: 1, item_id: BUSINESSES[0]!.items.find((i) => i.slug === "prawn_masala")!.id, variant_id: null });
    for (const s of [samples[0], samples[2], samples[3]]) ErrorResponse.parse(s!.body);
  });
});
