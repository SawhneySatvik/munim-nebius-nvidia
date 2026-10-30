// T-097a: a shared loader that throws mid-load must not leave a partial cache for the next entry (the first hosted pass read
// RG-K2 378000 against 491400 right after a `fetch failed`). Fake fetch at the system boundary; the recompute under test is real.
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyWorld, type AnswerKey } from "../verify/recompute.ts";

const entry = (id: string) => ({ id, pack: "p", kind: "remake_voids", what: "w", where: { bill_prefix: "X-" }, impact_minor: 300 });
const key = { world: "w", seed: "s", currency: "INR", problems: [entry("A"), entry("B")] } as unknown as AnswerKey;
const bill = (n: string, v: number) => ({ data: { bill_no: n, status: "completed", void_reason: "remake", line_total_minor: v } });

test("a failed bills load is not cached: the next entry reads every run or errors, never a partial sum", async () => {
  let rowCalls = 0;
  const fakeFetch = (async (input: Request | string) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (url.pathname === "/v1/me/tenants") return json({ tenants: [{ tenant_id: "t1" }] });
    if (url.pathname === "/v1/imports/runs") return json({ runs: ["r1", "r2"].map((import_run_id) => ({ import_run_id, kind: "pos_bills", status: "committed" })) });
    if (url.pathname === "/v1/imports/runs/r1/rows") { rowCalls++; return json({ staged: [bill("X-1", 100)] }); }
    if (url.pathname === "/v1/imports/runs/r2/rows") {
      if (++rowCalls === 2) return json({}, 502); // the second page fetch of the first load fails
      return json({ staged: [bill("X-2", 200)] });
    }
    return json({}, 404);
  }) as typeof fetch;
  const [a, b] = await verifyWorld({ baseUrl: "http://x", token: () => "t", asOf: "2026-10-01", fetch: fakeFetch }, key);
  assert.equal(a!.ok, false);
  assert.match(a!.detail, /^ERROR /);
  assert.equal(b!.got, 300, `second entry read a partial cache: ${b!.detail}`);
  assert.equal(b!.ok, true);
});
