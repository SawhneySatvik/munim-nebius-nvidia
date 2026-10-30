// 0036 gates (EV-3 / P1: a `nebius` provider beside `nvidia`; migrator lane M). Expected values are typed by hand here; none
// is read from the migration under test. Every refusal is paired with an accept.
//   DEF  platform.model_role and intel.intel_spend each carry exactly one CHECK on provider, named as below, validated, reading
//        back the five-provider list
//   P1   munim_platform sets platform.model_role.provider to 'nebius' (read back) and to each of the four older values;
//        'nebius ' and 'bogus' → 23514
//   P2   munim_svc records an intel.intel_spend row with provider 'nebius' and with 'nvidia'; 'bogus' → 23514; munim_intel_ro
//        still cannot insert a spend row (42501, R25), nebius or not
//   RED-PROOF  on a clone with the provider CHECKs put back to 0002/0012's four values, the same 'nebius' writes → 23514
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AppContext, TestDb } from "../src/harness.ts";
import { openDb } from "./db.ts";
import { attempt } from "./gates.ts";
import { buildWorld, uuidv7 as u, type World } from "./world.ts";

let db: TestDb;
let A: World;

const FIVE = "CHECK ((provider = ANY (ARRAY['gemini'::text, 'openai'::text, 'openrouter'::text, 'nvidia'::text, 'nebius'::text])))";
const svc = (): AppContext => ({ tenant_id: A.tenant, outlet_ids: "*" });
const setRole = (provider: string) => `UPDATE platform.model_role SET provider = '${provider}' WHERE role = 'reason'`;
const spend = (x: TestDb, role: "munim_svc" | "munim_intel_ro", provider: string) =>
  attempt(x, role, svc(), `INSERT INTO intel.intel_spend (tenant_id, id, run_id, role, provider, model_id, input_tokens, output_tokens, amount_minor, currency)
                          VALUES ($1, $2, $3, 'reason', $4, 'nvidia/nemotron-probe', 100, 10, 0, 'INR')`, [A.tenant, u(), A.run, provider]);

beforeAll(async () => {
  db = await openDb();
  A = await buildWorld(db);
});
afterAll(async () => db?.stop());

describe("DEF the provider CHECKs", () => {
  test("one validated CHECK on provider per table, named, reading back the five-provider list", async () => {
    const r = await db.admin<{ t: string; conname: string; convalidated: boolean; def: string }>(
      `SELECT c.conrelid::regclass::text t, c.conname, c.convalidated, pg_get_constraintdef(c.oid) def
         FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'provider'
        WHERE c.conrelid IN ('platform.model_role'::regclass, 'intel.intel_spend'::regclass) AND c.contype = 'c' AND a.attnum = ANY (c.conkey)
        ORDER BY 1`);
    console.log("DEF:", JSON.stringify(r.rows));
    expect(r.rows).toEqual([
      { t: "intel.intel_spend", conname: "intel_spend_provider_check", convalidated: true, def: FIVE },
      { t: "platform.model_role", conname: "model_role_provider_check", convalidated: true, def: FIVE },
    ]);
  });
});

describe("P1 platform.model_role.provider", () => {
  test("'nebius' and the four older values accepted (read back); 'nebius ' and 'bogus' → 23514", async () => {
    const got: Record<string, string> = {};
    for (const p of ["gemini", "openai", "openrouter", "nvidia", "nebius", "nebius ", "bogus"]) {
      got[p] = (await attempt(db, "munim_platform", {}, setRole(p)))?.code ?? "ok";
    }
    const back = (await db.admin<{ provider: string }>(`SELECT provider FROM platform.model_role WHERE role = 'reason'`)).rows[0]?.provider;
    console.log("P1:", JSON.stringify(got), "read back", back);
    expect(got).toEqual({ gemini: "ok", openai: "ok", openrouter: "ok", nvidia: "ok", nebius: "ok", "nebius ": "23514", bogus: "23514" });
    expect(back).toBe("nebius");
  });
});

describe("P2 intel.intel_spend.provider", () => {
  test("munim_svc records 'nebius' and 'nvidia' spend; 'bogus' → 23514; munim_intel_ro cannot insert (42501)", async () => {
    const got = {
      nebius: (await spend(db, "munim_svc", "nebius"))?.code ?? "ok",
      nvidia: (await spend(db, "munim_svc", "nvidia"))?.code ?? "ok",
      bogus: (await spend(db, "munim_svc", "bogus"))?.code ?? "ok",
      intel_ro: (await spend(db, "munim_intel_ro", "nebius"))?.code ?? "ok",
    };
    const n = (await db.admin<{ n: number }>(`SELECT count(*)::int n FROM intel.intel_spend WHERE tenant_id = $1 AND provider = 'nebius'`, [A.tenant])).rows[0]?.n;
    console.log("P2:", JSON.stringify(got), "nebius rows", n);
    expect(got).toEqual({ nebius: "ok", nvidia: "ok", bogus: "23514", intel_ro: "42501" });
    expect(n).toBe(1);
  });
});

describe("RED-PROOF", () => {
  test("with the CHECKs back at four providers (a clone, NOT VALID), the same 'nebius' writes → 23514", async () => {
    const x = await db.clone();
    try {
      // NOT VALID: the rows P1/P2 wrote stay; every new write is still checked.
      const four = "CHECK (provider IN ('gemini', 'openai', 'openrouter', 'nvidia')) NOT VALID";
      await x.admin(`ALTER TABLE platform.model_role DROP CONSTRAINT model_role_provider_check, ADD CONSTRAINT model_role_provider_check ${four}`);
      await x.admin(`ALTER TABLE intel.intel_spend DROP CONSTRAINT intel_spend_provider_check, ADD CONSTRAINT intel_spend_provider_check ${four}`);
      const got = { model_role: (await attempt(x, "munim_platform", {}, setRole("nebius")))?.code ?? "ok", spend: (await spend(x, "munim_svc", "nebius"))?.code ?? "ok" };
      console.log("RED-PROOF:", JSON.stringify(got));
      expect(got).toEqual({ model_role: "23514", spend: "23514" });
    } finally {
      await x.stop();
    }
  });
});
