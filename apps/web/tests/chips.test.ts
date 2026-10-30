// [unit] P3 polish: punctuation after a cited value rides with its source chip, so a line never starts with a lone "."
// after a chip. Only where the text may break changes: the words, their order and every guarantee check stay the same.
import { describe, expect, it } from "vitest";
import { renderSegment, withTrails, type ShownPart } from "@/lib/munim/refs";

const SNAP = "019f0000-0000-7000-8000-000000000001";
const a = `⟨snap:${SNAP}·0·tickets⟩`, b = `⟨snap:${SNAP}·0·p50_sec⟩`;
const resolved = [{ ref: a, value: 14 }, { ref: b, value: 1680 }];
/** The sentence back from its parts: text, a marker per value, then its trail. */
const back = (parts: ShownPart[]) => parts.map((p) => (p.kind === "text" ? p.text : p.kind === "value" ? `[${p.ref === a ? "A" : "B"}]${p.trail}` : "[?]")).join("");

describe("punctuation after a value", () => {
  it("a full stop and a comma move onto the value before them; the sentence reads the same", () => {
    const parts = withTrails(renderSegment({ text: `Made ${a}, and half within ${b}.`, refs: [a, b] }, resolved));
    expect(parts.map((p) => (p.kind === "value" ? p.trail : null))).toEqual([null, ",", null, "."]);
    expect(back(parts)).toBe("Made [A], and half within [B].");
  });
  it("a value followed by a space keeps no trail; a text part that was only punctuation is gone, not empty", () => {
    const parts = withTrails(renderSegment({ text: `${a} tickets; ${b}.`, refs: [a, b] }, resolved));
    expect(parts.map((p) => p.kind)).toEqual(["value", "text", "value"]);
    expect(back(parts)).toBe("[A] tickets; [B].");
  });
  it("a segment with a typed digit is still one Cannot verify", () => {
    expect(withTrails(renderSegment({ text: `Made 14 tickets ${a}.`, refs: [a] }, resolved))).toEqual([{ kind: "unverified", ref: null }]);
  });
});
