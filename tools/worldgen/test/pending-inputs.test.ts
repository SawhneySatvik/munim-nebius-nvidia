// R3-M7: every `w.<field>` the recompute reads is either a locator (finds rows) or a listed pending input (no read route yet). Nothing else, and
// nothing stale. T-086: the channel-terms, staff, reorder-level and shift routes now exist, so the recompute reads those rows and the seven entries
// that waited for them are gone; each remaining entry's route is checked against the generated OpenAPI and must still be missing. T-092: the
// catalogue recipes, prices and coupons routes retired the last eight entries; their key figures are now checks, read only inside sameAsKey.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { LOCATORS, PENDING_INPUTS, type PendingInput } from "../verify/pending-inputs.ts";

const SRC = readFileSync(join(import.meta.dirname, "..", "verify", "recompute.ts"), "utf8");

/** The text of `case "<kind>": { ... }` up to the next top-level case. */
export function caseBlock(src: string, kind: string): string {
  const start = src.indexOf(`case "${kind}":`);
  assert.ok(start >= 0, `no case for ${kind}`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\n {6}case "|\n {6}default:/);
  return next < 0 ? rest : rest.slice(0, next);
}
export const fieldsRead = (block: string): string[] => [...new Set([...block.matchAll(/\bw\.([a-z_]+)/g)].map((m) => m[1]!))].sort();

/** Fields read but neither locator nor pending, and pending entries no longer read. */
export function drift(src: string, pendingList: readonly PendingInput[] = PENDING_INPUTS): { unlisted: string[]; stale: string[] } {
  const unlisted: string[] = [];
  const stale: string[] = [];
  for (const kind of Object.keys(LOCATORS)) {
    const read = fieldsRead(caseBlock(src, kind));
    const pending = pendingList.filter((p) => p.kind === kind).map((p) => p.field);
    for (const f of read) if (!LOCATORS[kind]!.includes(f) && !pending.includes(f)) unlisted.push(`${kind}.${f}`);
    for (const f of pending) if (!read.includes(f)) stale.push(`${kind}.${f}`);
  }
  return { unlisted, stale };
}

/** Pending entries that name no owner or no GET route. */
export const unowned = (pendingList: readonly PendingInput[]): string[] =>
  pendingList.filter((p) => !(p.owner.length > 0 && p.route.startsWith("GET "))).map((p) => `${p.kind}.${p.field}`);

type OpenApi = { paths: Record<string, Record<string, unknown>> };
/** Pending entries whose route the public OpenAPI serves now (each must be retired). */
export function served(api: OpenApi, pendingList: readonly PendingInput[]): string[] {
  const out: string[] = [];
  for (const p of pendingList) {
    const path = /^GET (\/[A-Za-z0-9/_{}-]+)/.exec(p.route)?.[1];
    if (!path) out.push(`${p.kind}.${p.field}: no path in ${p.route}`);
    else if (api.paths[path]?.get !== undefined) out.push(`${p.kind}.${p.field}: GET ${path} is served now; switch the recompute to the row and delete the entry`);
  }
  return out;
}

/** The figures T-092 retired from the pending list: the key still carries them, but only as checks against the rows. */
export const RETIRED_CHECKS = ["recipe_qty_milli", "recipe_waste_bp", "recipe_yield_milli", "price_set_offset", "recipe_versions", "per_customer_cap"];
/** `w.<field>` reads of the retired figures outside a sameAsKey(…) check — any is the key used as an input again. */
export const readsOutsideChecks = (src: string): string[] =>
  [...src.replace(/sameAsKey\([\s\S]*?\);/g, "").matchAll(/\bw\.([a-z_]+)/g)].map((m) => m[1]!).filter((f) => RETIRED_CHECKS.includes(f));

describe("answer-key config inputs", () => {
  test("the recompute reads no key number that is not locator or listed pending", () => {
    assert.ok(Object.keys(LOCATORS).length >= 12);
    assert.deepEqual(drift(SRC), { unlisted: [], stale: [] });
  });
  test("every pending entry names an owner and a route", () => {
    assert.deepEqual(unowned(PENDING_INPUTS), []);
  });
  test("RED-PROOF: an entry with no owner or no GET route is reported", () => {
    const planted: PendingInput[] = [{ kind: "cost_drift", field: "x", owner: "", route: "GET /v1/x" }, { kind: "cost_drift", field: "y", owner: "catalogue", route: "POST /v1/y" }];
    assert.deepEqual(unowned(planted), ["cost_drift.x", "cost_drift.y"]);
  });
  test("RED-PROOF: a new key read in a gated case is reported unlisted", () => {
    const planted = SRC.replace('case "stock_below_reorder": {', 'case "stock_below_reorder": {\n        const sneaky = w.par_milli;');
    assert.notEqual(planted, SRC);
    assert.deepEqual(drift(planted).unlisted, ["stock_below_reorder.par_milli"]);
  });
  test("RED-PROOF: a number read from the key inside a history kind is reported unlisted", () => {
    const planted = SRC.replace('case "refund_burst": {', 'case "refund_burst": {\n        const sneaky = w.expected_minor;');
    assert.notEqual(planted, SRC);
    assert.deepEqual(drift(planted).unlisted, ["refund_burst.expected_minor"]);
  });
  test("RED-PROOF: a pending entry the recompute does not read is reported stale", () => {
    const planted: PendingInput[] = [{ kind: "coupon_cap_evasion", field: "global_cap", owner: "planted", route: "GET /v1/planted" }];
    assert.deepEqual(drift(SRC, planted).stale, ["coupon_cap_evasion.global_cap"]);
  });
  test("the seven entries the served routes retired are gone, and their cases read rows", () => {
    for (const f of ["cap_minor", "contracted_bp", "float_minor", "counted_minor", "rate_minor", "ot_bp", "min_milli"]) {
      assert.equal(PENDING_INPUTS.some((p) => p.field === f), false, f);
      assert.equal(/\bw\.(cap_minor|contracted_bp|float_minor|counted_minor|rate_minor|ot_bp|min_milli)\b/.test(SRC), false, f);
    }
    for (const route of ["/v1/finance/channel-terms", "/v1/people/staff", "/v1/inventory/reorder-levels", "/v1/shifts/{id}"]) assert.ok(SRC.includes(route), `the recompute never reads ${route}`);
  });
  const api = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "packages", "contracts", "generated", "openapi", "public.json"), "utf8")) as OpenApi;
  test("every pending route is still missing from the public OpenAPI (a served route retires its entry)", () => {
    assert.ok(Object.keys(api.paths).length > 100);
    assert.deepEqual(served(api, PENDING_INPUTS), []);
  });
  test("RED-PROOF: a pending entry whose route is served is reported", () => {
    const planted: PendingInput[] = [{ kind: "recipe_waste_gap", field: "recipe_waste_bp", owner: "planted", route: "GET /v1/catalogue/recipes?item=" }];
    assert.equal(served(api, planted).length, 1);
  });
  test("the eight entries T-092 retired are gone; the recompute reads the catalogue rows and uses the key's figures only as checks", () => {
    for (const f of RETIRED_CHECKS) assert.equal(PENDING_INPUTS.some((p) => p.field === f), false, f);
    for (const route of ["/v1/catalogue/recipes", "/v1/catalogue/prices", "/v1/catalogue/coupons"]) assert.ok(SRC.includes(`"${route}"`), `the recompute never reads ${route}`);
    for (const f of RETIRED_CHECKS) assert.ok(new RegExp(`sameAsKey\\([^;]*\\bw\\.${f}\\b`).test(SRC), `w.${f} is not checked against the rows`);
    assert.deepEqual(readsOutsideChecks(SRC), []);
  });
  test("RED-PROOF: a retired figure used as an input again is reported", () => {
    const planted = SRC.replace("const sold = div(cons * 10000, 10000 + recipeBp,", "const sold = div(cons * 10000, 10000 + w.recipe_waste_bp,");
    assert.notEqual(planted, SRC);
    assert.deepEqual(readsOutsideChecks(planted), ["recipe_waste_bp"]);
  });
});
