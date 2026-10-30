// The film's numbers must add up. Every expected value here was worked out by hand (paise), not by the fixture's code.
// Run: node --test tests/
import assert from "node:assert/strict";
import { test } from "node:test";
import "../assets/js/fixture.js";

const F = globalThis.FIX;

test("the cake order: FIRST50 is refused, COBNUT10 takes 10% before GST", () => {
  // 1 kg ₹1,400 + eggless ₹80 = ₹1,480.00
  assert.equal(F.cakeOrder.tried.subtotal, 148000);
  assert.deepEqual(F.cakeOrder.tried.refused.map((r) => r.reason), ["coupon_cap_reached"]);
  assert.equal(F.cakeOrder.tried.total, 155400); // ₹1,480 + 2.5% + 2.5% = ₹1,554.00
  const c = F.cakeOrder.priced;
  assert.equal(c.discount, 14800); // ₹148.00
  assert.equal(c.taxable, 133200); // ₹1,332.00
  assert.equal(c.cgst, 3330); // ₹33.30
  assert.equal(c.sgst, 3330);
  assert.equal(c.total, 139860); // ₹1,398.60
  assert.equal(F.fmt.inr(c.total), "₹1,398.60");
});

test("the walk-in: the morning bake takes 20% off the croissants only", () => {
  const w = F.walkIn.priced;
  assert.equal(w.subtotal, 52000); // 2 × ₹180 + ₹160
  assert.equal(w.discount, 7200); // 20% of ₹360
  assert.equal(w.tax, 2240); // 5% of ₹288 = ₹14.40, 5% of ₹160 = ₹8.00
  assert.equal(w.total, 47040); // ₹470.40
});

test("the owner home: waste, sales and labour", () => {
  assert.equal(F.waste.waste, 487200); // 3 × 2.9 kg × ₹560 = ₹4,872
  assert.equal(F.waste.median, 151200); // 3 × 0.9 kg × ₹560 = ₹1,512
  assert.equal(F.waste.excess, 336000); // ₹3,360
  assert.equal(F.fmt.inr(F.waste.waste), "₹4,872.00");
  assert.equal(F.netSalesWeek, 3164000); // ₹31,640
  assert.equal(F.labourWeek, 768000); // 4 days × 8 h × (₹110 + ₹130) = ₹7,680
  assert.equal(F.labourBp, 2427); // 7,680 / 31,640 = 24.27%
  assert.equal(F.fmt.rate(F.labourBp), "24.27%");
});

test("hazelnuts: below the minimum, and 1 kg short of the week's need", () => {
  assert.equal(F.hazelnuts.shortfall, 1000); // 6,800 g − 5,800 g − 0 on order
  assert.ok(F.hazelnuts.onHand < F.hazelnuts.minimum);
  assert.equal(F.fmt.qty(F.hazelnuts.onHand * 1000), "5,800");
  assert.equal(F.hazelnuts.sum, "6.8 kg needed − 5.8 kg on hand = 1 kg");
});

test("the negotiation follows the recorded run, and the cheapest bid fails the minimum-order rule", () => {
  const n = F.negotiation;
  assert.equal(n.counterAt, 133200); // ₹1,480 − 10%
  assert.equal(n.walkAway, 162800); // ₹1,480 + 10%
  assert.deepEqual(n.rounds.map((r) => r.map((b) => [b.s, b.price, b.move])), [
    [["steady", 150960, "counter"], ["bargain", 133200, "accept"], ["premium", 165760, "counter"]],
    [["steady", 148740, "counter"], ["premium", 162800, "accept"]],
    [["steady", 146520, "accept"]],
  ]);
  const byKey = Object.fromEntries(n.review.map((r) => [r.key, r]));
  assert.equal(byKey.bargain.pass, false);
  assert.equal(byKey.bargain.checks.minimum, false); // 3 kg minimum > 1 kg
  assert.equal(byKey.premium.pass, true);
  assert.equal(n.winner, "steady");
  assert.equal(n.po.qty, 1);
  assert.equal(n.po.total, 146520);
  assert.equal(F.fmt.inr(n.po.price), "₹1,465.20");
  assert.equal(n.po.lineage, "Proposed by Stock & Purchasing · 16 Oct, 11:12 am · Approved by Nandini Mehrotra · 16 Oct, 11:15 am");
  // No note Munim writes to a supplier holds a digit.
  for (const b of n.rounds.flat()) assert.doesNotMatch(b.note, /\d/);
});

test("Cares: sourdough at risk, the nearest simulated recipient, the impact counter", () => {
  assert.equal(F.cares.sourdough.atRisk, 110000); // 20 × ₹55
  assert.equal(F.cares.match, "Riverside Night Shelter");
  assert.equal(F.cares.recipients[0].m, 455);
  assert.equal(F.cares.after.packed, 32); // 12 rolls + 20 loaves
  assert.equal(F.cares.after.handovers, 2);
  assert.equal(F.cares.after.valueAtCost, 134000); // ₹240 of rolls + ₹1,100 of sourdough
});

test("the owner home at 8:10 am shows the four orders since opening, one ticket each", () => {
  assert.equal(F.ownerHome.ordersToday, 4);
  assert.equal(F.ownerHome.ticketsToday, 4);
});

test("the close: the founder's disclosure text, and a named placeholder until the Cloud Run URL arrives", () => {
  assert.equal(F.disclosure, "Synthetic business · simulated suppliers and recipients · payments recorded, not processed.");
  assert.match(F.endCard.cup.url, /PENDING/);
  assert.equal(F.endCard.full.url, "munim-rho.vercel.app");
});

test("Australia: prices include GST at 10% (1/11 of the total); the rollup adds up its outlets", () => {
  assert.equal(F.au.total, 2330); // A$4.80 + A$18.50
  assert.equal(F.au.gst, 212); // A$23.30 / 11 = A$2.118…
  assert.equal(F.rollup.tickets, 7);
  assert.equal(F.rollup.sales, 5142000); // ₹31,640 + ₹19,780
});

test("no in-app demo label leaks into a name the film shows", () => {
  const names = JSON.stringify([F.outlets, F.people, F.items, F.negotiation.suppliers, F.cares.recipients, F.hazelnuts.name]);
  assert.doesNotMatch(names, /synthetic|simulated|sample data/i);
});

test("the day's counts only go up: 8:10 am brief, the 8:31 cake, the 9:50 walk-in, the 9:20 pm home", () => {
  // Ticket numbers on screen: the cake is #12, the board at 9:45 shows #23, so the walk-in at 9:50 is #24.
  assert.equal(F.cakeOrder.ticket, 12);
  assert.equal(F.walkIn.ticket, 24);
  assert.equal(F.walkIn.at, "9:50 am"); // between the 9:45 and 10:00 chips, inside the 08:00–11:00 morning bake
  assert.ok(F.ownerHome.ordersToday < F.cakeOrder.ticket && F.cakeOrder.ticket < F.walkIn.ticket);
  assert.equal(F.ownerHomeLate.ordersToday, 41);
  assert.ok(F.ownerHomeLate.ordersToday >= F.walkIn.ticket);
  // ₹31,640.00 Monday–Thursday + ₹11,286.40 completed on Friday = ₹42,926.40, and Friday holds at least the cake and the walk-in.
  assert.equal(F.ownerHomeLate.netSalesWeek, 4292640);
  assert.ok(F.ownerHomeLate.todaySales >= F.cakeOrder.priced.total + F.walkIn.priced.total);
});

test("on-screen stamps follow the film's order of the day", () => {
  const min = (s) => {
    const [, h, m, ap] = s.match(/(\d{1,2}):(\d{2}) (am|pm)/);
    return ((+h % 12) + (ap === "pm" ? 12 : 0)) * 60 + +m;
  };
  // The full tour shows the investigation after the 10:00 pickup and before the purchase order (proposed 11:12 am).
  assert.equal(F.investigation.startedAt, "10:40 am");
  assert.ok(min("10:00 am") < min(F.investigation.startedAt));
  assert.ok(min(F.investigation.startedAt) < min(F.negotiation.po.proposedAt));
  // Scene 9's montage and 9b are earlier captures (chipped "Earlier · Fri …"): all before Cares at 8:30 pm, in order.
  const e = F.earlier;
  assert.ok(min(e.proposed) < min(e.saved) && min(e.saved) < min(e.approved) && min(e.approved) < min("8:30 pm"));
});

test("the supply graph: butter reaches seven dishes at both outlets, with the product's own figures", () => {
  const g = F.graph;
  assert.equal(g.uses.butter.length, 7);
  assert.equal(g.outlets.length, 2);
  assert.equal(new Set(Object.values(g.uses).flat()).size, g.dishes.length);
  // Butter ₹560.00 a kg (the product's price list); hazelnuts at the ₹1,465.20 Nandini approved in this film.
  assert.equal(g.butterPrice, 56000);
  assert.equal(g.hazelnutPrice, 146520);
  // Margin = (price − unit cost) / price: croissant (180 − 61.50) / 180 = 65.83%; knot (140 − 33.10) / 140 = 76.36%;
  // danish (210 − 74.80) / 210 = 64.38%; the pain au chocolat's row costs an earlier recipe, so it cannot be verified.
  assert.deepEqual(g.drawer.map((d) => d.margin), [6583, null, 7636, 6438]);
  assert.equal(F.fmt.rate(6583), "65.83%");
  // Ask's answer names the seven dishes and cites only butter's price cell.
  const text = F.ask.butter.parts.filter((p) => typeof p === "string").join("");
  for (const slug of g.uses.butter) assert.ok(text.includes(g.dishName(slug)), `${slug} is missing from the answer`);
  assert.deepEqual(F.ask.butter.parts.filter((p) => typeof p !== "string").map((p) => p.value), [56000, 56000]);
  assert.match(text, /^Butter \(synthetic\) costs /);
});

test("the new end cards: Cup 4:00 like the 2:55; FalkorDB names its track and repo; both URLs are placeholders for now", () => {
  assert.deepEqual(F.endCard.cup4, F.endCard.cup);
  assert.equal(F.endCard.falkor.line, "Built on FalkorDB");
  assert.equal(F.endCard.falkor.track, "Agents That Act on Connected Data");
  assert.equal(F.endCard.falkor.repo, "github.com/SawhneySatvik/business-graph");
  assert.match(F.endCard.falkor.url, /PENDING/);
});
