// Mock catalogues for the two storefront businesses. SYNTHETIC, SIMULATED: no real people or brands.
// Items, prices (minor units), tax classes and display text (name, description, diet mark) for the worldgen dishes come
// from tools/worldgen/src/worlds/restaurant_group.ts and au_outlet.ts; items marked "mock addition" exist only here so the
// storefront has variants, options, an unmarked diet and a sold-out / off-sale case to exercise.
import { stableId } from "./util";

export type Option = { id: string; key: string; label: string; delta: number };
export type Group = { id: string; key: string; label: string; min: number; max: number; required: boolean; options: Option[] };
export type Variant = { id: string; key: string; label: string; price: number };
export type Diet = "veg" | "non_veg" | "egg" | "vegan";
export type Item = {
  /** `label` is the owner's display name (`display_name`); `description` / `diet` null = not set. */
  id: string; slug: string; label: string; description: string | null; diet: Diet | null; category: string; price: number | null; taxClass: string;
  active: boolean;
  /** outlet index -> false when sold out there */
  soldOutAt: number[];
  variants: Variant[]; groups: Group[]; fromWorldgen: boolean;
};
export type TaxId = { code: string; label: string; value: string };
export type Outlet = {
  id: string; name: string; address: string; tz: string; prepMin: number; busyExtra: number; capacity: number; hours: [number, number];
  /** Synthetic E.164 number (null = none) and the receipt tax ids the pack prints (synthetic values, never a real registration). */
  phone: string | null; taxIds: TaxId[];
};
export type Deal = { id: string; key: string; label: string; itemSlug: string; bp: number; days: number[]; from: string; to: string };
export type Coupon = { code: string; label: string; bp: number; minSpend: number; validFrom: string; validTo: string | null; outletIdx: number[]; capReached: boolean };
export type Cares = { label: string; qtyMilli: number };
export type Business = {
  slug: string; name: string; key: string; country: "IN" | "AU"; channelId: string; tz: string;
  /** Brands selling at every outlet; each item's brand_id is the first one (none = []). */
  brands: Array<{ id: string; name: string }>;
  cityCode: string; outlets: Outlet[]; items: Item[]; deals: Deal[]; coupons: Coupon[]; cares: Cares[]; recipient: string;
};

const opt = (b: string, g: string, key: string, label: string, delta: number): Option => ({ id: stableId(`${b}:opt:${g}:${key}`), key, label, delta });
const group = (b: string, key: string, label: string, min: number, max: number, options: Array<[string, string, number]>): Group =>
  ({ id: stableId(`${b}:grp:${key}`), key, label, min, max, required: min > 0, options: options.map(([k, l, d]) => opt(b, key, k, l, d)) });
const variant = (b: string, item: string, key: string, label: string, price: number): Variant => ({ id: stableId(`${b}:var:${item}:${key}`), key, label, price });
const item = (b: string, slug: string, label: string, category: string, price: number | null, taxClass: string, o: Partial<Item> = {}): Item =>
  ({ id: stableId(`${b}:item:${slug}`), slug, label, description: null, diet: null, category, price, taxClass, active: true, soldOutAt: [], variants: [], groups: [], fromWorldgen: false, ...o });

function spiceRoute(): Business {
  const b = "spice_route";
  // Tax ids: synthetic values in the pack's format (IN: GSTIN, FSSAI Lic. No.); South has no phone or ids set (both null / []).
  const ids = (n: number): TaxId[] => [{ code: "GSTIN", label: "GSTIN", value: `29AAAAA000${n}A1Z5` }, { code: "FSSAI", label: "FSSAI Lic. No.", value: `1000000000000${n}` }];
  const outlets: Outlet[] = ([
    ["Spice Route North", "1 Synthetic Road, Bengaluru (synthetic)", 0, "+919000000101", ids(1)],
    ["Spice Route Central", "2 Synthetic Road, Bengaluru (synthetic)", 15, "+919000000102", ids(2)],
    ["Spice Route South", "3 Synthetic Road, Bengaluru (synthetic)", 0, null, []],
  ] as const).map(([name, address, busyExtra, phone, taxIds], i) => ({
    id: stableId(`${b}:outlet:${i}`), name, address, tz: "Asia/Kolkata", prepMin: 20,
    busyExtra, capacity: 6, hours: [10, 22] as [number, number], phone, taxIds: [...taxIds],
  }));
  const items = [
    item(b, "paneer_tikka", "Paneer Tikka", "starters", 28000, "restaurant_5", { fromWorldgen: true, diet: "veg",
      description: "Cottage cheese cubes marinated in spiced yoghurt, charred in the tandoor." }),
    item(b, "butter_chicken", "Butter Chicken", "mains", 36000, "restaurant_5", {
      fromWorldgen: true, diet: "non_veg", description: "Tandoor chicken simmered in a mild tomato and butter gravy.",
      groups: [
        group(b, "spice_level", "Spice level", 1, 1, [["mild", "Mild", 0], ["medium", "Medium", 0], ["hot", "Hot", 0]]),
        group(b, "extras", "Extras", 0, 3, [["extra_naan", "Extra naan", 6000], ["raita", "Raita", 4000]]),
      ],
    }),
    item(b, "veg_biryani", "Veg Biryani", "mains", 24000, "restaurant_5", { fromWorldgen: true, diet: "veg",
      description: "Basmati rice layered with seasonal vegetables and whole spices." }),
    item(b, "prawn_masala", "Prawn Masala", "mains", 52000, "restaurant_5", { fromWorldgen: true, soldOutAt: [0, 1, 2], diet: "non_veg",
      description: "Prawns in a coastal onion and kokum masala." }),
    item(b, "lamb_curry", "Lamb Curry", "mains", 24000, "restaurant_5", { fromWorldgen: true, diet: "non_veg",
      description: "Slow-cooked lamb in a cardamom and black pepper gravy." }),
    item(b, "chef_special", "Chef's Special", "mains", 30000, "restaurant_5", { fromWorldgen: true, soldOutAt: [1] }), // worldgen: a name only
    item(b, "mushroom_risotto", "Mushroom Risotto", "mains", 39000, "restaurant_5", { fromWorldgen: true, diet: "veg",
      description: "Arborio rice stirred with mushrooms and parmesan." }),
    item(b, "garlic_naan", "Garlic Naan", "breads", 6000, "restaurant_5", { diet: "veg", description: "Tandoor bread brushed with garlic butter." }), // mock addition
    item(b, "mango_lassi", "Mango Lassi", "drinks", null, "restaurant_5", { diet: "veg", // mock addition: sold by variant
      variants: [variant(b, "mango_lassi", "regular", "Regular", 9000), variant(b, "mango_lassi", "large", "Large", 12000)],
    }),
    item(b, "gulab_jamun", "Gulab Jamun", "desserts", 11000, "restaurant_5"), // mock addition: diet not marked (null)
    item(b, "seasonal_kulfi", "Seasonal Kulfi", "desserts", 9500, "restaurant_5", { active: false, diet: "veg" }), // mock addition: off sale, not listed
  ];
  return {
    slug: b, name: "Spice Route Group (synthetic)", key: "sfk_mock_spice_route_7f3a91c2", country: "IN", channelId: stableId(`${b}:channel:own_site`), tz: "Asia/Kolkata",
    brands: [{ id: stableId(`${b}:brand:spice_route`), name: "Spice Route (synthetic)" }],
    cityCode: "bengaluru", outlets, items,
    deals: [{ id: stableId(`${b}:deal:weekday_lunch`), key: "deal.weekday_lunch", label: "Weekday lunch: 10% off Veg Biryani", itemSlug: "veg_biryani", bp: 1000, days: [1, 2, 3, 4, 5], from: "12:00", to: "15:00" }],
    coupons: [
      { code: "SPICE10", label: "10% off, minimum spend Rs 300", bp: 1000, minSpend: 30000, validFrom: "2026-01-01", validTo: null, outletIdx: [], capReached: false },
      { code: "NORTH5", label: "5% off at Spice Route North only", bp: 500, minSpend: 0, validFrom: "2026-01-01", validTo: null, outletIdx: [0], capReached: false },
      { code: "OLDDEAL20", label: "Expired coupon", bp: 2000, minSpend: 0, validFrom: "2025-01-01", validTo: "2026-01-01", outletIdx: [], capReached: false },
      { code: "FIRST100", label: "Usage limit already reached", bp: 1500, minSpend: 0, validFrom: "2026-01-01", validTo: null, outletIdx: [], capReached: true },
    ],
    cares: [{ label: "Veg biryani portions", qtyMilli: 12000 }, { label: "Dal and rice portions", qtyMilli: 20000 }],
    recipient: "Simulated Community Kitchen (synthetic)",
  };
}

function laneway(): Business {
  const b = "laneway_cafe";
  const milk = () => group(b, "milk", "Milk", 0, 1, [["oat", "Oat milk", 80], ["almond", "Almond milk", 80]]);
  const outlets: Outlet[] = [{
    id: stableId(`${b}:outlet:0`), name: "Laneway Cafe Fitzroy", address: "5 Synthetic Lane, Fitzroy VIC (synthetic)", tz: "Australia/Melbourne",
    prepMin: 8, busyExtra: 0, capacity: 4, hours: [7, 15],
    phone: "+61390000101", taxIds: [{ code: "ABN", label: "ABN", value: "00000000001" }], // synthetic
  }];
  const items = [
    item(b, "flat_white", "Flat White", "coffee", 480, "gst_10", { fromWorldgen: true, groups: [milk()], diet: "veg", description: "Double ristretto with silky steamed milk." }),
    item(b, "latte", "Latte", "coffee", 500, "gst_10", { fromWorldgen: true, groups: [milk()], diet: "veg", description: "Espresso with steamed milk and a thin layer of foam." }),
    item(b, "avocado_toast", "Smashed Avocado on Sourdough", "food", 1850, "gst_10", {
      fromWorldgen: true, diet: "vegan", description: "Avocado, lemon and chilli flakes on toasted sourdough.",
      groups: [group(b, "add_ons", "Add-ons", 0, 2, [["egg", "Poached egg", 300], ["feta", "Feta", 250]])],
    }),
    item(b, "long_black", "Long Black", "coffee", 450, "gst_10", { diet: "vegan" }), // mock addition
    item(b, "iced_latte", "Iced Latte", "coffee", null, "gst_10", { diet: "veg", // mock addition: sold by variant
      variants: [variant(b, "iced_latte", "regular", "Regular", 600), variant(b, "iced_latte", "large", "Large", 700)],
    }),
    item(b, "sourdough_loaf", "Sourdough Loaf", "bakery", 900, "gst_free", { diet: "vegan" }), // mock addition: shows the GST-free class
    item(b, "banana_bread", "Banana Bread", "bakery", 700, "gst_10", { soldOutAt: [0], diet: "egg" }), // mock addition
    item(b, "seasonal_pie", "Seasonal Pie", "bakery", 850, "gst_10", { active: false }), // mock addition: off sale, not listed
  ];
  return {
    slug: b, name: "Laneway Cafe (synthetic)", key: "sfk_mock_laneway_cafe_c42e08d1", country: "AU", channelId: stableId(`${b}:channel:own_site`), tz: "Australia/Melbourne",
    brands: [],
    cityCode: "melbourne", outlets, items,
    deals: [{ id: stableId(`${b}:deal:early_bird`), key: "deal.early_bird", label: "Early bird: 10% off Flat White", itemSlug: "flat_white", bp: 1000, days: [1, 2, 3, 4, 5, 6, 7], from: "07:00", to: "09:00" }],
    coupons: [
      { code: "LANE5", label: "5% off, minimum spend A$10", bp: 500, minSpend: 1000, validFrom: "2026-01-01", validTo: null, outletIdx: [], capReached: false },
      { code: "OLDBREW15", label: "Expired coupon", bp: 1500, minSpend: 0, validFrom: "2025-01-01", validTo: "2026-01-01", outletIdx: [], capReached: false },
      { code: "FIRST50", label: "Usage limit already reached", bp: 1000, minSpend: 0, validFrom: "2026-01-01", validTo: null, outletIdx: [], capReached: true },
    ],
    cares: [{ label: "Sourdough loaves", qtyMilli: 6000 }, { label: "Sandwich portions", qtyMilli: 10000 }],
    recipient: "Simulated Food Rescue Kitchen (synthetic)",
  };
}

export const BUSINESSES: Business[] = [spiceRoute(), laneway()];
