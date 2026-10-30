// Cobnut Bakehouse (synthetic): the demo bakery, exactly as the shop showed it before businesses became profiles.
import type { Business } from "../types";

export const COBNUT: Business = {
  id: "cobnut",
  name: "Cobnut Bakehouse",
  short: "Cobnut",
  tagline: "Baked at dawn. Boxed with care. Pick up warm.",
  locale: "en-IN",
  lang: "en-IN",
  country: "IN",
  tz: "Asia/Kolkata",
  categoryOrder: ["pastries", "cakes", "cookies", "gift_boxes", "drinks"],
  categoryLabels: { pastries: "Pastries", cakes: "Cakes", cookies: "Cookies", gift_boxes: "Gift boxes", drinks: "Drinks" },
  dealLabels: { "deal.morning_bake": "Morning bake" },
  /** A bakery's diet words. In India the green veg mark already means "no egg", so it reads "Eggless" here. */
  dietWords: { veg: "Eggless", non_veg: "Non-veg", egg: "Contains egg", vegan: "Vegan" },
  noteFields: {
    "item.praline_celebration_cake": { label: "Message on the cake (optional)", hint: "Piped in chocolate. Up to 40 characters fit best." },
    "item.build_a_box": { label: "Gift card message (optional)", hint: "Handwritten on the card if you choose gift wrap." },
  },
  page: {
    theme: { primary: "#7b3f1d", secondary: "#9e2f4e", accent: "#f6d9c8", radius: "round", layout: "hero-banner" },
    sections: [
      { kind: "hero", visible: true, badge: "Lucknow · two bakehouses · pickup only", tagline: "Baked at dawn. Boxed with care. Pick up warm." },
      { kind: "outlets", visible: true, title: "Pick your bakehouse" },
      { kind: "ribbon", visible: true },
      { kind: "cards", visible: true, cards: [
        { title: "Build a gift box", body: "Pick a box size and two to four truffle-cookie flavours, add a ribbon and a card. Choose an outlet to start." },
        { title: "Cakes with a message", body: "Celebration cakes by weight, classic or eggless, with your words piped on top." },
      ] },
    ],
  },
  wordmark: { lead: "Cobnut", accent: "Bakehouse", accentClass: "italic" },
  outletWord: "bakehouse",
  meta: {
    title: "Cobnut Bakehouse — order ahead, pick up warm (sample shop)",
    template: "%s · Cobnut Bakehouse (sample shop)",
    description: "A synthetic bakehouse storefront built on Munim's API. Sample shop — orders are not real; payments are recorded, never processed.",
    themeColor: "#fbf4ea",
  },
  footer: "A synthetic bakehouse built on Munim's storefront API.",
  dataWords: { foot: "Demo: all data is synthetic.", staffBar: "synthetic data", storyBadge: "all of this is synthetic" },
  caresCard: "Surplus bakes from our counters, offered to simulated recipients.",
  cardMotif: "cakes",
  story: {
    title: { lead: "A small bakehouse that", accent: "loves hazelnuts" },
    paragraphs: [
      "Cobnut Bakehouse is an invented bakery with two invented counters in Lucknow. It exists to show how a shop can take pickup orders through Munim's storefront API: the menu, prices, taxes, deals and order status all come from the API, and nothing is ever charged.",
      "A cobnut is an old English name for a cultivated hazelnut. We named the shop after it because almost everything here has a hazelnut in it somewhere.",
    ],
    promises: [
      { motif: "pastries", title: "Laminated by hand", body: "Our croissant dough rests overnight and is folded three times before dawn. Nothing is par-baked." },
      { motif: "cookies", title: "Eggless, clearly marked", body: "Every item carries its own mark: the green dot means eggless, the dark oval means it contains egg, the leaf means vegan." },
      { motif: "gift_boxes", title: "Boxed to give", body: "Build a box of truffle cookies, add a ribbon and a handwritten card, and pick it up on your way." },
    ],
    surplus: { title: "Surplus never goes in the bin", body: "What's left at closing is listed on Munim Cares for simulated recipients." },
  },
};
