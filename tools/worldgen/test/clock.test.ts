// The gates must pass at ANY wall-clock time (the storefront refuses with 409 outlet_paused when the outlet's hours exclude the real now).
// The storefront module's clock is injectable and held on globalThis, so the app under test runs in this process with its clock pinned:
//   1. restaurant_group (the world with storefront legs) seeds green at 02:30, 00:00:30, 12:00 and 23:30 Kolkata time;
//   2. the hazard is real: with the old 09:00-22:00 hours and the clock at 02:30 a storefront order is refused outlet_paused;
//   3. the one minute LocalTime cannot open (23:59) is waited out: the leg succeeds once the clock reaches midnight.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { localToInstant } from "../../../packages/core-domain/tz/index.ts";
import { configureStorefront, resetStorefront } from "../../../services/core-api/src/modules/storefront/config.ts";
import { Api, CommandRefused } from "../src/api.ts";
import { makeCtx } from "../src/ctx.ts";
import * as k from "../src/kit.ts";
import { runWorld } from "../src/run.ts";
import { AS_OF } from "./profile.ts";
import { startStack, type Stack } from "./stack.ts";

let stack: Stack;
before(async () => {
  stack = await startStack();
});
after(async () => {
  resetStorefront();
  await stack?.stop();
});

const ist = (hhmm: string, seconds = 0) => new Date(localToInstant("2026-10-14", hhmm, "Asia/Kolkata").getTime() + seconds * 1000);

describe("worldgen does not depend on the wall clock", () => {
  for (const [name, at] of [["02:30 (outside hours, before the 04:00 rollover)", ist("02:30")], ["00:00:30", ist("00:00", 30)], ["12:00", ist("12:00")], ["23:30", ist("23:30")]] as const) {
    test(`restaurant_group seeds green with the storefront clock at ${name}`, async () => {
      configureStorefront({ clock: () => at });
      const r = await runWorld({ world: "restaurant_group", seed: `clock-${name}`, asOf: AS_OF, days: 14, baseUrl: stack.baseUrl, token: stack.token("restaurant_group") });
      assert.equal(r.log.split("\n").filter((l) => l.startsWith("POST /v1/storefront/orders ")).length, 33, "the storefront legs ran: three guests, the ten welcome-coupon guests of RG-G1 and its twenty decoys");
      assert.ok(r.planted.includes("RG-F4"));
    });
  }

  /** One restaurant with an own-site price and a storefront key: just enough for a storefront leg. */
  async function mini(world: string) {
    const api = new Api({ baseUrl: stack.baseUrl, seed: "clock-mini", world, token: stack.token(world) });
    const c = makeCtx({ api, world, seed: "clock-mini", asOf: AS_OF, days: 14 });
    const biz = await k.onboard(c, { kind: "restaurant", country: "IN", business: "Clock Cafe (synthetic)", ownerName: "Test Owner (synthetic)",
      outlet: { name: "Clock Cafe", address: "1 Synthetic Road (synthetic)", taxIds: { GSTIN: "29ABCDE1234F1Z5", FSSAI: "11111111111111" } } });
    c.s.currency = biz.currency;
    const o = biz.outlets[0]!;
    const it = await k.item(c, "tea", { category: "drinks" });
    await k.price(c, it, o.id, "own_site", 10000, "restaurant_5", "2026-01-01");
    const sf = await k.storefrontKey(c, biz);
    return { c, api, biz, o, it, sf };
  }

  test("RED-PROOF of the hazard: with the old 09:00-22:00 hours and the clock at 02:30 the storefront refuses outlet_paused; with the seed's hours it does not", async () => {
    const { c, api, biz, o, it, sf } = await mini("clock_hazard");
    configureStorefront({ clock: () => ist("02:30") });
    const hours = (opens: string, closes: string, key: string) => api.cmd("owner", "/v1/outlets/{id}:update", "tenancy.outlet.update.v1", key, { outlet_id: o.id, hours: { opens, closes } }, { params: { id: o.id } });
    await hours("09:00", "22:00", "hours:default");
    await assert.rejects(k.storefrontOrder(c, sf, "ord:sf:closed", biz, o, it, { name: "Guest (synthetic)", phone: "+919000000900" }), (e: unknown) => {
      assert.ok(e instanceof CommandRefused);
      assert.equal(e.status, 409);
      assert.equal(e.reason, "outlet_paused");
      return true;
    });
    await hours("00:00", "23:59", "hours:all-day");
    await k.storefrontOrder(c, sf, "ord:sf:open", biz, o, it, { name: "Guest (synthetic)", phone: "+919000000901" });
  });

  test("23:59 local (the one minute the contract's LocalTime cannot open) is waited out, not failed", async () => {
    const { c, biz, o, it, sf } = await mini("clock_gap");
    let now = ist("23:59", 10);
    configureStorefront({ clock: () => now });
    setTimeout(() => (now = ist("23:59", 59 + 5)), 1500); // five seconds past midnight, local
    const t0 = Date.now();
    await k.storefrontOrder(c, sf, "ord:sf:gap", biz, o, it, { name: "Guest (synthetic)", phone: "+919000000902" });
    assert.ok(Date.now() - t0 >= 1000, "the leg did not wait for the outlet to open");
  });
});
