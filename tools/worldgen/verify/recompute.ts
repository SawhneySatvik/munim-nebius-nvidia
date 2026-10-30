// The independent recompute (gate c). Reads a seeded world back through the public read routes only (SDK client,
// owner token) — no SQL, no write call, nothing imported from ../src — and recomputes every answer-key entry's
// impact from the rows the API returns. The key is typed by hand; a number here that disagrees with it is a
// failed gate. Seed keys in the key file resolve to ids with the same derivation worldgen uses (copied, not
// imported, so the two cannot drift together unseen).
import { createHash } from "node:crypto";
import { createMunimClient } from "../../../packages/sdk/src/index.ts";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface KeyEntry {
  id: string;
  pack: string;
  kind: string;
  what: string;
  where: J;
  /** Minor units of the world's currency; null for a non-money problem (then `metric` is set). */
  impact_minor: number | null;
  metric?: { name: string; value: number };
  /** Needs a timeline at least this long (a long-window plant); absent = present in every profile. */
  min_days?: number;
  /** Counted from the dated bills (or its offsets assume the calendar) at this as-of: the entry is in the key only for it (verify/run.ts loadKey). */
  as_of?: string;
  /** margin_bridge only: finance.margin_bridge's rows as [prior, current, share_bp] before and after the held settlement is approved. */
  bridge?: { before: Record<string, [number, number, number]>; after: Record<string, [number, number, number]> };
}
export interface AnswerKey { world: string; seed: string; currency: string; problems: KeyEntry[] }
export interface VerifyEnv {
  baseUrl: string;
  token: () => string | Promise<string>;
  asOf: string;
  fetch?: typeof fetch;
}
export interface Result { id: string; ok: boolean; expected: number | null; got: number | null; detail: string }

const idOf = (seed: string, world: string, key: string): string => {
  const h = createHash("sha256").update(`${seed}|${world}|${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-${"89ab"[Number.parseInt(h[16]!, 16) & 3]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** One CSV line → cells (quotes and doubled quotes, as the journal export writes them). */
const csvRow = (line: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  return [...out, cur];
};
/** Round half away from zero, as Postgres round() on a numeric. */
const bigRound = (num: bigint, den: bigint): number => {
  const neg = num < 0n;
  const n = neg ? -num : num;
  const q = (2n * n + den) / (2n * den);
  return Number(neg ? -q : q);
};
const lastDay = (month: string): string => { const [y, m] = month.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
/** Money is rounded half up once, at the end of a sum (the ledger's rule for a sum of fractional lines). */
const rdiv = (num: number, den: number): number => Math.floor((2 * num + den) / (2 * den));
const div = (num: number, den: number, what: string): number => {
  if (!Number.isInteger(num / den)) throw new Error(`${what}: ${num}/${den} is not whole`);
  return num / den;
};

export async function verifyWorld(env: VerifyEnv, key: AnswerKey): Promise<Result[]> {
  const id = (k: string) => idOf(key.seed, key.world, k);
  // R1-m6: core mints the tenant id, so the world's tenant is read back as the owner's one tenant, not derived.
  const mine = await (env.fetch ?? fetch)(`${env.baseUrl}/v1/me/tenants`, { headers: { Authorization: `Bearer ${await env.token()}` } });
  const tenants = ((await mine.json()) as { tenants?: Array<{ tenant_id: string }> }).tenants ?? [];
  if (mine.status !== 200 || tenants.length !== 1) throw new Error(`GET /v1/me/tenants → ${mine.status}, ${tenants.length} tenants (want exactly 1)`);
  const tenantId = tenants[0]!.tenant_id;
  const client = createMunimClient({ baseUrl: env.baseUrl, token: env.token, tenantId: () => tenantId, ...(env.fetch ? { fetch: env.fetch } : {}) }) as unknown as {
    GET(p: string, i: unknown): Promise<{ data?: J; response: Response }>;
  };
  const get = async (path: string, o: { path?: Record<string, string>; query?: Record<string, string> } = {}): Promise<J> => {
    const r = await client.GET(path, { params: o });
    if (r.response.status !== 200) throw new Error(`GET ${path} → ${r.response.status}`);
    return r.data as J;
  };

  // ---- shared reads ----
  let payoutRows: Map<string, J[]> | null = null;
  let runsSeen = 0;
  const payouts = async (): Promise<Map<string, J[]>> => {
    if (payoutRows) return payoutRows;
    // Built locally and cached only once whole: a fetch that throws mid-load must not leave a partial cache for later entries.
    const loaded = new Map<string, J[]>();
    const runs = (await get("/v1/imports/runs")).runs as J[];
    runsSeen = runs.length;
    for (const run of runs) {
      if (run.kind !== "payout_statement" || run.status !== "committed") continue;
      for (const r of (await get("/v1/imports/runs/{id}/rows", { path: { id: run.import_run_id } })).staged as J[]) {
        loaded.set(r.data.payout_ref, [...(loaded.get(r.data.payout_ref) ?? []), r.data]);
      }
    }
    return (payoutRows = loaded);
  };
  const payoutLines = async (refs: string[]): Promise<J[]> => {
    const all = await payouts();
    return refs.flatMap((ref) => {
      const rows = all.get(ref);
      if (!rows) throw new Error(`payout ${ref} is not committed${runsSeen >= 100 ? " (GET /v1/imports/runs returns only the newest 100 runs)" : ""}`);
      return rows;
    });
  };
  // The dated history's own bills: the staged rows of the committed pos_bills runs (what the owner approved). No member route lists
  // history orders by number or customer yet, so sales-derived plants are recomputed from these rows (the report names the route).
  let billRows: J[] | null = null;
  const bills = async (): Promise<J[]> => {
    if (billRows) return billRows;
    const loaded: J[] = []; // cached only once whole (a mid-load throw must not leave partial bills)
    for (const run of (await get("/v1/imports/runs")).runs as J[]) {
      if (run.kind !== "pos_bills" || run.status !== "committed") continue;
      for (const r of (await get("/v1/imports/runs/{id}/rows", { path: { id: run.import_run_id } })).staged as J[]) loaded.push(r.data);
    }
    return (billRows = loaded);
  };
  const billsWithPrefix = async (prefix: string): Promise<J[]> => {
    const rows = (await bills()).filter((r) => String(r.bill_no).startsWith(prefix));
    if (rows.length === 0) throw new Error(`no committed history bill starts with ${prefix}`);
    return rows;
  };
  /** One entry per bill (its first line's bill-level columns), in file order. */
  const uniqueBills = (rows: J[]): J[] => [...new Map(rows.map((r) => [r.bill_no, r])).values()];
  const zones = new Map<string, string>();
  const dateAt = async (outletId: string, iso: string): Promise<string> => {
    if (zones.size === 0) for (const o of (await get("/v1/outlets")).outlets as J[]) zones.set(o.id, o.tz);
    return new Intl.DateTimeFormat("en-CA", { timeZone: zones.get(outletId) }).format(new Date(iso));
  };
  const order = (k: string) => get("/v1/orders/{id}", { path: { id: id(k) } });
  // The agreed terms in force on a date for a channel kind (R3-M7: these used to be typed into the key).
  let channelIds: Map<string, string> | null = null;
  const termsOn = async (channelKind: string, date: string): Promise<J> => {
    channelIds ??= new Map(((await get("/v1/channels")).channels as J[]).map((c) => [c.kind as string, c.id as string]));
    const channelId = channelIds.get(channelKind);
    if (!channelId) throw new Error(`no channel of kind ${channelKind}`);
    const rows = ((await get("/v1/finance/channel-terms", { query: { channel_id: channelId } })).channel_terms as J[]).filter(
      (t) => t.valid_from <= date && (t.valid_to === null || t.valid_to > date));
    if (rows.length !== 1) throw new Error(`${rows.length} terms in force for ${channelKind} on ${date}`);
    return rows[0]!;
  };
  const movements = async (outlet: string, ingredient: string): Promise<J[]> => {
    const out: J[] = [];
    let cursor: string | undefined;
    for (;;) {
      const r = await get("/v1/inventory/movements", { query: { outlet: id(outlet), ingredient: id(ingredient), limit: "500", ...(cursor ? { cursor } : {}) } });
      out.push(...(r.movements as J[]));
      if (!r.next_cursor) return out;
      cursor = r.next_cursor as string;
    }
  };
  /** Weighted-average unit cost of the receipts (the only cost the movements expose). */
  const unitCost = (mv: J[]): number => {
    const rec = mv.filter((m) => m.kind === "receipt" && m.unit_cost);
    return Math.round(sum(rec.map((m) => m.qty_milli * m.unit_cost.amount_minor)) / sum(rec.map((m) => m.qty_milli)));
  };
  /** Waste movements of the pair on the given days (offsets from as-of; history waste has server-minted ids, so days locate it). */
  const wasteValue = async (outlet: string, ingredient: string, offsets: number[]): Promise<{ value: number; logs: number }> => {
    const mv = await movements(outlet, ingredient);
    const days = new Set(offsets.map((n) => addDays(env.asOf, n)));
    const w: J[] = [];
    for (const m of mv) if (m.kind === "waste" && days.has(await dateAt(m.outlet_id, m.at))) w.push(m);
    if (w.length < days.size) throw new Error(`found ${w.length} waste movements on ${days.size} days`);
    return { value: div(-sum(w.map((m) => m.qty_milli)) * unitCost(mv), 1000, "waste value"), logs: w.length };
  };
  const batchOf = async (outlet: string, ingredient: string, code: string): Promise<J> => {
    const b = ((await get("/v1/inventory/batches", { query: { outlet: id(outlet), ingredient: id(ingredient) } })).batches as J[]).find((x) => x.batch_code === code);
    if (!b) throw new Error(`batch ${code} not found`);
    return b;
  };
  const invoice = (k: string) => get("/v1/supplier-invoices/{id}", { path: { id: id(k) } });
  // Every approved invoice line, with its date: the price a supplier charged is the cost the books take from that day.
  let invoiceLines: J[] | null = null;
  const allInvoiceLines = async (): Promise<J[]> => {
    if (invoiceLines) return invoiceLines;
    const list = (await get("/v1/supplier-invoices")).items as J[];
    return (invoiceLines = list.filter((i) => i.status === "approved").flatMap((i) => (i.lines as J[]).map((l) => ({ ...l, invoice_date: i.invoice_date }))));
  };
  /** The unit price in force for an ingredient on a date: its latest approved invoice dated on or before it, else null. */
  const priceOn = async (ingredientId: string, date: string): Promise<number | null> => {
    const lines = (await allInvoiceLines()).filter((l) => l.ingredient_id === ingredientId && l.invoice_date <= date).sort((a, b) => (a.invoice_date < b.invoice_date ? -1 : a.invoice_date > b.invoice_date ? 1 : 0));
    return lines.length ? (lines.at(-1)!.unit_price_minor as number) : null;
  };
  /** Staged payout rows of runs still waiting for the owner (uploaded, previewed, not approved). */
  const heldPayoutRows = async (): Promise<J[]> => {
    const out: J[] = [];
    for (const run of (await get("/v1/imports/runs")).runs as J[]) {
      if (run.kind !== "payout_statement" || run.status !== "previewed") continue;
      for (const r of (await get("/v1/imports/runs/{id}/rows", { path: { id: run.import_run_id } })).staged as J[]) out.push(r.data);
    }
    return out;
  };
  let bankRows: J[] | null = null;
  const bank = async (): Promise<J[]> => {
    if (bankRows) return bankRows;
    const loaded: J[] = []; // cached only once whole
    for (const run of (await get("/v1/imports/runs")).runs as J[]) {
      if (run.kind !== "bank_statement" || run.status !== "committed") continue;
      for (const r of (await get("/v1/imports/runs/{id}/rows", { path: { id: run.import_run_id } })).staged as J[]) loaded.push(r.data);
    }
    return (bankRows = loaded);
  };
  // The catalogue rows the key used to carry (R3-M7; T-092 serves them): recipe versions with their lines, and prices and coupons. The
  // recompute computes from these rows; the key's own figure stays only as a check that the rows say it. A lookup that does not land on one
  // row throws rather than picks.
  const allPages = async (path: string, query: Record<string, string> = {}): Promise<J[]> => {
    const out: J[] = [];
    let cursor: string | undefined;
    for (;;) {
      const r = await get(path, { query: { ...query, limit: "200", ...(cursor ? { cursor } : {}) } });
      out.push(...(r.items as J[]));
      if (!r.next_cursor) return out;
      cursor = r.next_cursor as string;
    }
  };
  /** Each item's recipe in force on a date, the catalogue templates' rule: no variant, valid that day, the latest valid_from, then version. */
  const recipesOn = async (date: string, itemId?: string): Promise<Map<string, J>> => {
    const live = (await allPages("/v1/catalogue/recipes", itemId ? { item: itemId } : {}))
      .filter((v) => v.variant_id === null && v.valid_from <= date && (v.valid_to === null || v.valid_to > date))
      .sort((a, b) => (a.valid_from === b.valid_from ? b.version - a.version : a.valid_from < b.valid_from ? 1 : -1));
    const out = new Map<string, J>();
    for (const v of live) if (!out.has(v.item_id)) out.set(v.item_id, v);
    return out;
  };
  /** The recipes in force on a date that use an ingredient, each with its one line of it. */
  const linesOf = async (ingredientId: string, date: string, itemId?: string): Promise<Array<{ recipe: J; line: J }>> => {
    const out: Array<{ recipe: J; line: J }> = [];
    for (const recipe of (await recipesOn(date, itemId)).values()) {
      const ls = (recipe.lines as J[]).filter((l) => l.ingredient_id === ingredientId);
      if (ls.length > 1) throw new Error(`recipe ${recipe.recipe_version_id} has ${ls.length} lines of one ingredient`);
      if (ls.length === 1) out.push({ recipe, line: ls[0]! });
    }
    return out;
  };
  /** The item's price in force at the outlet on a date, catalogue.cost_drift's rule: counter first, then the highest, then the id. */
  const priceOf = async (itemId: string, outletId: string, date: string): Promise<J | null> =>
    (await allPages("/v1/catalogue/prices", { item: itemId, outlet: outletId }))
      .filter((x) => x.valid_from <= date && (x.valid_to === null || x.valid_to > date))
      .sort((a, b) => Number(b.channel_kind === "counter") - Number(a.channel_kind === "counter") || b.amount_minor - a.amount_minor || (a.price_id < b.price_id ? -1 : 1))[0] ?? null;
  /** Rows and key must say the same; the rows are what the recompute uses. */
  const sameAsKey = (what: string, rows: unknown, key: unknown): void => {
    if (JSON.stringify(rows) !== JSON.stringify(key)) throw new Error(`${what}: the rows say ${JSON.stringify(rows)}, the key ${JSON.stringify(key)}`);
  };

  const run = async (p: KeyEntry): Promise<{ got: number | null; detail: string }> => {
    const w = p.where;
    switch (p.kind) {
      case "unapproved_ad_fee": {
        const rows = await payoutLines(w.payout_refs);
        return { got: sum(rows.map((r) => r.ad_fee_minor)), detail: `${rows.filter((r) => r.ad_fee_minor > 0).length} ad lines` };
      }
      case "ad_cap_excess": {
        const rows = await payoutLines(w.payout_refs);
        const terms = await termsOn(w.channel, rows[0]!.period_to);
        if (terms.ads_opted_in !== true || terms.ad_spend_cap_minor === null) throw new Error("the channel's terms carry no ad cap");
        return { got: sum(rows.map((r) => r.ad_fee_minor)) - (terms.ad_spend_cap_minor as number), detail: "ad fees − monthly cap (channel terms)" };
      }
      case "short_commission": {
        const all = await payoutLines(w.payout_refs);
        const contracted = (await termsOn(w.channel, all[0]!.period_to)).commission_bp as number;
        const rows = all.filter((r) => r.line_kind === "order");
        return { got: div(sum(rows.map((r) => r.commission_minor * 10000 - r.gross_minor * contracted)), 10000, "short commission"), detail: `${rows.length} orders at contracted ${contracted} bp` };
      }
      case "missing_payout": {
        const seen = new Set([...(await payouts()).values()].flat().map((r) => r.order_ref));
        const refs = new Set(w.external_refs as string[]);
        const rows = (await bills()).filter((r) => refs.has(r.bill_no));
        if (uniqueBills(rows).length !== refs.size) throw new Error(`found ${uniqueBills(rows).length} of ${refs.size} history bills`);
        const inPayout = uniqueBills(rows).filter((r) => seen.has(r.bill_no));
        if (inPayout.length) throw new Error(`${inPayout.length} of the bills are in a payout`);
        return { got: sum(rows.map((r) => r.line_total_minor)), detail: `${refs.size} bills in no payout` };
      }
      case "invoice_overbilled": {
        const inv = await invoice(w.invoice);
        const po = await get("/v1/purchase-orders/{id}", { path: { id: inv.po_id } });
        const lines = (inv.lines as J[]).map((l) => {
          const pl = (po.lines as J[]).find((x) => x.po_line_id === l.po_line_id);
          if (!pl) throw new Error("invoice line is not on the PO");
          return Math.max(0, l.unit_price_minor - pl.unit_price_minor) * l.qty_milli;
        });
        return { got: div(sum(lines), 1000, "overbilled"), detail: `invoice ${inv.invoice_no}` };
      }
      case "near_duplicate_invoice": {
        const [a, b] = (await Promise.all((w.invoices as string[]).map(invoice))) as [J, J];
        const norm = (s: string) => s.replaceAll(/[^A-Za-z0-9]/g, "").toLowerCase();
        if (norm(a.invoice_no) !== norm(b.invoice_no) || a.invoice_no === b.invoice_no) throw new Error("numbers are not near-duplicates");
        if (a.total_minor !== b.total_minor || a.supplier.supplier_id !== b.supplier.supplier_id) throw new Error("totals/suppliers differ");
        return { got: b.total_minor, detail: `${a.invoice_no} ~ ${b.invoice_no}` };
      }
      case "price_creep": {
        const lines = async (keys: string[]) => (await Promise.all(keys.map(invoice))).flatMap((i) => i.lines as J[]).filter((l) => l.ingredient_id === id(w.ingredient));
        const pre = await lines(w.pre_invoices);
        const post = await lines(w.post_invoices);
        const base = median(pre.map((l) => l.unit_price_minor));
        return { got: div(sum(post.map((l) => (l.unit_price_minor - base) * l.qty_milli)), 1000, "creep"), detail: `median ${base} → ${post[0]?.unit_price_minor}` };
      }
      case "waste_value": {
        const r = await wasteValue(w.outlet, w.ingredient, w.waste_offsets);
        return { got: r.value, detail: `${r.logs} waste movements` };
      }
      case "temp_excursion": {
        const logs = (await get("/v1/compliance/temp-logs", { query: { outlet: id(w.outlet), asset: id(w.asset), limit: "500" } })).items as J[];
        const mine = logs.filter((l) => (w.logs as string[]).map(id).includes(l.id));
        if (mine.length !== w.logs.length) throw new Error(`found ${mine.length} of ${w.logs.length} readings`);
        const bad = mine.filter((l) => l.out_of_range === true).length;
        if (bad !== w.out_of_range) throw new Error(`${bad} readings out of range, key says ${w.out_of_range}`);
        return { got: (await wasteValue(w.outlet, w.ingredient, w.waste_offsets)).value, detail: `${bad} readings out of range` };
      }
      case "licence_expiring": {
        const r = (await get("/v1/compliance/licences/expiring", { query: { within_days: "90", as_of: `${env.asOf}T06:30:00.000Z`, outlet: id(w.outlet) } })).items as J[];
        const l = r.find((x) => x.id === id(w.licence));
        if (!l) throw new Error("licence not in the expiring list");
        return { got: l.days_left, detail: `valid to ${l.valid_to}` };
      }
      case "overtime_drift": {
        const rows = ((await get("/v1/people/overtime", { query: { outlet: id(w.outlet), from: addDays(env.asOf, w.from_offset), to: addDays(env.asOf, w.to_offset) } })).rows as J[]).filter((r) => r.staff_id === id(w.staff));
        const extra = sum(rows.map((r) => r.extra_min));
        // The answer is core's own row; the wage terms come from the staff row and only have to agree with it, so a drifting
        // formula or a wrong wage both fail.
        const cost = sum(rows.map((r) => r.extra_cost_minor));
        const member = ((await get("/v1/people/staff", { query: { outlet: id(w.outlet) } })).staff as J[]).find((x) => x.staff_id === id(w.staff));
        if (!member || member.pay_basis !== "hourly") throw new Error("staff row missing or not hourly");
        const byRow = div(extra * (member.wage_rate_minor as number) * (member.ot_multiplier_bp as number), 60 * 10000, "overtime");
        if (byRow !== cost) throw new Error(`core's extra_cost_minor ${cost} differs from the staff-row formula ${byRow}`);
        return { got: cost, detail: `${extra} extra minutes` };
      }
      case "advance_outstanding": {
        const month = `${env.asOf.slice(0, 7)}-01`;
        const lines = (await get("/v1/people/payroll-preview", { query: { outlet: id(w.outlet), month } })).lines as J[];
        const l = lines.find((x) => x.staff_id === id(w.staff));
        if (!l) throw new Error("staff not in the payroll preview");
        return { got: l.outstanding_advance_minor, detail: "outstanding advance" };
      }
      case "cash_variance": {
        const os = await Promise.all((w.orders as string[]).map(order));
        const cash = sum(os.flatMap((o) => (o.tenders as J[]).filter((t) => t.method === "cash").map((t) => t.amount_minor)));
        const shift = await get("/v1/shifts/{id}", { path: { id: id(w.shift) } });
        if (shift.status !== "closed" || shift.counted_cash_minor === null) throw new Error("the shift is not closed with a count");
        return { got: (shift.float_minor as number) + cash - (shift.counted_cash_minor as number), detail: `expected ${(shift.float_minor as number) + cash}` };
      }
      case "stock_below_reorder": {
        const mv = await movements(w.outlet, w.ingredient);
        const onhand = sum(mv.map((m) => m.qty_milli));
        const level = ((await get("/v1/inventory/reorder-levels", { query: { outlet: id(w.outlet), ingredient: id(w.ingredient) } })).reorder_levels as J[])[0];
        if (!level) throw new Error("no reorder level set");
        const min = level.min_qty_milli as number;
        return { got: div((min - onhand) * unitCost(mv), 1000, "shortfall"), detail: `on hand ${onhand}, min ${min}` };
      }
      case "cost_drift": {
        // catalogue.cost_drift as migration 0019 defines it: Σ over units sold since :since × (the dish's unit cost that day − its cost when the price was set),
        // a dish's unit cost taking each ingredient at the outlet's latest landed cost (receipt) on or before the day, else the earliest known one.
        // Only the drifting ingredient's line is rebuilt: every other line carries the same cost on both days, so it cancels exactly.
        const receipts = (await movements(w.outlet, w.ingredient)).filter((m) => m.kind === "receipt" && m.unit_cost_per_1000).sort((a, b) => (a.at < b.at ? -1 : 1));
        const when = new Map<string, string>();
        for (const m of receipts) when.set(m.movement_id, await dateAt(m.outlet_id, m.at));
        const landed = (d: string): number => {
          const upTo = receipts.filter((m) => when.get(m.movement_id)! <= d).at(-1);
          return (upTo ?? receipts[0]!).unit_cost_per_1000.amount_minor;
        };
        const used = await linesOf(id(w.ingredient), env.asOf, id(w.item));
        if (used.length !== 1) throw new Error(`${used.length} recipes of ${w.item} in force on ${env.asOf} use ${w.ingredient}`);
        const { recipe, line } = used[0]!;
        const price = await priceOf(id(w.item), id(w.outlet), env.asOf);
        if (!price) throw new Error(`no price of ${w.item} in force at ${w.outlet} on ${env.asOf}`);
        sameAsKey("recipe qty, waste, yield and the price's day", [line.qty_milli, line.waste_pct_bp, recipe.yield_qty_milli, price.valid_from],
          [w.recipe_qty_milli, w.recipe_waste_bp, w.recipe_yield_milli, addDays(env.asOf, w.price_set_offset)]);
        const then = landed(price.valid_from);
        if (landed(addDays(env.asOf, 400)) <= then) throw new Error("the landed cost has not risen since the price was set");
        const perDay = new Map<string, number>();
        for (const r of (await bills()).filter((x) => x.outlet_id === id(w.outlet) && x.item_id === id(w.item) && x.status === "completed" && x.bill_date >= addDays(env.asOf, w.since_offset))) {
          perDay.set(r.bill_date, (perDay.get(r.bill_date) ?? 0) + r.qty_milli);
        }
        if (perDay.size === 0) throw new Error("no sale since the window opened");
        let num = 0n;
        for (const [d, q] of perDay) num += BigInt(q) * BigInt(line.qty_milli) * BigInt(10000 + line.waste_pct_bp) * BigInt(landed(d) - then);
        return { got: bigRound(num, 10_000_000n * BigInt(recipe.yield_qty_milli) * 1000n), detail: `${perDay.size} sale days, landed cost ${then} → ${landed(addDays(env.asOf, 400))} per 1000` };
      }
      case "recipe_waste_gap": {
        // catalogue.dish_margin's excess_waste_minor: units sold x recipe quantity x landed cost x (observed - recipe waste) / 10,000, where observed waste is the
        // outlet's waste over what its sales drew (the allowance included) in the window.
        const from = addDays(env.asOf, w.from_offset);
        const to = addDays(env.asOf, w.to_offset);
        let cons = 0;
        let waste = 0;
        for (const m of await movements(w.outlet, w.ingredient)) {
          const day = await dateAt(m.outlet_id, m.at);
          if (day < from || day > to) continue;
          if (m.kind === "sale_consumption") cons += -m.qty_milli;
          if (m.kind === "waste") waste += -m.qty_milli;
        }
        // The recipe's own allowance: every recipe in force at the window's end that uses the ingredient must carry one and the same.
        const allowances = [...new Set((await linesOf(id(w.ingredient), to)).map((x) => x.line.waste_pct_bp as number))];
        if (allowances.length !== 1) throw new Error(`recipes in force on ${to} using ${w.ingredient} carry waste allowances ${JSON.stringify(allowances)}`);
        const recipeBp = allowances[0]!;
        sameAsKey("the recipe's waste allowance", recipeBp, w.recipe_waste_bp);
        const observed = Math.round((waste * 10000) / cons);
        if (observed < recipeBp + 300) throw new Error(`observed waste ${observed} bp is not 300 above the recipe's ${recipeBp}`);
        const sold = div(cons * 10000, 10000 + recipeBp, "milli sold at recipe quantity");
        const landedLast = (await movements(w.outlet, w.ingredient)).filter((m) => m.kind === "receipt" && m.unit_cost_per_1000).sort((a, b) => (a.at < b.at ? 1 : -1));
        let per1000 = landedLast[0]!.unit_cost_per_1000.amount_minor;
        for (const m of landedLast) if ((await dateAt(m.outlet_id, m.at)) <= to) { per1000 = m.unit_cost_per_1000.amount_minor; break; }
        return { got: bigRound(BigInt(sold) * BigInt(per1000) * BigInt(observed - recipeBp), 10_000n * 1_000_000n), detail: `observed ${observed} bp vs recipe ${recipeBp}` };
      }
      case "recipe_missing": {
        const rows = (await billsWithPrefix(w.bill_prefix)).filter((r) => r.status === "completed");
        if (rows.some((r) => r.item_id !== id(w.item))) throw new Error("a bill line is for another item");
        const versions = (await allPages("/v1/catalogue/recipes", { item: id(w.item) })).length;
        sameAsKey("recipe versions of the dish", versions, w.recipe_versions);
        if (versions !== 0) throw new Error(`the dish has ${versions} recipe versions`);
        return { got: div(sum(rows.map((r) => r.qty_milli)), 1000, "units"), detail: `${rows.length} lines of ${w.item}` };
      }
      case "cost_drift_held": {
        const ing = id(w.ingredient);
        const lines = (await allInvoiceLines()).filter((l) => l.ingredient_id === ing).sort((a, b) => (a.invoice_date < b.invoice_date ? -1 : 1));
        const base = lines[0]!.unit_price_minor as number;
        const now = lines.at(-1)!.unit_price_minor as number;
        // Without the price rise this would be a cost drift (the same bar as the detector's) ...
        if (Math.round(((now - base) * 10000) / base) < 800 || now - base < 500) throw new Error(`cost moved ${base} → ${now}: not a drift to hold`);
        // ... but the price was set after the cost move, so the cost then is the cost now and nothing has drifted since.
        // The day the menu price was set: the price in force now of every dish whose recipe uses the ingredient, one day for all of them.
        const dishes = [...new Set((await linesOf(ing, env.asOf)).map((x) => x.recipe.item_id as string))];
        const days = [...new Set(await Promise.all(dishes.map(async (item) => (await priceOf(item, id(w.outlet), env.asOf))?.valid_from ?? null)))];
        if (dishes.length === 0 || days.length !== 1 || days[0] === null) throw new Error(`${dishes.length} dishes use ${w.ingredient}; price days in force ${JSON.stringify(days)}`);
        const priceDay = days[0]!;
        sameAsKey("the day the price was set", priceDay, addDays(env.asOf, w.price_set_offset));
        const then = (await priceOn(ing, priceDay))!;
        if (then !== now) throw new Error(`cost on the price day ${then} is not the latest ${now}`);
        let num = 0;
        let n = 0;
        for (const m of await movements(w.outlet, w.ingredient)) {
          if (m.kind !== "sale_consumption" || (await dateAt(m.outlet_id, m.at)) < priceDay) continue;
          num += -m.qty_milli * ((await priceOn(ing, await dateAt(m.outlet_id, m.at)))! - then);
          n++;
        }
        if (n === 0) throw new Error("no sale after the price rise: the zero would be vacuous");
        return { got: rdiv(num, 1000), detail: `${n} sales since the price rise; cost ${base} → ${now}` };
      }
      case "tender_gap": {
        const mine = uniqueBills((await bills()).filter((r) => r.outlet_id === id(w.outlet) && r.status === "completed"));
        const tendered = new Map<string, number>();
        for (const r of mine) tendered.set(r.bill_date, (tendered.get(r.bill_date) ?? 0) + r[`${w.method}_minor`]);
        const credited = new Map<string, number>();
        for (const r of (await bank()).filter((b) => b.outlet_id === id(w.outlet) && b.method === w.method)) credited.set(r.value_date, (credited.get(r.value_date) ?? 0) + r.amount_minor);
        let gap = 0;
        const days: string[] = [];
        for (const [d, t] of tendered) {
          const g = t - (credited.get(d) ?? 0);
          if (g < 0) throw new Error(`${d}: credited more than tendered`);
          if (g > 0) { gap += g; days.push(d); }
        }
        const voids = uniqueBills((await bills()).filter((r) => r.outlet_id === id(w.outlet) && r.status === "cancelled" && days.includes(r.bill_date))).length;
        // finance.tender_gap (pack §4): a day counts from ₹500 (50,000 paise) and a finding needs 3 such days in one ISO week; the weeks' gaps are what it can find.
        const monday = (d: string) => addDays(d, 1 - (new Date(`${d}T00:00:00Z`).getUTCDay() || 7));
        const weeks = new Map<string, number[]>();
        for (const d of days) weeks.set(monday(d), [...(weeks.get(monday(d)) ?? []), tendered.get(d)! - (credited.get(d) ?? 0)]);
        const found = [...weeks.values()].filter((g) => g.filter((x) => x >= 50000).length >= 3);
        if (sum(found.flat()) !== gap) throw new Error(`gap days outside any week of 3 days from ₹500: only ${sum(found.flat())} of ${gap} is findable`);
        return { got: gap, detail: `${days.length} days short in ${found.length} weeks (${found.map((g) => sum(g)).join(" + ")}), ${voids} bills voided on them` };
      }
      case "missing_cycle": {
        if ((await payouts()).has(w.payout_ref)) throw new Error(`${w.payout_ref} is already approved`);
        const held = (await heldPayoutRows()).filter((r) => r.payout_ref === w.payout_ref);
        if (held.length === 0) throw new Error(`${w.payout_ref} is not waiting for approval`);
        const orders = held.filter((r) => r.line_kind === "order");
        const known = new Map(uniqueBills(await bills()).map((r) => [r.bill_no, r]));
        for (const r of orders) if (known.get(r.order_ref)?.channel_kind !== w.channel) throw new Error(`${r.order_ref} is not a ${w.channel} bill`);
        return { got: sum(orders.map((r) => r.gross_minor)), detail: `${orders.length} orders in the unapproved statement` };
      }
      case "ad_within_cap": {
        const rows = await payoutLines(w.payout_refs);
        const ads = sum(rows.map((r) => r.ad_fee_minor));
        const terms = await termsOn(w.channel, rows[0]!.period_to);
        if (ads <= 0 || terms.ads_opted_in !== true || terms.ad_spend_cap_minor === null) throw new Error("no ad fee inside an opted-in cap to hold");
        return { got: Math.max(0, ads - (terms.ad_spend_cap_minor as number)), detail: `${ads} of ${terms.ad_spend_cap_minor} allowed` };
      }
      case "margin_bridge": {
        // ADR-014 §7.3 as migration 0019 defines the rows, rebuilt here from read routes only: orders (the approved history bills), receipts and waste
        // (stock movements), the ledger (the journal export). Every row of the key is [prior, current, share_bp].
        const monthOf = (n: number) => { const [y, m] = env.asOf.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
        const [CM, PM] = [monthOf(w.compare_month_offset), monthOf(w.period_month_offset)] as const;
        const nextMonth = (m: string) => addDays(lastDay(m), 1);
        const roundAway = (num: number, den: number) => Math.sign(num) * rdiv(Math.abs(num), den);
        const outletsOf = (w.outlets as string[]).map(id);
        const sold = (await bills()).filter((r) => outletsOf.includes(r.outlet_id) && r.status === "completed");
        const lineBase = (r: J) => rdiv(r.qty_milli * r.unit_price_minor, 1000);
        const inclusive = sold.some((r) => r.line_tax_minor > 0 && r.line_total_minor === lineBase(r) - r.line_discount_minor);
        const ords = (m: string) => {
          const rows = sold.filter((r) => r.bill_date.startsWith(m));
          const perBill = uniqueBills(rows).map((b) => rows.filter((r) => r.bill_no === b.bill_no));
          return {
            gross: sum(perBill.map((ls) => sum(ls.map((r) => r.line_total_minor)) - sum(ls.map((r) => r.line_tax_minor)) + sum(ls.map((r) => r.line_discount_minor)))),
            disc: sum(perBill.map((ls) => sum(ls.map((r) => r.line_discount_minor)))),
            items: rows.reduce<Map<string, { q: number; g: number }>>((acc, r) => { const e = acc.get(r.item_id) ?? { q: 0, g: 0 }; e.q += r.qty_milli; e.g += lineBase(r) - (inclusive ? r.line_tax_minor : 0); return acc.set(r.item_id, e); }, new Map()),
          };
        };
        const [oc, op] = [ords(CM), ords(PM)];
        const priceEffect = sum([...op.items].flatMap(([item, c]) => { const p = oc.items.get(item); return p && p.q !== 0 ? [c.g - roundAway(c.q * p.g, p.q)] : []; }));
        // Stock movements of every listed ingredient at every listed outlet.
        const mvAll: J[] = [];
        for (const o of w.outlets as string[]) for (const i of w.ingredients as string[]) mvAll.push(...(await movements(o, i)));
        const day = new Map<string, string>();
        for (const m of mvAll) day.set(m.movement_id, await dateAt(m.outlet_id, m.at));
        const receipts = mvAll.filter((m) => m.kind === "receipt" && m.unit_cost_per_1000);
        const rcMonth = (m: string) => {
          const by = new Map<string, { q: number; v: number }>();
          for (const r of receipts.filter((x) => day.get(x.movement_id)!.startsWith(m))) {
            const e = by.get(r.ingredient_id) ?? { q: 0, v: 0 };
            e.q += r.qty_milli; e.v += rdiv(r.qty_milli * r.unit_cost_per_1000.amount_minor, 1_000_000);
            by.set(r.ingredient_id, e);
          }
          return by;
        };
        const [rc, rp] = [rcMonth(PM), rcMonth(CM)];
        const supplierEffect = sum([...rc].flatMap(([ing, c]) => { const p = rp.get(ing); return p && p.q !== 0 ? [c.v - roundAway(c.q * p.v, p.q)] : []; }));
        const wasteValue = (m: string): number => {
          const end = nextMonth(m);
          const q = new Map<string, number>();
          for (const x of mvAll.filter((y) => y.kind === "waste" && day.get(y.movement_id)!.startsWith(m))) q.set(x.ingredient_id, (q.get(x.ingredient_id) ?? 0) - x.qty_milli);
          let total = 0;
          for (const [ing, qty] of q) {
            const mine = receipts.filter((r) => r.ingredient_id === ing);
            const before = mine.filter((r) => day.get(r.movement_id)! < end).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
            const pick = before ?? mine.sort((a, b) => (a.at < b.at ? -1 : 1))[0];
            if (pick) total += rdiv(qty * pick.unit_cost_per_1000.amount_minor, 1_000_000);
          }
          return total;
        };
        // The ledger, from the journal export: income 4xxx, expense 5xxx-6xxx; debit positive.
        const tally = await get("/v1/finance/exports/tally", { query: { from: `${CM}-01`, to: lastDay(PM) } });
        const posts = (tally.content as string).split("\r\n").slice(1).filter(Boolean).map((l) => {
          const c = csvRow(l);
          const [d, mth, y] = c[0]!.split("-");
          const minor = (x: string) => (x === "" ? 0 : Math.round(Number(x) * 100));
          return { month: `${y}-${mth}`, date: `${y}-${mth}-${d}`, code: c[3]!, amount: minor(c[5]!) - minor(c[6]!) };
        });
        const gl = (m: string) => {
          const x = posts.filter((q) => q.month === m && /^[456]/.test(q.code));
          const g = (codes: string[]) => sum(x.filter((q) => codes.includes(q.code)).map((q) => q.amount));
          const named = ["5000", "5100", "6000", "6010", "6300"];
          return { cogs: g(["5000", "5100"]), fees: g(["6000", "6010"]), labour: g(["6300"]), other: sum(x.filter((q) => /^[56]/.test(q.code) && !named.includes(q.code)).map((q) => q.amount)), margin: -sum(x.map((q) => q.amount)) };
        };
        const [gp, gc] = [gl(CM), gl(PM)];
        // Held settlement: fees are posted on the day it is paid out, so its September cycle only shows once the owner has approved it.
        const feeRows = async (heldToo: boolean) => {
          if (!heldToo) return { p: gp.fees, c: gc.fees };
          const rows = (await heldPayoutRows()).filter((r) => r.paid_on !== null);
          const fee = (m: string) => sum(rows.filter((r) => String(r.paid_on).startsWith(m)).map((r) => r.commission_minor + r.ad_fee_minor + r.promo_share_minor));
          return { p: gp.fees + fee(CM), c: gc.fees + fee(PM) };
        };
        const one = async (heldToo: boolean): Promise<Record<string, [number, number, number]>> => {
          const f = await feeRows(heldToo);
          const [wp, wc] = [wasteValue(CM), wasteValue(PM)];
          const mp = gp.margin + (heldToo ? gp.fees - f.p : 0);
          const mc = gc.margin + (heldToo ? gc.fees - f.c : 0);
          const rowsOf: Array<[string, number, number]> = [
            ["revenue_volume", oc.gross, op.gross - priceEffect], ["revenue_price", 0, priceEffect], ["deal_discount", -oc.disc, -op.disc],
            ["cogs_supplier_price", 0, -supplierEffect], ["cogs_volume_mix", -gp.cogs + wp, -gc.cogs + wc + supplierEffect], ["waste", -wp, -wc],
            ["channel_fees", -f.p, -f.c], ["labour", -gp.labour, -gc.labour], ["other", -gp.other, -gc.other],
            ["unexplained", mp - (oc.gross - oc.disc - gp.cogs - f.p - gp.labour - gp.other), mc - (op.gross - op.disc - gc.cogs - f.c - gc.labour - gc.other)],
            ["margin_delta_minor", mp, mc],
          ];
          const delta = mc - mp;
          return Object.fromEntries(rowsOf.map(([k, a, b]) => [k, [a, b, roundAway((b - a) * 10000, Math.abs(delta))] as [number, number, number]]));
        };
        if (!(await heldPayoutRows()).some((r) => r.payout_ref === w.held_payout_ref)) throw new Error(`${w.held_payout_ref} is not the settlement waiting for approval`);
        const [before, after] = [await one(false), await one(true)];
        const want = p.bridge!;
        const bad = [["before", before, want.before], ["after", after, want.after]].flatMap(([tag, got, exp]) =>
          Object.keys(exp as J).filter((k) => JSON.stringify((got as J)[k]) !== JSON.stringify((exp as J)[k])).map((k) => `${tag}.${k}: key ${JSON.stringify((exp as J)[k])}, rows ${JSON.stringify((got as J)[k])}`));
        if (bad.length) throw new Error(`bridge differs: ${bad.join("; ")}`);
        const d = after.margin_delta_minor!;
        return { got: d[1] - d[0], detail: `${CM} → ${PM}: ${Object.entries(after).map(([k, v]) => `${k} ${v[1] - v[0]} (${v[2]} bp)`).join(", ")}` };
      }
      case "overstaffed_slot": {
        const staffRows = ((await get("/v1/people/staff", { query: { outlet: id(w.outlet) } })).staff as J[]).filter((x) => (w.staff as string[]).map(id).includes(x.staff_id));
        if (staffRows.length !== w.staff.length || staffRows.some((x) => x.pay_basis !== "hourly")) throw new Error("staff rows missing or not hourly");
        const rows = ((await get("/v1/people/overtime", { query: { outlet: id(w.outlet), from: addDays(env.asOf, w.from_offset), to: addDays(env.asOf, w.to_offset) } })).rows as J[]).filter((r) => staffRows.some((x) => x.staff_id === r.staff_id));
        // These helpers work only the rostered slot, so every attended minute is surplus to the demand and none is overtime.
        if (sum(rows.map((r) => r.extra_min)) !== 0 || sum(rows.map((r) => r.attended_min)) !== sum(rows.map((r) => r.rostered_min))) throw new Error("an extra helper worked outside the roster");
        const cost = sum(rows.map((r) => (r.attended_min as number) * (staffRows.find((x) => x.staff_id === r.staff_id)!.wage_rate_minor as number)));
        return { got: div(cost, 60, "excess cost"), detail: `${sum(rows.map((r) => r.attended_min))} attended minutes over ${rows.length} staff-weeks` };
      }
      case "coupon_cap_evasion": {
        const customersOf = async (q: string) => ((await get("/v1/customers", { query: { q, limit: "50" } })).customers as J[]);
        const usesOf = async (cid: string) => ((await get("/v1/customers/{id}/coupon-uses", { path: { id: cid } })).coupon_uses as J[]).filter((u) => u.coupon_id === id(w.coupon));
        const mine = (await customersOf(w.phone.replace(/\D/g, ""))).filter((x) => x.phone === w.phone);
        const uses = (await Promise.all(mine.map((x) => usesOf(x.customer_id as string)))).flat().sort((a, b) => (a.at < b.at ? -1 : 1));
        if (mine.length < 2) throw new Error(`${mine.length} customer records share the phone`);
        // The decoys: other phones, one use each, inside the cap, so the phone with several records is the only one over.
        const decoys = (await customersOf(w.decoy_q)).filter((x) => x.phone !== w.phone);
        const decoyUses = (await Promise.all(decoys.map((x) => usesOf(x.customer_id as string)))).flat();
        if (decoys.length < 20 || decoyUses.length > decoys.length) throw new Error(`${decoys.length} decoy customers with ${decoyUses.length} uses`);
        const coupon = (await allPages("/v1/catalogue/coupons")).filter((c) => c.coupon_id === id(w.coupon));
        if (coupon.length !== 1) throw new Error(`${coupon.length} coupons ${w.coupon}`);
        const cap = coupon[0]!.per_customer_cap as number;
        sameAsKey("the coupon's per-customer cap", cap, w.per_customer_cap);
        return { got: sum(uses.slice(cap).map((u) => u.discount_minor)), detail: `${uses.length} uses by ${mine.length} records of one phone; ${decoys.length} other phones` };
      }
      case "no_marketing_consent": {
        let consenting = 0;
        for (const phone of w.phones as string[]) {
          const found = ((await get("/v1/customers", { query: { q: phone.replace(/\D/g, ""), limit: "50" } })).customers as J[]).filter((x) => x.phone === phone);
          if (found.length !== 1) throw new Error(`${found.length} customers with phone ${phone}`);
          if (found[0]!.consent.email === true || found[0]!.consent.sms === true) consenting++;
        }
        return { got: consenting, detail: `of ${(w.phones as string[]).length} regulars` };
      }
      case "event_ahead": {
        const outletId = id(w.outlet);
        const signals: J[] = [];
        for (const run of (await get("/v1/imports/runs")).runs as J[]) {
          if (run.kind !== "market_signal" || run.status !== "committed") continue;
          for (const r of (await get("/v1/imports/runs/{id}/rows", { path: { id: run.import_run_id } })).staged as J[]) if (r.data.outlet_id === outletId) signals.push(r.data);
        }
        const mine = signals.filter((x) => x.kind === w.kind && x.label === w.label);
        const past = mine.filter((x) => x.on_date < env.asOf).map((x) => x.on_date as string);
        const ahead = mine.filter((x) => x.on_date >= env.asOf && x.on_date <= addDays(env.asOf, w.lookahead_days)).map((x) => x.on_date as string);
        if (past.length < 2 || ahead.length !== 1) throw new Error(`${past.length} past and ${ahead.length} upcoming occurrences`);
        // Orders and their totals per day at the outlet (completed bills), from the dated history.
        const perDay = new Map<string, { n: number; total: number }>();
        for (const r of (await bills()).filter((x) => x.outlet_id === outletId && x.status === "completed")) {
          const e = perDay.get(r.bill_date) ?? { n: 0, total: 0 };
          e.total += r.line_total_minor;
          perDay.set(r.bill_date, e);
        }
        for (const r of uniqueBills((await bills()).filter((x) => x.outlet_id === outletId && x.status === "completed"))) perDay.get(r.bill_date)!.n++;
        const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
        const marked = new Set(signals.map((x) => x.on_date as string));
        const base = [...perDay.keys()].filter((d) => weekday(d) === weekday(ahead[0]!) && !marked.has(d) && d < env.asOf);
        const sN = sum(past.map((d) => perDay.get(d)!.n));
        const bN = sum(base.map((d) => perDay.get(d)!.n));
        const uplift = rdiv((sN * base.length - bN * past.length) * 10000, bN * past.length);
        if (Math.abs(uplift) < 2000) throw new Error(`past effect ${uplift} bp is below the detector's 2,000`);
        const baselineSales = rdiv(sum(base.map((d) => perDay.get(d)!.total)), base.length);
        return { got: rdiv(baselineSales * Math.abs(uplift), 10000), detail: `${past.length} past ${w.label} days, uplift ${uplift} bp on ${base.length} normal days, baseline sales ${baselineSales}` };
      }
      case "level_shift": {
        const from = addDays(env.asOf, w.shift_offset - w.window_days);
        const shiftDay = addDays(env.asOf, w.shift_offset);
        const bs = uniqueBills((await bills()).filter((x) => x.outlet_id === id(w.outlet) && x.status === "completed"));
        const pre = bs.filter((x) => x.bill_date >= from && x.bill_date < shiftDay).length;
        const post = bs.filter((x) => x.bill_date >= shiftDay && x.bill_date < env.asOf).length;
        return { got: rdiv((post - pre) * 10000, pre), detail: `${pre} orders in the ${w.window_days} days before, ${post} after` };
      }
      case "coupon_discount": {
        const os = await Promise.all((w.orders as string[]).map(order));
        if (os.some((o) => o.discount_minor <= 0)) throw new Error("an order carries no discount");
        return { got: sum(os.map((o) => o.discount_minor)), detail: `${os.length} discounted orders` };
      }
      case "amc_waste": {
        const asset = id(w.asset);
        const amcs = (await get("/v1/compliance/amcs", { query: { asset } })).items as J[];
        const done = ((await get("/v1/compliance/maintenance", { query: { asset, status: "done" } })).items as J[]).filter((m) => m.kind === "breakdown");
        const billed = done.filter((m) => m.amc_id === null && amcs.some((a) => a.valid_from <= m.done_on && m.done_on <= a.valid_to));
        return { got: sum(billed.map((m) => m.cost_minor)), detail: `${billed.length} repairs billed inside a valid AMC` };
      }
      case "amc_overlap": {
        const [a, b] = ((await get("/v1/compliance/amcs", { query: { asset: id(w.asset) } })).items as J[]).sort((x, y) => (x.valid_from < y.valid_from ? -1 : 1)) as [J, J];
        const start = a.valid_to < b.valid_from ? null : b.valid_from > a.valid_from ? b.valid_from : a.valid_from;
        if (!start) throw new Error("the AMCs do not overlap");
        const end = a.valid_to < b.valid_to ? a.valid_to : b.valid_to;
        const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
        return { got: div(days * a.cost_minor, 365, "overlap cost"), detail: `${days} days` };
      }
      case "missed_logs": {
        const runs = (await get("/v1/compliance/checklist-runs", { query: { outlet: id(w.outlet), checklist: id(w.checklist), from: addDays(env.asOf, w.from_offset), to: addDays(env.asOf, w.to_offset), limit: "500" } })).items as J[];
        return { got: new Set(runs.map((r) => r.business_date)).size, detail: `of ${w.days} days` };
      }
      case "above_mrp": {
        const menu = (await get("/v1/catalogue/menu", { query: { outlet: id(w.outlet), channel_kind: "counter" } })).entries as J[];
        const e = menu.find((x) => x.item_id === id(w.item));
        if (!e) throw new Error("item is not on the counter menu");
        if (e.tax_class !== "goods_exempt") throw new Error("the recompute compares the untaxed shelf price; use a tax-exempt SKU");
        const b = await batchOf(w.outlet, w.ingredient, w.batch);
        const onhand = sum((await movements(w.outlet, w.ingredient)).filter((m) => m.batch_id === b.batch_id).map((m) => m.qty_milli));
        return { got: div((e.price_minor - b.mrp.amount_minor) * onhand, 1000, "above MRP"), detail: `shelf ${e.price_minor} vs batch MRP ${b.mrp.amount_minor} on ${onhand / 1000} units` };
      }
      case "expired_batch":
      case "expiry_risk": {
        const b = await batchOf(w.outlet, w.ingredient, w.batch);
        const mv = await movements(w.outlet, w.ingredient);
        const days = Math.round((Date.parse(b.expires_on) - Date.parse(env.asOf)) / 86_400_000);
        if (p.kind === "expired_batch" ? days >= 0 : days < 0 || days > w.within_days) throw new Error(`batch expires in ${days} days`);
        const onhand = sum(mv.filter((m) => m.batch_id === b.batch_id).map((m) => m.qty_milli));
        return { got: div(onhand * unitCost(mv), 1000, "stock at risk"), detail: `${onhand / 1000} units, expires in ${days} days` };
      }
      case "shrinkage": {
        const b = await batchOf(w.outlet, w.ingredient, w.batch);
        const mv = (await movements(w.outlet, w.ingredient));
        const adj = -sum(mv.filter((m) => m.kind === "count_adjust" && m.batch_id === b.batch_id).map((m) => m.qty_milli));
        const onhand = sum(mv.filter((m) => m.batch_id === b.batch_id).map((m) => m.qty_milli));
        const pct = Math.round((adj * 10000) / (onhand + adj));
        if (pct !== w.pct_bp) throw new Error(`short by ${pct} bp, key says ${w.pct_bp}`);
        return { got: div(adj * unitCost(mv), 1000, "shrinkage"), detail: `${adj / 1000} units short (${pct} bp)` };
      }
      case "remake_voids": {
        const rows = (await billsWithPrefix(w.bill_prefix)).filter((r) => r.status === "completed" && r.void_reason === "remake");
        return { got: sum(rows.map((r) => r.line_total_minor)), detail: `${rows.length} remade lines written off` };
      }
      case "refund_burst": {
        const bs = uniqueBills(await billsWithPrefix(w.bill_prefix)).filter((r) => r.refund_minor > 0);
        return { got: sum(bs.map((r) => r.refund_minor)), detail: `${bs.length} refunded bills` };
      }
      case "void_burst": {
        const rows = (await billsWithPrefix(w.bill_prefix)).filter((r) => r.status === "cancelled");
        return { got: sum(rows.map((r) => r.line_total_minor)), detail: `${uniqueBills(rows).length} voided bills` };
      }
      case "line_discount": {
        const rows = (await billsWithPrefix(w.bill_prefix)).filter((r) => r.line_discount_minor > 0);
        return { got: sum(rows.map((r) => r.line_discount_minor)), detail: `${uniqueBills(rows).length} discounted bills` };
      }
      case "lapsed_regulars": {
        const all = await bills();
        const from = addDays(env.asOf, w.from_offset);
        const to = addDays(env.asOf, w.to_offset);
        const silentBefore = addDays(env.asOf, w.silent_since_offset);
        let spend = 0;
        for (const phone of w.phones as string[]) {
          const found = ((await get("/v1/customers", { query: { q: phone.replace(/\D/g, ""), limit: "50" } })).customers as J[]).filter((x) => x.phone === phone);
          if (found.length !== 1) throw new Error(`${found.length} customers with phone ${phone}`);
          const mine = uniqueBills(all.filter((r) => r.customer_id === found[0]!.customer_id && r.status === "completed"));
          const last = mine.map((r) => r.bill_date as string).sort().at(-1);
          if (!last || last >= silentBefore) throw new Error(`customer ${phone} ordered ${last ?? "never"}, not silent since ${silentBefore}`);
          spend += sum(all.filter((r) => r.customer_id === found[0]!.customer_id && r.status === "completed" && r.bill_date >= from && r.bill_date <= to).map((r) => r.line_total_minor));
        }
        return { got: spend, detail: `${(w.phones as string[]).length} regulars silent since ${silentBefore}` };
      }
      default:
        throw new Error(`no recompute for kind ${p.kind}`);
    }
  };

  const out: Result[] = [];
  for (const p of key.problems) {
    try {
      const { got, detail } = await run(p);
      const want = p.metric ? p.metric.value : p.impact_minor;
      out.push({ id: p.id, ok: got === want, expected: want, got, detail });
    } catch (e) {
      out.push({ id: p.id, ok: false, expected: p.metric ? p.metric.value : p.impact_minor, got: null, detail: `ERROR ${(e as Error).message}` });
    }
  }
  return out;
}
