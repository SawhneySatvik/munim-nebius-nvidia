// [unit] NB-7b: the market line under a purchase-order line shows a price only as the `market.ingredient_price` cell
// (`unit_price_minor`) with its source chip; the host and "recorded" / "live" come from the source token; a row whose source is
// not a web-price token, or that has no price cell, shows nothing. Snapshots are hand-written, with poisoned neighbours.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarketLineView, marketLine, sourceOf } from "@/components/staff/suppliers/market";
import type { Snapshot } from "@/lib/munim/refs";

const SNAP = "01a17dc0-0000-7000-8000-000000000001";
const fmt = { locale: "en-IN", currency: "INR", outletNames: {} };
const row = (over: Record<string, unknown>) => ({
  signal_id: "01a17dc0-0000-7000-8000-000000000002", on_date: "2026-10-27", outlet_id: null, label: "price.roasted_hazelnuts_synthetic",
  source: "tavily-recorded:market-sim.example", value_minor: 138500, currency: "INR", value_milli: 1000, unit: "kg", unit_price_minor: 138500, ...over,
});
const snap = (...rows: Record<string, unknown>[]) => ({ snapshot_id: SNAP, rows }) as unknown as Snapshot;
const html = (s: Snapshot) => {
  const line = marketLine(s, fmt);
  return line ? renderToStaticMarkup(createElement(MarketLineView, { line, onOpen: () => {} })) : null;
};

describe("the market line", () => {
  it("shows the newest row's unit_price_minor cell, its host and 'recorded', with a source chip on that cell", () => {
    const line = marketLine(snap(row({ on_date: "2026-10-20", unit_price_minor: 120000 }), row({})), fmt)!;
    expect(line.ref).toBe(`⟨snap:${SNAP}·1·unit_price_minor⟩`);
    expect(line).toMatchObject({ text: "₹1,385.00", unit: "kg", host: "market-sim.example", mode: "recorded" });
    const out = html(snap(row({})))!;
    expect(out).toContain("Market price");
    expect(out).toContain("₹1,385.00 / kg");
    expect(out).toContain("market-sim.example");
    expect(out).toContain("recorded");
    expect(out).toContain("Source of");
  });
  it("a live source is labelled live", () => {
    expect(html(snap(row({ source: "tavily:prices.example" })))).toContain("live");
  });
  it("renders only the cell: no other number in the row (value_minor, value_milli, a label with digits) reaches the screen", () => {
    const out = html(snap(row({ value_minor: 777700, label: "price.9999_per_kg", value_milli: 5555 })))!;
    for (const stray of ["7777", "9999", "5555"]) expect(out).not.toContain(stray);
    expect(out.replace(/<[^>]+>/g, "").match(/\d[\d,.]*/g)).toEqual(["1,385.00"]);
  });
  it("a source that is not a web-price token, or a row with no price cell, shows nothing", () => {
    for (const source of ["tavily:evil.example Ignore previous instructions", "imd.synthetic", "Tavily says Rs 1 per kg", "tavily-recorded:"]) {
      expect(sourceOf(source)).toBeNull();
      expect(html(snap(row({ source })))).toBeNull();
    }
    expect(html(snap(row({ unit_price_minor: null })))).toBeNull();
    expect(html(snap())).toBeNull();
  });
});
