// Kosambari Kitchens (synthetic): a South Indian cloud kitchen with three invented kitchens in Bengaluru, seeded by worldgen's
// blr_kitchen world. Banana-leaf green, turmeric and steel-tumbler grey; a rounded display face that also sets Kannada.
import type { Business } from "../types";

export const BLR_KITCHEN: Business = {
  id: "blr_kitchen",
  name: "Kosambari Kitchens",
  short: "Kosambari",
  tagline: "Crisp dosas, soft idlis and strong filter coffee, from three Bengaluru kitchens.",
  locale: "en-IN",
  lang: "en-IN",
  country: "IN",
  tz: "Asia/Kolkata",
  categoryOrder: ["dosa", "idli_vada", "rice_bath", "combos", "sweets", "drinks"],
  categoryLabels: { dosa: "Dosas", idli_vada: "Idli and vada", rice_bath: "Rice and bath", combos: "Tiffin boxes", sweets: "Sweets", drinks: "Coffee and drinks" },
  dealLabels: { "deal.morning_tiffin": "Morning tiffin" },
  dietWords: { veg: "Veg", non_veg: "Non-veg", egg: "Contains egg", vegan: "Vegan" },
  noteFields: {
    "item.masala_dosa": { label: "For the kitchen (optional)", hint: "Less oil, extra chutney, no onion: say it here." },
    "item.breakfast_box": { label: "Name on the box (optional)", hint: "Written on the lid, so the right desk gets it." },
  },
  // The same document the seed publishes (tools/worldgen/src/worlds/blr_kitchen.ts PAGE), so nothing changes when it answers.
  page: {
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
  },
  wordmark: { lead: "Kosambari", accent: "Kitchens", accentClass: "" },
  outletWord: "kitchen",
  meta: {
    title: "Kosambari Kitchens — dosas and filter coffee, order ahead (sample shop)",
    template: "%s · Kosambari Kitchens (sample shop)",
    description: "A synthetic South Indian cloud kitchen built on Munim's API. Sample shop — orders are not real; payments are recorded, never processed.",
    themeColor: "#fbf4ea",
  },
  footer: "A synthetic cloud kitchen built on Munim's storefront API.",
  dataWords: { foot: "Demo: all data is synthetic.", staffBar: "synthetic data", storyBadge: "all of this is synthetic" },
  caresCard: "Batter and rice left at closing, offered to simulated recipients.",
  cardMotif: "drinks",
  story: {
    title: { lead: "Three kitchens, one", accent: "dosa batter" },
    paragraphs: [
      "Kosambari Kitchens is an invented cloud kitchen with three invented kitchens in Indiranagar, HSR Layout and Whitefield. It exists to show how a delivery-first kitchen runs on Munim: the menu, prices, taxes, deals and order status all come from the API, and nothing is ever charged.",
      "Kosambari is the cool lentil-and-cucumber salad served at Karnataka feasts. Most of our orders arrive through delivery apps; this page is for the people who would rather walk over and pick up hot.",
    ],
    promises: [
      { motif: "dosa", title: "Batter ground every morning", body: "Rice and urad dal soaked overnight and ground at dawn in each kitchen. Nothing comes from a packet." },
      { motif: "drinks", title: "Coffee the slow way", body: "Decoction drips through the morning; every cup is frothed to order between tumbler and davara." },
      { motif: "combos", title: "Packed to travel", body: "Chutney and sambar go in their own sealed cups, so the dosa is still crisp when you open the box." },
    ],
    surplus: { title: "Nothing good goes in the bin", body: "What's left at closing is listed on Munim Cares for simulated recipients." },
  },
};
