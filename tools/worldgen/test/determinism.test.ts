// Gate a: the same seed gives byte-identical API call logs under TZ=UTC and TZ=Asia/Kolkata (and two more zones).
//   plan mode  — every world, gate profile; the AU world also at the full 183-day profile (it spans both Melbourne
//                DST changes), each run in a child process with its own TZ, outputs compared byte for byte;
//   real mode  — worlds.test.ts run twice (TZ=UTC, TZ=Asia/Kolkata) against the real app; the logs it writes are
//                compared with each other AND with the plan-mode logs (the fake transport is faithful).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { EVAL_WORLDS as WORLDS } from "../src/run.ts";
import { AS_OF, DAYS } from "./profile.ts";

const ROOT = join(import.meta.dirname, "..");
const ZONES = ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Australia/Melbourne"];

function child(args: string[], tz: string, extra: Record<string, string> = {}) {
  const env = { ...process.env, TZ: tz, ...extra } as Record<string, string | undefined>;
  delete env.NODE_TEST_CONTEXT; // a nested `node --test` must run as a runner, not as a child of this one
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 240_000 });
  assert.equal(r.status, 0, `node ${args.join(" ")} (TZ=${tz}) exited ${r.status}: ${r.stderr.slice(-600)}`);
  return r.stdout;
}
const plan = (world: string, days: number, tz: string) => child(["src/cli.ts", `--world=${world}`, `--as-of=${AS_OF}`, `--days=${days}`, "--plan"], tz);

describe("determinism across time zones", () => {
  for (const [world, days] of [["restaurant_group", 14] as const, ...WORLDS.map((w) => [w, DAYS] as const), ["au_outlet", 183] as const]) {
    test(`plan ${world} days=${days}: identical in ${ZONES.join(", ")}`, () => {
      const logs = ZONES.map((tz) => plan(world, days, tz));
      assert.ok(logs[0]!.split("\n").length > 50, "the log is suspiciously short");
      for (const [i, l] of logs.entries()) assert.equal(l, logs[0], `${ZONES[i]} differs from ${ZONES[0]}`);
    });
  }

  test("real app: logs identical in UTC and Asia/Kolkata, and equal to the plan-mode logs", () => {
    const dirs = ["UTC", "Asia/Kolkata"].map((tz) => {
      const dir = mkdtempSync(join(tmpdir(), "worldgen-logs-"));
      child(["--test", "test/worlds.test.ts"], tz, { WORLDGEN_LOG_DIR: dir });
      return dir;
    });
    try {
      for (const w of WORLDS) {
        const [a, b] = dirs.map((d) => readFileSync(join(d, `${w}.log`), "utf8"));
        assert.ok(a!.length > 1000);
        assert.equal(a, b, `${w}: real-app logs differ between zones`);
        assert.equal(a, plan(w, DAYS, "UTC"), `${w}: real-app log differs from the plan-mode log`);
      }
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  });
});
