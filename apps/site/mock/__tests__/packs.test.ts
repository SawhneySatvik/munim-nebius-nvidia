// The mock's tax rules are a copy of the packs; fail if the packs move.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PACKS } from "../packs";

describe("mock tax rules equal packages/contracts/packs", () => {
  for (const code of ["IN", "AU"] as const) {
    it(code, () => {
      const pack = JSON.parse(readFileSync(new URL(`../../../../packages/contracts/packs/${code}.json`, import.meta.url), "utf8"));
      const mine = PACKS[code];
      expect([mine.version, mine.currency, mine.price_display, mine.pay_at_counter_methods]).toEqual([pack.version, pack.currency.code, pack.tax.price_display, pack.pay_at_counter_methods]);
      expect(pack.tax.rounding).toBe("half_up_per_line");
      const used = Object.keys(mine.classes);
      expect(used.length).toBeGreaterThan(0);
      for (const c of used) {
        const real = pack.tax.classes.find((x: any) => x.code === c);
        expect(real, c).toBeTruthy();
        expect(mine.classes[c]).toEqual({ rate_bp: real.rate_bp, components: real.components });
      }
    });
  }
});
