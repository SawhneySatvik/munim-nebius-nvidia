// Gate for deploy/nebius/env-setup.ts. Fake settings in a temp tree; the vercel boundary is a recording stub; no network, no database.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { plan, run } from "../env-setup.ts";

const tmp: string[] = [];
after(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }); });
const SECRETS = ["pw-nebiusref0001-secret", "nvidia-key-VALUE", "nebius-key-VALUE", "tavily-key-VALUE", "sb-secret-VALUE", "role-pw-VALUE", "demo-pw-VALUE", "storefront-VALUE"];
const settings = (ref: string, extra = "") => [
  `SUPABASE_PROJECT_ID=${ref}`, `SUPABASE_PROJECT_URL=https://${ref}.supabase.co`, "SUPABASE_PUBLISHABLE_KEY=pub-VALUE", "SUPABASE_SECRET_KEY=sb-secret-VALUE",
  `SUPABASE_SESSION_POOLER_CONNECTION_STRING=postgresql://postgres.${ref}:pw-${ref}-secret@pool.example.test:5432/postgres`,
  `SUPABASE_TRANSACTION_POOLER_CONNECTION_STRING=postgresql://postgres.${ref}:pw-${ref}-secret@pool.example.test:6543/postgres`, extra,
].join("\n") + "\n";

const KEYS = "NEBIUS_API_KEY=nebius-key-VALUE\nNVIDIA_API_KEY=nvidia-key-VALUE\nTAVILY_API_KEY=tavily-key-VALUE";

function world(nebius: string) {
  const root = mkdtempSync(join(tmpdir(), "nbd-env-"));
  tmp.push(root);
  const run_ = join(root, ".run", "nebius");
  mkdirSync(join(run_, "cobnut"), { recursive: true });
  writeFileSync(join(root, ".env.nebius"), nebius);
  writeFileSync(join(root, ".env"), settings("existingref002"));
  writeFileSync(join(run_, "db-roles.json"), JSON.stringify({ roles: { munim_core: "role-pw-VALUE", munim_svc: "role-pw-VALUE", munim_platform: "role-pw-VALUE" } }));
  writeFileSync(join(run_, "cobnut", "site.env"), "MUNIM_DEMO_TENANT_ID=tenant-1\nNEXT_PUBLIC_MUNIM_STOREFRONT_KEY=storefront-VALUE\n");
  writeFileSync(join(run_, "cobnut", "demo-password"), "demo-pw-VALUE\n");
  const outs: string[] = [], errs: string[] = [], calls: Array<{ args: string[]; input: string }> = [];
  const go = (argv: string[]) => run({ argv, root, out: (l) => outs.push(l), err: (l) => errs.push(l), exec: (args, input) => { calls.push({ args, input }); return 0; } });
  return { root, outs, errs, calls, go };
}

describe("nebius env-setup", () => {
  test("the table targets only munim-nebius-* and drops Gemini and FalkorDB", () => {
    const rows = plan();
    assert.ok(rows.length > 20);
    assert.deepEqual([...new Set(rows.map((r) => r.project))].sort(), ["munim-nebius-api", "munim-nebius-web"]);
    const names = rows.map((r) => r.v.name);
    for (const n of ["NEBIUS_API_KEY", "NVIDIA_API_KEY", "TAVILY_API_KEY", "MUNIM_SERVICE_SECRET", "NEXT_PUBLIC_MUNIM_STOREFRONT_KEY"]) assert.ok(names.includes(n), n);
    for (const n of ["GEMINI_API_KEY", "MUNIM_FALKORDB_URL", "MUNIM_GRAPH"]) assert.ok(!names.includes(n), n);
  });

  test("--dry-run prints names and target projects, never a value, and calls nothing", () => {
    const w = world(settings("nebiusref0001", KEYS));
    assert.equal(w.go(["--dry-run"]), 0, w.errs.join("\n"));
    const text = w.outs.join("\n");
    for (const n of ["NEBIUS_API_KEY", "NVIDIA_API_KEY", "TAVILY_API_KEY"]) assert.match(text, new RegExp(`munim-nebius-api {2}${n} {2}\\[ok\\]`));
    const bare = world(settings("nebiusref0001", "NEBIUS_API_KEY=nebius-key-VALUE"));
    assert.equal(bare.go(["--dry-run"]), 0, bare.errs.join("\n"));
    const bareText = bare.outs.join("\n");
    assert.match(bareText, /munim-nebius-api {2}NEBIUS_API_KEY {2}\[ok\]/);
    assert.match(bareText, /munim-nebius-api {2}TAVILY_API_KEY {2}\[optional, unset\]/);
    const noNebius = world(settings("nebiusref0001"));
    noNebius.go(["--dry-run"]);
    assert.match(noNebius.outs.join("\n"), /munim-nebius-api {2}NEBIUS_API_KEY {2}\[missing\]/);
    assert.match(text, /munim-nebius-web {2}NEXT_PUBLIC_MUNIM_STOREFRONT_KEY/);
    assert.match(text, /MUNIM_CORE_URL {2}\[needs --api-origin\]/);
    for (const s of [...SECRETS, "nebiusref0001", "pool.example.test", "tenant-1"]) assert.ok(!text.includes(s), `a value leaked: ${s}`);
    assert.ok(!/munim-(cobnut|api)\b/.test(text), "an existing project name appeared");
    assert.equal(w.calls.length, 0);
  });

  test("the guard stands in front: the existing project's settings are refused with nothing sent", () => {
    const w = world(settings("existingref002", KEYS));
    assert.equal(w.go(["--dry-run"]), 1);
    assert.ok(w.errs.some((l) => l.includes("REFUSED")));
    assert.equal(w.calls.length, 0);
  });

  test("apply (stubbed exec): every call names a munim-nebius-* project, values ride stdin only, a missing name stops it before any call", () => {
    const w = world(settings("nebiusref0001", KEYS));
    assert.equal(w.go([]), 2, "a real run needs --api-origin");
    assert.equal(w.go(["--api-origin", "https://nebius-api.example.test"]), 0, w.errs.join("\n"));
    assert.ok(w.calls.length >= 40);
    for (const c of w.calls) {
      assert.match(c.args[c.args.indexOf("--project") + 1]!, /^munim-nebius-(api|web)$/);
      for (const s of SECRETS) assert.ok(!c.args.join(" ").includes(s), "a value rode an argument");
    }
    const nv = w.calls.find((c) => c.args[1] === "add" && c.args[2] === "NVIDIA_API_KEY")!;
    assert.equal(nv.input, "nvidia-key-VALUE");
    assert.equal(w.calls.find((c) => c.args[1] === "add" && c.args[2] === "NEBIUS_API_KEY")!.input, "nebius-key-VALUE");
    assert.equal(w.calls.find((c) => c.args[1] === "add" && c.args[2] === "TAVILY_API_KEY")!.input, "tavily-key-VALUE");
    const lean = world(settings("nebiusref0001", "NEBIUS_API_KEY=nebius-key-VALUE")); // optional keys absent: not sent, run still succeeds
    assert.equal(lean.go(["--api-origin", "https://nebius-api.example.test"]), 0, lean.errs.join("\n"));
    assert.ok(lean.calls.some((c) => c.args[2] === "NEBIUS_API_KEY"));
    assert.ok(!lean.calls.some((c) => c.args[2] === "TAVILY_API_KEY" || c.args[2] === "NVIDIA_API_KEY"));
    const none = world(settings("nebiusref0001")); // no NEBIUS_API_KEY
    assert.equal(none.go(["--api-origin", "https://nebius-api.example.test"]), 1);
    assert.equal(none.calls.length, 0);
    assert.ok(none.errs.some((l) => l.includes("missing NEBIUS_API_KEY")));
  });

  test("usage errors exit 2", () => {
    const w = world(settings("nebiusref0001"));
    for (const bad of [["--bogus"], ["--env=staging"], ["--api-origin=http://x"], ["--dry-run=1"], ["--reference"]]) assert.equal(w.go(bad), 2, bad.join(" "));
  });
});
