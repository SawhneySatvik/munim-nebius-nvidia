// Flow 10 — a roster edit and an opening-hours change (R1-M2 / R1-M4): book UPDATEs that must each be audited with
// before and after in their own transaction.
// Hand: "Synthetic Cook" (hourly, outlet 3) rostered next Monday 09:00–17:00 IST; the manager's edit moves the shift to
//   10:00–18:00 → one roster_shift update, audited before (09:00) / after (10:00).
//   A new outlet "Synthetic outlet 4" opens with the default weekly hours, 7 rows 09:00–22:00; changing them to
//   08:00–23:00 updates exactly those 7 rows, each audited before (09:00/22:00) / after (08:00/23:00).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chain, clause1, watermark } from "./guarantee.ts";
import { type Caller, type Env, startEnv, uuidv7, type World, world } from "./harness.ts";

let env: Env;
let w: World;
let owner: Caller;
let mark: Awaited<ReturnType<typeof watermark>>;
const ids = { staff: uuidv7(), roster: uuidv7(), shift: uuidv7(), outlet: uuidv7() };

/** The next Monday after today, Asia/Kolkata (YYYY-MM-DD). */
function nextMonday(): string {
  for (let d = 1; d <= 7; d++) {
    const t = new Date(Date.now() + d * 86_400_000);
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(t);
    if (wd === "Mon") return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(t);
  }
  throw new Error("no Monday in 7 days");
}
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

beforeAll(async () => {
  env = await startEnv();
  ({ w, owner } = await world(env, "IN"));
  mark = await watermark(env, w.tenant);
});
afterAll(async () => env?.stop());

const audits = (entity: string, ids: string[]) => env.rows<{ id: string; before: string | null; after: string | null }>(
  `SELECT entity_id AS id, before::text AS before, after::text AS after FROM core.audit_log WHERE tenant_id = $1 AND entity = $2 AND entity_id = ANY ($3::text[]) ORDER BY seq`,
  [w.tenant, entity, ids]);

describe("roster edit and hours change: every book update audited with before/after", () => {
  it("roster: the shift moves 09:00–17:00 → 10:00–18:00, one audited update", async () => {
    const monday = nextMonday();
    expect((await env.cmd(owner, "/v1/people/staff:upsert", "people.staff.upsert.v1", {
      staff_id: ids.staff, member_id: null, outlet_id: w.outlets[2], name: "Synthetic Cook", phone: null, role_key: "cook", pay_basis: "hourly",
      wage_rate_minor: 15000, monthly_salary_minor: null, contract_min_per_month: null, ot_multiplier_bp: 15000, currency: "INR",
      joined_on: "2026-10-01", left_on: null, active: true })).status).toBe(200);
    expect((await env.cmd(owner, "/v1/people/rosters", "people.roster.create.v1", { roster_id: ids.roster, outlet_id: w.outlets[2], week_start: monday,
      shifts: [{ roster_shift_id: ids.shift, staff_id: ids.staff, starts_at: at(monday, "09:00"), ends_at: at(monday, "17:00"), role_key: "cook" }] })).status).toBe(200);
    expect((await env.cmd(owner, "/v1/people/rosters:update", "people.roster.update.v1", { roster_id: ids.roster, cancel_roster: false, add_shifts: [],
      edit_shifts: [{ roster_shift_id: ids.shift, starts_at: at(monday, "10:00"), ends_at: at(monday, "18:00"), role_key: "cook" }], cancel_shift_ids: [] })).status).toBe(200);
    expect(await env.one(`SELECT starts_at = $2::timestamptz AS s, ends_at = $3::timestamptz AS e, status FROM core.roster_shift WHERE id = $1`,
      [ids.shift, at(monday, "10:00"), at(monday, "18:00")])).toEqual({ s: true, e: true, status: "scheduled" });
    const a = (await audits("core.roster_shift", [ids.shift])).filter((x) => x.before !== null);
    expect(a).toHaveLength(1);
    expect([a[0]!.before!.includes(at(monday, "09:00").slice(0, 16)), a[0]!.after!.includes(at(monday, "10:00").slice(0, 16))]).toEqual([true, true]);
  });

  it("hours: a new outlet's 7 weekly rows 09:00–22:00 → 08:00–23:00, each audited before/after", async () => {
    expect((await env.cmd(owner, "/v1/outlets", "tenancy.outlet.create.v1", {
      outlet_id: ids.outlet, name: "Synthetic outlet 4", kind: "restaurant", tz: "Asia/Kolkata", address: "4 Synthetic Street", tax_ids: {} })).status).toBe(200);
    const hours = () => env.rows<{ id: string; o: string; c: string }>(`SELECT id::text, opens_at::text AS o, closes_at::text AS c FROM core.outlet_calendar WHERE outlet_id = $1 ORDER BY weekday`, [ids.outlet]);
    const before = await hours();
    expect(before.map((h) => [h.o, h.c])).toEqual(Array(7).fill(["09:00:00", "22:00:00"]));
    expect((await env.cmd(owner, `/v1/outlets/${ids.outlet}:update`, "tenancy.outlet.update.v1", { outlet_id: ids.outlet, hours: { opens: "08:00", closes: "23:00" } })).status).toBe(200);
    expect((await hours()).map((h) => [h.o, h.c])).toEqual(Array(7).fill(["08:00:00", "23:00:00"]));
    const a = (await audits("core.outlet_calendar", before.map((h) => h.id))).filter((x) => x.before !== null);
    expect(a.map((x) => x.id).sort()).toEqual(before.map((h) => h.id).sort());
    for (const x of a) expect([x.before!.includes("09:00"), x.before!.includes("22:00"), x.after!.includes("08:00"), x.after!.includes("23:00")]).toEqual([true, true, true, true]);
  });

  it("One Guarantee clause 1 over the flow's book rows (hand-counted), and the audit chain verifies", async () => {
    const scan = await clause1(env, mark);
    expect(scan.bad).toEqual([]);
    // Hand: staff, roster, 1 shift; the outlet and its 7 weekly rows.
    expect(scan.inserted).toEqual({ staff: 1, roster: 1, roster_shift: 1, outlet: 1, outlet_calendar: 7 });
    // Hand: the one shift edit; the 7 hours rows.
    expect(scan.updated).toEqual({ roster_shift: 1, outlet_calendar: 7 });
    const v = await chain(env, w.tenant);
    expect([v.ok, v.firstBadSeq]).toEqual([true, null]);
  });
});
