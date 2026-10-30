// The Snacky Shack: a smash-burger takeaway in Geelong, seeded by worldgen's snacky_shack world. Real menu, synthetic history:
// the menu is the shop's own; every person, address, cost and order around it is invented, and the shop says so. Not for public
// use until the owner agrees in writing. Smash burgers, loud and warm: ketchup red, toasted bun, melted cheese, a heavy display face.
import type { Business } from "../types";

export const SNACKY_SHACK: Business = {
  id: "snacky_shack",
  name: "The Snacky Shack",
  short: "Snacky Shack",
  tagline: "Smashed hot on the plate, stacked high, and ready when you get here.",
  locale: "en-AU",
  lang: "en-AU",
  country: "AU",
  tz: "Australia/Melbourne",
  categoryOrder: ["smash_mates", "indian_style_burgers", "veggie_room", "mini_munch", "snacky_signature_boxes", "specials", "sides", "fries", "drinks_shakes", "kids_menu", "extras"],
  categoryLabels: {
    smash_mates: "Smash Mates", indian_style_burgers: "Indian Style Burgers", veggie_room: "Veggie Room", mini_munch: "Mini Munch",
    snacky_signature_boxes: "Snacky Signature Boxes", specials: "Specials", sides: "Sides", fries: "Fries", drinks_shakes: "Drinks & Shakes",
    kids_menu: "Kids Menu", extras: "Extras",
  },
  dealLabels: {},
  // The seed records no diet for this menu (nothing is claimed about a real shop's food), so no mark or word shows.
  dietWords: {},
  noteFields: {},
  // The same document the seed publishes (tools/worldgen/src/worlds/snacky_shack.ts PAGE).
  page: {
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
  },
  wordmark: { lead: "The Snacky", accent: "Shack", accentClass: "" },
  outletWord: "shack",
  meta: {
    title: "The Snacky Shack — smash burgers, real menu, synthetic history (sample shop)",
    template: "%s · The Snacky Shack (sample shop)",
    description: "The Snacky Shack's real menu on Munim's API, with synthetic history. Sample shop — orders are not real; payments are recorded, never processed.",
    themeColor: "#fbf4ea",
  },
  footer: "Real menu, synthetic history: a sample shop built on Munim's storefront API.",
  dataWords: { foot: "Demo: real menu, synthetic history.", staffBar: "real menu, synthetic history", storyBadge: "real menu, synthetic history" },
  caresCard: "Food left at closing, offered to simulated recipients.",
  cardMotif: "smash_mates",
  story: {
    title: { lead: "Smashed, stacked,", accent: "and served loud" },
    paragraphs: [
      "This is The Snacky Shack's real menu, running on Munim as a sample shop. The people, the address, the orders, the costs and the suppliers around it are all invented, to show how a busy takeaway runs on Munim's storefront API. Nothing here is charged.",
      "Smash burgers, Indian-style burgers and a veggie room, with fries, sides and shakes: the menu, prices and options come straight from the API.",
    ],
    promises: [
      { motif: "smash_mates", title: "Double-smashed", body: "The Smash Mates: double-smashed patties, American cheese, pickles and house sauce on a toasted milk bun." },
      { motif: "indian_style_burgers", title: "Two menus in one bun", body: "Korma and butter chicken burgers, paneer and aloo tikki, beside the Aussie classics." },
      { motif: "fries", title: "Fries your size", body: "Small, medium or large, classic or peri-peri; loaded fries on the specials and gravy fries with the sides." },
    ],
    surplus: { title: "Nothing good goes in the bin", body: "What's left at closing is listed on Munim Cares for simulated recipients." },
  },
};
