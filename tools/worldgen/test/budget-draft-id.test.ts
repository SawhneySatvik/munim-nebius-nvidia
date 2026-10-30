// T-097b: platform.config_draft ids are global, so the demo budget draft's id carries the tenant. The tenant id of an
// operator-provisioned world is client-chosen from (seed, world), so two businesses are two seeds (the same seed again is a replay, and a fresh
// database is needed to seed it twice). Two seeds -> two draft ids; one seed replayed -> the same id. Fake transport; kit.onboard is real.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Api } from "../src/api.ts";
import { makeCtx } from "../src/ctx.ts";
import { dryFetch } from "../src/dry.ts";
import { onboard } from "../src/kit.ts";

async function budgetDraftId(seed: string): Promise<string> {
  const dry = dryFetch({ tz: "Asia/Kolkata", currency: "INR" });
  let seen = "";
  const fetchImpl = (async (input: Request | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const body = req.method === "POST" ? await req.clone().text() : "";
    if (new URL(req.url).pathname === "/platform/v1/config-drafts") seen = (JSON.parse(body) as { draft_id: string }).draft_id;
    return dry(req);
  }) as typeof fetch;
  const api = new Api({ baseUrl: "http://plan.invalid", seed, world: "store", token: () => "t", fetch: fetchImpl, lenient: true });
  const c = makeCtx({ api, world: "store", seed, asOf: "2026-10-01", days: 14 });
  await onboard(c, { kind: "shop", country: "IN", business: "B", ownerName: "O", outlet: { name: "o", address: "a", taxIds: {} } });
  assert.ok(seen, "no budget draft was proposed");
  return seen;
}

test("the budget draft id differs per tenant and is stable for one tenant", async () => {
  const [a, a2, b] = [await budgetDraftId("s1"), await budgetDraftId("s1"), await budgetDraftId("s2")];
  assert.equal(a, a2);
  assert.notEqual(a, b);
});
