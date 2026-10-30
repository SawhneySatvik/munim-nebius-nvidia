// [unit] One web, many businesses (lib/businesses): with NEXT_PUBLIC_MUNIM_SITE unset the build is Cobnut's, exactly as before
// (expected values typed from the Cobnut shop as it was: its name, its built-in page's colours, its words), and every business's
// built-in page passes the contrast rule core judges a saved page by. That a new business's built-in page is the very document its
// seed publishes is checked from the seed's side (tools/worldgen/test/blr_kitchen.test.ts): apps/web imports no repo code. That a
// build carries only its own business is scripts/bundle-isolation.sh (a production build per business); here, that every business's
// module exports what the build swaps in for lib/businesses/current.ts.
import { describe, expect, it } from "vitest";
import { BUSINESS, SITE_ATTR } from "@/lib/businesses";
import * as blrKitchenModule from "@/lib/businesses/blr_kitchen";
import { BLR_KITCHEN } from "@/lib/businesses/blr_kitchen/profile";
import * as cobnutModule from "@/lib/businesses/cobnut";
import { COBNUT } from "@/lib/businesses/cobnut/profile";
import * as current from "@/lib/businesses/current";
import * as snackyShackModule from "@/lib/businesses/snacky_shack";
import { SNACKY_SHACK } from "@/lib/businesses/snacky_shack/profile";
import { BUILT_IN, themeOk } from "@/lib/munim/page-theme";
import { categoryLabel, DIET_WORD, PHONE_PREFIX, SITE, toE164, toE164Au } from "@/lib/site";

describe("businesses", () => {
  it("unset NEXT_PUBLIC_MUNIM_SITE is Cobnut, unchanged", () => {
    expect(process.env.NEXT_PUBLIC_MUNIM_SITE ?? "").toBe("");
    expect(BUSINESS.id).toBe("cobnut");
    expect(SITE).toEqual({ name: "Cobnut Bakehouse", short: "Cobnut", tagline: "Baked at dawn. Boxed with care. Pick up warm.", locale: "en-IN",
      categoryOrder: ["pastries", "cakes", "cookies", "gift_boxes", "drinks"] });
    expect(BUILT_IN.theme).toEqual({ primary: "#7b3f1d", secondary: "#9e2f4e", accent: "#f6d9c8", radius: "round", layout: "hero-banner" });
    expect(BUILT_IN.sections[0]).toEqual({ kind: "hero", visible: true, badge: "Lucknow · two bakehouses · pickup only", tagline: "Baked at dawn. Boxed with care. Pick up warm." });
    expect(DIET_WORD.veg).toBe("Eggless");
    expect(BUSINESS.tz).toBe("Asia/Kolkata");
    expect(BUSINESS.dataWords).toEqual({ foot: "Demo: all data is synthetic.", staffBar: "synthetic data", storyBadge: "all of this is synthetic" });
    expect(categoryLabel("gift_boxes")).toBe("Gift boxes");
    // No data-site attribute on Cobnut's <html>: its tokens are globals.css :root, as before.
    expect(SITE_ATTR).toEqual({});
    // India's mobile numbers at checkout, as before.
    expect(PHONE_PREFIX).toBe("+91");
    expect(toE164("98123 45678")).toBe("+919812345678");
    expect(toE164("0412 345 678")).toBe(null);
  });

  for (const b of [COBNUT, BLR_KITCHEN, SNACKY_SHACK]) {
    it(`${b.id}: its built-in page passes the contrast rule, and every category it orders has a label`, () => {
      expect(themeOk(b.page.theme)).toBe(true);
      expect(b.page.sections.map((s) => s.kind).sort()).toEqual(["cards", "hero", "outlets", "ribbon"]);
      for (const c of b.categoryOrder) expect(b.categoryLabels[c], c).toBeTruthy();
      expect(b.meta.title).toContain("(sample shop)");
    });
  }

  it("current.ts is Cobnut's module, and every business's module exports the same names", () => {
    expect(current.BUSINESS).toBe(COBNUT);
    expect(current.ART).toBe(cobnutModule.ART);
    for (const [b, m] of [[COBNUT, cobnutModule], [BLR_KITCHEN, blrKitchenModule], [SNACKY_SHACK, snackyShackModule]] as const) {
      expect(Object.keys(m).sort(), b.id).toEqual(["ART", "BUSINESS"]);
      expect(m.BUSINESS).toBe(b);
      expect([typeof m.ART.Mark, typeof m.ART.Hero, typeof m.ART.motif], b.id).toEqual(["function", "function", "function"]);
    }
  });

  it("only The Snacky Shack's menu is real: its labels say so, the others stay all synthetic", () => {
    expect(BLR_KITCHEN.dataWords).toEqual(COBNUT.dataWords);
    for (const words of Object.values(SNACKY_SHACK.dataWords)) expect(words.toLowerCase()).toContain("real menu, synthetic history");
  });

  it("blr_kitchen: Kosambari Kitchens, in banana-leaf green and turmeric", () => {
    expect(BLR_KITCHEN.name).toBe("Kosambari Kitchens");
    expect(BLR_KITCHEN.page.theme).toEqual({ primary: "#2d6a2e", secondary: "#8f5b00", accent: "#f7dc8f", radius: "round", layout: "hero-banner" });
  });

  it("snacky_shack: an Australian shop reads Australian mobile numbers", () => {
    expect(SNACKY_SHACK.country).toBe("AU");
    expect(SNACKY_SHACK.locale).toBe("en-AU");
    expect(SNACKY_SHACK.tz).toBe("Australia/Melbourne");
    for (const [input, want] of [["0412 345 678", "+61412345678"], ["412345678", "+61412345678"], ["+61 412 345 678", "+61412345678"], ["61412345678", "+61412345678"],
      ["(03) 5222 1234", null], ["98123 45678", null], ["+919812345678", null], ["0412 345", null]] as const) expect(toE164Au(input), input).toBe(want);
  });
});
