// The shipped entry points, end to end against a running app: `make seed` runs src/cli.ts (live mode: tokens from
// the environment), then verify/run.ts recomputes the world's key and exits 0. Refusals exit 1.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { startStack, type Stack } from "./stack.ts";

const ROOT = join(import.meta.dirname, "..");
let stack: Stack;
before(async () => {
  stack = await startStack();
});
after(async () => {
  await stack?.stop();
});

/** Async spawn: the app under test runs in this process, so a synchronous wait would deadlock it. */
function run(args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((ok) => {
    const e = { ...process.env, ...env } as Record<string, string | undefined>;
    delete e.NODE_TEST_CONTEXT;
    const p = spawn(process.execPath, args, { cwd: ROOT, env: e });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => ok({ code, out, err }));
  });
}

describe("cli", () => {
  const tokens = () => ({ MUNIM_API_URL: stack.baseUrl, MUNIM_SEED_TOKEN: stack.token("store")("owner") });

  test("seed (live mode) then verify exit 0", async () => {
    const seed = await run(["src/cli.ts", "--world=store", "--as-of=2026-10-10", "--days=14"], tokens());
    assert.equal(seed.code, 0, seed.err);
    assert.match(seed.out, /planted 9: ST-A5 ST-C4 ST-I1/);
    // With no operator token the tool says what that costs, in plain words (no rule or ledger ids), and names the verify command it has.
    assert.match(seed.out, /^worldgen: no operator token, so this world is onboarded self-serve and is NOT labelled as demo data \(no "Sample data" badge in the UI\)\./m);
    assert.match(seed.out, /^worldgen: no operator token, so no AI budget is set for this business \(with none, AI declines and rules still run\)\./m);
    assert.match(seed.out, /^verify:   node tools\/worldgen\/verify\/run\.ts --world=store --as-of=2026-10-10 /m);
    assert.doesNotMatch(seed.out, /hard rule|\bR[0-9]{2}\b/);
    const v = await run(["verify/run.ts", "--world=store", "--as-of=2026-10-10", "--days=14"], tokens());
    assert.equal(v.code, 0, v.out + v.err);
    assert.match(v.out, /verify: 9\/9 entries recomputed to the key/);
  });

  test("seeding the same world again is an idempotent replay", async () => {
    const again = await run(["src/cli.ts", "--world=store", "--as-of=2026-10-10", "--days=14"], tokens());
    assert.equal(again.code, 0, again.err);
  });

  test("a world that needs a persona with no token refuses before writing anything", async () => {
    const r = await run(["src/cli.ts", "--world=restaurant_group", "--as-of=2026-10-10", "--days=14"], tokens());
    assert.equal(r.code, 1);
    assert.match(r.err, /no bearer token for persona\(s\): manager/);
  });

  test("unknown world and unknown flag exit 1", async () => {
    assert.equal((await run(["src/cli.ts", "--world=nope"], tokens())).code, 1);
    assert.equal((await run(["src/cli.ts", "--world=store", "--bogus"], tokens())).code, 1);
  });

  test("verify exits 1 when key entries do not resolve", async () => {
    // The stack is seeded with `store` only; verifying `restaurant_group` against it → none of that key's seeded ids exist: every entry must fail, and the process must say so.
    const v = await run(["verify/run.ts", "--world=restaurant_group", "--as-of=2026-10-10", "--days=14"], tokens());
    assert.equal(v.code, 1);
    assert.match(v.out, /FAIL/);
  });

  // T-127: `make seed WORLD=cobnut SEED=<seed>` passes --seed=<seed>; both flag forms give the same world, and the simulated suppliers'
  // agent cards need the simulator's URL (refused before anything is written without it). Plan mode: no server is reached.
  const COBNUT = ["src/cli.ts", "--world=cobnut", "--as-of=2026-10-10", "--days=14", "--plan"];
  const SIM = { SUPPLIERS_SIM_PUBLIC_URL: "http://127.0.0.1:4423/" };

  test("cobnut: --seed value and --seed=value seed the same world, its cards on the simulator's URL", async () => {
    const [a, b] = [await run([...COBNUT, "--seed", "cobnut-gate"], SIM), await run([...COBNUT, "--seed=cobnut-gate"], SIM)];
    assert.equal(a.code, 0, a.err);
    assert.equal(a.out, b.out);
    assert.match(a.out, /^# world=cobnut seed=cobnut-gate /);
    const cards = [...a.out.matchAll(/"a2a_card_url":"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(cards, ["steady", "discounter", "premium"].map((k) => `http://127.0.0.1:4423/${k}/.well-known/agent-card.json`));
    assert.match(a.out, /^POST \/v1\/finance\/budgets .*"amount_minor":5000000,.*"category":"purchases".*"outlet_id":null/m);
  });

  test("cobnut without SUPPLIERS_SIM_PUBLIC_URL, or a --seed with no value, is refused (exit 1) before anything is written", async () => {
    const none = await run([...COBNUT, "--seed=cobnut-gate"], { SUPPLIERS_SIM_PUBLIC_URL: "" });
    assert.equal(none.code, 1);
    assert.match(none.err, /set SUPPLIERS_SIM_PUBLIC_URL/);
    assert.equal(none.out, "");
    for (const bad of [[...COBNUT, "--seed="], [...COBNUT.slice(0, -1), "--seed", "--plan"]]) {
      const r = await run(bad, SIM);
      assert.equal(r.code, 1, bad.join(" "));
      assert.match(r.err, /--seed needs a value/);
    }
  });
});
