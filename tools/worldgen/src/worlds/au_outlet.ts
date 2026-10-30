// au_outlet: a synthetic café in Melbourne (AU). The 14-day window crosses the October daylight-saving change,
// so every local time goes through the tz module. Impacts are in cents of AUD. Conventions as restaurant_group.ts;
// the hand-kept key is answer-key/au_outlet.json. AU payroll is out of scope (roster-only pack), so no payroll plant.
import type { Ctx } from "../ctx.ts";
import { payoutFile, type PayoutLine } from "../files.ts";
import { customers, Plan, type PBill, type Waste } from "../history.ts";
import * as k from "../kit.ts";
import { addDays, at, atPlus, daysBetween, mondayOf } from "../time.ts";

const KINDS = ["counter", "table_qr", "own_site", "aggregator:ubereats", "aggregator:doordash"];

export const meta = { tz: "Australia/Melbourne", currency: "AUD", personas: ["owner"] } as const;

export async function build(c: Ctx): Promise<void> {
  const { asOf: A } = c;
  const D = (n: number) => addDays(A, -n);
  const biz = await k.onboard(c, {
    kind: "restaurant", country: "AU", business: "Laneway Cafe (synthetic)", ownerName: "Mia Thompson (synthetic)",
    outlet: { name: "Laneway Cafe Fitzroy", address: "5 Synthetic Lane, Fitzroy VIC (synthetic)", tz: "Australia/Melbourne", taxIds: { ABN: "12345678901" } },
  });
  c.s.currency = biz.currency;
  const o = biz.outlets[0]!;
  const tz = o.tz;
  const histFrom = D(c.days + 2);
  const stockAt = at(D(c.days + 1), "08:00", tz);
  // The café's manager (the compliance task's assignee, pack §6), invited; not signed in yet.
  await k.invite(c, "manager", "Grace Wilson (synthetic)", "manager", [o.id]);

  const milk = await k.ingredient(c, "milk", "Milk", "l", { shelfDays: 7 });
  const beans = await k.ingredient(c, "beans", "Coffee beans", "kg");
  const avocado = await k.ingredient(c, "avocado", "Avocado", "pc", { shelfDays: 5 });
  const bread = await k.ingredient(c, "bread", "Sourdough loaf", "pc", { shelfDays: 3 });
  const cream = await k.ingredient(c, "cream", "Cream", "l", { shelfDays: 6 });
  const cups = await k.ingredient(c, "cups", "Takeaway cups", "pc");
  const menu: k.MenuSpec[] = [
    { key: "flat_white", category: "coffee", priceMinor: 480, taxClass: "gst_10", recipe: [[milk, 200], [beans, 18]],
      display: { name: "Flat White", description: "Double ristretto with silky steamed milk.", diet: "veg" } },
    { key: "latte", category: "coffee", priceMinor: 500, taxClass: "gst_10", recipe: [[milk, 250], [beans, 18]],
      display: { name: "Latte", description: "Espresso with steamed milk and a thin layer of foam.", diet: "veg" } },
    { key: "avocado_toast", category: "food", priceMinor: 1850, taxClass: "gst_10", recipe: [[avocado, 1], [bread, 1]],
      display: { name: "Smashed Avocado on Sourdough", description: "Avocado, lemon and chilli flakes on toasted sourdough.", diet: "vegan" } },
  ];
  const items = await k.menu(c, biz, menu, KINDS, histFrom);

  // ---- dated history (R44b): six months of bills and waste through the approved-import path, planted problems at their natural dates ----
  const people = await customers(c, "AU", 20, 5);
  const bill = (no: string, date: string, lines: PBill["lines"], o2: Partial<PBill> = {}): PBill =>
    ({ no, date, time: "09:10", outlet: 0, channel: "counter", type: "dine_in", lines, tender: "card", ...o2 });
  const planted: PBill[] = [];
  const plantedWaste: Waste[] = [];
  // AU-K3: 12 avocados thrown out as overprep, in three logs. AU-A1: 12 l of cream binned after the fridge excursion.
  for (const n of [5, 4, 3]) plantedWaste.push({ date: D(n), time: "17:30", outlet: 0, ing: avocado, qtyMilli: 4000, reason: "overprep" });
  plantedWaste.push({ date: D(1), time: "16:30", outlet: 0, ing: cream, qtyMilli: 12000, reason: "temperature" });
  // AU-F3: fifteen doordash office orders of eight lattes (A$40, GST inside), 7 to 2 days back; no avocado (AU-K3 is avocado overprep in that week).
  // DD-SHORT below pays them short.
  for (let i = 0; i < 15; i++) planted.push(bill(`DD-SH-${i + 1}`, D(7 - (i % 6)), [{ item: "latte", qty: 8 }], { channel: "aggregator:doordash", type: "delivery", time: "08:40" }));
  if (c.days >= 55) {
    // AU-K2 (pack K2: 3% of orders for 4 weeks): sixteen remakes of avocado toast (a line written off as `remake`), four in each ISO week from
    // Mon 17 Aug to Fri 11 Sep (W34-W37, ~145-175 orders a week).
    for (const [i, n] of [54, 52, 50, 49, 47, 45, 43, 42, 40, 38, 36, 35, 33, 31, 30, 29].entries()) {
      planted.push(bill(`AU-K2-${i + 1}`, D(n), [{ item: "avocado_toast", qty: 1, voidReason: "remake" }, { item: "latte", qty: 1 }]));
    }
  }
  if (c.days >= 40) {
    // AU-K7: 24 sourdough loaves thrown out as expired, six a day Mon 14 to Thu 17 Sep (26 to 23 days back, one ISO week); it normally wastes none.
    for (const n of [26, 25, 24, 23]) plantedWaste.push({ date: D(n), time: "17:45", outlet: 0, ing: bread, qtyMilli: 6000, reason: "expired" });
    // AU-F9: seven full card refunds of two avocado toasts in seven days (16 to 10 days back), `wrong_item`.
    for (const [i, n] of [16, 15, 14, 13, 12, 11, 10].entries()) planted.push(bill(`AU-F9-${i + 1}`, D(n), [{ item: "avocado_toast", qty: 2 }], { time: "12:20", refund: { minor: "full", mode: "card", reason: "wrong_item" } }));
  }
  if (c.days >= 92) {
    // AU-G4: five weekly regulars, eight orders each (91 to 35 days back), none since.
    for (const [r, phone] of people.regulars.entries()) for (let i = 0; i < 8; i++) {
      planted.push(bill(`AU-G4-${r + 1}-${i + 1}`, D(35 + 7 * i), [{ item: "flat_white", qty: 1 }, { item: "avocado_toast", qty: 1 }], { phone, time: "08:05" }));
    }
  }
  const plan = new Plan(c, {
    prefix: "LC", inclusive: true, hours: [7, 14], phones: people.pool, planted, plantedWaste,
    outlets: [{ outlet: o, perDay: [14, 22] }],
    channels: [
      { kind: "counter", w: 35, types: ["dine_in", "takeaway"] }, { kind: "table_qr", w: 20, types: ["dine_in"] }, { kind: "own_site", w: 10, types: ["pickup"] },
      { kind: "aggregator:ubereats", w: 18, types: ["delivery"] }, { kind: "aggregator:doordash", w: 17, types: ["delivery"] },
    ],
    items: menu.map((m) => ({ key: m.key, priceMinor: m.priceMinor, taxClass: m.taxClass, w: m.key === "avocado_toast" ? 3 : 5, recipe: m.recipe })),
    waste: [{ outlet: 0, ing: milk, qtyMilli: [1000, 4000] }, { outlet: 0, ing: beans, qtyMilli: [100, 300] }],
    // AU-FC2b: a new office opens nearby and the café's orders rise by 30% from 28 days back.
    dayFactor: (d) => (c.days >= 57 && d >= D(28) ? 1.3 : 1),
  });
  await k.openingStock(c, "open", o.id, stockAt, [
    { ing: milk, qtyMilli: 400000 + plan.need(0, milk), costMinor: 200 }, { ing: beans, qtyMilli: 20000 + plan.need(0, beans), costMinor: 3200 },
    { ing: avocado, qtyMilli: 100000 + plan.need(0, avocado), costMinor: 250 }, { ing: bread, qtyMilli: 40000 + plan.need(0, bread), costMinor: 450 },
    // Cream is no dish's ingredient: stock only what AU-A1 bins, so no unsold cream lingers as dead stock.
    { ing: cream, qtyMilli: plan.need(0, cream), costMinor: 600 }, { ing: cups, qtyMilli: 120000, costMinor: 12 },
  ]);
  const dairy = await k.supplier(c, "dairy", "Fresh Farms Wholesale");
  const roaster = await k.supplier(c, "roaster", "Metro Grain Traders");

  // AU-I2: beans invoiced 200 cents/kg above the PO on 50 kg.
  const po = await k.purchaseOrder(c, "beans", roaster, o.id, D(6), [{ ing: beans, qtyMilli: 50000, priceMinor: 3200 }]);
  await k.goodsReceived(c, "beans", roaster, o.id, po.id, at(D(5), "07:00", tz), [{ ing: beans, qtyMilli: 50000, costMinor: null, poLine: po.lines[0]! }]);
  await k.invoice(c, "beans-over", roaster, "MG-880", D(5), po.id, [{ ing: beans, qtyMilli: 50000, priceMinor: 3400, poLine: po.lines[0]! }]);
  c.plant("AU-I2");
  // AU-I1: milk +12% (200 to 224 cents a litre), three deliveries each side, 300 l a time.
  for (const [tag, day, p] of [["pre1", 13, 200], ["pre2", 11, 200], ["pre3", 9, 200], ["post1", 5, 224], ["post2", 3, 224], ["post3", 1, 224]] as const) {
    await k.goodsReceived(c, `milk-${tag}`, dairy, o.id, null, at(D(day), "06:30", tz), [{ ing: milk, qtyMilli: 300000, costMinor: p, poLine: null }]);
    await k.invoice(c, `milk-${tag}`, dairy, `FF-M-${tag}`, D(day), null, [{ ing: milk, qtyMilli: 300000, priceMinor: p, poLine: null }]);
  }
  c.plant("AU-I1");
  c.plant("AU-K3"); // 12 avocados thrown out as overprep: dated history above
  // AU-A1: the milk fridge reads 7–9 C three times a day for two days; 12 l of cream is binned.
  const fridge = await k.asset(c, "fridge1", o.id, "chiller", "Under-bench fridge (synthetic)", 1, 4);
  for (const day of [3, 2, 1]) {
    for (const [slot, hhmm] of [["a", "07:00"], ["b", "11:00"], ["c", "15:00"]] as const) {
      const milli = day <= 2 ? { a: 7000, b: 8000, c: 9000 }[slot] : 3000;
      await k.tempLog(c, `fridge1:${day}:${slot}`, o.id, fridge, milli, at(D(day), hhmm, tz));
    }
  }
  c.plant("AU-A1");
  // AU-A5: the council food-business registration runs out in 25 days.
  await k.licence(c, "foodreg", o.id, "food_business_registration", "FBR-SYN-1187", "Synthetic City Council", D(340), addDays(A, 25));
  c.plant("AU-A5");
  // AU-S1: 120 takeaway cups on hand against a minimum of 200.
  await k.reorderLevel(c, o.id, cups, 200000, 400000);
  c.plant("AU-S1");

  // AU-P1 (pack P1: +45 min on 70% of shifts): a barista clocks out 45 minutes late on 18 of the 26 shifts from 26 days back (3, 5, 5 and 5 of
  // them: at the gate's Sat 10 Oct, the four ISO weeks Mon 14 Sep - Fri 9 Oct, across the October DST change; rostered 07:00–15:00, Melbourne
  // time). Planted only when attendance reaches that far.
  const liam = await k.staff(c, "liam", "Liam Nguyen (synthetic)", o.id, "barista", 3000, "2025-02-01");
  const zoe = await k.staff(c, "zoe", "Zoe Brown (synthetic)", o.id, "barista", 3000, "2025-02-01");
  const p1 = c.liveDays >= 26;
  const p1From = D(26);
  const lateDays = new Set([1, 3, 5, 7, 8, 10, 11, 13, 14, 15, 17, 18, 20, 21, 22, 23, 24, 25]);
  const winFrom = D(c.liveDays);
  for (let w = mondayOf(winFrom); w <= D(1); w = addDays(w, 7)) {
    const shifts = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(w, i);
      if (d >= winFrom && d <= D(1)) for (const s of [liam, zoe]) shifts.push({ staff: s, date: d, start: "07:00", end: "15:00", role: "barista" });
    }
    if (shifts.length) await k.roster(c, `${w}`, o, w, shifts, (d, t) => at(d, t, tz));
  }
  for (const s of [liam, zoe]) {
    for (let d = winFrom; d <= D(1); d = addDays(d, 1)) {
      const late = p1 && s.key === "liam" && d >= p1From && lateDays.has(daysBetween(p1From, d));
      await k.attend(c, o, s, d, at(d, "07:00", tz), atPlus(d, "15:00", late ? 45 : 0, tz));
    }
  }
  if (p1) c.plant("AU-P1");


  // ---- finance ----
  const uber = biz.channels["aggregator:ubereats"]!;
  const door = biz.channels["aggregator:doordash"]!;
  const termsFrom = D(c.days + 30);
  await k.channelTerms(c, "ubereats", uber, { commissionBp: 2500, ads: false, capMinor: null, promoBp: 0, cycleDays: 7, from: termsFrom });
  await k.channelTerms(c, "doordash", door, { commissionBp: 2500, ads: false, capMinor: null, promoBp: 0, cycleDays: 7, from: termsFrom });
  // Clean history first, so the planted payout files below are the newest import runs (the runs list is capped at 100).
  plan.queue();
  await k.history(c, {
    payouts: [
      { layout: "ubereats", prefix: "UE-C", outlet: o, commissionBp: 2500, withholdsTax: false, bills: (f, t) => plan.aggregatorBills(0, "aggregator:ubereats", f, t) },
      { layout: "doordash", prefix: "DD", outlet: o, commissionBp: 2500, withholdsTax: false, bills: (f, t) => plan.aggregatorBills(0, "aggregator:doordash", f, t) },
    ],
    temp: { outlet: o, assetId: fridge, assetKey: "fridge1", milliC: 3000, hhmm: "07:00" }, rent: { outlet: o, amountMinor: 450000 },
  });
  const line = (ref: string, date: string, gross: number): PayoutLine => ({ kind: "order", orderRef: ref, orderDate: date, gross, commission: (gross * 2500) / 10000, ad: 0, promo: 0, tax: 0 });
  const ads = (date: string, ad: number): PayoutLine => ({ kind: "ads", orderRef: "", orderDate: date, gross: 0, commission: 0, ad, promo: 0, tax: 0 });
  // AU-F1: channel aggregator:ubereats ads are not opted in; two statements carry marketing lines (A$80 + A$95).
  for (const [ref, from, to, paid, adAmt] of [["UE-C1", D(13), D(7), D(5), 8000], ["UE-C2", D(6), D(1), D(0), 9500]] as const) {
    const lines: PayoutLine[] = [];
    for (let i = 0; i < 5; i++) lines.push(line(`${ref}-${i + 1}`, addDays(from, i), 3200 + i * 400));
    lines.push(ads(to, adAmt));
    await k.importFile(c, ref, "payout_statement", `${ref}.csv`, payoutFile("ubereats", { ref, outlet: o.name, from, to, paidOn: paid }, lines));
  }
  c.plant("AU-F1");
  // AU-F3: channel aggregator:doordash takes 30% against a contracted 25% on its 15 planted orders of A$40 (dated history above): 1,200 against
  // 1,000 a line. The merchant collects the GST (no withholding), so core's short is the commission excess.
  {
    const lines = k.shortLines(plan.aggregatorBills(0, "aggregator:doordash", D(7), D(2)), "DD-SH-", 15, 2500, 200, false);
    await k.importFile(c, "DD-SHORT", "payout_statement", "DD-SHORT.csv", payoutFile("doordash", { ref: "DD-SHORT", outlet: o.name, from: D(7), to: D(2), paidOn: D(1) }, lines));
  }
  c.plant("AU-F3");
  await k.flushImports(c);
  if (c.days >= 55) c.plant("AU-K2");
  if (c.days >= 40) for (const id of ["AU-K7", "AU-F9"]) c.plant(id);
  if (c.days >= 92) c.plant("AU-G4");
  if (c.days >= 57) c.plant("AU-FC2b");

  // ---- sales and the drawer (server-stamped: seed day) ----
  for (let i = 0; i < 3; i++) await k.placeOrder(c, `ord:table:${i}`, biz, o, "table_qr", "dine_in", [{ item: items.avocado_toast!, qtyMilli: 1000 }, { item: items.latte!, qtyMilli: 1000 }], { table: `T${i + 1}` });
  await k.placeOrder(c, "ord:site:0", biz, o, "own_site", "pickup", [{ item: items.flat_white!, qtyMilli: 2000 }]);
  await k.placeOrder(c, "ord:ue:0", biz, o, "aggregator:ubereats", "delivery", [{ item: items.avocado_toast!, qtyMilli: 1000 }], { externalRef: "UE-LIVE-0" });
  // AU-X1: the drawer opens with A$200, takes four cash sales of A$9.60, and is counted A$5 short.
  await k.shiftOpen(c, "shift:au1", o, 20000);
  for (let i = 0; i < 4; i++) {
    await k.placeOrder(c, `ord:cash:${i}`, biz, o, "counter", "takeaway", [{ item: items.flat_white!, qtyMilli: 2000 }]);
    await k.tenderCash(c, `tender:cash:${i}`, `ord:cash:${i}`, 1000);
  }
  await k.shiftClose(c, "shift:au1", 23340);
  c.plant("AU-X1");
}
