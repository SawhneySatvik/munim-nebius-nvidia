// [unit] The Australian checkout path through the business module: this file swaps the current business for The Snacky Shack's
// module, as next.config.ts does for a NEXT_PUBLIC_MUNIM_SITE=snacky_shack build, and reads lib/site.ts the way the checkout does
// (the prefix before the box, the number as E.164, the error under it). The rest of the suite runs as Cobnut.
import { describe, expect, it, vi } from "vitest";
import { BUSINESS } from "@/lib/businesses";
import { PHONE_ERROR, PHONE_PREFIX, toE164 } from "@/lib/site";

vi.mock("@/lib/businesses/current", () => import("@/lib/businesses/snacky_shack"));

describe("an Australian business's checkout", () => {
  it("is The Snacky Shack's build", () => {
    expect(BUSINESS.id).toBe("snacky_shack");
    expect(BUSINESS.country).toBe("AU");
  });

  it("shows +61 before the mobile number and words its error for Australia", () => {
    expect(PHONE_PREFIX).toBe("+61");
    expect(PHONE_ERROR).toBe("Enter a mobile number starting with 04, like 0412 345 678.");
  });

  it.each([
    ["0412 345 678", "+61412345678"],
    ["0412-345-678", "+61412345678"],
    ["412 345 678", "+61412345678"],
    ["+61 412 345 678", "+61412345678"],
    ["+61 (0)412 345 678", "+61412345678"],
    ["61412345678", "+61412345678"],
    ["0061 412 345 678", "+61412345678"],
    ["0061 (0)412 345 678", "+61412345678"],
  ])("reads %s as %s", (input, want) => expect(toE164(input)).toBe(want));

  it.each([["(03) 5222 1234"], ["+61 3 5222 1234"], ["98123 45678"], ["+91 98123 45678"], ["0412 345"], ["0412 345 6789"], ["0062 412 345 678"]])(
    "refuses %s",
    (input) => expect(toE164(input)).toBe(null),
  );
});
