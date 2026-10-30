// T-054 ranking gates, pure (no database: the ranking is a function of resolved rows and `now`).
//   (1) top 5 on restaurant_group = the hand data's (ranking.restaurant_group.hand.json), whose inputs are cross-checked
//       against the answer key and the IN pack's severity ladder — never against ranking.ts
//   (2) 0 duplicate dedupe keys, from input that really contains duplicates; a draft collapses onto its finding
//   plus the formula's own terms: confidence, severity, age, null impact, drafts without findings.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type DraftIn, type FindingIn, rankInbox, type Severity } from "./ranking.ts";

const here = (p: string) => new URL(p, import.meta.url);
const hand = JSON.parse(readFileSync(here("./ranking.restaurant_group.hand.json"), "utf8")) as {
  top5: string[];
  rows: Array<{ id: string; pack: string; impact_minor: number | null; severity?: Severity; confidence_bp?: number; age_days?: number }>;
};
const keyFile = JSON.parse(readFileSync(here("../../../../../tools/worldgen/answer-key/restaurant_group.json"), "utf8")) as {
  problems: Array<{ id: string; impact_minor: number | null }>;
};
const ladder = JSON.parse(readFileSync(here("../../../../../packages/contracts/packs/IN.json"), "utf8")).severity_ladder as Record<string, number>;

const NOW = new Date("2026-10-11T00:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const uid = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
let seq = 1;
const finding = (o: Partial<FindingIn> & { dedupe_key: string }): FindingIn => ({
  id: uid(seq++), pack: "finance", severity: "medium", confidence_bp: 10_000, impact: 100_000, created_at: day(0), updated_at: day(0), ...o,
});

describe("(1) the restaurant_group sweep ranks as the hand data says", () => {
  const sweep = hand.rows.map((r, i) => finding({
    id: r.id, pack: r.pack, severity: r.severity ?? "low", confidence_bp: r.confidence_bp ?? 10_000, impact: r.impact_minor,
    created_at: day(r.age_days ?? 0), dedupe_key: `k${i}`,
  }));

  it("the hand data's inputs are the answer key's impacts and the pack ladder's severities", () => {
    const byId = new Map(keyFile.problems.map((p) => [p.id, p.impact_minor]));
    expect(hand.rows.length).toBe(24);
    for (const r of hand.rows) {
      expect(byId.get(r.id), r.id).toBe(r.impact_minor);
      if (r.impact_minor !== null) {
        const want = r.impact_minor >= ladder.critical_minor_gte! ? "critical" : r.impact_minor >= ladder.high_minor_gte! ? "high" : r.impact_minor >= ladder.medium_minor_gte! ? "medium" : "low";
        expect(r.severity, r.id).toBe(want);
      }
    }
  });

  it("top 5 = hand data, and the order down to rank 15 matches it", () => {
    const got = rankInbox(sweep, [], NOW).map((i) => i.finding!.id);
    expect(got.slice(0, 5)).toEqual(hand.top5);
    expect(hand.top5).toEqual(["RG-G4", "RG-P3", "RG-F5", "RG-F7", "RG-I3"]);
    expect(got.slice(0, 15)).toEqual(hand.rows.slice(0, 15).map((r) => r.id)); // ranks 16-17 tie; A5 (null impact) is last
    expect(got.at(-1)).toBe("RG-A5");
  });

  it("every item carries its specialist", () => {
    const items = rankInbox(sweep, [], NOW);
    expect(items.map((i) => i.specialist)).toEqual(items.map((i) => i.finding!.pack));
    expect(items[0]!.specialist).toBe("customers");
  });
});

describe("(2) dedupe and drafts", () => {
  it("duplicate dedupe keys collapse to one item each; the draft of the losing row follows the winner", () => {
    const a1 = finding({ dedupe_key: "same", impact: 500_000, updated_at: day(1) });
    const a2 = finding({ dedupe_key: "same", impact: 900_000, updated_at: day(0) });
    const a3 = finding({ dedupe_key: "same", impact: 900_000, updated_at: day(2) });
    const b = finding({ dedupe_key: "other", impact: 100_000 });
    const d1: DraftIn = { id: uid(900), finding_id: a1.id, source: "intel:finance", created_at: day(1) };
    const d2: DraftIn = { id: uid(901), finding_id: b.id, source: "intel:finance", created_at: day(0) };
    const items = rankInbox([a1, a2, a3, b], [d1, d2], NOW);
    expect(items.map((i) => i.finding!.id)).toEqual([a2.id, b.id]);
    expect(new Set(items.map((i) => i.finding!.dedupe_key)).size).toBe(items.length);
    expect(items[0]!.drafts.map((d) => d.id)).toEqual([d1.id]);
    expect(items[1]!.drafts.map((d) => d.id)).toEqual([d2.id]);
  });

  it("a draft with no open finding is its own item after every finding, with its source's specialist", () => {
    const f = finding({ dedupe_key: "k", impact: null });
    const loose: DraftIn = { id: uid(902), finding_id: null, source: "intel:people", created_at: day(3) };
    const gone: DraftIn = { id: uid(903), finding_id: uid(99999), source: "member", created_at: day(1) };
    const items = rankInbox([f], [gone, loose], NOW);
    expect(items.map((i) => [i.finding?.id ?? null, i.specialist])).toEqual([[f.id, "finance"], [null, "people"], [null, null]]);
  });
});

describe("the formula's terms", () => {
  const rank = (...fs: FindingIn[]) => rankInbox(fs, [], NOW).map((i) => i.finding!.id);
  it("confidence scales the score", () => {
    const hi = finding({ dedupe_key: "a", impact: 1_000_000, confidence_bp: 9_000 });
    const lo = finding({ dedupe_key: "b", impact: 1_500_000, confidence_bp: 5_000 });
    expect(rank(lo, hi)).toEqual([hi.id, lo.id]); // 9.0e6 > 7.5e6 before urgency (same severity)
  });
  it("severity outweighs a smaller impact", () => {
    const crit = finding({ dedupe_key: "a", impact: 400_000, severity: "critical" }); // 400000 x 30000 = 12e9
    const med = finding({ dedupe_key: "b", impact: 700_000, severity: "medium" }); // 700000 x 15000 = 10.5e9
    expect(rank(med, crit)).toEqual([crit.id, med.id]);
  });
  it("age raises urgency by 500bp a day, capped at 14 days", () => {
    const old = finding({ dedupe_key: "a", impact: 100_000, created_at: day(10) }); // 15000 + 5000 = 20000
    const fresh = finding({ dedupe_key: "b", impact: 120_000, created_at: day(0) }); // 15000
    expect(rank(fresh, old)).toEqual([old.id, fresh.id]); // 2.0e9 > 1.8e9
    const capped = finding({ dedupe_key: "c", impact: 100_000, created_at: day(400) });
    const cap14 = finding({ dedupe_key: "d", impact: 100_000, created_at: day(14) });
    // 100000 x 10000 x (15000 + 14 x 500) = 22,000,000,000,000 for both
    expect(rankInbox([capped, cap14], [], NOW).map((i) => i.score)).toEqual([22_000_000_000_000n, 22_000_000_000_000n]);
  });
  it("a negative impact ranks by its size; a null impact ranks last", () => {
    const neg = finding({ dedupe_key: "a", impact: -2_000_000 });
    const pos = finding({ dedupe_key: "b", impact: 1_000_000 });
    const none = finding({ dedupe_key: "c", impact: null, severity: "critical" });
    expect(rank(none, pos, neg)).toEqual([neg.id, pos.id, none.id]);
  });
});
