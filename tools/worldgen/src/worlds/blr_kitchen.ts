// blr_kitchen: Kosambari Kitchens (synthetic), a South Indian cloud kitchen in Bengaluru with three kitchens (Indiranagar, HSR Layout,
// Whitefield), most of its orders through Swiggy and Zomato. A demo business with its own storefront (apps/web, NEXT_PUBLIC_MUNIM_SITE=
// blr_kitchen) like cobnut: every reseed is a fresh tenant (cli.ts picks a fresh seed). Three situations are planted for the agents to find,
// each in the hand-kept key answer-key/demo/blr_kitchen.json (test/blr_kitchen.test.ts recomputes it): Swiggy takes 30% against a
// contracted 22% (BK-F3) and Zomato bills ads that were never opted in (BK-F1), urad dal creeps from ₹125 to ₹145 a kilo (BK-I1), and a
// Whitefield cook's overtime spikes (BK-P1). All people, kitchens, suppliers and customers are invented; suppliers are simulated.
import type { Ctx } from "../ctx.ts";
import { payoutFile, type PayoutLine } from "../files.ts";
import { customers, Plan, priceLine, type PBill, type Waste } from "../history.ts";
import * as k from "../kit.ts";
import { addDays, at, businessToday, daysBetween, mondayOf } from "../time.ts";

// The demo sign-in picker's four people (apps/web DEMO_KEYS): the same keys as cobnut, so demo sign-in works on this business's web.
export const meta = { tz: "Asia/Kolkata", currency: "INR", personas: ["owner", "manager", "counter", "kitchen"] } as const;

/** The months the demo runs without a reseed: this one and the next two, for the AI budget and the purchases budget (as cobnut). */
const MONTHS = 3;
const TAX = "restaurant_5";
const KINDS = ["counter", "pickup", "own_site", "aggregator:swiggy", "aggregator:zomato"];
/** Contracted aggregator commission (basis points). */
const SWIGGY_BP = 2200;
const ZOMATO_BP = 2000;

interface Option { key: string; name: string; delta: number }
interface Group { key: string; name: string; description: string | null; min: number; max: number; options: Option[] }
interface Variant { key: string; name: string; price: number }
interface Dish {
  key: string; name: string; description: string; diet: NonNullable<k.Display["diet"]>; category: string; kind: "dish" | "combo";
  price: number | null; variants: Variant[]; groups: Group[]; station: string; prepSec: number; w: number;
}

// Prices in paise before GST (the IN pack shows prices exclusive of tax). Names and words written for this world.
const DISHES: Dish[] = [
  { key: "masala_dosa", name: "Masala Dosa", description: "A crisp rice-and-urad dosa folded over turmeric potato palya, with coconut chutney and sambar.", diet: "veg", category: "dosa", kind: "dish", price: 14000, variants: [], groups: [], station: "tawa", prepSec: 420, w: 6 },
  { key: "ghee_podi_dosa", name: "Ghee Podi Dosa", description: "Brushed with ghee and dusted with gunpowder podi; chutney and sambar on the side.", diet: "veg", category: "dosa", kind: "dish", price: 16000, variants: [], groups: [], station: "tawa", prepSec: 420, w: 5 },
  { key: "set_dosa", name: "Set Dosa", description: "Three soft, spongy dosas with vegetable sagu and coconut chutney.", diet: "veg", category: "dosa", kind: "dish", price: 12000, variants: [], groups: [], station: "tawa", prepSec: 360, w: 3 },
  { key: "onion_rava_dosa", name: "Onion Rava Dosa", description: "A lacy semolina dosa with onion, green chilli and cumin, cooked thin and crisp.", diet: "veg", category: "dosa", kind: "dish", price: 15000, variants: [], groups: [], station: "tawa", prepSec: 480, w: 3 },
  { key: "idli", name: "Idli (two)", description: "Two steamed rice-and-urad idlis with coconut chutney and sambar.", diet: "veg", category: "idli_vada", kind: "dish", price: 7000, variants: [], groups: [], station: "kitchen", prepSec: 180, w: 5 },
  { key: "medu_vada", name: "Medu Vada (two)", description: "Two urad dal vadas, crisp outside and soft inside, with chutney and sambar.", diet: "veg", category: "idli_vada", kind: "dish", price: 8000, variants: [], groups: [], station: "kitchen", prepSec: 240, w: 4 },
  { key: "idli_vada", name: "Idli Vada", description: "One idli and one vada in a bowl of sambar, with chutney.", diet: "veg", category: "idli_vada", kind: "dish", price: 11000, variants: [], groups: [], station: "kitchen", prepSec: 240, w: 4 },
  { key: "bisi_bele_bath", name: "Bisi Bele Bath", description: "Rice, toor dal and vegetables cooked with a roasted spice blend, finished with ghee and boondi.", diet: "veg", category: "rice_bath", kind: "dish", price: 15000, variants: [], groups: [], station: "kitchen", prepSec: 300, w: 4 },
  { key: "curd_rice", name: "Curd Rice", description: "Soft rice and curd, tempered with mustard, curry leaves and a little ginger.", diet: "veg", category: "rice_bath", kind: "dish", price: 11000, variants: [], groups: [], station: "kitchen", prepSec: 180, w: 3 },
  { key: "chitranna", name: "Chitranna", description: "Lemon rice with turmeric, green chilli and roasted peanuts.", diet: "vegan", category: "rice_bath", kind: "dish", price: 11000, variants: [], groups: [], station: "kitchen", prepSec: 180, w: 2 },
  { key: "kesari_bath", name: "Kesari Bath", description: "Warm semolina pudding with ghee, saffron and cashews.", diet: "veg", category: "sweets", kind: "dish", price: 7000, variants: [], groups: [], station: "kitchen", prepSec: 120, w: 2 },
  {
    key: "mysore_pak", name: "Mysore Pak", description: "Gram flour, ghee and sugar cooked into a soft, melting fudge. Boxed to give.", diet: "veg", category: "sweets", kind: "dish", price: null,
    variants: [{ key: "box_4", name: "Box of 4", price: 12000 }, { key: "box_8", name: "Box of 8", price: 22000 }], groups: [], station: "kitchen", prepSec: 60, w: 0,
  },
  { key: "filter_coffee", name: "Filter Coffee", description: "A chicory-blend decoction with hot milk, frothed between tumbler and davara.", diet: "veg", category: "drinks", kind: "dish", price: 4500, variants: [], groups: [], station: "bar", prepSec: 120, w: 5 },
  { key: "neer_majjige", name: "Neer Majjige", description: "Thin spiced buttermilk with ginger, green chilli and curry leaves.", diet: "veg", category: "drinks", kind: "dish", price: 4000, variants: [], groups: [], station: "bar", prepSec: 60, w: 2 },
  {
    key: "breakfast_box", name: "Tiffin Box", description: "A dosa of your choice, one idli, one vada and a filter coffee, packed for the desk.", diet: "veg", category: "combos", kind: "combo", price: 24000, variants: [],
    groups: [{ key: "dosa", name: "Your dosa", description: "Choose one.", min: 1, max: 1, options: [{ key: "masala", name: "Masala dosa", delta: 0 }, { key: "ghee_podi", name: "Ghee podi dosa", delta: 2000 }, { key: "onion_rava", name: "Onion rava dosa", delta: 1000 }] }],
    station: "tawa", prepSec: 540, w: 0,
  },
];

/** The storefront page this business publishes (the T-128 mechanism): its colours pass core's contrast rule (judged again on save). */
export const PAGE = {
  theme: { primary: "#2d6a2e", secondary: "#8f5b00", accent: "#f7dc8f", radius: "round", layout: "hero-banner" },
  sections: [
    { kind: "hero", visible: true, badge: "Bengaluru · three kitchens · pick up hot", tagline: "Crisp dosas, soft idlis and strong filter coffee, from three Bengaluru kitchens." },
    { kind: "outlets", visible: true, title: "Pick your kitchen" },
    { kind: "ribbon", visible: true },
    { kind: "cards", visible: true, cards: [
      { title: "The tiffin box", body: "A dosa of your choice, an idli, a vada and a filter coffee, packed to travel. Choose a kitchen to start." },
      { title: "Filter coffee, done slowly", body: "Decoction brewed through the morning and frothed to order, in a steel tumbler and davara." },
    ] },
  ],
} as const;

export async function build(c: Ctx): Promise<void> {
  // A demo tenant (the "Sample data" badge) is provisioned by the platform operator, so there is no self-serve fallback.
  if (!c.api.hasOperator) throw new Error('blr_kitchen is provisioned by the platform operator (a demo business): add "operator" to MUNIM_SEED_TOKENS');
  const { asOf: A } = c;
  const D = (n: number) => addDays(A, -n);
  const biz = await k.onboard(c, {
    kind: "cloud_kitchen", country: "IN", business: "Kosambari Kitchens (synthetic)", ownerName: "Shalini Rao",
    outlet: { name: "Kosambari Indiranagar", address: "12 Synthetic Cross, HAL 2nd Stage, Indiranagar, Bengaluru (synthetic)", taxIds: { GSTIN: "29AAAAA0002A1Z5", FSSAI: "21000000000002" } },
    more: [
      { name: "Kosambari HSR Layout", address: "5 Synthetic Main, Sector 2, HSR Layout, Bengaluru (synthetic)", kind: "cloud_kitchen", taxIds: { GSTIN: "29AAAAA0002A2Z4", FSSAI: "21000000000003" } },
      { name: "Kosambari Whitefield", address: "88 Synthetic Road, ITPL Main Road, Whitefield, Bengaluru (synthetic)", kind: "cloud_kitchen", taxIds: { GSTIN: "29AAAAA0002A3Z3", FSSAI: "21000000000004" } },
    ],
    aiBudget: { limitMinor: 10_000, months: MONTHS },
  });
  c.s.currency = biz.currency;
  const [ind, hsr, wfd] = biz.outlets as [k.OutletInfo, k.OutletInfo, k.OutletInfo];
  const tz = ind.tz;
  const histFrom = D(c.days + 2);
  const stockAt = at(D(c.days + 1), "06:00", tz);
  const live = businessToday(new Date(), tz);
  const day = (name: string, date: string) => c.api.alias(date, name);
  // A cloud kitchen starts with no counter; a walk-in pickup desk at each kitchen rings up collections on the till.
  const counter = c.api.id("channel:counter");
  await c.api.cmd("owner", "/v1/channels", "tenancy.channel.create.v1", "channel:counter", { channel_id: counter, name: "Counter", kind: "counter" });
  biz.channels["counter"] = counter;

  await k.person(c, "manager", "Manjunath Hegde", "manager", [hsr.id, wfd.id]);
  await k.person(c, "counter", "Divya Shetty", "staff", [ind.id]);
  await k.person(c, "kitchen", "Prakash Nayak", "staff", [ind.id]);
  await k.outletSettings(c, "ind", ind, { phone: "+919000000501" });
  await k.device(c, "kds:2", hsr.id, "kds");
  await k.device(c, "kds:3", wfd.id, "kds");
  for (const [i, o] of biz.outlets.entries()) {
    await k.licence(c, `fssai:${i + 1}`, o.id, "fssai", `2100000000000${i + 2}`, "Synthetic Food Authority", D(220), addDays(A, 480));
  }

  // ---- stock records ----
  const urad = await k.ingredient(c, "urad_dal", "Urad dal (synthetic)", "kg", { shelfDays: 180 });
  const dosaRice = await k.ingredient(c, "dosa_rice", "Idli-dosa rice (synthetic)", "kg", { shelfDays: 180 });
  const rice = await k.ingredient(c, "sona_masoori", "Sona masoori rice (synthetic)", "kg", { shelfDays: 180 });
  const toor = await k.ingredient(c, "toor_dal", "Toor dal (synthetic)", "kg", { shelfDays: 180 });
  const rava = await k.ingredient(c, "rava", "Bombay rava (synthetic)", "kg", { shelfDays: 120 });
  const potato = await k.ingredient(c, "potato", "Potatoes (synthetic)", "kg", { shelfDays: 14 });
  const coconut = await k.ingredient(c, "coconut", "Fresh coconut (synthetic)", "pc", { shelfDays: 10 });
  const ghee = await k.ingredient(c, "ghee", "Ghee (synthetic)", "kg", { shelfDays: 180 });
  const oil = await k.ingredient(c, "oil", "Groundnut oil (synthetic)", "l", { shelfDays: 180 });
  const coffee = await k.ingredient(c, "coffee", "Filter coffee powder (synthetic)", "kg", { shelfDays: 60 });
  const milk = await k.ingredient(c, "milk", "Milk (synthetic)", "l", { shelfDays: 3 });
  const curd = await k.ingredient(c, "curd", "Curd (synthetic)", "kg", { shelfDays: 4 });
  const sugar = await k.ingredient(c, "sugar", "Sugar (synthetic)", "kg", { shelfDays: 365 });
  const besan = await k.ingredient(c, "besan", "Gram flour (synthetic)", "kg", { shelfDays: 120 });
  // Grams (milli-units of the base unit) per portion: the cost the margin reads, and what history sales draw from stock.
  const RECIPES: Record<string, Array<[k.Ingredient, number]>> = {
    masala_dosa: [[dosaRice, 90], [urad, 30], [potato, 120], [oil, 15], [coconut, 250]],
    ghee_podi_dosa: [[dosaRice, 90], [urad, 30], [ghee, 15], [coconut, 250]],
    set_dosa: [[dosaRice, 120], [urad, 35], [oil, 15], [coconut, 200]],
    onion_rava_dosa: [[rava, 80], [dosaRice, 30], [oil, 20], [coconut, 200]],
    idli: [[dosaRice, 70], [urad, 25], [toor, 20], [coconut, 200]],
    medu_vada: [[urad, 90], [oil, 40], [coconut, 200]],
    idli_vada: [[dosaRice, 35], [urad, 60], [oil, 20], [toor, 20], [coconut, 250]],
    bisi_bele_bath: [[rice, 90], [toor, 50], [ghee, 10], [oil, 10]],
    curd_rice: [[rice, 90], [curd, 150], [milk, 30]],
    chitranna: [[rice, 100], [oil, 15]],
    kesari_bath: [[rava, 60], [ghee, 20], [sugar, 50]],
    mysore_pak: [[besan, 60], [ghee, 60], [sugar, 60]],
    filter_coffee: [[coffee, 12], [milk, 120], [sugar, 10]],
    neer_majjige: [[curd, 100]],
    breakfast_box: [[dosaRice, 160], [urad, 85], [potato, 100], [oil, 35], [coconut, 400], [coffee, 12], [milk, 120]],
  };

  // ---- the menu: items, variants, an option group, a price per (sellable, outlet, channel), prep times and stations ----
  const items: Record<string, k.Item> = {};
  for (const d of DISHES) {
    const it = await k.item(c, d.key, {
      category: d.category, kind: d.kind, display: { name: d.name, description: d.description, diet: d.diet },
      variants: d.variants.map((v) => ({ key: v.key, name: v.name })),
      groups: d.groups.map((g) => ({ ...g, options: g.options.map((o) => ({ key: o.key, name: o.name, deltaMinor: o.delta })) })),
    });
    items[d.key] = it;
    await k.recipe(c, it, histFrom, RECIPES[d.key]!.map(([ing, qtyMilli]) => ({ ing, qtyMilli })));
    for (const o of biz.outlets) {
      for (const kind of KINDS) {
        if (d.variants.length === 0) await k.price(c, it, o.id, kind, d.price!, TAX, histFrom);
        for (const v of d.variants) await k.price(c, it, o.id, kind, v.price, TAX, histFrom, { variant: v.key });
      }
      await k.prepTime(c, it, o.id, d.station, d.prepSec, histFrom);
    }
  }
  // Whitefield has no rava dosa (its tawa is short a cook in the evenings).
  await k.availability(c, items.onion_rava_dosa!, wfd.id, false);
  // The morning tiffin: 15% off idlis and vadas, every day 07:00-10:00 kitchen time, all kitchens.
  await k.deal(c, "morning_tiffin", { bp: 1500, itemIds: [items.idli!.id, items.medu_vada!.id, items.idli_vada!.id], windows: [{ days: [1, 2, 3, 4, 5, 6, 7], from: "07:00", to: "10:00" }], from: "2026-01-01" });
  await k.coupon(c, "kosambari10", "KOSAMBARI10", { bp: 1000, from: histFrom, minSpendMinor: 40000 });
  await k.coupon(c, "hsr15", "HSR15", { bp: 1500, from: histFrom, outletIds: [hsr.id] });

  // ---- dated history: bills and waste through the approved-import path, the planted bills at their natural dates ----
  const people = await customers(c, "IN", 24, 0);
  const planted: PBill[] = [];
  const plantedWaste: Waste[] = [];
  // BK-F3: eighteen Swiggy orders at Indiranagar of two ghee podi dosas (32,000 + 5% GST = 33,600), three a day 7 to 2 days back. Its
  // payout statement SW-BK-SHORT below takes 30% on each instead of the contracted 22%.
  for (let i = 0; i < 18; i++) {
    planted.push({ no: `SW-BK-SH-${i + 1}`, date: D(7 - (i % 6)), time: "20:15", outlet: 0, channel: "aggregator:swiggy", type: "delivery", lines: [{ item: "ghee_podi_dosa", qty: 2 }] });
  }
  const simple = DISHES.filter((d) => d.variants.length === 0 && d.groups.length === 0);
  const plan = new Plan(c, {
    prefix: "KK", inclusive: false, phones: people.pool, planted, plantedWaste, hours: [7, 22],
    outlets: [{ outlet: ind, perDay: [22, 32] }, { outlet: hsr, perDay: [18, 26] }, { outlet: wfd, perDay: [14, 22] }],
    channels: [
      { kind: "pickup", w: 10, types: ["pickup"] }, { kind: "own_site", w: 14, types: ["pickup", "delivery"] },
      { kind: "aggregator:swiggy", w: 40, types: ["delivery"] }, { kind: "aggregator:zomato", w: 36, types: ["delivery"] },
    ],
    items: simple.map((d) => ({ key: d.key, priceMinor: d.price!, taxClass: TAX, w: d.w, recipe: RECIPES[d.key]! })),
    waste: biz.outlets.flatMap((_, oi) => [{ outlet: oi, ing: coconut, qtyMilli: [1000, 3000] as [number, number] }, { outlet: oi, ing: milk, qtyMilli: [500, 2000] as [number, number] }]),
  });
  const cost: Array<[k.Ingredient, number]> = [[urad, 12500], [dosaRice, 5200], [rice, 6000], [toor, 14000], [rava, 5000], [potato, 3000], [coconut, 3500],
    [ghee, 65000], [oil, 18000], [coffee, 60000], [milk, 6000], [curd, 8000], [sugar, 4500], [besan, 9000]];
  for (const [oi, o] of biz.outlets.entries()) {
    await k.openingStock(c, `open:${oi + 1}`, o.id, stockAt, cost.map(([ing, costMinor]) => ({ ing, qtyMilli: 20000 + plan.need(oi, ing), costMinor })));
  }

  // ---- simulated suppliers (every name says so), with price lists ----
  const observed = at(D(15), "10:00", tz);
  const pulses = await k.supplier(c, "pulses", "Chickpet Pulses & Grains (simulated)", 15, [
    { key: "urad_dal", ing: urad, priceMinor: 12500, at: observed }, { key: "toor_dal", ing: toor, priceMinor: 14000, at: observed }, { key: "dosa_rice", ing: dosaRice, priceMinor: 5200, at: observed },
  ]);
  await k.supplier(c, "dairy", "Nandi Hills Dairy (simulated)", 7, [{ key: "milk", ing: milk, priceMinor: 6000, at: observed }, { key: "curd", ing: curd, priceMinor: 8000, at: observed }]);
  await k.supplier(c, "coconut", "Tiptur Coconut Traders (simulated)", 7, [{ key: "coconut", ing: coconut, priceMinor: 3500, at: observed }]);

  // BK-I1: urad dal from 12,500 to 14,500 paise a kilo (+16%), three deliveries of 50 kg to Indiranagar each side.
  for (const [tag, n, p] of [["pre1", 13, 12500], ["pre2", 11, 12500], ["pre3", 9, 12500], ["post1", 5, 14500], ["post2", 3, 14500], ["post3", 1, 14500]] as const) {
    await k.goodsReceived(c, `urad-${tag}`, pulses, ind.id, null, at(D(n), "07:00", tz), [{ ing: urad, qtyMilli: 50000, costMinor: p, poLine: null }]);
    await k.invoice(c, `urad-${tag}`, pulses, `CPG-U-${tag}`, D(n), null, [{ ing: urad, qtyMilli: 50000, priceMinor: p, poLine: null }]);
  }
  c.plant("BK-I1");

  // ---- labour: two cooks or packers per kitchen, rostered and clocked for the live-command reach ----
  // BK-P1: Whitefield's cook (rostered 11:00-19:00) clocks out an hour late on 18 of his 26 shifts from 26 days back (3, 5, 5 and 5 a week
  // as the four weeks go), planted only when attendance reaches that far.
  const crew: Array<[k.OutletInfo, k.Staff]> = [
    [ind, await k.staff(c, "divya", "Divya Shetty", ind.id, "packer", 11000, "2025-03-01")],
    [ind, await k.staff(c, "prakash", "Prakash Nayak", ind.id, "cook", 13000, "2025-03-01")],
    [hsr, await k.staff(c, "salma", "Salma Begum (synthetic)", hsr.id, "cook", 13000, "2025-05-01")],
    [hsr, await k.staff(c, "kiran", "Kiran Poojary (synthetic)", hsr.id, "packer", 11000, "2025-05-01")],
    [wfd, await k.staff(c, "mahesh", "Mahesh Gowda (synthetic)", wfd.id, "cook", 12000, "2025-06-01")],
    [wfd, await k.staff(c, "teju", "Tejaswini Rao (synthetic)", wfd.id, "packer", 11000, "2025-06-01")],
  ];
  const p1 = c.liveDays >= 26;
  const p1From = D(26);
  const lateDays = new Set([1, 3, 5, 7, 8, 10, 11, 13, 14, 15, 17, 18, 20, 21, 22, 23, 24, 25]);
  const from = D(c.liveDays);
  for (const o of biz.outlets) {
    const here = crew.filter(([oo]) => oo === o).map(([, s]) => s);
    for (let w = mondayOf(from); w <= D(1); w = addDays(w, 7)) {
      const shifts = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(w, i);
        if (d >= from && d <= D(1)) for (const s of here) shifts.push({ staff: s, date: d, start: "11:00", end: "19:00", role: s.key === "divya" || s.key === "kiran" || s.key === "teju" ? "packer" : "cook" });
      }
      if (shifts.length) await k.roster(c, `${o.id.slice(0, 8)}:${w}`, o, w, shifts, (d, t) => at(d, t, tz));
    }
    for (const s of here) {
      for (let d = from; d <= D(1); d = addDays(d, 1)) {
        const late = p1 && s.key === "mahesh" && d >= p1From && lateDays.has(daysBetween(p1From, d));
        await k.attend(c, o, s, d, at(d, "11:00", tz), at(d, late ? "20:00" : "19:00", tz));
      }
    }
  }
  if (p1) c.plant("BK-P1");

  // ---- finance: the aggregators' terms, the clean statements, then the planted ones ----
  const swiggy = biz.channels["aggregator:swiggy"]!;
  const zomato = biz.channels["aggregator:zomato"]!;
  const termsFrom = D(c.days + 30);
  await k.channelTerms(c, "swiggy", swiggy, { commissionBp: SWIGGY_BP, ads: false, capMinor: null, promoBp: 0, cycleDays: 7, from: termsFrom });
  await k.channelTerms(c, "zomato", zomato, { commissionBp: ZOMATO_BP, ads: false, capMinor: null, promoBp: 0, cycleDays: 7, from: termsFrom });
  plan.queue();
  await k.history(c, {
    payouts: biz.outlets.flatMap((o, oi) => [
      { layout: "swiggy" as const, prefix: `SW-BK${oi + 1}`, outlet: o, commissionBp: SWIGGY_BP, withholdsTax: true, bills: (f: string, t: string) => plan.aggregatorBills(oi, "aggregator:swiggy", f, t) },
      { layout: "zomato" as const, prefix: `ZM-BK${oi + 1}`, outlet: o, commissionBp: ZOMATO_BP, withholdsTax: true, bills: (f: string, t: string) => plan.aggregatorBills(oi, "aggregator:zomato", f, t) },
    ]),
    rent: { outlet: ind, amountMinor: 9_500_000, monthly: true },
  });
  for (const [o, amount] of [[hsr, 8_000_000], [wfd, 7_000_000]] as const) {
    for (let d = D(c.days); d <= D(14); d = addDays(d, 1)) {
      if (d.endsWith("-01")) await k.expense(c, `rent:${o.id.slice(0, 8)}:${d}`, o.id, "rent", d, amount, 0, "Synthetic Estates LLP");
    }
  }
  // An order line withholds the GST inside the order value (the operator collects it), split as core splits restaurant_5.
  const line = (ref: string, date: string, gross: number): PayoutLine =>
    ({ kind: "order", orderRef: ref, orderDate: date, gross, commission: (gross * ZOMATO_BP) / 10000, ad: 0, promo: 0, tax: priceLine(TAX, gross, 1, 0, true).tax });
  const ads = (date: string, ad: number): PayoutLine => ({ kind: "ads", orderRef: "", orderDate: date, gross: 0, commission: 0, ad, promo: 0, tax: 0 });
  // BK-F1: Zomato ads at HSR Layout were never opted in, yet two statements carry ad lines (250 + 300 rupees).
  for (const [ref, f, t, paid, adAmt] of [["ZM-BK-C1", D(13), D(7), D(5), 25000], ["ZM-BK-C2", D(6), D(1), D(0), 30000]] as const) {
    const lines: PayoutLine[] = [];
    for (let i = 0; i < 5; i++) lines.push(line(`${ref}-${i + 1}`, addDays(f, i), 30000 + i * 5000));
    lines.push(ads(t, adAmt));
    await k.importFile(c, ref, "payout_statement", `${ref}.csv`, payoutFile("zomato", { ref, outlet: hsr.name, from: f, to: t, paidOn: paid }, lines));
  }
  c.plant("BK-F1");
  // BK-F3: Swiggy pays Indiranagar's 18 planted orders (dated history above) at 30%: commission 10,080 against the contracted 22% of
  // 33,600 = 7,392. The lines are the orders' own totals and tax, so core matches every one and the short is commission only.
  {
    const lines = k.shortLines(plan.aggregatorBills(0, "aggregator:swiggy", D(7), D(2)), "SW-BK-SH-", 18, SWIGGY_BP, 2688, true);
    await k.importFile(c, "SW-BK-SHORT", "payout_statement", "SW-BK-SHORT.csv", payoutFile("swiggy", { ref: "SW-BK-SHORT", outlet: ind.name, from: D(7), to: D(2), paidOn: D(1) }, lines));
  }
  c.plant("BK-F3");
  await k.flushImports(c);

  // The purchases budget for the whole business, this month and the next two, the owner's own command: ₹1,50,000 a month.
  for (let i = 0; i < MONTHS; i++) {
    await k.budget(c, i === 0 ? "purchases" : `purchases:+${i}`, { month: k.monthAfter(live, i), category: "purchases", amountMinor: 15_000_000 });
  }
  await k.reorderLevel(c, ind.id, urad, 15000, 60000);

  // ---- today: pickup windows, live orders at each kitchen, open kitchen tickets, storefront orders ----
  for (const o of biz.outlets) {
    for (const [name, date] of [["today", live], ["tomorrow", addDays(live, 1)]] as const) {
      await k.pickupWindows(c, `${o.id.slice(0, 8)}:${name}`, o.id, day(`windows_${name}`, date), "07:00", "22:00", 30, 8);
    }
  }
  const ol = (key: string, qty = 1, variant?: string, options: string[] = []): k.OrderLine => ({ item: items[key]!, qtyMilli: qty * 1000, ...(variant ? { variant } : {}), options });
  const todays: Array<[k.OutletInfo, string, "pickup" | "delivery" | "takeaway", k.OrderLine[]]> = [
    [ind, "aggregator:swiggy", "delivery", [ol("masala_dosa", 2), ol("filter_coffee", 2)]],
    [ind, "aggregator:zomato", "delivery", [ol("bisi_bele_bath"), ol("neer_majjige")]],
    [ind, "counter", "takeaway", [ol("breakfast_box", 1, undefined, ["dosa:ghee_podi"])]],
    [ind, "aggregator:swiggy", "delivery", [ol("idli_vada", 2), ol("kesari_bath")]],
    [hsr, "aggregator:zomato", "delivery", [ol("set_dosa"), ol("filter_coffee")]],
    [hsr, "aggregator:swiggy", "delivery", [ol("ghee_podi_dosa"), ol("medu_vada")]],
    [hsr, "counter", "takeaway", [ol("mysore_pak", 1, "box_8")]],
    [wfd, "aggregator:swiggy", "delivery", [ol("curd_rice"), ol("chitranna")]],
    [wfd, "aggregator:zomato", "delivery", [ol("masala_dosa"), ol("idli")]],
  ];
  for (const [i, [o, channel, kind, lines]] of todays.entries()) {
    await k.placeOrder(c, `ord:today:${i}`, biz, o, channel, kind, lines, { externalRef: `KK-LIVE-${i + 1}` });
    if (channel === "counter") await k.tenderUpiFull(c, `tender:today:${i}`, `ord:today:${i}`);
  }
  // Prakash at Indiranagar's kitchen screen: the first ticket is ready, the next is on the tawa; the rest wait.
  await k.advanceTickets(c, "ind", ind, "kitchen", [["preparing", "ready"], ["preparing"]]);
  const sf = await k.storefrontKey(c, biz, []);
  c.s.storefrontKey = sf;
  for (let i = 0; i < 2; i++) await k.storefrontOrder(c, sf, `ord:sf:${i}`, biz, ind, items.masala_dosa!, { name: `Guest ${i + 1} (synthetic)`, phone: `+9190000005${i}0` });

  // ---- the storefront page: saved and published as the owner, before onboarding completes (after it a demo business's live page is
  // protected and only reseeding changes it) ----
  const page = c.api.id("storefront:page:1");
  await c.api.cmd("owner", "/v1/storefront-pages", "storefront.page.save.v1", "storefront:page:1", { page_id: page, based_on_version: null, doc: PAGE });
  await c.api.cmd("owner", "/v1/storefront-pages/{id}:publish", "storefront.page.publish.v1", "storefront:publish:1", { publish_id: c.api.id("storefront:publish:1"), page_id: page }, { params: { id: page } });

  // What a live AI run of this business still lacks, read back from core and only reported: the roles' prices are platform-wide and not
  // this seed's to set.
  if (!c.api.lenient) c.s.aiMissing = await k.aiReadiness(c, biz.currency, Array.from({ length: MONTHS }, (_, i) => k.monthAfter(A, i)));
}
