// cloud_kitchen: one synthetic kitchen running three invented brands (IN). See restaurant_group.ts for the
// conventions; the hand-kept key is answer-key/cloud_kitchen.json.
import type { Ctx } from "../ctx.ts";
import { payoutFile, type PayoutLine } from "../files.ts";
import { customers, Plan, priceLine, type PBill, type Waste } from "../history.ts";
import * as k from "../kit.ts";
import { addDays, at } from "../time.ts";

const KINDS = ["pickup", "own_site", "aggregator:swiggy", "aggregator:zomato"];

export const meta = { tz: "Asia/Kolkata", currency: "INR", personas: ["owner", "cashier", "manager"] } as const;

export async function build(c: Ctx): Promise<void> {
  const { asOf: A } = c;
  const D = (n: number) => addDays(A, -n);
  const biz = await k.onboard(c, {
    kind: "cloud_kitchen", country: "IN", business: "Hub Kitchens (synthetic)", ownerName: "Vikram Shah (synthetic)",
    outlet: { name: "Hub Kitchen One", address: "7 Synthetic Industrial Lane, Mumbai (synthetic)", taxIds: { GSTIN: "27ABCDE1234F1Z5", FSSAI: "44444444444444" } },
  });
  c.s.currency = biz.currency;
  // A cloud kitchen starts with no counter; its walk-in pickup counter is added so imported POS bills have a channel to land on.
  const counter = c.api.id("channel:counter");
  await c.api.cmd("owner", "/v1/channels", "tenancy.channel.create.v1", "channel:counter", { channel_id: counter, name: "Counter", kind: "counter" });
  biz.channels["counter"] = counter;
  const o = biz.outlets[0]!;
  const tz = o.tz;
  const histFrom = D(c.days + 2);
  await k.person(c, "cashier", "Kavya Nair (synthetic)", "staff", [o.id]);
  // The kitchen's manager (the compliance task's assignee, pack §6); signs in, since CK-G2's staff meal is his to ring up.
  await k.person(c, "manager", "Rohan Bose (synthetic)", "manager", [o.id]);
  const brandA = await k.brand(c, "zafran", "Zafran Pot (synthetic brand)", [o.id]);
  const brandB = await k.brand(c, "wrap", "Wrap Lane (synthetic brand)", [o.id]);
  const brandC = await k.brand(c, "sweet", "Sweet Crate (synthetic brand)", [o.id]);

  const chicken = await k.ingredient(c, "chicken", "Chicken", "kg", { shelfDays: 4 });
  const paneer = await k.ingredient(c, "paneer", "Paneer", "kg", { shelfDays: 7 });
  const rice = await k.ingredient(c, "rice", "Basmati rice", "kg");
  const flour = await k.ingredient(c, "flour", "Wheat flour", "kg");
  const cream = await k.ingredient(c, "cream", "Cream", "l", { shelfDays: 5 });
  const menu: k.MenuSpec[] = [
    { key: "chicken_dum_biryani", category: "biryani", priceMinor: 32000, taxClass: "restaurant_5", brand: brandA, recipe: [[chicken, 200], [rice, 150]],
      display: { name: "Chicken Dum Biryani", description: "Chicken and basmati sealed and slow-cooked in the pot.", diet: "non_veg" } },
    { key: "veg_dum_biryani", category: "biryani", priceMinor: 26000, taxClass: "restaurant_5", brand: brandA, recipe: [[paneer, 80], [rice, 150]],
      display: { name: "Veg Dum Biryani", description: "Paneer and vegetables slow-cooked with basmati.", diet: "veg" } },
    { key: "paneer_wrap", category: "wraps", priceMinor: 25000, taxClass: "restaurant_5", brand: brandB, recipe: [[paneer, 100], [flour, 80]],
      display: { name: "Paneer Wrap", description: "Grilled paneer and onions rolled in a soft flatbread.", diet: "veg" } },
    { key: "chicken_wrap", category: "wraps", priceMinor: 28000, taxClass: "restaurant_5", brand: brandB, recipe: [[chicken, 120], [flour, 80]],
      display: { name: "Chicken Wrap", description: "Spiced grilled chicken rolled in a soft flatbread.", diet: "non_veg" } },
    { key: "gulab_jamun_box", category: "dessert", priceMinor: 18000, taxClass: "restaurant_5", brand: brandC, recipe: [[flour, 60], [cream, 30]],
      display: { name: "Gulab Jamun Box", description: "Six warm milk dumplings in rose-cardamom syrup.", diet: "veg" } },
    { key: "brownie_box", category: "dessert", priceMinor: 20000, taxClass: "restaurant_5", brand: brandC, recipe: [[flour, 70], [cream, 40]],
      display: { name: "Brownie Box", description: "Four fudge brownies, baked each morning.", diet: "egg" } },
  ];
  const items = await k.menu(c, biz, menu, KINDS, histFrom);
  const stockAt = at(D(c.days + 1), "08:00", tz);

  // ---- dated history (R44b): six months of bills and waste through the approved-import path, planted problems at their natural dates ----
  const people = await customers(c, "IN", 20, 5);
  const ZAFRAN = "Zafran Pot (synthetic brand)", WRAP = "Wrap Lane (synthetic brand)";
  const bill = (no: string, date: string, lines: PBill["lines"], o2: Partial<PBill> = {}): PBill =>
    ({ no, date, time: "13:10", outlet: 0, channel: "pickup", type: "pickup", lines, tender: "upi", ...o2 });
  const planted: PBill[] = [];
  const plantedWaste: Waste[] = [];
  // CK-I6: 6 kg of paneer written off as damaged in three logs, Mon 5 to Wed 7 Oct (one ISO week: waste_spike judges a week).
  for (const n of [5, 4, 3]) plantedWaste.push({ date: D(n), time: "21:00", outlet: 0, ing: paneer, qtyMilli: 2000, reason: "damaged" });
  // CK-F3: twelve swiggy orders of two chicken wraps (56,000 + 5% GST = 58,800), two a day 7 to 2 days back; no paneer (CK-I6 is paneer waste in
  // that week). SW-K-SHORT below pays them short.
  for (let i = 0; i < 12; i++) planted.push(bill(`SW-K-SH-${i + 1}`, D(7 - (i % 6)), [{ item: "chicken_wrap", qty: 2 }], { brand: WRAP, channel: "aggregator:swiggy", type: "delivery", time: "19:40" }));
  if (c.days >= 50) {
    // CK-K2 (pack K2: 3% of orders for 4 weeks): sixteen remakes of the chicken wrap (a line written off as `remake`), four in each ISO week from
    // Mon 24 Aug to Sun 20 Sep (W35-W38, ~110-150 orders a week), every other day.
    for (const [i, n] of [47, 45, 43, 41, 40, 38, 36, 34, 33, 31, 29, 27, 26, 24, 22, 20].entries()) {
      planted.push(bill(`CK-K2-${i + 1}`, D(n), [{ item: "chicken_wrap", qty: 1, voidReason: "remake" }, { item: "paneer_wrap", qty: 1 }], { brand: WRAP, tender: "cash" }));
    }
  }
  if (c.days >= 45) {
    // CK-F9: eight bills for two chicken biryanis on the own site, all voided as `customer_left` late on one night (20 days back).
    for (let i = 0; i < 8; i++) planted.push(bill(`CK-F9-${i + 1}`, D(20), [{ item: "chicken_dum_biryani", qty: 2 }], { brand: ZAFRAN, channel: "own_site", type: "delivery", time: "23:05", voidReason: "customer_left" }));
    // CK-K7: 9 l of cream thrown out as expired over three days (33 to 31 days back); it normally wastes none.
    for (const n of [33, 32, 31]) plantedWaste.push({ date: D(n), time: "22:00", outlet: 0, ing: cream, qtyMilli: 3000, reason: "expired" });
  }
  if (c.days >= 92) {
    // CK-G4: five weekly regulars of Zafran Pot, eight orders each (91 to 35 days back), none since.
    for (const [r, phone] of people.regulars.entries()) for (let i = 0; i < 8; i++) {
      planted.push(bill(`CK-G4-${r + 1}-${i + 1}`, D(35 + 7 * i), [{ item: "chicken_dum_biryani", qty: 1 }, { item: "veg_dum_biryani", qty: 1 }], { brand: ZAFRAN, phone, time: "20:00" }));
    }
  }
  const nameOf = (id: string | undefined) => (id === brandA ? ZAFRAN : id === brandB ? WRAP : "Sweet Crate (synthetic brand)");
  const plan = new Plan(c, {
    prefix: "HK", inclusive: false, phones: people.pool, planted, plantedWaste,
    outlets: [{ outlet: o, perDay: [14, 20] }],
    channels: [
      { kind: "counter", w: 15, types: ["takeaway"] }, { kind: "pickup", w: 25, types: ["pickup"] }, { kind: "own_site", w: 25, types: ["pickup", "delivery"] },
      { kind: "aggregator:swiggy", w: 17, types: ["delivery"] }, { kind: "aggregator:zomato", w: 18, types: ["delivery"] },
    ],
    items: menu.map((m) => ({ key: m.key, priceMinor: m.priceMinor, taxClass: m.taxClass, brand: nameOf(m.brand), w: 4, recipe: m.recipe })),
    waste: [{ outlet: 0, ing: chicken, qtyMilli: [500, 1500] }, { outlet: 0, ing: flour, qtyMilli: [500, 1500] }],
    // CK-FC2: the kitchen's orders drop by a quarter from 28 days back (a level shift the forecast has to notice).
    dayFactor: (d) => (c.days >= 57 && d >= D(28) ? 0.75 : 1),
  });
  await k.openingStock(c, "open", o.id, stockAt, [
    { ing: chicken, qtyMilli: 120000 + plan.need(0, chicken), costMinor: 18000 }, { ing: paneer, qtyMilli: 40000 + plan.need(0, paneer), costMinor: 32000 },
    { ing: rice, qtyMilli: 80000 + plan.need(0, rice), costMinor: 9000 }, { ing: flour, qtyMilli: 60000 + plan.need(0, flour), costMinor: 4500 },
    { ing: cream, qtyMilli: 12000 + plan.need(0, cream), costMinor: 28000 },
  ]);
  const fresh = await k.supplier(c, "fresh", "Fresh Farms Wholesale");

  // CK-I2: chicken invoiced 400 paise/kg above the PO on 80 kg.
  const po = await k.purchaseOrder(c, "chicken", fresh, o.id, D(6), [{ ing: chicken, qtyMilli: 80000, priceMinor: 18000 }]);
  await k.goodsReceived(c, "chicken", fresh, o.id, po.id, at(D(5), "07:00", tz), [{ ing: chicken, qtyMilli: 80000, costMinor: null, poLine: po.lines[0]! }]);
  await k.invoice(c, "chicken-over", fresh, "FF-5501", D(5), po.id, [{ ing: chicken, qtyMilli: 80000, priceMinor: 18400, poLine: po.lines[0]! }]);
  c.plant("CK-I2");

  c.plant("CK-I6"); // 6 kg of paneer written off as damaged: dated history above

  // CK-S1: two LPG cylinders on hand against a minimum of four.
  const lpg = await k.ingredient(c, "lpg", "LPG cylinder", "pc");
  await k.openingStock(c, "lpg", o.id, stockAt, [{ ing: lpg, qtyMilli: 2000, costMinor: 180000 }]);
  await k.reorderLevel(c, o.id, lpg, 4000, 6000);
  c.plant("CK-S1");

  // CK-A2: three breakdown repairs billed on a freezer that is under a valid AMC.
  const freezer = await k.asset(c, "freezer1", o.id, "freezer", "Chest freezer (synthetic)", -22, -16);
  await k.amc(c, "freezer1", freezer, "Synthetic Cooling Services", D(100), addDays(A, 265), 3650000);
  await k.repair(c, "freezer1:a", freezer, D(12), 450000, "Synthetic Cooling Services");
  await k.repair(c, "freezer1:b", freezer, D(8), 380000, "Synthetic Cooling Services");
  await k.repair(c, "freezer1:c", freezer, D(3), 520000, "Synthetic Cooling Services");
  c.plant("CK-A2");
  // CK-A3: the walk-in's AMC was renewed early, so two contracts overlap for 75 days.
  const walkin = await k.asset(c, "walkin1", o.id, "chiller", "Walk-in chiller (synthetic)", 1, 5);
  await k.amc(c, "walkin1:old", walkin, "Synthetic Cooling Services", D(300), addDays(A, 30), 3650000);
  await k.amc(c, "walkin1:new", walkin, "Synthetic Cooling Services", D(45), addDays(A, 320), 3650000);
  c.plant("CK-A3");
  // CK-A6: the closing checklist was done on 4 of the last 7 days.
  const closing = ["lock_gas", "clean_hood", "empty_bins", "sanitise_surfaces"];
  await k.checklist(c, "closing", o.id, closing);
  for (const n of [7, 6, 4, 2]) await k.checklistRun(c, `closing:${n}`, o.id, "closing", D(n), closing);
  c.plant("CK-A6");


  // ---- finance ----
  const swiggy = biz.channels["aggregator:swiggy"]!;
  const zomato = biz.channels["aggregator:zomato"]!;
  const termsFrom = D(c.days + 30);
  await k.channelTerms(c, "swiggy", swiggy, { commissionBp: 2200, ads: true, capMinor: 300000, promoBp: 0, cycleDays: 7, from: termsFrom });
  await k.channelTerms(c, "zomato", zomato, { commissionBp: 2200, ads: false, capMinor: null, promoBp: 0, cycleDays: 7, from: termsFrom });
  // Clean history first, so the planted payout files below are the newest import runs (the runs list is capped at 100).
  plan.queue();
  await k.history(c, {
    payouts: [
      { layout: "zomato", prefix: "ZM-K", outlet: o, commissionBp: 2200, withholdsTax: true, bills: (f, t) => plan.aggregatorBills(0, "aggregator:zomato", f, t) },
      { layout: "swiggy", prefix: "SW-K", outlet: o, commissionBp: 2200, withholdsTax: true, bills: (f, t) => plan.aggregatorBills(0, "aggregator:swiggy", f, t) },
    ],
    temp: { outlet: o, assetId: walkin, assetKey: "walkin1", milliC: 3000, hhmm: "09:00" }, rent: { outlet: o, amountMinor: 9000000 },
  });
  // An order line withholds the GST inside the order value (operator collects, Sec 9(5): packs/finance.md §2), split as core splits restaurant_5.
  const line = (ref: string, date: string, gross: number): PayoutLine =>
    ({ kind: "order", orderRef: ref, orderDate: date, gross, commission: (gross * 2200) / 10000, ad: 0, promo: 0, tax: priceLine("restaurant_5", gross, 1, 0, true).tax });
  const ads = (date: string, ad: number): PayoutLine => ({ kind: "ads", orderRef: "", orderDate: date, gross: 0, commission: 0, ad, promo: 0, tax: 0 });
  // CK-F1: channel aggregator:zomato ads are not opted in; two payouts carry ad lines (180 + 220 rupees).
  for (const [ref, from, to, paid, adAmt] of [["ZM-K-C1", D(13), D(7), D(5), 18000], ["ZM-K-C2", D(6), D(1), D(0), 22000]] as const) {
    const lines: PayoutLine[] = [];
    for (let i = 0; i < 5; i++) lines.push(line(`${ref}-${i + 1}`, addDays(from, i), 30000 + i * 4000));
    lines.push(ads(to, adAmt));
    await k.importFile(c, ref, "payout_statement", `${ref}.csv`, payoutFile("zomato", { ref, outlet: o.name, from, to, paidOn: paid }, lines));
  }
  c.plant("CK-F1");
  // CK-F2: channel aggregator:swiggy ads opted in with a 3,000 rupee cap; one payout charges 5,200.
  {
    const lines = [line("SW-K-AD-1", D(12), 70000), line("SW-K-AD-2", D(11), 90000), ads(D(8), 520000)];
    await k.importFile(c, "SW-K-AD", "payout_statement", "SW-K-AD.csv", payoutFile("swiggy", { ref: "SW-K-AD", outlet: o.name, from: D(13), to: D(8), paidOn: D(6) }, lines));
  }
  c.plant("CK-F2");
  // CK-F3: channel aggregator:swiggy pays its 12 planted orders (dated history above) ₹48 short each: commission 17,736 against the contracted
  // 22% of 58,800 = 12,936 (about 30%). Lines are the orders' own totals and tax, so core matches every one and the short is commission only.
  {
    const lines = k.shortLines(plan.aggregatorBills(0, "aggregator:swiggy", D(7), D(2)), "SW-K-SH-", 12, 2200, 4800, true);
    await k.importFile(c, "SW-K-SHORT", "payout_statement", "SW-K-SHORT.csv", payoutFile("swiggy", { ref: "SW-K-SHORT", outlet: o.name, from: D(7), to: D(2), paidOn: D(1) }, lines));
  }
  c.plant("CK-F3");
  await k.flushImports(c);
  if (c.days >= 50) c.plant("CK-K2");
  if (c.days >= 45) for (const id of ["CK-F9", "CK-K7"]) c.plant(id);
  if (c.days >= 57) c.plant("CK-FC2");
  if (c.days >= 92) c.plant("CK-G4");

  // ---- sales (server-stamped: seed day) ----
  const a = items.chicken_dum_biryani!;
  const wrap = items.paneer_wrap!;
  const dessert = items.gulab_jamun_box!;
  await k.coupon(c, "staff30", "STAFF30", { bp: 3000, from: histFrom });
  await k.coupon(c, "leak15", "LEAK15", { bp: 1500, from: histFrom });
  for (let i = 0; i < 4; i++) await k.placeOrder(c, `ord:pickup:${i}`, biz, o, "pickup", "pickup", [{ item: a, qtyMilli: 1000 }], { brand: brandA });
  for (let i = 0; i < 3; i++) await k.placeOrder(c, `ord:site:${i}`, biz, o, "own_site", "delivery", [{ item: dessert, qtyMilli: 2000 }], { brand: brandC });
  // CK-G2 (pack G2 at one week's scale): one cashier applies the staff code to twelve anonymous pickup orders and takes cash for each; the owner and
  // the manager each use it once for a staff meal, so the cashier's twelve stand against a median member count of one.
  for (let i = 0; i < 12; i++) {
    await k.placeOrder(c, `ord:staffcode:${i}`, biz, o, "pickup", "pickup", [{ item: wrap, qtyMilli: 1000 }], { brand: brandB, persona: "cashier", coupons: ["STAFF30"] });
    await k.tenderCash(c, `tender:staffcode:${i}`, `ord:staffcode:${i}`, 20000, "cashier");
  }
  for (const persona of ["owner", "manager"]) await k.placeOrder(c, `ord:staffmeal:${persona}`, biz, o, "pickup", "pickup", [{ item: wrap, qtyMilli: 1000 }], { brand: brandB, persona, coupons: ["STAFF30"] });
  c.plant("CK-G2");
  // CK-G3: a leaked 15% code is used ten times in one day, each by a new guest on the storefront (a first order).
  const sf = await k.storefrontKey(c, biz);
  for (let i = 0; i < 10; i++) await k.storefrontOrder(c, sf, `ord:leak:${i}`, biz, o, dessert, { name: `Guest L${i + 1} (synthetic)`, phone: `+9190000077${String(i).padStart(2, "0")}` }, ["LEAK15"]);
  if (sf !== null) c.plant("CK-G3");
}
