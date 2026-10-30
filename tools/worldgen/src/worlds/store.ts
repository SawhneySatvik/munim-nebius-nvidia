// store: a synthetic neighbourhood shop (IN) selling packaged goods by barcode, with batches, expiry and MRP.
// Conventions as restaurant_group.ts; the hand-kept key is answer-key/store.json.
import type { Ctx } from "../ctx.ts";
import { customers, Plan, type PBill, type Waste } from "../history.ts";
import * as k from "../kit.ts";
import { addDays, at } from "../time.ts";

export const meta = { tz: "Asia/Kolkata", currency: "INR", personas: ["owner"] } as const;

export async function build(c: Ctx): Promise<void> {
  const { asOf: A } = c;
  const D = (n: number) => addDays(A, -n);
  const biz = await k.onboard(c, {
    kind: "shop", country: "IN", business: "Corner Mart (synthetic)", ownerName: "Nisha Verma (synthetic)",
    outlet: { name: "Corner Mart Main", address: "12 Synthetic Market Road, Pune (synthetic)", taxIds: { GSTIN: "27ABCDE1234F1Z5", FSSAI: "55555555555555" } },
  });
  c.s.currency = biz.currency;
  const o = biz.outlets[0]!;
  const tz = o.tz;
  const histFrom = D(c.days + 2);
  const stockAt = at(D(c.days + 1), "08:00", tz);
  const mart = await k.supplier(c, "mart", "Metro Grain Traders");
  // The shop's manager (the compliance task's assignee, pack §6), invited; not signed in yet.
  await k.invite(c, "manager", "Imran Khan (synthetic)", "manager", [o.id]);

  // SKU = a batch-tracked stock record + a catalogue item that scans to it.
  interface Sku { ing: k.Ingredient; item: k.Item; mrp: number }
  const sku = async (key: string, name: string, barcode: string, mrp: number, price: number, taxClass: string): Promise<Sku> => {
    const ing = await k.ingredient(c, key, name, "pc", { batch: true, shelfDays: 180 });
    const it = await k.item(c, key, { category: "grocery", kind: "sku", stock: ing, barcode, mrp: { minor: mrp, currency: biz.currency }, display: { name } });
    await k.price(c, it, o.id, "counter", price, taxClass, histFrom);
    await k.price(c, it, o.id, "own_site", price, taxClass, histFrom);
    return { ing, item: it, mrp };
  };
  const atta = await sku("atta_5kg", "Atta 5 kg", "8901234500011", 28000, 26000, "goods_5");
  const sugar = await sku("sugar_1kg", "Sugar 1 kg", "8901234500028", 5200, 4800, "goods_5");
  const biscuit = await sku("biscuit_pack", "Biscuit pack", "8901234500035", 3000, 3000, "goods_exempt");
  const yoghurt = await sku("yoghurt_cup", "Yoghurt cup", "8901234500042", 3500, 3300, "goods_5");
  const milk = await sku("milk_pack", "Milk 1 l pack", "8901234500059", 6800, 6500, "goods_exempt");
  const rice = await sku("rice_5kg", "Rice 5 kg", "8901234500066", 62000, 58000, "goods_5");
  const detergent = await sku("detergent_1kg", "Detergent 1 kg", "8901234500073", 14000, 11000, "goods_18");

  // Six more SKUs that only the dated history sells (the plants above own the on-hand of every SKU listed before them; none of these is
  // batch-tracked, none has a plant but the ones below). Opening stock at the end of this block covers everything the history draws.
  const extra = [
    { key: "tea_250g", name: "Tea 250 g", price: 12000, cost: 9000, tax: "goods_5", w: 5 }, { key: "salt_1kg", name: "Salt 1 kg", price: 2400, cost: 1800, tax: "goods_exempt", w: 4 },
    { key: "soap_bar", name: "Soap bar", price: 3500, cost: 2400, tax: "goods_18", w: 3 }, { key: "pulses_1kg", name: "Pulses 1 kg", price: 14000, cost: 10500, tax: "goods_5", w: 4 },
    { key: "chips_pack", name: "Chips pack", price: 2000, cost: 1400, tax: "goods_12", w: 5 }, { key: "oil_1l", name: "Cooking oil 1 l", price: 18000, cost: 14000, tax: "goods_5", w: 3 },
  ] as const;
  const hist = new Map<string, { ing: k.Ingredient; cost: number }>();
  for (const e of extra) {
    const ing = await k.ingredient(c, e.key, e.name, "pc");
    const it = await k.item(c, e.key, { category: "grocery", kind: "sku", stock: ing, display: { name: e.name } });
    await k.price(c, it, o.id, "counter", e.price, e.tax, histFrom);
    await k.price(c, it, o.id, "own_site", e.price, e.tax, histFrom);
    hist.set(e.key, { ing, cost: e.cost });
  }
  const people = await customers(c, "IN", 20, 4);
  const bill = (no: string, date: string, lines: PBill["lines"], o2: Partial<PBill> = {}): PBill =>
    ({ no, date, time: "11:20", outlet: 0, channel: "counter", type: "takeaway", lines, tender: "upi", ...o2 });
  const planted: PBill[] = [];
  const plantedWaste: Waste[] = [];
  if (c.days >= 45) {
    // ST-K7: 20 tea packs written off as damaged over three days (40 to 38 days back, one ISO week); the shop normally writes off none.
    for (const [n, q] of [[40, 7000], [39, 7000], [38, 6000]] as const) plantedWaste.push({ date: D(n), time: "18:30", outlet: 0, ing: hist.get("tea_250g")!.ing, qtyMilli: q, reason: "damaged" });
    // ST-F9: six full cash refunds of two tea packs in six days (20 to 15 days back), `customer_complaint`.
    for (const [i, n] of [20, 19, 18, 17, 16, 15].entries()) planted.push(bill(`ST-F9-${i + 1}`, D(n), [{ item: "tea_250g", qty: 2 }], { tender: "cash", refund: { minor: "full", mode: "cash", reason: "customer_complaint" } }));
  }
  if (c.days >= 92) {
    // ST-G4: four weekly regulars, eight baskets each (91 to 35 days back), none since.
    for (const [r, phone] of people.regulars.entries()) for (let i = 0; i < 8; i++) {
      planted.push(bill(`ST-G4-${r + 1}-${i + 1}`, D(35 + 7 * i), [{ item: "tea_250g", qty: 1 }, { item: "pulses_1kg", qty: 1 }], { phone, time: "18:05" }));
    }
  }
  const plan = new Plan(c, {
    prefix: "CM", inclusive: false, phones: people.pool, planted, plantedWaste,
    outlets: [{ outlet: o, perDay: [14, 22] }],
    channels: [{ kind: "counter", w: 80, types: ["takeaway"] }, { kind: "own_site", w: 10, types: ["pickup", "delivery"] }, { kind: "pickup", w: 10, types: ["pickup"] }],
    items: extra.map((e) => ({ key: e.key, priceMinor: e.price, taxClass: e.tax, w: e.w, recipe: [[hist.get(e.key)!.ing, 1000]] as Array<[k.Ingredient, number]> })),
    waste: [{ outlet: 0, ing: hist.get("chips_pack")!.ing, qtyMilli: [1000, 3000] }, { outlet: 0, ing: hist.get("salt_1kg")!.ing, qtyMilli: [1000, 2000] }],
  });

  const batch = (code: string, expires: string | null, mrp: number) => ({ code, expires, mrpMinor: mrp });
  await k.openingStock(c, "open", o.id, stockAt, [
    { ing: atta.ing, qtyMilli: 100000, costMinor: 21000, batch: batch("ATTA-B0", addDays(A, 150), 28000) },
    { ing: sugar.ing, qtyMilli: 100000, costMinor: 4000, batch: batch("SUGAR-B0", addDays(A, 200), 5200) },
    { ing: yoghurt.ing, qtyMilli: 40000, costMinor: 2500, batch: batch("YOG-B7", addDays(A, 3), 3500) },
    { ing: milk.ing, qtyMilli: 12000, costMinor: 5200, batch: batch("MILK-B3", D(2), 6800) },
    { ing: rice.ing, qtyMilli: 500000, costMinor: 45000, batch: batch("RICE-B1", addDays(A, 300), 62000) },
    { ing: detergent.ing, qtyMilli: 10000, costMinor: 9000, batch: batch("DET-B1", addDays(A, 400), 14000) },
  ]);
  await k.openingStock(c, "open-history-skus", o.id, stockAt, extra.map((e) => ({ ing: hist.get(e.key)!.ing, qtyMilli: 100000 + plan.need(0, hist.get(e.key)!.ing), costMinor: e.cost })));
  // ST-C4: the new biscuit batch is printed with an MRP of 28.00 but the shelf price is still the old 30.00.
  await k.goodsReceived(c, "biscuit", mart, o.id, null, at(D(1), "07:00", tz), [{ ing: biscuit.ing, qtyMilli: 140000, costMinor: 2200, poLine: null, batch: batch("BISC-B2", addDays(A, 120), 2800) }]);
  await k.placeOrder(c, "ord:biscuit-try", biz, o, "counter", "takeaway", [{ item: biscuit.item, qtyMilli: 1000, barcode: "8901234500035" }], { refusedWith: "price_above_mrp" });
  c.plant("ST-C4");
  // ST-X1: a milk batch expired two days ago is still on the shelf; the sale of it is refused.
  await k.placeOrder(c, "ord:milk-try", biz, o, "counter", "takeaway", [{ item: milk.item, qtyMilli: 1000 }], { refusedWith: "expired_batch" });
  c.plant("ST-X1");
  // ST-I4: 40 yoghurt cups in a batch that expires in three days.
  c.plant("ST-I4");
  // ST-S1: ten detergent bottles on hand against a minimum of 24.
  await k.reorderLevel(c, o.id, detergent.ing, 24000, 48000);
  c.plant("ST-S1");
  // ST-I5: the rice count finds 470 of 500 bags (6% short).
  await k.countStock(c, "rice", o.id, [{ ing: rice.ing, batchCode: "RICE-B1", countedMilli: 470000 }]);
  c.plant("ST-I5");

  // ---- purchasing ----
  // ST-I2: sugar invoiced 300 paise above the PO on 80 packs.
  const po = await k.purchaseOrder(c, "sugar", mart, o.id, D(6), [{ ing: sugar.ing, qtyMilli: 80000, priceMinor: 4000 }]);
  await k.goodsReceived(c, "sugar", mart, o.id, po.id, at(D(5), "07:00", tz), [{ ing: sugar.ing, qtyMilli: 80000, costMinor: null, poLine: po.lines[0]!, batch: batch("SUGAR-B1", addDays(A, 200), 5200) }]);
  await k.invoice(c, "sugar-over", mart, "MT-3301", D(5), po.id, [{ ing: sugar.ing, qtyMilli: 80000, priceMinor: 4300, poLine: po.lines[0]! }]);
  c.plant("ST-I2");
  // ST-I3: "SC-7781" and "SC7781", same total, two days apart; the second is left unapproved.
  await k.invoice(c, "sugar-7781", mart, "SC-7781", D(9), null, [{ ing: sugar.ing, qtyMilli: 50000, priceMinor: 4000, poLine: null }]);
  await k.invoice(c, "sugar-7781b", mart, "SC7781", D(7), null, [{ ing: sugar.ing, qtyMilli: 50000, priceMinor: 4000, poLine: null }], { approve: false });
  c.plant("ST-I3");
  // ST-I1: atta +10% (21,000 to 23,100 paise per bag), three deliveries each side of the rise, 50 bags a time.
  for (const [tag, day, p] of [["pre1", 13, 21000], ["pre2", 11, 21000], ["pre3", 9, 21000], ["post1", 5, 23100], ["post2", 3, 23100], ["post3", 1, 23100]] as const) {
    await k.goodsReceived(c, `atta-${tag}`, mart, o.id, null, at(D(day), "07:00", tz), [{ ing: atta.ing, qtyMilli: 50000, costMinor: p, poLine: null, batch: batch(`ATTA-${tag}`, addDays(A, 150), 28000) }]);
    await k.invoice(c, `atta-${tag}`, mart, `MT-A-${tag}`, D(day), null, [{ ing: atta.ing, qtyMilli: 50000, priceMinor: p, poLine: null }]);
  }
  c.plant("ST-I1");
  // ST-A5: the Shops & Establishment licence runs out in 12 days.
  await k.licence(c, "fssai", o.id, "fssai", "55555555555555", "Synthetic Food Authority", D(200), addDays(A, 165));
  await k.licence(c, "shops", o.id, "shops_establishment", "SE-SYN-0042", "Synthetic Municipal Office", D(353), addDays(A, 12));
  c.plant("ST-A5");

  // ---- customers and sales (barcode scans at the counter; orders land on the seed day) ----
  await k.customer(c, "anil", "Anil Kulkarni (synthetic)", "+919000000010", 50);
  await k.customer(c, "deepa", "Deepa Joshi (synthetic)", "+919000000011", 0);
  for (let i = 0; i < 4; i++) {
    const sk = i % 2 ? sugar : atta;
    await k.placeOrder(c, `ord:scan:${i}`, biz, o, "counter", "takeaway", [{ item: sk.item, qtyMilli: 1000 + (i % 2) * 1000, barcode: i % 2 ? "8901234500028" : "8901234500011" }]);
    if (i % 2) await k.tenderUpi(c, `tender:scan:${i}`, `ord:scan:${i}`, i === 1 ? 10080 : 10080);
    else await k.tenderCash(c, `tender:scan:${i}`, `ord:scan:${i}`, 30000);
  }
  plan.queue();
  await k.history(c, { payouts: [], rent: { outlet: o, amountMinor: 4500000 } });
  await k.flushImports(c);
  if (c.days >= 45) for (const id of ["ST-K7", "ST-F9"]) c.plant(id);
  if (c.days >= 92) c.plant("ST-G4");
}
