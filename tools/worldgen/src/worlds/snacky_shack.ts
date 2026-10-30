// snacky_shack: The Snacky Shack, a smash-burger takeaway in Geelong (AU pack: Australia/Melbourne, AUD, GST inside the price). Real menu,
// synthetic history: the categories, items, prices and option groups are the shop's own menu, transcribed by hand from its app's menu
// seed (names, descriptions, prices and modifiers only; nothing else of the shop's was read). Everything around the menu is invented and
// labelled: the owner and staff, the address and ABN, the recipes and costs, the suppliers (simulated), the customers and six months of
// orders. Using it in public needs the owner's written consent first. A demo business with its own storefront (apps/web,
// NEXT_PUBLIC_MUNIM_SITE=snacky_shack); every reseed is a fresh tenant. Two situations are planted, each in the hand-kept key
// answer-key/demo/snacky_shack.json (test/snacky_shack.test.ts recomputes it): DoorDash takes 30% against a contracted 25% (SS-F3), and
// the beef patty creeps from A$1.40 to A$1.65 (SS-I1). The 183-day history crosses both Melbourne daylight-saving changes.
import type { Ctx } from "../ctx.ts";
import { payoutFile } from "../files.ts";
import { customers, Plan, type PBill, type Waste } from "../history.ts";
import * as k from "../kit.ts";
import { addDays, at, businessToday, mondayOf } from "../time.ts";

export const meta = { tz: "Australia/Melbourne", currency: "AUD", personas: ["owner", "manager", "counter", "kitchen"] } as const;

const MONTHS = 3;
const TAX = "gst_10";
const KINDS = ["counter", "table_qr", "pickup", "own_site", "aggregator:ubereats", "aggregator:doordash"];
const UBER_BP = 2500;
const DOORDASH_BP = 2500;

interface Option { label: string; delta: number }
interface Group { name: string; min: number; max: number; options: Option[] }
interface MenuItem { name: string; description: string; price: number; groups?: Group[] }

// The shop's option-group shapes (add-ons: any number, none required; a required or optional single choice; three sizes).
const addOns = (options: Option[]): Group[] => [{ name: "Add-ons", min: 0, max: options.length, options }];
const requiredSingle = (name: string, options: Option[]): Group[] => [{ name, min: 1, max: 1, options }];
const optionalSingle = (name: string, options: Option[]): Group[] => [{ name, min: 0, max: 1, options }];
const sizes = (): Group[] => requiredSingle("Size", [{ label: "Small", delta: 0 }, { label: "Medium", delta: 200 }, { label: "Large", delta: 400 }]);

// The real menu, in the shop's order. Prices in cents of AUD, GST included (the AU pack shows prices inclusive of tax).
const MENU: Array<{ slug: string; label: string; items: MenuItem[] }> = [
  { slug: "smash_mates", label: "Smash Mates", items: [
    { name: "Beef Smash Mate", description: "Double-smashed beef patty, American cheese, pickles, onion, house sauce on a toasted milk bun.", price: 1399, groups: addOns([{ label: "Eggs", delta: 150 }, { label: "Lettuce & Tomato", delta: 100 }]) },
    { name: "Chicken Smash Mate", description: "Crispy smashed chicken thigh, American cheese, pickles, onion, house sauce on a toasted milk bun.", price: 1399, groups: addOns([{ label: "Eggs", delta: 150 }, { label: "Lettuce & Tomato", delta: 100 }]) },
    { name: "The Aussie Mate", description: "Double beef smash, cheese, beetroot, fried egg, BBQ sauce — the true blue classic.", price: 1699, groups: addOns([{ label: "Eggs", delta: 150 }, { label: "Beetroot", delta: 100 }]) },
    { name: "Double Trouble Burger", description: "Two smashed beef patties, double cheese, grilled onions, pickles, Snacky sauce.", price: 1799 },
    { name: "Moo & Cluck", description: "Smashed beef patty and crispy chicken stacked with cheese, slaw and Snacky sauce.", price: 1899 },
    { name: "Crunchy Chicken Burger", description: "Buttermilk-crumbed chicken breast, slaw, pickles, mayo on a toasted bun.", price: 1599 },
    { name: "Peri-Peri Chicken Burger", description: "Flame-grilled peri-peri chicken thigh, lettuce, tomato, peri mayo.", price: 1699 },
    { name: "Avo Ranch Chicken Burger", description: "Crispy chicken, smashed avocado, lettuce, tomato, ranch drizzle.", price: 1699 },
  ] },
  { slug: "indian_style_burgers", label: "Indian Style Burgers", items: [
    { name: "Korma Chicken/Beef Burger", description: "Slow-simmered korma-spiced patty, house slaw, mint yoghurt sauce on a toasted bun.", price: 1999, groups: requiredSingle("Choice of Meat", [{ label: "Chicken", delta: 0 }, { label: "Beef", delta: 0 }]) },
    { name: "Butter Chicken Burger", description: "Tandoori chicken patty tossed in creamy butter chicken sauce, pickled onion, coriander.", price: 1899 },
  ] },
  { slug: "veggie_room", label: "Veggie Room", items: [
    { name: "Spicy Paneer Burger", description: "Crispy spiced paneer patty, tangy chutney, slaw, mint mayo.", price: 1799 },
    { name: "Crunchy Paneer Burger", description: "Golden crumbed paneer, lettuce, tomato, garlic mayo.", price: 1799 },
    { name: "Aloo Tikki Burger", description: "Spiced potato and pea patty, tamarind chutney, fresh salad on a soft bun.", price: 1399 },
    { name: "Stuffed Kulcha", description: "Traditional stuffed kulcha bread with spiced potato filling, served with chutney.", price: 1199 },
    { name: "Veggie Crunch", description: "Crumbed mixed-vegetable patty, slaw, pickles, chutney mayo.", price: 1799 },
  ] },
  { slug: "mini_munch", label: "Mini Munch", items: [
    { name: "Mini Cheese Burger", description: "A pint-sized classic — beef patty, cheese, pickles, mustard.", price: 899 },
    { name: "Mini Veggie Burger", description: "A pint-sized veggie patty with lettuce, tomato and mayo.", price: 899 },
    { name: "Mini Chicken & Cheese", description: "Bite-sized crumbed chicken with melted cheese.", price: 999 },
    { name: "Mini Samosas", description: "Golden fried mini samosas with spiced potato filling, served with chutney.", price: 999 },
  ] },
  { slug: "snacky_signature_boxes", label: "Snacky Signature Boxes", items: [
    { name: "Special Snacky Box for 1", description: "Our signature combo built for one — a Snacky favourite, fries and a drink.", price: 1900 },
    { name: "Special Snacky Box for 2", description: "Our signature combo to share — Snacky favourites, fries and drinks for two.", price: 2500 },
  ] },
  { slug: "specials", label: "Specials", items: [
    { name: "Fish Fry", description: "Crispy battered fish fillets, served golden and hot.", price: 1499 },
    { name: "Lava Chicken Tenders", description: "Crunchy chicken tenders tossed in our fiery lava glaze.", price: 1599 },
    { name: "The Snacky Chicken Wrap", description: "Grilled spiced chicken, slaw and sauce wrapped in soft flatbread.", price: 1399 },
    { name: "Crunchy Chicken Schnitzel & Chips", description: "Golden crumbed chicken schnitzel served with a side of chips.", price: 1699 },
    { name: "Loaded Fries", description: "A generous pile of fries loaded with cheese, sauce and toppings.", price: 1699, groups: optionalSingle("Extra Sauce", [{ label: "Butter Chicken Sauce", delta: 300 }]) },
  ] },
  { slug: "sides", label: "Sides", items: [
    { name: "Spring Rolls", description: "Crispy vegetable spring rolls served with sweet chilli sauce.", price: 999 },
    { name: "Hash Brown", description: "Golden crispy hash browns.", price: 999 },
    { name: "Wedges", description: "Crispy potato wedges with sour cream and sweet chilli.", price: 999 },
    { name: "Chicken Bites with Chips", description: "Crispy chicken bites served with a side of chips.", price: 999 },
    { name: "Gravy Fries", description: "Golden fries smothered in rich gravy.", price: 999 },
    { name: "Onion Rings", description: "Crispy battered onion rings.", price: 999 },
    { name: "Sweet Potato Chips", description: "Crispy sweet potato chips.", price: 999 },
    { name: "Chicken Bites", description: "Crispy bite-sized crumbed chicken pieces.", price: 1199 },
    { name: "Dim Sims with Chips", description: "Classic dim sims served with a side of chips.", price: 999 },
    { name: "Mini Dim Sim", description: "A single mini dim sim.", price: 100 },
    { name: "Dim Sim", description: "A single classic dim sim.", price: 250 },
  ] },
  { slug: "fries", label: "Fries", items: [
    { name: "Fries", description: "Classic golden crispy fries, lightly salted.", price: 499, groups: sizes() },
    { name: "Peri Peri Fries", description: "Golden fries tossed in peri-peri seasoning.", price: 499, groups: sizes() },
  ] },
  { slug: "drinks_shakes", label: "Drinks & Shakes", items: [
    { name: "Water", description: "Bottled still water.", price: 299 },
    { name: "Soft Drinks Can", description: "Assorted soft drink cans.", price: 399 },
    { name: "Lassi", description: "Traditional churned yoghurt drink.", price: 599, groups: requiredSingle("Flavour", [{ label: "Mango", delta: 0 }, { label: "Sweet", delta: 0 }, { label: "Salty", delta: 0 }]) },
    { name: "Indian Style Cold Coffee", description: "Chilled sweet cold coffee, Indian style.", price: 699 },
    { name: "Special Mango Shake", description: "Thick creamy mango shake.", price: 699 },
    { name: "Strawberry Shake", description: "Thick creamy strawberry shake.", price: 699 },
    { name: "Chocolate Shake", description: "Thick creamy chocolate shake.", price: 699 },
  ] },
  { slug: "kids_menu", label: "Kids Menu", items: [
    { name: "Combo 1", description: "5 crispy nuggets, chips and a kids drink.", price: 1299 },
    { name: "Combo 2", description: "Mini burger, chips and a kids drink.", price: 1299, groups: requiredSingle("Choice", [{ label: "Chicken", delta: 0 }, { label: "Beef", delta: 0 }, { label: "Veg", delta: 0 }]) },
  ] },
  { slug: "extras", label: "Extras", items: [
    { name: "Cheese", description: "Extra slice of cheese.", price: 100 },
    { name: "Extra Sauce", description: "Extra serve of sauce.", price: 100 },
    { name: "Small Gravy", description: "Small tub of gravy.", price: 300 },
    { name: "Patty", description: "Extra smash patty.", price: 400 },
    { name: "Large Gravy Tub", description: "Large tub of gravy.", price: 450 },
  ] },
];

/** A seed key from an item's name ("Moo & Cluck" → moo_cluck). */
export const keyOf = (name: string): string => name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_|_$/g, "");

/** The categories in the shop's order, with their labels (apps/web's profile repeats them). */
export const CATEGORIES = MENU.map((c) => ({ slug: c.slug, label: c.label }));

/** The storefront page this business publishes: smash burgers, loud and warm (ketchup red, toasted bun, melted cheese). */
export const PAGE = {
  theme: { primary: "#c62f12", secondary: "#8a3a00", accent: "#ffcf3f", radius: "soft", layout: "hero-banner" },
  sections: [
    { kind: "hero", visible: true, badge: "Geelong · smash burgers · real menu, synthetic history", tagline: "Smashed hot on the plate, stacked high, and ready when you get here." },
    { kind: "outlets", visible: true, title: "Order from the Shack" },
    { kind: "ribbon", visible: true },
    { kind: "cards", visible: true, cards: [
      { title: "Smash Mates", body: "Double-smashed patties, American cheese and house sauce on a toasted milk bun. Start with the Beef Smash Mate." },
      { title: "Indian Style Burgers", body: "Korma and butter chicken burgers, paneer stacks and aloo tikki: the Shack's own twist on the smash." },
    ] },
  ],
} as const;

export async function build(c: Ctx): Promise<void> {
  if (!c.api.hasOperator) throw new Error('snacky_shack is provisioned by the platform operator (a demo business): add "operator" to MUNIM_SEED_TOKENS');
  const { asOf: A } = c;
  const D = (n: number) => addDays(A, -n);
  const biz = await k.onboard(c, {
    kind: "restaurant", country: "AU", business: "The Snacky Shack (real menu, synthetic history)", ownerName: "Sam Carter (synthetic)",
    outlet: { name: "The Snacky Shack Geelong", address: "1 Synthetic Lane, Geelong VIC (synthetic)", tz: "Australia/Melbourne", taxIds: { ABN: "98765432109" } },
    aiBudget: { limitMinor: 1_000, months: MONTHS },
  });
  c.s.currency = biz.currency;
  const o = biz.outlets[0]!;
  const tz = o.tz;
  const histFrom = D(c.days + 2);
  const stockAt = at(D(c.days + 1), "08:00", tz);
  const live = businessToday(new Date(), tz);
  const day = (name: string, date: string) => c.api.alias(date, name);

  await k.person(c, "manager", "Priya Nair (synthetic)", "manager", [o.id]);
  await k.person(c, "counter", "Jack Wilson (synthetic)", "staff", [o.id]);
  await k.person(c, "kitchen", "Mei Chen (synthetic)", "staff", [o.id]);
  await k.licence(c, "foodreg", o.id, "food_business_registration", "FBR-SYN-2207", "Synthetic City Council", D(200), addDays(A, 165));

  // ---- stock records and recipes: invented, for cost and stock only (the shop's own recipes and costs are not known) ----
  const patty = await k.ingredient(c, "beef_patty", "Beef smash patty (synthetic)", "pc", { shelfDays: 5 });
  const chicken = await k.ingredient(c, "chicken", "Chicken thigh (synthetic)", "kg", { shelfDays: 4 });
  const paneer = await k.ingredient(c, "paneer", "Paneer (synthetic)", "kg", { shelfDays: 10 });
  const bun = await k.ingredient(c, "bun", "Milk bun (synthetic)", "pc", { shelfDays: 4 });
  const cheese = await k.ingredient(c, "cheese", "American cheese slice (synthetic)", "pc", { shelfDays: 60 });
  const chips = await k.ingredient(c, "chips", "Frozen chips (synthetic)", "kg", { shelfDays: 180 });
  const oil = await k.ingredient(c, "fry_oil", "Fryer oil (synthetic)", "l", { shelfDays: 180 });
  const sauce = await k.ingredient(c, "sauce", "House sauce (synthetic)", "l", { shelfDays: 30 });
  const salad = await k.ingredient(c, "salad", "Salad mix (synthetic)", "kg", { shelfDays: 4 });
  const potato = await k.ingredient(c, "potato", "Potatoes (synthetic)", "kg", { shelfDays: 21 });
  const fish = await k.ingredient(c, "fish", "Fish fillets (synthetic)", "kg", { shelfDays: 3 });
  const milk = await k.ingredient(c, "milk", "Milk (synthetic)", "l", { shelfDays: 7 });
  const icecream = await k.ingredient(c, "ice_cream", "Ice cream (synthetic)", "l", { shelfDays: 90 });
  const can = await k.ingredient(c, "soft_drink", "Soft drink can (synthetic)", "pc", { shelfDays: 365 });
  const water = await k.ingredient(c, "water", "Bottled water (synthetic)", "pc", { shelfDays: 365 });
  const dimsim = await k.ingredient(c, "dim_sim", "Dim sim (synthetic)", "pc", { shelfDays: 90 });
  const wrap = await k.ingredient(c, "flatbread", "Flatbread (synthetic)", "pc", { shelfDays: 7 });
  const burger = (meat: Array<[k.Ingredient, number]>): Array<[k.Ingredient, number]> => [[bun, 1000], [cheese, 1000], [sauce, 25], [salad, 30], ...meat];
  const fried = (base: Array<[k.Ingredient, number]>): Array<[k.Ingredient, number]> => [...base, [oil, 30]];
  const RECIPE: Record<string, Array<[k.Ingredient, number]>> = {
    beef_smash_mate: burger([[patty, 2000]]), chicken_smash_mate: burger([[chicken, 150]]), the_aussie_mate: burger([[patty, 2000]]),
    double_trouble_burger: [...burger([[patty, 2000]]), [cheese, 1000]], moo_cluck: burger([[patty, 1000], [chicken, 120]]),
    crunchy_chicken_burger: fried(burger([[chicken, 160]])), peri_peri_chicken_burger: burger([[chicken, 160]]), avo_ranch_chicken_burger: fried(burger([[chicken, 150]])),
    korma_chicken_beef_burger: burger([[chicken, 160]]), butter_chicken_burger: burger([[chicken, 160]]),
    spicy_paneer_burger: fried(burger([[paneer, 120]])), crunchy_paneer_burger: fried(burger([[paneer, 120]])), aloo_tikki_burger: fried(burger([[potato, 150]])),
    stuffed_kulcha: [[potato, 120], [wrap, 1000]], veggie_crunch: fried(burger([[potato, 130]])),
    mini_cheese_burger: [[bun, 1000], [patty, 1000], [cheese, 1000]], mini_veggie_burger: [[bun, 1000], [potato, 80], [salad, 20]],
    mini_chicken_cheese: fried([[chicken, 80], [cheese, 1000]]), mini_samosas: fried([[potato, 150]]),
    special_snacky_box_for_1: fried([...burger([[patty, 2000]]), [chips, 200], [can, 1000]]),
    special_snacky_box_for_2: fried([...burger([[patty, 2000]]), ...burger([[chicken, 150]]), [chips, 400], [can, 2000]]),
    fish_fry: fried([[fish, 200]]), lava_chicken_tenders: fried([[chicken, 220]]), the_snacky_chicken_wrap: [[wrap, 1000], [chicken, 150], [salad, 40], [sauce, 25]],
    crunchy_chicken_schnitzel_chips: fried([[chicken, 220], [chips, 200]]), loaded_fries: fried([[chips, 300], [cheese, 2000], [sauce, 40]]),
    spring_rolls: fried([[salad, 60]]), hash_brown: fried([[potato, 150]]), wedges: fried([[potato, 250]]), chicken_bites_with_chips: fried([[chicken, 120], [chips, 150]]),
    gravy_fries: fried([[chips, 250], [sauce, 60]]), onion_rings: fried([[salad, 120]]), sweet_potato_chips: fried([[potato, 250]]), chicken_bites: fried([[chicken, 200]]),
    dim_sims_with_chips: fried([[dimsim, 3000], [chips, 150]]), mini_dim_sim: fried([[dimsim, 1000]]), dim_sim: fried([[dimsim, 1000]]),
    fries: fried([[chips, 200]]), peri_peri_fries: fried([[chips, 200]]),
    water: [[water, 1000]], soft_drinks_can: [[can, 1000]], lassi: [[milk, 250]], indian_style_cold_coffee: [[milk, 250], [icecream, 50]],
    special_mango_shake: [[milk, 250], [icecream, 100]], strawberry_shake: [[milk, 250], [icecream, 100]], chocolate_shake: [[milk, 250], [icecream, 100]],
    combo_1: fried([[chicken, 120], [chips, 120], [can, 1000]]), combo_2: fried([[bun, 1000], [patty, 1000], [chips, 120], [can, 1000]]),
    cheese: [[cheese, 1000]], extra_sauce: [[sauce, 30]], small_gravy: [[sauce, 80]], patty: [[patty, 1000]], large_gravy_tub: [[sauce, 200]],
  };

  // ---- the menu: items with their option groups, a price per channel kind, prep times and stations ----
  const items: Record<string, k.Item> = {};
  const station = (slug: string) => (slug === "drinks_shakes" ? "bar" : ["sides", "fries", "specials"].includes(slug) ? "fryer" : "grill");
  for (const cat of MENU) {
    for (const m of cat.items) {
      const key = keyOf(m.name);
      const recipe = RECIPE[key];
      if (!recipe) throw new Error(`snacky_shack: no recipe for ${key}`);
      const groups = (m.groups ?? []).map((g) => ({
        key: keyOf(g.name), name: g.name, description: null, min: g.min, max: g.max,
        options: g.options.map((x) => ({ key: keyOf(x.label), name: x.label, deltaMinor: x.delta })),
      }));
      const it = await k.item(c, key, { category: cat.slug, kind: "dish", display: { name: m.name, description: m.description }, groups });
      items[key] = it;
      await k.recipe(c, it, histFrom, recipe.map(([ing, qtyMilli]) => ({ ing, qtyMilli })));
      for (const kind of KINDS) await k.price(c, it, o.id, kind, m.price, TAX, histFrom);
      await k.prepTime(c, it, o.id, station(cat.slug), cat.slug === "drinks_shakes" ? 120 : cat.slug === "extras" ? 30 : 420, histFrom);
    }
  }

  // ---- dated history: six months of synthetic bills and waste through the approved-import path ----
  const people = await customers(c, "AU", 24, 0);
  const planted: PBill[] = [];
  const plantedWaste: Waste[] = [];
  // SS-F3: fifteen DoorDash family orders of two Special Snacky Boxes for 2 (A$50, GST inside), 7 to 2 days back. DD-SS-SHORT below pays them at 30%.
  for (let i = 0; i < 15; i++) {
    planted.push({ no: `DD-SS-SH-${i + 1}`, date: D(7 - (i % 6)), time: "18:40", outlet: 0, channel: "aggregator:doordash", type: "delivery", lines: [{ item: "special_snacky_box_for_2", qty: 2 }] });
  }
  // Drawn bills sell the items with no option group to choose (an imported bill line carries no options).
  const simple = MENU.flatMap((cat) => cat.items.filter((m) => !m.groups).map((m) => ({ cat: cat.slug, m })));
  const weight = (slug: string) => (slug === "smash_mates" ? 6 : slug === "extras" ? 1 : slug === "drinks_shakes" || slug === "sides" ? 3 : 2);
  const plan = new Plan(c, {
    prefix: "SS", inclusive: true, hours: [11, 21], phones: people.pool, planted, plantedWaste,
    outlets: [{ outlet: o, perDay: [38, 60] }],
    channels: [
      { kind: "counter", w: 38, types: ["takeaway", "dine_in"] }, { kind: "own_site", w: 12, types: ["pickup"] },
      { kind: "aggregator:ubereats", w: 25, types: ["delivery"] }, { kind: "aggregator:doordash", w: 25, types: ["delivery"] },
    ],
    items: simple.map(({ cat, m }) => ({ key: keyOf(m.name), priceMinor: m.price, taxClass: TAX, w: weight(cat), recipe: RECIPE[keyOf(m.name)]! })),
    waste: [{ outlet: 0, ing: chips, qtyMilli: [500, 2000] }, { outlet: 0, ing: salad, qtyMilli: [200, 800] }],
  });
  const cost: Array<[k.Ingredient, number]> = [[patty, 140], [chicken, 1200], [paneer, 1800], [bun, 60], [cheese, 25], [chips, 320], [oil, 450], [sauce, 600], [salad, 500],
    [potato, 200], [fish, 1600], [milk, 180], [icecream, 600], [can, 90], [water, 40], [dimsim, 35], [wrap, 50]];
  await k.openingStock(c, "open", o.id, stockAt, cost.map(([ing, costMinor]) => ({ ing, qtyMilli: 20000 + plan.need(0, ing), costMinor })));

  // ---- simulated suppliers (every name says so) ----
  const observed = at(D(15), "10:00", tz);
  const meat = await k.supplier(c, "meat", "Bellarine Meat Co (simulated)", 14, [{ key: "beef_patty", ing: patty, priceMinor: 140, at: observed }, { key: "chicken", ing: chicken, priceMinor: 1200, at: observed }]);
  await k.supplier(c, "foodservice", "Corio Bay Foodservice (simulated)", 30, [{ key: "chips", ing: chips, priceMinor: 320, at: observed }, { key: "fry_oil", ing: oil, priceMinor: 450, at: observed }, { key: "bun", ing: bun, priceMinor: 60, at: observed }]);
  // SS-I1: beef patties from 140 to 165 cents each (+18%), three deliveries of 400 patties each side.
  for (const [tag, n, p] of [["pre1", 13, 140], ["pre2", 11, 140], ["pre3", 9, 140], ["post1", 5, 165], ["post2", 3, 165], ["post3", 1, 165]] as const) {
    await k.goodsReceived(c, `patty-${tag}`, meat, o.id, null, at(D(n), "07:00", tz), [{ ing: patty, qtyMilli: 400000, costMinor: p, poLine: null }]);
    await k.invoice(c, `patty-${tag}`, meat, `BMC-P-${tag}`, D(n), null, [{ ing: patty, qtyMilli: 400000, priceMinor: p, poLine: null }]);
  }
  c.plant("SS-I1");

  // ---- labour: a cook and a counter hand, rostered and clocked for the live-command reach (Melbourne time, across the October change) ----
  const crew = [await k.staff(c, "mei", "Mei Chen (synthetic)", o.id, "cook", 3200, "2025-02-01"), await k.staff(c, "jack", "Jack Wilson (synthetic)", o.id, "counter", 2900, "2025-02-01")];
  const from = D(c.liveDays);
  for (let w = mondayOf(from); w <= D(1); w = addDays(w, 7)) {
    const shifts = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(w, i);
      if (d >= from && d <= D(1)) for (const s of crew) shifts.push({ staff: s, date: d, start: "11:00", end: "19:00", role: s.key === "mei" ? "cook" : "counter" });
    }
    if (shifts.length) await k.roster(c, `${w}`, o, w, shifts, (d, t) => at(d, t, tz));
  }
  for (const s of crew) for (let d = from; d <= D(1); d = addDays(d, 1)) await k.attend(c, o, s, d, at(d, "11:00", tz), at(d, "19:00", tz));

  // ---- finance ----
  const uber = biz.channels["aggregator:ubereats"]!;
  const door = biz.channels["aggregator:doordash"]!;
  const termsFrom = D(c.days + 30);
  await k.channelTerms(c, "ubereats", uber, { commissionBp: UBER_BP, ads: false, capMinor: null, promoBp: 0, cycleDays: 7, from: termsFrom });
  await k.channelTerms(c, "doordash", door, { commissionBp: DOORDASH_BP, ads: false, capMinor: null, promoBp: 0, cycleDays: 7, from: termsFrom });
  plan.queue();
  await k.history(c, {
    payouts: [
      { layout: "ubereats", prefix: "UE-SS", outlet: o, commissionBp: UBER_BP, withholdsTax: false, bills: (f, t) => plan.aggregatorBills(0, "aggregator:ubereats", f, t) },
      { layout: "doordash", prefix: "DD-SS", outlet: o, commissionBp: DOORDASH_BP, withholdsTax: false, bills: (f, t) => plan.aggregatorBills(0, "aggregator:doordash", f, t) },
    ],
    rent: { outlet: o, amountMinor: 650000, monthly: true },
  });
  // SS-F3: DoorDash pays the 15 planted orders (A$50 each) at 30% against the contracted 25%: commission 1,500 against 1,250 a line.
  {
    const lines = k.shortLines(plan.aggregatorBills(0, "aggregator:doordash", D(7), D(2)), "DD-SS-SH-", 15, DOORDASH_BP, 250, false);
    await k.importFile(c, "DD-SS-SHORT", "payout_statement", "DD-SS-SHORT.csv", payoutFile("doordash", { ref: "DD-SS-SHORT", outlet: o.name, from: D(7), to: D(2), paidOn: D(1) }, lines));
  }
  c.plant("SS-F3");
  await k.flushImports(c);
  for (let i = 0; i < MONTHS; i++) {
    await k.budget(c, i === 0 ? "purchases" : `purchases:+${i}`, { month: k.monthAfter(live, i), category: "purchases", amountMinor: 1_200_000 });
  }

  // ---- today: pickup windows, counter and app orders, open kitchen tickets, storefront orders ----
  for (const [name, date] of [["today", live], ["tomorrow", addDays(live, 1)]] as const) {
    await k.pickupWindows(c, `${name}`, o.id, day(`windows_${name}`, date), "11:00", "21:00", 15, 6);
  }
  const ol = (key: string, qty = 1, options: string[] = []): k.OrderLine => ({ item: items[key]!, qtyMilli: qty * 1000, options });
  const todays: Array<[string, "takeaway" | "dine_in" | "delivery", k.OrderLine[]]> = [
    ["counter", "takeaway", [ol("beef_smash_mate", 2, ["add_ons:eggs"]), ol("fries", 1, ["size:large"])]],
    ["counter", "dine_in", [ol("butter_chicken_burger"), ol("special_mango_shake")]],
    ["aggregator:ubereats", "delivery", [ol("the_aussie_mate"), ol("loaded_fries", 1, ["extra_sauce:butter_chicken_sauce"])]],
    ["aggregator:doordash", "delivery", [ol("korma_chicken_beef_burger", 1, ["choice_of_meat:beef"]), ol("lassi", 1, ["flavour:mango"])]],
    ["counter", "takeaway", [ol("mini_cheese_burger", 2), ol("combo_2", 1, ["choice:chicken"])]],
  ];
  for (const [i, [channel, kind, lines]] of todays.entries()) {
    await k.placeOrder(c, `ord:today:${i}`, biz, o, channel, kind, lines, { externalRef: `SS-LIVE-${i + 1}` });
    if (channel === "counter") await k.tenderUpiFull(c, `tender:today:${i}`, `ord:today:${i}`);
  }
  await k.advanceTickets(c, "geelong", o, "kitchen", [["preparing", "ready"], ["preparing"]]);
  const sf = await k.storefrontKey(c, biz, []);
  c.s.storefrontKey = sf;
  for (let i = 0; i < 2; i++) await k.storefrontOrder(c, sf, `ord:sf:${i}`, biz, o, items.double_trouble_burger!, { name: `Guest ${i + 1} (synthetic)`, phone: `+614002000${String(i + 10)}` });

  // ---- the storefront page, published by the owner before onboarding completes ----
  const page = c.api.id("storefront:page:1");
  await c.api.cmd("owner", "/v1/storefront-pages", "storefront.page.save.v1", "storefront:page:1", { page_id: page, based_on_version: null, doc: PAGE });
  await c.api.cmd("owner", "/v1/storefront-pages/{id}:publish", "storefront.page.publish.v1", "storefront:publish:1", { publish_id: c.api.id("storefront:publish:1"), page_id: page }, { params: { id: page } });

  // The model roles are priced platform-wide in one currency; an AUD business only reports what a live AI run still lacks.
  if (!c.api.lenient) c.s.aiMissing = await k.aiReadiness(c, biz.currency, Array.from({ length: MONTHS }, (_, i) => k.monthAfter(A, i)));
}
