// The clause-1 scan and the audit-chain check can fail: each is shown clean on a real flow (an expense recorded over
// HTTP and posted), then fed a planted defect written as the cluster superuser with the book guard switched off for
// that one statement — the scan must name it. Paired: clean → [] ; planted → the finding.
//   1. an inserted book row whose origin names a command no one ran (no command_log row)
//   2. an inserted book row whose origin names a decision that does not exist
//   3. an inserted derived row whose rule does not exist for that table
//   4. an UPDATE of a book row with no audit entry in its transaction
//   5. one audit row's text changed → the chain breaks at that seq
// R1-M4 / R3-m6: the branches no flow had planted, each by plant() into a fresh window over the same flow — a cloned
// row whose command type does not list its table, a derivation whose rule is missing, whose source is missing, or
// written by a transaction that audited nothing, or whose source_state the capture did not evaluate, an update that
// rewrites a row's origin, an unknown origin kind, an unaudited migration-origin row, a row with no captured transaction, and a
// book row of another tenant written after the mark. (The source_state branches and an unaudited decision need a
// flow with a cancelled-order rule source or an executed decision: redproof.sh plants them into counter-sale and
// import-settlement.)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, PLANTS, type PlantBranch, plant, watermark } from "./guarantee.ts";
import { type Caller, type Env, startEnv, uuidv7, type World, world } from "./harness.ts";

let env: Env;
let w: World;
let owner: Caller;
const expense = uuidv7();

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner } = await world(env, "IN"));
});
afterAll(async () => env?.stop());

/** One superuser statement on `table` with its book guard off (fixture plumbing for the planted defect only). */
async function unguarded(table: string, sql: string, params: unknown[]) {
  await env.db.admin(`ALTER TABLE core.${table} DISABLE TRIGGER book_guard`);
  try {
    await env.db.admin(sql, params);
  } finally {
    await env.db.admin(`ALTER TABLE core.${table} ENABLE TRIGGER book_guard`);
  }
}

describe("the scan and the chain catch planted defects", () => {
  it("clean flow → no finding; each planted row or update → named; a changed audit row → the chain fails at its seq", async () => {
    const mark = await watermark(env, w.tenant);
    const r = await env.cmd(owner, "/v1/finance/expenses", "finance.expense.record.v1", {
      expense_id: expense, outlet_id: w.outlets[0], category: "utilities", incurred_on: "2026-10-08", amount_minor: 120000, tax_minor: 0, currency: "INR",
      payee: "Synthetic Power", note: null, document_id: null });
    expect(r.status).toBe(201);
    const clean = await clause1(env, mark);
    // Hand: the expense and its posted entry (Dr 6200 utilities · Cr 1010 bank = 2 postings).
    expect([clean.bad, clean.inserted, clean.updated]).toEqual([[], { expense: 1, journal_entry: 1, posting: 2 }, {}]);
    expect((await chain(env, w.tenant)).ok).toBe(true);

    const forged = uuidv7(), ghost = uuidv7(), badRule = uuidv7();
    const insert = (id: string, origin: object) => unguarded("expense",
      `INSERT INTO core.expense (tenant_id, id, outlet_id, category, incurred_on, amount_minor, currency, payee, origin) VALUES ($1, $2, $3, 'rent', '2026-10-08', 100, 'INR', 'Nobody', $4)`,
      [w.tenant, id, w.outlets[0], JSON.stringify(origin)]);
    await insert(forged, { kind: "command", command_type: "finance.expense.record.v1", role: "owner", principal_id: w.owner });
    await insert(ghost, { kind: "decision", decision_id: uuidv7() });
    await insert(badRule, { kind: "derivation", rule_id: "finance.post_expense", source_ref: `core.expense:${expense}` });
    await unguarded("expense", `UPDATE core.expense SET amount_minor = 1 WHERE id = $1`, [expense]);
    const planted = await clause1(env, mark);
    expect(planted.bad).toHaveLength(4);
    expect(planted.bad.find((b) => b.startsWith(`core.expense:${forged} `))).toMatch(/not logged by the transaction that wrote it/);
    expect(planted.bad.find((b) => b.startsWith(`core.expense:${ghost} `))).toMatch(/no executed approved draft/);
    expect(planted.bad.find((b) => b.startsWith(`core.expense:${badRule} `))).toMatch(/no such rule for core.expense/);
    expect(planted.bad.find((b) => b.startsWith(`core.expense:${expense} `))).toMatch(/updated at .* with no audit entry in that transaction/);

    const last = await env.one<{ seq: string }>(`SELECT max(seq)::text AS seq FROM core.audit_log WHERE tenant_id = $1`, [w.tenant]);
    await env.db.admin(`UPDATE core.audit_log SET after = '{"amount_minor": 1}' WHERE tenant_id = $1 AND seq = $2`, [w.tenant, last.seq]);
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([false, Number(last.seq)]);
  });
});

describe("R1-M4: every other scan branch names its planted defect", () => {
  it("clean window → []; each planted row → exactly its finding", async () => {
    const mark = await watermark(env, w.tenant);
    expect((await clause1(env, mark)).bad).toEqual([]);
    const branches: PlantBranch[] = ["command_unlisted", "rule_missing", "source_missing", "derivation_unaudited", "state_unevaluated", "unknown_kind", "migration_unaudited", "no_capture", "update_unaudited", "restamp", "other_tenant"];
    const keys = new Map<PlantBranch, string>();
    for (const b of branches) keys.set(b, await plant(env, mark, b));
    const scan = await clause1(env, mark);
    for (const b of branches) {
      const hits = scan.bad.filter((x) => x.includes(`:${keys.get(b)} `));
      expect([b, hits.some((x) => PLANTS[b].test(x))]).toEqual([b, true]);
    }
    expect(scan.bad.length).toBeGreaterThanOrEqual(branches.length);
  });
});
