// restaurant_group: a synthetic three-outlet restaurant group (IN). Every number below that a problem's ₹ impact
// depends on is a literal here AND in answer-key/restaurant_group.json (typed by hand; the verifier recomputes it
// from what the API returns). All people, businesses and suppliers are invented. Simulated suppliers are labelled.
import type { Ctx } from "../ctx.ts";
import { bankFile, payoutFile, signalFile, type PayoutLine } from "../files.ts";
import { customers, Plan, priceLine, type PBill, type Waste } from "../history.ts";
import * as k from "../kit.ts";
import { addDays, at, atPlus, businessToday, daysBetween, isoWeekday, mondayOf, monthStartBefore } from "../time.ts";

const KINDS = ["counter", "table_qr", "own_site", "aggregator:swiggy", "aggregator:zomato"];
const FSSAI = ["11111111111111", "22222222222222", "33333333333333"];

/** What the runner needs before the world exists: the home zone and currency (plan mode), and the personas that sign in. */
export const meta = { tz: "Asia/Kolkata", currency: "INR", personas: ["owner", "manager"] } as const;

// September is calibrated 7% busier than August so that the month pair's volume effect nets out near zero and the planted drivers carry the fall.
const SEPT_FACTOR = 1.0625;
const CAL_ORDINARY = 9;
/** RG-F5: the days (from the period month's first) South's bank credits fall short: three in each of three ISO weeks (Mon 7, 14 and 21 Sep), since tender_gap needs 3 days a week. */
const F5_DAYS = [6, 8, 10, 13, 15, 17, 20, 22, 24] as const;

export async function build(c: Ctx): Promise<void> {
  const { asOf: A } = c;
  const D = (n: number) => addDays(A, -n);
  const biz = await k.onboard(c, {
    kind: "restaurant", country: "IN", business: "Spice Route Group (synthetic)", ownerName: "Asha Rao (synthetic)",
    outlet: { name: "Spice Route North", address: "1 Synthetic Road, Bengaluru (synthetic)", taxIds: { GSTIN: "29ABCDE1234F1Z5", FSSAI: FSSAI[0]! } },
    more: [
      { name: "Spice Route Central", address: "2 Synthetic Road, Bengaluru (synthetic)", kind: "restaurant", taxIds: { GSTIN: "29ABCDE1234F1Z5", FSSAI: FSSAI[1]! } },
      { name: "Spice Route South", address: "3 Synthetic Road, Bengaluru (synthetic)", kind: "restaurant", taxIds: { GSTIN: "29ABCDE1234F1Z5", FSSAI: FSSAI[2]! } },
    ],
  });
  c.s.currency = biz.currency;
  const [o1, o2, o3] = biz.outlets as [k.OutletInfo, k.OutletInfo, k.OutletInfo];
  const tz = o1.tz;
  const histFrom = D(c.days + 2);
  // One manager per outlet (the compliance task's assignee, pack §6): Meera runs South and signs in (she closes RG-X1's drawer); North's and
  // Central's managers are invited and have not signed in yet.
  await k.person(c, "manager", "Meera Iyer (synthetic)", "manager", [o3.id]);
  await k.invite(c, "manager_north", "Arjun Pillai (synthetic)", "manager", [o1.id]);
  await k.invite(c, "manager_central", "Farah Qureshi (synthetic)", "manager", [o2.id]);

  // ---- ingredients, menu, suppliers ----
  const paneer = await k.ingredient(c, "paneer", "Paneer", "kg", { shelfDays: 7 });
  const tomato = await k.ingredient(c, "tomato", "Tomato", "kg", { shelfDays: 6 });
  const chicken = await k.ingredient(c, "chicken", "Chicken", "kg", { shelfDays: 4 });
  const rice = await k.ingredient(c, "rice", "Basmati rice", "kg");
  const oil = await k.ingredient(c, "oil", "Cooking oil", "l");
  const boxes = await k.ingredient(c, "boxes", "Takeaway boxes", "pc");
  // The margin-fall month pair (T-086, ADR-014 §7.5): the calendar month before as-of's month against the one before it, planted only when the
  // timeline reaches the earlier month's first day. Every plant below is placed by day-of-month, so it holds for any as-of.
  const cm0 = monthStartBefore(A, 2);
  const pm0 = monthStartBefore(A, 1);
  const margin = daysBetween(cm0, A) <= c.days;
  const prawns = margin ? await k.ingredient(c, "prawns", "Prawns", "kg", { shelfDays: 3 }) : null;
  const lamb = margin ? await k.ingredient(c, "lamb", "Lamb", "kg", { shelfDays: 4 }) : null;
  const mushroom = margin ? await k.ingredient(c, "mushroom", "Mushroom", "kg", { shelfDays: 4 }) : null;
  const menu: k.MenuSpec[] = [
    { key: "paneer_tikka", category: "starters", priceMinor: 28000, taxClass: "restaurant_5", recipe: [[paneer, 150], [oil, 10]],
      display: { name: "Paneer Tikka", description: "Cottage cheese cubes marinated in spiced yoghurt, charred in the tandoor.", diet: "veg" } },
    { key: "butter_chicken", category: "mains", priceMinor: 36000, taxClass: "restaurant_5", recipe: [[chicken, 200], [tomato, 100]],
      display: { name: "Butter Chicken", description: "Tandoor chicken simmered in a mild tomato and butter gravy.", diet: "non_veg" } },
    { key: "veg_biryani", category: "mains", priceMinor: 24000, taxClass: "restaurant_5", recipe: [[rice, 150], [oil, 10]],
      display: { name: "Veg Biryani", description: "Basmati rice layered with seasonal vegetables and whole spices.", diet: "veg" } },
  ];
  // Dishes only planted bills sell (weight 0 in the baseline draw), so their numbers are arithmetic, not counts of random bills.
  const extra: k.MenuSpec[] = margin ? [
    { key: "prawn_masala", category: "mains", priceMinor: 52000, taxClass: "restaurant_5", recipe: [[prawns!, 200]],
      display: { name: "Prawn Masala", description: "Prawns in a coastal onion and kokum masala.", diet: "non_veg" } },
    { key: "lamb_curry", category: "mains", priceMinor: 24000, taxClass: "restaurant_5", recipe: [[lamb!, 300]],
      display: { name: "Lamb Curry", description: "Slow-cooked lamb in a cardamom and black pepper gravy.", diet: "non_veg" } },
    { key: "chef_special", category: "mains", priceMinor: 30000, taxClass: "restaurant_5", recipe: [], display: { name: "Chef's Special" } }, // RG-C5: sold, never given a recipe
  ] : [];
  const items = await k.menu(c, biz, [...menu, ...extra], KINDS, histFrom);
  const stockAt = at(D(c.days + 1), "08:00", tz);
  // RG-C6 trap: mushroom costs 9% more from D(10), and the owner raises the dish's price from D(9): the cost move is already in the price.
  const risottoPriceDay = D(9);
  if (margin) {
    const risotto = await k.item(c, "mushroom_risotto", { category: "mains",
      display: { name: "Mushroom Risotto", description: "Arborio rice stirred with mushrooms and parmesan.", diet: "veg" } });
    await k.recipe(c, risotto, histFrom, [{ ing: mushroom!, qtyMilli: 250 }]);
    for (const o of biz.outlets) for (const kind of KINDS) {
      await k.price(c, risotto, o.id, kind, 36000, "restaurant_5", histFrom, { tag: "old" });
      await k.price(c, risotto, o.id, kind, 39000, "restaurant_5", risottoPriceDay, { tag: "new" });
    }
  }

  // ---- dated history: six months of bills and waste through the approved-import path (R44b), planted problems at their natural dates ----
  const people = await customers(c, "IN", 24, 6);
  const R = people.regulars;
  const bill = (no: string, date: string, outlet: number, lines: PBill["lines"], o: Partial<PBill> = {}): PBill =>
    ({ no, date, time: "13:10", outlet, channel: "counter", type: "takeaway", lines, tender: "upi", ...o });
  const planted: PBill[] = [];
  const plantedWaste: Waste[] = [];
  // RG-F4: six zomato orders at Central that appear in no payout file (inside the planted window, where no baseline aggregator bill exists).
  for (const [i, n] of [12, 10, 9, 6, 5, 3].entries()) planted.push(bill(`ZM-MISS-${i}`, D(n), 1, [{ item: "paneer_tikka", qty: 1 }], { channel: "aggregator:zomato", type: "delivery", time: "20:15" }));
  // RG-F3: twenty zomato orders at Central of two veg biryani (48,000 + 5% GST = 50,400), on the days 7 to 2 back that are not a Friday or a Saturday
  // (RG-M1/M1b measure Central's normal Fridays and Saturdays); no paneer (RG-C1 counts Central's paneer dishes). ZM-C-SHORT below pays them short.
  const f3Days = Array.from({ length: 6 }, (_, i) => D(7 - i)).filter((d) => isoWeekday(d) < 5 || isoWeekday(d) === 7);
  for (let i = 0; i < 20; i++) planted.push(bill(`ZM-C-SH-${i + 1}`, f3Days[i % f3Days.length]!, 1, [{ item: "veg_biryani", qty: 2 }], { channel: "aggregator:zomato", type: "delivery", time: "19:40" }));
  // RG-K3: 10 kg of chicken wasted as overprep at Central in four logs. RG-A1: 14 kg of paneer binned as temperature waste at North.
  for (const n of [5, 4, 3, 2]) plantedWaste.push({ date: D(n), time: "21:15", outlet: 1, ing: chicken, qtyMilli: 2500, reason: "overprep" });
  plantedWaste.push({ date: D(1), time: "18:30", outlet: 0, ing: paneer, qtyMilli: 14000, reason: "temperature" });
  if (c.days >= 55) {
    // RG-K2 (pack K2: 3% of orders for 4 weeks): thirteen remakes of butter chicken at North (a line written off as `remake`), three or four in each
    // ISO week from Wed 26 Aug to Sat 19 Sep (W35-W38, ~90-130 orders a week). Four fall in August and nine in September, two more of each than
    // the nine this plant had, so the month pair's bridge moves by the same amount in both months.
    for (const [i, n] of [45, 44, 42, 40, 39, 36, 33, 31, 30, 27, 24, 22, 21].entries()) {
      planted.push(bill(`RG-K2-${String(i + 1).padStart(2, "0")}`, D(n), 0, [{ item: "butter_chicken", qty: 1, voidReason: "remake" }, { item: "veg_biryani", qty: 1 }], { tender: "cash" }));
    }
    // RG-F9: eight full refunds of a butter chicken bill at North in eight days (`customer_complaint`, back to UPI).
    for (const [i, n] of [26, 25, 24, 23, 22, 20, 19, 18].entries()) planted.push(bill(`RG-F9-${String(i + 1).padStart(2, "0")}`, D(n), 0, [{ item: "butter_chicken", qty: 1 }], { type: "dine_in", refund: { minor: "full", mode: "upi", reason: "customer_complaint" } }));
    // RG-G7: twelve takeaway bills at Central with a 25% line discount on two butter chicken, every third day from 50 days back.
    for (let i = 0; i < 12; i++) planted.push(bill(`RG-G7-${String(i + 1).padStart(2, "0")}`, D(50 - 3 * i), 1, [{ item: "butter_chicken", qty: 2, discBp: 2500 }]));
    // RG-K7: South wastes 6 kg of rice as overprep on each of four days (30 to 27 days back); it normally wastes none.
    for (const n of [30, 29, 28, 27]) plantedWaste.push({ date: D(n), time: "20:40", outlet: 2, ing: rice, qtyMilli: 6000, reason: "overprep" });
  }
  if (c.days >= 92) {
    // RG-G4: six weekly regulars at North, eight orders each (91 to 35 days back), none since.
    for (const [r, phone] of R.entries()) for (let i = 0; i < 8; i++) {
      planted.push(bill(`RG-G4-${r + 1}-${i + 1}`, D(35 + 7 * i), 0, [{ item: "paneer_tikka", qty: 1 }, { item: "butter_chicken", qty: 1 }], { type: "dine_in", phone, time: "20:05" }));
    }
  }
  // RG-M1 / RG-M1b: Central's orders ran 60% above a normal Friday on two past festival Fridays and 30% below a normal Saturday on three past rainy
  // Saturdays (all in the third month back); the same festival is imported for next Friday and rain for next Saturday. Files are the only inputs a forecast
  // would be given (market_signal imports); the lift itself is in the dated bills.
  const monthDays = Array.from({ length: 31 }, (_, i) => addDays(monthStartBefore(A, 3), i)).filter((d) => d.startsWith(monthStartBefore(A, 3).slice(0, 7)));
  const festivalPast = [monthDays.filter((d) => isoWeekday(d) === 5)[1]!, monthDays.filter((d) => isoWeekday(d) === 5)[3]!];
  const rainPast = monthDays.filter((d) => isoWeekday(d) === 6).slice(1, 4);
  const signals = daysBetween(festivalPast[0]!, A) <= c.days;
  const nextOn = (wd: number) => { let d = addDays(A, 1); while (isoWeekday(d) !== wd) d = addDays(d, 1); return d; };
  const orderOf = (n: string, d: string, oi: number, qty: number, o: Partial<PBill> = {}) => bill(n, d, oi, [{ item: "prawn_masala", qty }], { type: "dine_in", time: "20:00", ...o });
  if (margin) {
    // The compare month (cm0) against the period month (pm0). The same dishes are sold in both; only the planted differences below move the margin.
    const dayOf = (m0: string, n: number) => addDays(m0, n);
    for (const [tag, m0, discBp] of [["A", cm0, 0], ["S", pm0, 5000]] as const) {
      // RG-C3 (history form): 25 two-for-one lamb curry bills at Central in the afternoon; the compare month sells the same 25 at full price.
      for (let i = 0; i < 25; i++) planted.push(bill(`RG-C3-${tag}-${String(i + 1).padStart(2, "0")}`, dayOf(m0, tag === "A" ? 5 + i : 1 + i), 1, [{ item: "lamb_curry", qty: 2, ...(discBp ? { discBp } : {}) }], { type: "dine_in", time: "16:00" }));
      // RG-C2: prawn masala at North, 5 bills of 3 portions a day for 14 days (210 portions, 42 kg), in both months; waste is logged at the recipe's 2% in
      // the compare month and at 11% in the period month.
      for (let j = 0; j < 14; j++) for (let n = 1; n <= 5; n++) planted.push(orderOf(`RG-C2-${tag}-${String(j + 1).padStart(2, "0")}-${n}`, dayOf(m0, 13 + j), 0, 3));
      for (const j of [15, 18, 21, 24]) plantedWaste.push({ date: dayOf(m0, j), time: "22:10", outlet: 0, ing: prawns!, qtyMilli: tag === "A" ? 210 : 1155, reason: "overprep" });
    }
    // RG-C2 in the detector's window (the 14 days to as-of): the dish keeps selling 5 bills of 3 a day for the last nine days and three overprep logs
    // of 1,122 g fall in as-of's week. With the period month's last sale day (13 days back) that is 150 portions drawing 150 x 204 = 30,600 g, and
    // 3,366 g of waste: 1,100 bp observed against the recipe's 200.
    for (let d = 1; d <= 9; d++) for (let n = 1; n <= 5; n++) planted.push(orderOf(`RG-C2-R-${String(d).padStart(2, "0")}-${n}`, D(d), 0, 3));
    for (const n of [5, 4, 3]) plantedWaste.push({ date: D(n), time: "22:10", outlet: 0, ing: prawns!, qtyMilli: 1122, reason: "overprep" });
    // Calibration (nothing in the key points at these): eight refunded butter chicken bills at North spread over the compare month, so its refunds are
    // not far below the period month's and the bridge's `other` row stays a minor one; then CAL_ORDINARY plain compare-month bills at North, so the
    // month pair's revenue_volume row cancels the volume/mix row (the ledger books purchases, not consumption) instead of reading as a driver.
    for (let i = 0; i < 8; i++) planted.push(bill(`RG-CALR-${i + 1}`, addDays(cm0, 2 + 3 * i), 0, [{ item: "butter_chicken", qty: 1 }], { type: "dine_in", time: "13:20", refund: { minor: "full", mode: "upi", reason: "customer_complaint" } }));
    for (let i = 0; i < CAL_ORDINARY; i++) planted.push(bill(`RG-CAL-${i + 1}`, addDays(cm0, 1 + 2 * i), 0, [{ item: "butter_chicken", qty: 1 }], { type: "dine_in", time: "13:30" }));
    // RG-C5: a new dish, sold 60 times at South in the last six days, with no recipe version (launched after the month pair, so it moves no bridge row).
    for (let d = 1; d <= 6; d++) for (let n = 1; n <= 10; n++) planted.push(bill(`RG-C5-${String(d).padStart(2, "0")}-${String(n).padStart(2, "0")}`, D(d), 2, [{ item: "chef_special", qty: 1 }], { type: "dine_in", time: "19:30" }));
    // RG-C6: 24 mushroom risotto sold at South after the price rise.
    for (let d = 1; d <= 8; d++) for (let n = 1; n <= 3; n++) planted.push(bill(`RG-C6-${String(d).padStart(2, "0")}-${n}`, D(d), 2, [{ item: "mushroom_risotto", qty: 1 }], { type: "dine_in", time: "20:30" }));
    // RG-F5: South's UPI credits fall short on nine September days; three bills are voided on each of those days.
    for (const n of F5_DAYS) for (let v = 1; v <= 3; v++) planted.push(bill(`RG-F5-${String(n).padStart(2, "0")}-${v}`, addDays(pm0, n), 2, [{ item: "paneer_tikka", qty: 1 }], { time: "21:40", voidReason: "customer_left" }));
  }
  // RG-P2's demand history: people.overstaffed_slot measures a slot's minutes against the 8 weeks before it (same weekday and slot, minutes per
  // order), so North's own crew is on the books from 8 weeks before the helpers' first Tuesday (attendance below) and every Tuesday and Wednesday
  // afternoon from then has the same flat demand: one veg biryani bill in each of the 15:00, 16:00 and 17:00 slots.
  const winFrom = D(c.liveDays);
  let helpersFrom = winFrom;
  while (isoWeekday(helpersFrom) !== 2) helpersFrom = addDays(helpersFrom, 1);
  const p2 = c.liveDays >= 35 && daysBetween(D(c.days), addDays(helpersFrom, -56)) >= 0;
  const northFrom = p2 ? addDays(helpersFrom, -56) : winFrom;
  const afternoons = (from: string, to: string) => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) if (d >= northFrom && d <= D(1) && (isoWeekday(d) === 2 || isoWeekday(d) === 3)) out.push(d);
    return out;
  };
  if (p2) {
    for (const d of afternoons(northFrom, D(1))) for (const h of [15, 16, 17]) {
      planted.push(bill(`RG-P2D-${d.replaceAll("-", "")}-${h}`, d, 0, [{ item: "veg_biryani", qty: 1 }], { type: "dine_in", time: `${h}:20` }));
    }
  }
  if (p2 && margin) {
    // Calibration (nothing in the key points at these): the month with fewer such afternoons gets the difference in plain veg biryani bills at lunch,
    // so the demand history adds the same sales to both months of the pair and moves no bridge row's delta.
    const days = (m0: string) => afternoons(m0, addDays(monthStartBefore(m0, -1), -1)).length;
    const gap = 3 * (days(pm0) - days(cm0));
    const into = gap > 0 ? cm0 : pm0;
    for (let i = 0; i < Math.abs(gap); i++) planted.push(bill(`RG-CALV-${i + 1}`, addDays(into, 2 + 3 * i), 0, [{ item: "veg_biryani", qty: 1 }], { type: "dine_in", time: "13:40" }));
  }
  const plan = new Plan(c, {
    prefix: "RG", inclusive: false, phones: people.pool, planted, plantedWaste,
    outlets: [{ outlet: o1, perDay: [7, 11] }, { outlet: o2, perDay: [7, 11] }, { outlet: o3, perDay: [7, 11] }],
    channels: [
      { kind: "counter", w: 40, types: ["dine_in", "takeaway"] }, { kind: "table_qr", w: 20, types: ["dine_in"] }, { kind: "own_site", w: 10, types: ["pickup", "delivery"] },
      { kind: "aggregator:swiggy", w: 15, types: ["delivery"], outlets: [0] }, { kind: "aggregator:zomato", w: 15, types: ["delivery"], outlets: [1] },
    ],
    items: [
      ...menu.map((m) => ({ key: m.key, priceMinor: m.priceMinor, taxClass: m.taxClass, w: m.key === "butter_chicken" ? 5 : 4, recipe: m.recipe })),
      ...extra.map((m) => ({ key: m.key, priceMinor: m.priceMinor, taxClass: m.taxClass, w: 0, recipe: m.recipe })),
      ...(margin ? [{ key: "mushroom_risotto", priceMinor: 39000, taxClass: "restaurant_5", w: 0, recipe: [[mushroom!, 250]] as Array<[k.Ingredient, number]> }] : []),
    ],
    dayFactor: (d, oi) => {
      if (margin && d >= pm0 && d < monthStartBefore(A, 0)) return SEPT_FACTOR;
      if (oi === 1 && signals) return festivalPast.includes(d) ? 1.6 : rainPast.includes(d) ? 0.7 : 1; // RG-M1 and RG-M1b, at Central
      return 1;
    },
    // Baseline waste on pairs no plant uses (a plant's pair has none outside its planted days).
    waste: [{ outlet: 0, ing: tomato, qtyMilli: [500, 2000] }, { outlet: 1, ing: oil, qtyMilli: [500, 1500] }, { outlet: 2, ing: paneer, qtyMilli: [300, 1000] }],
  });
  for (const [oi, o] of biz.outlets.entries()) {
    // Stock for what the history draws, at the same unit cost, so six months of sales never drive on-hand negative (the cost average the plants use is unchanged).
    await k.openingStock(c, `open:${o.id.slice(0, 8)}`, o.id, stockAt, [
      { ing: paneer, qtyMilli: 20000 + plan.need(oi, paneer), costMinor: 32000 }, { ing: tomato, qtyMilli: 30000 + plan.need(oi, tomato), costMinor: 4000 },
      { ing: chicken, qtyMilli: 30000 + plan.need(oi, chicken), costMinor: 18000 }, { ing: rice, qtyMilli: 50000 + plan.need(oi, rice), costMinor: 9000 },
      { ing: oil, qtyMilli: 20000 + plan.need(oi, oil), costMinor: 13000 },
      // The month pair's own ingredients only where a dish uses them (prawns North, lamb Central, mushroom South): stock no bill draws is dead stock.
      ...(margin ? ([[prawns!, 0, 80000], [lamb!, 1, 80000], [mushroom!, 2, 20000]] as const).filter(([, only]) => only === oi)
        .map(([ing, , costMinor]) => ({ ing, qtyMilli: 20000 + plan.need(oi, ing), costMinor })) : []),
    ]);
  }
  const fresh = await k.supplier(c, "fresh", "Fresh Farms Wholesale");
  const grain = await k.supplier(c, "grain", "Metro Grain Traders");

  // ---- RG-I2 paneer invoiced ₹6/kg above the PO on 120 kg ----
  const po = await k.purchaseOrder(c, "paneer", fresh, o1.id, D(8), [{ ing: paneer, qtyMilli: 120000, priceMinor: 32000 }]);
  await k.goodsReceived(c, "paneer", fresh, o1.id, po.id, at(D(7), "07:00", tz), [{ ing: paneer, qtyMilli: 120000, costMinor: null, poLine: po.lines[0]! }]);
  await k.invoice(c, "paneer-over", fresh, "FF-201", D(7), po.id, [{ ing: paneer, qtyMilli: 120000, priceMinor: 32600, poLine: po.lines[0]! }]);
  c.plant("RG-I2");

  // ---- RG-I3 "INV-1042" and "INV1042": same total, two days apart (the second is a near-duplicate, left unapproved) ----
  await k.invoice(c, "oil-1042", grain, "INV-1042", D(9), null, [{ ing: oil, qtyMilli: 40000, priceMinor: 13000, poLine: null }]);
  await k.invoice(c, "oil-1042b", grain, "INV1042", D(7), null, [{ ing: oil, qtyMilli: 40000, priceMinor: 13000, poLine: null }], { approve: false });
  // ...and an exact re-record of INV-1042 is refused by the books (the attempt leaves no row; it resolves to the original invoice).
  await k.invoice(c, "oil-1042-again", grain, "INV-1042", D(8), null, [{ ing: oil, qtyMilli: 40000, priceMinor: 13000, poLine: null }], { refusedWith: "duplicate_invoice" });
  c.plant("RG-I3");

  // ---- RG-I1 tomato +14% from the 5th day back: three invoices at 4000/kg, then three at 4560/kg, 200 kg each ----
  for (const [tag, day, p] of [["pre1", 13, 4000], ["pre2", 11, 4000], ["pre3", 9, 4000], ["post1", 5, 4560], ["post2", 3, 4560], ["post3", 1, 4560]] as const) {
    await k.goodsReceived(c, `tomato-${tag}`, fresh, o1.id, null, at(D(day), "07:00", tz), [{ ing: tomato, qtyMilli: 200000, costMinor: p, poLine: null }]);
    await k.invoice(c, `tomato-${tag}`, fresh, `FF-T-${tag}`, D(day), null, [{ ing: tomato, qtyMilli: 200000, priceMinor: p, poLine: null }]);
  }
  c.plant("RG-I1");

  if (margin) {
    // RG-C1: paneer +22% (32,000 → 39,040 paise/kg) from the period month's second day; the dishes' prices do not move. Each weekly delivery of 20 kg is
    // received at Central or South (never North: RG-A1 values its waste at North's 32,000 receipts) and invoiced at the same price, so both the supplier
    // price (invoices) and the landed cost the ledger uses (receipts) move. Both months take five deliveries (100 kg); one more follows after RG-I2's blip.
    const preDays = [2, 9, 16, 23, 30].map((n) => addDays(cm0, n));
    const postDays = [1, 8, 15, 22, 29].map((n) => addDays(pm0, n));
    for (const [i, d] of [...preDays, ...postDays, D(3)].entries()) {
      const unit = i < 5 ? 32000 : 39040;
      await k.goodsReceived(c, `paneer-drift-${i + 1}`, fresh, (i % 2 === 0 ? o2 : o3).id, null, at(d, "07:00", tz), [{ ing: paneer, qtyMilli: 20000, costMinor: unit, poLine: null }]);
      await k.invoice(c, `paneer-drift-${i + 1}`, fresh, `FF-P-${String(i + 1).padStart(2, "0")}`, d, null, [{ ing: paneer, qtyMilli: 20000, priceMinor: unit, poLine: null }]);
    }
    c.plant("RG-C1");
    c.plant("RG-C1b");
    // Standing weekly deliveries, the same in both months at constant costs: the ledger books goods received as cost of sales, so equal purchases
    // keep the month pair's volume/mix row from reading as purchasing timing. RG-I1's two September tomato deliveries (27 and 29 Sep) have twins in
    // August for the same reason. All at North but the lamb, which goes to Central, the one outlet whose dish uses it.
    const standing: Array<[k.Ingredient, number, number]> = [[chicken, 30000, 18000], [rice, 20000, 9000], [oil, 5000, 13000], [tomato, 25000, 4000], [prawns!, 10000, 80000]];
    for (const [tag, m0] of [["A", cm0], ["S", pm0]] as const) {
      for (const n of [3, 10, 17, 24]) {
        await k.goodsReceived(c, `stock-${tag}-${n}`, fresh, o1.id, null, at(addDays(m0, n), "07:30", tz), standing.map(([ing, qtyMilli, costMinor]) => ({ ing, qtyMilli, costMinor, poLine: null })));
        await k.goodsReceived(c, `lamb-${tag}-${n}`, fresh, o2.id, null, at(addDays(m0, n), "07:30", tz), [{ ing: lamb!, qtyMilli: 5000, costMinor: 80000, poLine: null }]);
      }
    }
    for (const n of [26, 28]) await k.goodsReceived(c, `tomato-twin-${n}`, fresh, o1.id, null, at(addDays(cm0, n), "07:00", tz), [{ ing: tomato, qtyMilli: 200000, costMinor: 4000, poLine: null }]);
    // Prices the other new dishes are costed at, and the mushroom move RG-C6 rides on (one invoice before, one after: 20,000 → 21,800, +9%).
    await k.invoice(c, "prawns-1", fresh, "FF-PR-01", addDays(cm0, 3), null, [{ ing: prawns!, qtyMilli: 100000, priceMinor: 80000, poLine: null }]);
    await k.invoice(c, "lamb-1", fresh, "FF-LB-01", addDays(cm0, 3), null, [{ ing: lamb!, qtyMilli: 100000, priceMinor: 80000, poLine: null }]);
    await k.invoice(c, "mushroom-1", fresh, "FF-MU-01", D(30), null, [{ ing: mushroom!, qtyMilli: 50000, priceMinor: 20000, poLine: null }]);
    await k.invoice(c, "mushroom-2", fresh, "FF-MU-02", D(10), null, [{ ing: mushroom!, qtyMilli: 50000, priceMinor: 21800, poLine: null }]);
    for (const id of ["RG-C2", "RG-C3", "RG-C5", "RG-C6", "RG-F5"]) c.plant(id);
  }

  c.plant("RG-K3"); // waste: see the dated history above

  // ---- RG-A1 chiller at North reads 9–11 °C three times a day for two days; 14 kg of paneer is binned ----
  const chiller = await k.asset(c, "chiller1", o1.id, "chiller", "Walk-in chiller (synthetic)", 1, 5);
  for (const day of [3, 2, 1]) {
    for (const [slot, hhmm] of [["a", "09:00"], ["b", "13:00"], ["c", "17:00"]] as const) {
      const bad = day <= 2;
      const milli = bad ? { a: 9000, b: 10000, c: 11000 }[slot] : 3000;
      await k.tempLog(c, `chiller1:${day}:${slot}`, o1.id, chiller, milli, at(D(day), hhmm, tz));
    }
  }
  c.plant("RG-A1");

  // ---- RG-A5 Central's FSSAI licence runs out in 20 days; the other two outlets are fine ----
  await k.licence(c, "fssai:1", o1.id, "fssai", FSSAI[0]!, "Synthetic Food Authority", D(300), addDays(A, 300));
  await k.licence(c, "fssai:2", o2.id, "fssai", FSSAI[1]!, "Synthetic Food Authority", D(345), addDays(A, 20));
  await k.licence(c, "fssai:3", o3.id, "fssai", FSSAI[2]!, "Synthetic Food Authority", D(100), addDays(A, 265));
  c.plant("RG-A5");

  // ---- people: a cook at each outlet, a helper at North ----
  const ravi = await k.staff(c, "ravi", "Ravi Kumar (synthetic)", o1.id, "cook", 12000, "2025-01-01");
  const sunita = await k.staff(c, "sunita", "Sunita Devi (synthetic)", o1.id, "helper", 8000, "2025-01-01");
  const imran = await k.staff(c, "imran", "Imran Sheikh (synthetic)", o2.id, "cook", 12000, "2025-01-01");
  const joseph = await k.staff(c, "joseph", "Joseph Mathew (synthetic)", o3.id, "cook", 12000, "2025-01-01");
  const crew: Array<[k.OutletInfo, typeof ravi]> = [[o1, ravi], [o1, sunita], [o2, imran], [o3, joseph]];
  // RG-P2: two extra helpers at North on Tuesday and Wednesday afternoons (15:00-18:00) while the orders stay flat.
  const overstaffed = new Set<string>();
  if (c.liveDays >= 35) {
    for (const [key, name] of [["kavya", "Kavya Nair (synthetic)"], ["dev", "Dev Malhotra (synthetic)"]] as const) {
      crew.push([o1, await k.staff(c, key, name, o1.id, "helper", 8000, "2025-01-01")]);
      overstaffed.add(key);
    }
  }
  const slotOf = (s: { key: string }, d: string): [string, string] | null =>
    !overstaffed.has(s.key) ? ["10:00", "18:00"] : d >= winFrom && (isoWeekday(d) === 2 || isoWeekday(d) === 3) ? ["15:00", "18:00"] : null;
  // Rostered 10:00–18:00 every day of the window (North from RG-P2's norm weeks). RG-P1 (pack P1: +45 min on 70% of shifts): Ravi clocks out
  // 45 minutes late on 18 of the 26 shifts from 26 days back (3, 5, 5 and 5 of them: at the gate's Sat 10 Oct, the four ISO weeks Mon 14 Sep -
  // Fri 9 Oct). Planted only when attendance reaches that far.
  const p1 = c.liveDays >= 26;
  const p1From = D(26);
  const lateDays = new Set([1, 3, 5, 7, 8, 10, 11, 13, 14, 15, 17, 18, 20, 21, 22, 23, 24, 25]);
  const fromOf = (o: k.OutletInfo) => (o === o1 ? northFrom : winFrom);
  for (const o of biz.outlets) {
    const here = crew.filter(([oo]) => oo === o).map(([, s]) => s);
    for (let w = mondayOf(fromOf(o)); w <= D(1); w = addDays(w, 7)) {
      const shifts = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(w, i);
        if (d >= fromOf(o) && d <= D(1)) for (const s of here) {
          const slot = slotOf(s, d);
          if (slot) shifts.push({ staff: s, date: d, start: slot[0], end: slot[1], role: s.key === "sunita" || overstaffed.has(s.key) ? "helper" : "cook" });
        }
      }
      if (shifts.length) await k.roster(c, `${o.id.slice(0, 8)}:${w}`, o, w, shifts, (d, t) => at(d, t, tz));
    }
    for (const s of here) {
      for (let d = fromOf(o); d <= D(1); d = addDays(d, 1)) {
        const late = p1 && s.key === "ravi" && d >= p1From && lateDays.has(daysBetween(p1From, d));
        const slot = slotOf(s, d);
        if (slot) await k.attend(c, o, s, d, at(d, slot[0], tz), atPlus(d, slot[1], late ? 45 : 0, tz));
      }
    }
  }
  if (p1) c.plant("RG-P1");
  if (overstaffed.size) c.plant("RG-P2");
  // ---- RG-P3 a ₹15,000 advance to Ravi 90 days ago, never recovered ----
  await k.advance(c, "ravi-1", ravi, "given", 1500000, D(90));
  c.plant("RG-P3");


  // ---- finance: channel terms, then the aggregator payout files ----
  const swiggy = biz.channels["aggregator:swiggy"]!;
  const zomato = biz.channels["aggregator:zomato"]!;
  const termsFrom = D(c.days + 30);
  await k.channelTerms(c, "swiggy", swiggy, { commissionBp: 2200, ads: false, capMinor: null, promoBp: 0, cycleDays: 7, from: termsFrom });
  await k.channelTerms(c, "zomato", zomato, { commissionBp: 2200, ads: true, capMinor: 500000, promoBp: 0, cycleDays: 7, from: termsFrom });
  // Clean history first, so the planted payout files below are the newest import runs (the runs list is capped at 100).
  plan.queue();
  if (signals) {
    const row = (on: string, kind: string, label: string) => ({ on, kind, label, outlet: o2.name, source: "synthetic_calendar" });
    k.importFile(c, "signals", "market_signal", "signals.csv", signalFile([
      ...festivalPast.map((d) => row(d, "festival", "harvest_festival")), row(nextOn(5), "festival", "harvest_festival"),
      ...rainPast.map((d) => row(d, "weather", "rain")), row(nextOn(6), "weather", "rain"),
    ]), "Synthetic calendar");
  }
  // RG-F7: one September Zomato cycle at Central is uploaded and left unapproved (the owner has not looked at it); RG-F8: an August cycle carries a
  // ₹300 ad fee, inside the ₹5,000 monthly cap the channel's terms allow.
  const weeks = Math.floor((c.days - 14) / 7);
  const inMonth = (w: number, m0: string) => D(7 * w + 13) >= m0 && D(7 * w + 7) < monthStartBefore(m0, -1);
  const holdW = margin ? Array.from({ length: weeks }, (_, i) => i + 1).find((w) => inMonth(w, pm0)) : undefined;
  const adW = margin ? Array.from({ length: weeks }, (_, i) => i + 1).find((w) => inMonth(w, cm0)) : undefined;
  if (margin) {
    const first = addDays(A, -c.days);
    const credits: Array<{ date: string; ref: string; outlet: string; minor: number; narration: string }> = [];
    for (const [oi, o] of biz.outlets.entries()) {
      for (let d = first; d <= D(1); d = addDays(d, 1)) {
        const tendered = plan.upiTendered(oi, d);
        // South's shortfall on its nine days is 30% of the day's UPI, rounded down to a whole rupee and never under ₹600 (the detector counts a day from ₹500).
        const short = oi === 2 && F5_DAYS.some((n) => addDays(pm0, n) === d) ? Math.max(Math.floor((tendered * 0.3) / 100) * 100, 60000) : 0;
        if (tendered - short > 0) credits.push({ date: d, ref: `UPI-${oi + 1}-${d}`, outlet: o.name, minor: tendered - short, narration: "UPI settlement (synthetic)" });
      }
    }
    k.importFile(c, "bank:upi", "bank_statement", "upi-credits.csv", bankFile("SB-SYN-0001", credits, biz.currency), "Synthetic dated history");
  }
  await k.history(c, {
    payouts: [
      { layout: "swiggy", prefix: "SW-N", outlet: o1, commissionBp: 2200, withholdsTax: true, bills: (f, t) => plan.aggregatorBills(0, "aggregator:swiggy", f, t) },
      { layout: "zomato", prefix: "ZM-C", outlet: o2, commissionBp: 2200, withholdsTax: true, bills: (f, t) => plan.aggregatorBills(1, "aggregator:zomato", f, t),
        ...(margin ? { hold: holdW === undefined ? [] : [holdW], extra: (w: number, m: { to: string }): PayoutLine[] => (w === adW ? [{ kind: "ads", orderRef: "", orderDate: m.to, gross: 0, commission: 0, ad: 30000, promo: 0, tax: 0 }] : []) } : {}) },
    ],
    temp: { outlet: o1, assetId: chiller, assetKey: "chiller1", milliC: 3000, hhmm: "09:00" }, rent: { outlet: o1, amountMinor: 18000000, ...(margin ? { monthly: true as const } : {}) },
  });
  // An order line withholds the GST inside the order value (operator collects, Sec 9(5): packs/finance.md §2), split as core splits restaurant_5.
  const line = (ref: string, date: string, gross: number): PayoutLine =>
    ({ kind: "order", orderRef: ref, orderDate: date, gross, commission: (gross * 2200) / 10000, ad: 0, promo: 0, tax: priceLine("restaurant_5", gross, 1, 0, true).tax });
  const ads = (date: string, ad: number): PayoutLine => ({ kind: "ads", orderRef: "", orderDate: date, gross: 0, commission: 0, ad, promo: 0, tax: 0 });
  // RG-F1: ads are not opted in on channel aggregator:swiggy, yet two payouts carry ad-fee lines (₹250 + ₹300).
  for (const [ref, from, to, paid, adAmt] of [["SW-N-C1", D(13), D(7), D(5), 25000], ["SW-N-C2", D(6), D(1), D(0), 30000]] as const) {
    const lines: PayoutLine[] = [];
    for (let i = 0; i < 6; i++) lines.push(line(`${ref}-${i + 1}`, addDays(from, i), 40000 + i * 5000));
    lines.push(ads(to, adAmt));
    await k.importFile(c, ref, "payout_statement", `${ref}.csv`, payoutFile("swiggy", { ref, outlet: o1.name, from, to, paidOn: paid }, lines));
  }
  c.plant("RG-F1");
  // RG-F2: channel aggregator:zomato ads opted in with a ₹5,000 monthly cap; one payout is charged ₹8,200.
  {
    const lines = [line("ZM-C-AD-1", D(12), 60000), line("ZM-C-AD-2", D(11), 80000), ads(D(8), 820000)];
    await k.importFile(c, "ZM-C-AD", "payout_statement", "ZM-C-AD.csv", payoutFile("zomato", { ref: "ZM-C-AD", outlet: o2.name, from: D(13), to: D(8), paidOn: D(6) }, lines));
  }
  c.plant("RG-F2");
  // RG-F3: channel aggregator:zomato pays its 20 planted orders (dated history above) ₹30 short each: commission 14,088 against the contracted
  // 22% of 50,400 = 11,088 (about 28%). Lines are the orders' own totals and tax, so core matches every one and the short is commission only.
  {
    const lines = k.shortLines(plan.aggregatorBills(1, "aggregator:zomato", D(7), D(2)), "ZM-C-SH-", 20, 2200, 3000, true);
    await k.importFile(c, "ZM-C-SHORT", "payout_statement", "ZM-C-SHORT.csv", payoutFile("zomato", { ref: "ZM-C-SHORT", outlet: o2.name, from: D(7), to: D(2), paidOn: D(1) }, lines));
  }
  c.plant("RG-F3");
  await k.flushImports(c);
  // Rent falls on the 1st of each month (the month pair's `other` row must not move on rent timing); this month's, if the month has begun.
  const rentDay = margin ? monthStartBefore(A, 0) : D(10);
  if (rentDay <= D(1)) await k.expense(c, "rent:1", o1.id, "rent", rentDay, 18000000, 0, "Synthetic Landlord LLP");

  // ---- sales: all of these land on the seed day (orders are server-stamped) ----
  const menuKeys = ["paneer_tikka", "butter_chicken", "veg_biryani"] as const;
  for (const [oi, o] of biz.outlets.entries()) {
    for (let i = 0; i < 4; i++) {
      const key = `ord:${oi + 1}:counter:${i}`;
      await k.placeOrder(c, key, biz, o, "counter", "takeaway", [{ item: items[menuKeys[i % 3]!]!, qtyMilli: 1000 + (i % 2) * 1000 }]);
    }
    await k.placeOrder(c, `ord:${oi + 1}:table:0`, biz, o, "table_qr", "dine_in", [{ item: items.veg_biryani!, qtyMilli: 2000 }], { table: "T4" });
    await k.placeOrder(c, `ord:${oi + 1}:site:0`, biz, o, "own_site", "pickup", [{ item: items.paneer_tikka!, qtyMilli: 1000 }]);
    await k.placeOrder(c, `ord:${oi + 1}:swiggy:0`, biz, o, "aggregator:swiggy", "delivery", [{ item: items.butter_chicken!, qtyMilli: 1000 }], { externalRef: `SWG-${oi + 1}-0` });
  }
  // The public storefront: three guests check out on the own-site channel and pay at the counter.
  const sf = await k.storefrontKey(c, biz);
  for (let i = 0; i < 3; i++) await k.storefrontOrder(c, sf, `ord:1:sf:${i}`, biz, o1, items.paneer_tikka!, { name: `Guest ${i + 1} (synthetic)`, phone: `+9190000001${i}0` });
  // RG-G1: a welcome coupon (20%, one use a customer) is used once under each of ten guest records that share one phone, on a butter chicken, and once each by
  // twenty other phones: the nine uses beyond the cap are worth 9 x 7,200 paise, over the detector's ₹500.
  await k.coupon(c, "welcome", "WELCOME20", { bp: 2000, from: D(c.days + 1), perCustomerCap: 1, requiresCustomer: true });
  for (let i = 0; i < 10; i++) await k.storefrontOrder(c, sf, `ord:welcome:${i}`, biz, o1, items.butter_chicken!, { name: `Guest ${"ABCDEFGHIJ"[i]} (synthetic)`, phone: "+919000009901" }, ["WELCOME20"]);
  for (let i = 0; i < 20; i++) await k.storefrontOrder(c, sf, `ord:welcome:d${i}`, biz, o1, items.paneer_tikka!, { name: `Guest D${i + 1} (synthetic)`, phone: `+9190000098${String(i).padStart(2, "0")}` }, ["WELCOME20"]);
  if (sf !== null) c.plant("RG-G1");
  await k.customer(c, "regular1", "Pooja Menon (synthetic)", "+919000000201", 100);
  await k.customer(c, "regular2", "Rahul Das (synthetic)", "+919000000202", 40);
  c.plant("RG-F4"); // six zomato bills at Central in no payout: dated history above
  if (margin) for (const id of ["RG-F7", "RG-F8", "RG-MF1"]) c.plant(id);
  if (c.days >= 55) for (const id of ["RG-K2", "RG-F9", "RG-G7", "RG-K7"]) c.plant(id);
  if (c.days >= 92) for (const id of ["RG-G4", "RG-G5"]) c.plant(id);
  if (signals) for (const id of ["RG-M1", "RG-M1b"]) c.plant(id);
  // RG-X1: South's drawer closes ₹250 short. The manager opens it with ₹5,000 and rings three cash sales.
  await k.shiftOpen(c, "shift:rg3", o3, 500000, "manager");
  for (let i = 0; i < 3; i++) {
    await k.placeOrder(c, `ord:cash:${i}`, biz, o3, "counter", "takeaway", [{ item: items.butter_chicken!, qtyMilli: 1000 }], { persona: "manager" });
    await k.tenderCash(c, `tender:cash:${i}`, `ord:cash:${i}`, 40000, "manager");
  }
  await k.shiftClose(c, "shift:rg3", 588400, "manager");
  c.plant("RG-X1");
  // RG-S1: takeaway boxes at South sit at 30 pcs against a minimum of 50.
  await k.openingStock(c, "boxes:3", o3.id, stockAt, [{ ing: boxes, qtyMilli: 30000, costMinor: 800 }]);
  await k.reorderLevel(c, o3.id, boxes, 50000, 100000);
  c.plant("RG-S1");

  // ---- Munim Cares (ADR-015): North and Central take part; simulated recipients; near-expiry stock for the expiry_risk draft ----
  // Cares needs an operator (city, recipients and this business's enablement are approved platform drafts, R24); without one the curd below is
  // still stocked but nothing is enrolled. New perishables that no dish draws and no existing plant touches, received as opening stock (no ledger posting).
  const curd = await k.ingredient(c, "curd", "Fresh curd", "kg", { shelfDays: 5, batch: true });
  const carrot = await k.ingredient(c, "carrot", "Carrots", "kg", { shelfDays: 14, batch: true });
  const onion = await k.ingredient(c, "onion", "Onions", "kg", { shelfDays: 21, batch: true });
  // North's curd falls due in two days: 20 kg at ₹60/kg = ₹1,200 at risk against the pack's ₹500 floor, 2 days left against its 3-day horizon.
  await k.openingStock(c, "cares:north", o1.id, stockAt, [{ ing: curd, qtyMilli: 20000, costMinor: 6000, batch: { code: "CURD-N1", expires: addDays(A, 2), mrpMinor: null } }]);
  c.plant("RG-CA1");
  if (c.api.hasOperator) {
    // The books refuse a listing whose pickup has passed, so the pickup windows and the listed batches' shelf lives hang on the real business day,
    // not on as-of. Those strings are logged under aliases: the request log is the same on every day and in plan mode.
    const live = businessToday(new Date(), tz);
    const nextTue = (() => { let d = addDays(live, 1); while (isoWeekday(d) !== 2) d = addDays(d, 1); return d; })();
    const when = (name: string, date: string, hhmm: string) => c.api.alias(at(date, hhmm, tz), name);
    const shelf = (name: string, date: string) => c.api.alias(addDays(date, 6), name);
    const recipients = await k.caresOperator(c, { code: "bengaluru", country: "IN", name: "Bengaluru" }, [
      { key: "food_bank", name: "Annapurna Food Bank (simulated)", kind: "food_bank", cooked: false, raw: true, packaged: true, kg: 400, portions: 0, lat: 12_975_000, lng: 77_600_000 },
      { key: "ngo", name: "Asha Kiran Trust (simulated)", kind: "ngo", cooked: true, raw: true, packaged: false, kg: 120, portions: 300, lat: 12_990_000, lng: 77_570_000 },
      { key: "kitchen", name: "Seva Community Kitchen (simulated)", kind: "ngo", cooked: true, raw: false, packaged: false, kg: 0, portions: 200, lat: 12_940_000, lng: 77_620_000 },
    ]);
    await k.caresProfile(c, "Spice Route Group (synthetic)", true, [
      { outlet: o1, city: "bengaluru", lat: 12_971_600, lng: 77_594_600, from: "10:00", to: "18:00" },
      { outlet: o2, city: "bengaluru", lat: 12_935_200, lng: 77_624_400, from: "10:00", to: "18:00" },
    ]);
    // North: 6 kg of carrots go to the food bank tomorrow and are handed over (the impact report has one recorded donation); 10 kg of onions are
    // listed for next Tuesday afternoon, the slot RG-P2's extra helpers are rostered for (the labour detector's pack-and-hand-over task attaches to it).
    const carrotExp = shelf("cares_carrot_expiry", addDays(live, 1));
    const onionExp = shelf("cares_onion_expiry", nextTue);
    await k.openingStock(c, "cares:north2", o1.id, stockAt, [
      { ing: carrot, qtyMilli: 12000, costMinor: 4000, batch: { code: "CARROT-N1", expires: carrotExp, mrpMinor: null } },
      { ing: onion, qtyMilli: 20000, costMinor: 3000, batch: { code: "ONION-N1", expires: onionExp, mrpMinor: null } },
    ]);
    const gift = await k.caresListing(c, "carrot", o1, { recipient: recipients.food_bank!, pickupFrom: when("cares_pickup_1_from", addDays(live, 1), "11:00"), pickupTo: when("cares_pickup_1_to", addDays(live, 1), "13:00"),
      lines: [{ key: "carrot", ing: carrot, batch: "CARROT-N1", qtyMilli: 6000, expires: carrotExp }] });
    await k.caresHandover(c, "carrot", gift.id, [{ lineId: gift.lineIds[0]!, qtyMilli: 6000 }]);
    await k.caresListing(c, "onion", o1, { recipient: recipients.ngo!, pickupFrom: when("cares_pickup_2_from", nextTue, "15:00"), pickupTo: when("cares_pickup_2_to", nextTue, "17:00"),
      lines: [{ key: "onion", ing: onion, batch: "ONION-N1", qtyMilli: 10000, expires: onionExp }] });
    // Central offers 15 kg of onions to other businesses at ₹22/kg (a priced offer: recorded, never processed).
    const offerExp = shelf("cares_offer_expiry", addDays(live, 2));
    await k.openingStock(c, "cares:central", o2.id, stockAt, [{ ing: onion, qtyMilli: 30000, costMinor: 3000, batch: { code: "ONION-C1", expires: offerExp, mrpMinor: null } }]);
    await k.caresListing(c, "onion_offer", o2, { pickupFrom: when("cares_pickup_3_from", addDays(live, 2), "11:00"), pickupTo: when("cares_pickup_3_to", addDays(live, 2), "13:00"),
      lines: [{ key: "onion", ing: onion, batch: "ONION-C1", qtyMilli: 15000, expires: offerExp, priceMinor: 2200 }] });
    // The operator mints the network total over the whole timeline and publishes it by an approved draft (nothing is public before that).
    await k.caresNetworkImpact(c, addDays(A, -c.days), c.api.alias(addDays(live, 1), "cares_impact_to"));
  }
}
