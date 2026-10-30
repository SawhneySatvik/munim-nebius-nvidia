// The film's demo fixture: one day at Cobnut Bakehouse, a synthetic two-outlet bakery that runs on Munim. Names, outlets,
// menu and prices are the app's (apps/web/mock-server/data.ts, tools/worldgen/src/worlds/cobnut.ts); the waste, the
// shortfall and the negotiation follow the seeded world and the recorded run (services/intel/fixtures/recorded). Every
// total below is computed here, with the app's rounding, never typed. In-app "(synthetic)"/"(simulated)" suffixes are
// left off the names (R65 V-5); the film carries one disclosure card instead.
// Loads as a classic <script> (sets globalThis.FIX) and as a Node module (import it, then read globalThis.FIX).
(function () {
  const pct = (amount, bp) => Math.round((amount * bp) / 10000); // the app's percent rule (pricing.ts)
  const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
  const numFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
  const fmt = {
    /** 487200 → "₹4,872.00" (the app's formatMoney for INR, en-IN). */
    inr: (minor) => inrFmt.format(minor / 100),
    /** 5800000 milli-grams → "5,800" (the app's formatQty). */
    qty: (milli) => numFmt.format(milli / 1000),
    /** 2427 → "24.27%" (the app's formatRate). */
    rate: (bp) => new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 2 }).format(bp / 10000),
  };

  // ---------------------------------------------------------------- who and where
  const day = { date: "2026-10-16", weekday: "Friday", label: "16 Oct 2026", weekStart: "2026-10-12" };
  const outlets = {
    hzg: { name: "Cobnut Hazratganj", area: "Hazratganj, Lucknow", gstin: "09AAAAA0001A1Z5", fssai: "20000000000001", series: "HZG" },
    gmt: { name: "Cobnut Gomti Nagar", area: "Gomti Nagar, Lucknow", series: "GMT" },
  };
  const people = {
    owner: { name: "Nandini Mehrotra", role: "Owner", blurb: "Owner · both outlets", outlets: ["hzg", "gmt"] },
    manager: { name: "Farah Qureshi", role: "Manager", blurb: "Manager · Cobnut Gomti Nagar", outlets: ["gmt"] },
    counter: { name: "Imran Siddiqui", role: "Staff", blurb: "Counter · Cobnut Hazratganj", outlets: ["hzg"] },
    kitchen: { name: "Kavya Tandon", role: "Staff", blurb: "Kitchen · Cobnut Hazratganj", outlets: ["hzg"] },
  };
  // The eight specialists and the Manager who routes to them (apps/web/lib/munim/staff-copy.ts SPECIALIST_NAME).
  const specialists = [
    { id: "catalogue", name: "Menu & Pricing" }, { id: "kitchen", name: "Kitchen" },
    { id: "inventory_purchasing", name: "Stock & Purchasing" }, { id: "finance", name: "Finance" },
    { id: "people", name: "People" }, { id: "customers", name: "Customers" },
    { id: "compliance", name: "Compliance" }, { id: "market", name: "Market" },
  ];
  const manager = { id: "manager", name: "Manager" };

  // ---------------------------------------------------------------- the menu (paise, before GST)
  const items = {
    hazelnut_croissant: { name: "Hazelnut Croissant", category: "pastries", diet: "egg", price: 18000 },
    pain_au_chocolat: { name: "Pain au Chocolat", category: "pastries", diet: "egg", price: 17000 },
    cardamom_knot: { name: "Cardamom Knot", category: "pastries", diet: "veg", price: 14000 },
    pistachio_danish: { name: "Pistachio Danish", category: "pastries", diet: "egg", price: 21000, soldOut: true },
    praline_celebration_cake: {
      name: "Hazelnut Praline Cake", category: "cakes", diet: null, price: null,
      description: "Layers of sponge, hazelnut praline cream and a whisper of dark chocolate ganache. Add a message for the top.",
      variants: { half_kg: { name: "½ kg (serves 4–6)", price: 75000 }, one_kg: { name: "1 kg (serves 8–10)", price: 140000 } },
      groups: { sponge: { name: "Sponge", options: { classic: { name: "Classic (contains egg)", delta: 0 }, eggless: { name: "Eggless", delta: 8000 } } } },
    },
    gianduja_mousse: { name: "Gianduja Mousse Cup", category: "cakes", diet: "egg", price: 26000 },
    rose_tres_leches: { name: "Rose Pistachio Tres Leches", category: "cakes", diet: "egg", price: 24000 },
    brown_butter_cookie: { name: "Brown Butter Hazelnut Cookie", category: "cookies", diet: "egg", price: 9000 },
    eggless_choc_chip: { name: "Eggless Choc-Chip Cookie", category: "cookies", diet: "veg", price: 8000 },
    oat_jaggery_cookie: { name: "Oat & Jaggery Cookie", category: "cookies", diet: "vegan", price: 8500 },
    truffle_tin: { name: "Truffle Tin", category: "gift_boxes", diet: "veg", price: 65000 },
    hazelnut_hot_chocolate: {
      name: "Hazelnut Hot Chocolate", category: "drinks", diet: "veg", price: null,
      variants: { regular: { name: "Regular", price: 16000 }, large: { name: "Large", price: 21000 } },
    },
    cold_coffee: {
      name: "Cold Coffee", category: "drinks", diet: "veg", price: 15000,
      groups: { milk: { name: "Milk", options: { dairy: { name: "Dairy", delta: 0 }, oat: { name: "Oat", delta: 4000 } } } },
    },
  };
  const categories = [["pastries", "Pastries"], ["cakes", "Cakes"], ["cookies", "Cookies"], ["gift_boxes", "Gift boxes"], ["drinks", "Drinks"]];
  // GST on bakery items: 5%, split CGST 2.5% + SGST 2.5% (the IN pack's restaurant_5 rate).
  const TAX = [{ code: "CGST", bp: 250 }, { code: "SGST", bp: 250 }];
  // The morning bake: 20% off knots and croissants, Monday to Saturday 08:00–11:00.
  const deal = { name: "Morning bake", bp: 2000, items: ["cardamom_knot", "hazelnut_croissant"], from: "08:00", to: "11:00" };
  const coupons = {
    COBNUT10: { bp: 1000, minSpend: 50000 },
    FIRST50: { bp: 5000, capReached: true }, // one use in all, already used: refused (coupon_cap_reached)
  };
  const refusal = { coupon_cap_reached: "This coupon has reached its limit." }; // apps/web/lib/munim/copy.ts

  /** The app's pricing order (pricing.ts): deal first, then coupons, both as a percent of the line, then GST per
   *  component on the discounted line. `dealActive` says whether the order's time falls in the morning-bake window. */
  function price(lines, codes, dealActive) {
    const work = lines.map((l) => {
      const it = items[l.slug];
      const unit = l.variant ? it.variants[l.variant].price : it.price;
      const options = (l.options || []).reduce((s, [g, o]) => s + it.groups[g].options[o].delta, 0);
      const gross = (unit + options) * (l.qty || 1);
      const dealDiscount = dealActive && deal.items.includes(l.slug) ? pct(gross, deal.bp) : 0;
      return { l, it, unit, options, gross, dealDiscount };
    });
    const afterDeals = work.reduce((s, w) => s + w.gross - w.dealDiscount, 0);
    const applied = [];
    const refused = [];
    for (const code of codes || []) {
      const c = coupons[code];
      if (c.capReached) refused.push({ code, reason: "coupon_cap_reached", text: refusal.coupon_cap_reached });
      else if (c.minSpend !== undefined && afterDeals < c.minSpend) refused.push({ code, reason: "coupon_min_spend" });
      else applied.push({ code, bp: c.bp });
    }
    const out = work.map((w) => {
      const couponDiscount = applied.reduce((s, c) => s + pct(w.gross - w.dealDiscount, c.bp), 0);
      const discount = w.dealDiscount + couponDiscount;
      const taxable = w.gross - discount;
      const tax = TAX.map((t) => ({ code: t.code, bp: t.bp, amount: pct(taxable, t.bp) }));
      const taxTotal = tax.reduce((s, t) => s + t.amount, 0);
      return { ...w, dealDiscount: w.dealDiscount, couponDiscount, discount, taxable, tax, taxTotal, total: taxable + taxTotal };
    });
    const sum = (f) => out.reduce((s, x) => s + f(x), 0);
    return {
      lines: out, applied, refused,
      subtotal: sum((x) => x.gross), discount: sum((x) => x.discount), taxable: sum((x) => x.taxable),
      cgst: sum((x) => x.tax[0].amount), sgst: sum((x) => x.tax[1].amount), tax: sum((x) => x.taxTotal), total: sum((x) => x.total),
    };
  }

  // ---------------------------------------------------------------- 8:30 am: Zoya's cake, on her phone
  const cakeLines = [{ slug: "praline_celebration_cake", variant: "one_kg", options: [["sponge", "eggless"]], qty: 1, note: "Happy 60th, Nani! — with love, Zoya" }];
  const cakeTry = price(cakeLines, ["FIRST50"], true); // refused, nothing off
  const cake = price(cakeLines, ["COBNUT10"], true); // the coupon that applies
  const cakeOrder = {
    customer: "Zoya", outlet: "hzg", ticket: 12, placedAt: "8:31 am", pickup: "10:00–10:30 am", surfacesAt: "9:45 am",
    lines: cakeLines, tried: cakeTry, priced: cake, paidAt: "the counter", // pickup only: paid at the counter, recorded there
  };

  // ---------------------------------------------------------------- 9:50 am: a walk-in at Imran's till
  // Between the 9:45 and 10:00 chips, after ticket #23 on the kitchen board; still inside the morning bake (08:00–11:00).
  const walkInLines = [{ slug: "hazelnut_croissant", qty: 2 }, { slug: "hazelnut_hot_chocolate", variant: "regular", qty: 1 }];
  const walkIn = { outlet: "hzg", ticket: 24, at: "9:50 am", invoice: "HZG-48", lines: walkInLines, priced: price(walkInLines, [], true), tender: "Card" };

  // ---------------------------------------------------------------- 8:10 am: the owner home, Cobnut Hazratganj
  // Net sales this week (Monday to Thursday, completed orders after discounts) and the labour behind them.
  const salesByDay = [742000, 786000, 814000, 822000];
  const netSalesWeek = salesByDay.reduce((s, x) => s + x, 0);
  // Two staff on 07:30–15:30 shifts, four days: Imran ₹110/h, Kavya ₹130/h.
  const labourWeek = 4 * 8 * (11000 + 13000);
  const labourBp = Math.round((labourWeek * 10000) / netSalesWeek);
  const BUTTER_PER_KG = 56000;
  // Butter write-offs at Hazratganj: three of 2.9 kg this week (Mon, Tue, Wed evening), three of 0.9 kg in a usual week.
  const butterLogsMilli = [2900, 2900, 2900];
  const usualLogsMilli = [900, 900, 900];
  const kgCost = (milli) => Math.round((milli * BUTTER_PER_KG) / 1000);
  const waste = {
    ingredient: "Butter",
    waste: butterLogsMilli.reduce((s, m) => s + kgCost(m), 0),
    median: usualLogsMilli.reduce((s, m) => s + kgCost(m), 0),
  };
  waste.excess = waste.waste - waste.median;

  // Hazelnuts (grams): below the reorder minimum, and short of the next 7 days' need by what the order fills.
  const hazelnuts = {
    name: "Roasted hazelnuts", onHand: 5800, minimum: 8500, par: 16500,
    need7d: 6800, openPo: 0, lastPrice: 148000, lastSupplier: "Lalbagh Nut & Spice", stockoutOn: "22 Oct 2026",
  };
  hazelnuts.shortfall = hazelnuts.need7d - hazelnuts.onHand - hazelnuts.openPo;
  // Shown on screen wherever the 1 kg appears (orchestrator, 16 Oct): the order is the week's shortfall.
  const kg = (g) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(g / 1000);
  hazelnuts.sum = `${kg(hazelnuts.need7d)} kg needed − ${kg(hazelnuts.onHand)} kg on hand = ${kg(hazelnuts.shortfall)} kg`;

  // 12 day-old rolls (₹20 each at cost) already handed to Old Town Community Kitchen this month.
  const caresBefore = { portions: 0, packed: 12, handovers: 1, valueAtCost: 12 * 2000 };
  // The brief is at 8:10 am (founder, 16 Oct): the four orders since the 8 am opening, each one kitchen ticket. (Core takes
  // no online order while an outlet is shut, so a 7 am count could only be zero.)
  const earlyOrders = [
    { at: "8:01 am", channel: "Counter", slug: "cardamom_knot", qty: 2 }, { at: "8:03 am", channel: "Website (pickup)", slug: "truffle_tin", qty: 1 },
    { at: "8:06 am", channel: "Counter", slug: "hazelnut_croissant", qty: 2 }, { at: "8:09 am", channel: "Counter", slug: "brown_butter_cookie", qty: 3 },
  ];
  const ownerHome = {
    outlet: "hzg", at: "8:10 am", earlyOrders, ordersToday: earlyOrders.length, ticketsToday: earlyOrders.length, netSalesWeek, waste,
    shared: caresBefore, lowStock: [{ name: hazelnuts.name, onHand: hazelnuts.onHand, minimum: hazelnuts.minimum, unit: "g" }],
  };

  // 9:20 pm, after the sourdough pickup: the owner home again. The day's orders (each one kitchen ticket) and the week's
  // net sales with Friday's completed orders in (invented: Friday runs above a usual day, cakes included).
  const todaySales = 1128640;
  const ownerHomeLate = { at: "9:20 pm", ordersToday: 41, ticketsToday: 41, netSalesWeek: netSalesWeek + todaySales, todaySales };

  // ---------------------------------------------------------------- the negotiation (as recorded; simulated suppliers)
  // Bounds come from the last price paid: counter at −10%, walk away above +10%. Each simulated supplier answers by its
  // own rule, in basis points over the last price.
  const counterAt = pct(hazelnuts.lastPrice, 9000);
  const walkAway = pct(hazelnuts.lastPrice, 11000);
  const bid = (bp) => pct(hazelnuts.lastPrice, 10000 + bp);
  const suppliers = {
    steady: { name: "Steady Wholesale", payDays: 15, minOrderG: 0, letter: "A" },
    bargain: { name: "Bargain Bulk Traders", payDays: 7, minOrderG: 3000, letter: "B" },
    premium: { name: "Premium Provisions", payDays: 30, minOrderG: 0, letter: "C" },
  };
  // Munim's notes carry no number: code adds the price line after each one (the recorded run).
  const NOTE_COUNTER = "Thank you for the offer. Another supplier has quoted lower, so we ask you to match it.";
  const NOTE_ACCEPT = "Thank you, this works for us.";
  const rounds = [
    [
      { s: "steady", price: bid(200), move: "counter", note: NOTE_COUNTER },
      { s: "bargain", price: bid(-1000), move: "accept", note: NOTE_ACCEPT, terms: "Minimum order 3 kg." },
      { s: "premium", price: bid(1200), move: "counter", note: NOTE_COUNTER },
    ],
    [
      { s: "steady", price: bid(50), move: "counter", note: NOTE_COUNTER },
      { s: "premium", price: walkAway, move: "accept", note: NOTE_ACCEPT },
    ],
    [{ s: "steady", price: bid(-100), move: "accept", note: NOTE_ACCEPT }],
  ];
  const qtyKg = hazelnuts.shortfall / 1000; // the shortfall, in the unit the suppliers quote (kg)
  const finalOf = (key) => rounds.flat().filter((b) => b.s === key).pop();
  const budgetLeft = 5000000 - 2138000; // ₹50,000 purchases budget this month, ₹21,380 committed
  // The deal review's five rules (services/intel/munim_intel/negotiate/review.py), in a person's words when one fails.
  const WHY = {
    budget: "More than the budget left", margin: "Margin below the floor", minimum: "Smallest order is more than is needed",
    overlap: "Already on order", payment: "Pay-within days too short",
  };
  const review = Object.keys(suppliers).map((key) => {
    const s = suppliers[key];
    const q = finalOf(key);
    const total = Math.round(q.price * qtyKg);
    const checks = {
      budget: total <= budgetLeft,
      margin: true, // margin at the quote above the 55% floor for every quote
      minimum: s.minOrderG <= hazelnuts.shortfall,
      overlap: hazelnuts.openPo < hazelnuts.need7d,
      payment: s.payDays >= 7,
    };
    const pass = Object.values(checks).every(Boolean);
    return { key, name: s.name, price: q.price, total, payDays: s.payDays, checks, pass, fail: pass ? null : WHY[Object.keys(checks).find((k) => !checks[k])] };
  });
  const winner = review.filter((r) => r.pass).sort((a, b) => a.price - b.price)[0];
  const po = {
    supplier: winner.name, outlet: "hzg", expected: "19 Oct 2026", unit: "kg", qty: qtyKg, price: winner.price, total: winner.total,
    proposedBy: "Stock & Purchasing", proposedAt: "16 Oct, 11:12 am", approvedAt: "16 Oct, 11:15 am",
    farahGate: "Only the owner can decide this one: it covers outlets beyond yours.",
    approveLabel: `Approve as ${people.owner.name}`,
  };
  po.lineage = `Proposed by ${po.proposedBy} · ${po.proposedAt} · Approved by ${people.owner.name} · ${po.approvedAt}`;
  const negotiation = { counterAt, walkAway, lastPrice: hazelnuts.lastPrice, suppliers, rounds, review, winner: winner.key, po, budgetLeft };

  // ---------------------------------------------------------------- Ask Munim (numbers are snapshot cells, shown with Source)
  const ask = {
    waste: {
      q: "Why was butter waste so high this week?",
      via: "Stock & Purchasing",
      parts: ["Butter written off at Cobnut Hazratganj this week came to ", { ref: "waste", value: waste.waste }, "; a usual week is ", { ref: "median", value: waste.median }, ". Every write-off was marked expired, at the end of the day."],
    },
    diwali: { q: "What will we sell on Diwali night?", abstain: "There isn't enough history to answer that yet." },
    labour: {
      q: "What's my labour percentage this week?",
      via: "People",
      parts: ["Labour at Cobnut Hazratganj this week is ", { ref: "labour", value: labourWeek }, " against ", { ref: "sales", value: netSalesWeek }, " of net sales: ", { ref: "pct", value: labourBp, kind: "rate" }, ", above the ", { ref: "target", value: 2200, kind: "rate" }, " target."],
    },
  };

  // ---------------------------------------------------------------- closing time: Munim Cares (simulated recipients)
  const sourdough = { name: "Sliced sourdough loaf", loaves: 20, costEach: 5500, expires: "18 Oct 2026", batch: "SOURDOUGH-HZG-1" };
  sourdough.atRisk = sourdough.loaves * sourdough.costEach;
  // Distance from Hazratganj (26.850, 80.946) on a flat-earth approximation, as a person would read it on a map.
  const metres = (a, b) => {
    const k = 111320;
    const dy = (b[0] - a[0]) * k;
    const dx = (b[1] - a[1]) * k * Math.cos((a[0] * Math.PI) / 180);
    return Math.round(Math.hypot(dx, dy));
  };
  const HZG = [26.85, 80.946];
  const recipients = [
    { name: "Riverside Night Shelter", kind: "NGO", m: metres(HZG, [26.848, 80.95]), takes: "20:30–23:00" },
    { name: "Old Town Community Kitchen", kind: "Food bank", m: metres(HZG, [26.87, 80.91]), takes: "09:00–22:00" },
  ].sort((a, b) => a.m - b.m);
  const cares = {
    sourdough, recipients, match: recipients[0].name, pickup: "9:00–10:30 pm", // outlet 21:00–22:30 ∩ shelter 20:30–23:00
    draftTitle: "List surplus food on Munim Cares", gate: "Only the owner can approve or reject a donation.",
    before: caresBefore,
    after: {
      portions: caresBefore.portions, packed: caresBefore.packed + sourdough.loaves, handovers: caresBefore.handovers + 1,
      valueAtCost: caresBefore.valueAtCost + sourdough.atRisk,
    },
  };

  // ---------------------------------------------------------------- the close (founder, 16 Oct)
  const disclosure = "Synthetic business · simulated suppliers and recipients · payments recorded, not processed.";
  const endCard = {
    // The founder supplies the Cloud Run URL from his GCP deploy; until then this placeholder is shown and must not ship.
    cup: { url: "CLOUD-RUN-URL-PENDING-FROM-FOUNDER", line: "Built with Gemini on Google Cloud" },
    full: { url: "munim-rho.vercel.app", line: "Built with Gemini" },
    // The 4:00 Cup cut (R74 V-1) ends like the 2:55 one; the FalkorDB cut (R74 V-2, F-1) names the track and the repo, and
    // its live URL is a placeholder until the founder sends it.
    cup4: { url: "CLOUD-RUN-URL-PENDING-FROM-FOUNDER", line: "Built with Gemini on Google Cloud" },
    falkor: { url: "LIVE-URL-PENDING", line: "Built on FalkorDB", track: "Agents That Act on Connected Data", repo: "github.com/SawhneySatvik/business-graph" },
    // The Nebius submission cut: repository destination is set; only the dedicated deployment URL awaits deployment.
    nebius: { url: "[DEMO_URL]", repo: "github.com/SawhneySatvik/munim-nebius-nvidia", line: "The back office that keeps honest books.", labels: "Synthetic data. Simulated suppliers. NVIDIA Nemotron on Nebius Token Factory." },
  };
  // The Australia beat: the seeded AU business (tools/worldgen/src/worlds/au_outlet.ts) on the AU pack. Its prices
  // include GST at 10%, so the GST inside a total is 1/11 of it.
  const au = {
    business: "Laneway Cafe", outlet: "Laneway Cafe Fitzroy", city: "Melbourne", tz: "Australia/Melbourne", currency: "AUD", abn: "12 345 678 901",
    lines: [{ name: "Flat White", price: 480, qty: 1 }, { name: "Smashed Avocado on Sourdough", price: 1850, qty: 1 }],
  };
  au.total = au.lines.reduce((s, l) => s + l.price * l.qty, 0);
  au.gst = Math.round(au.total / 11);

  // The full tour's "All outlets" view at 8:10 am: each outlet from its own books.
  const rollup = { outlets: [{ key: "hzg", tickets: 4, sales: netSalesWeek, waste: waste.waste }, { key: "gmt", tickets: 3, sales: 1978000, waste: 126000 }] };
  rollup.tickets = rollup.outlets.reduce((s, o) => s + o.tickets, 0);
  rollup.sales = rollup.outlets.reduce((s, o) => s + o.sales, 0);
  // The Kitchen desk's finding the owner dismisses in the full tour (the mock's ticket-times row).
  const kitchenDrift = { late: 5, p80: "41 min", prep: "30 min" };
  // Scene 9 (Cup montage) and 9b come after the 9:20 pm owner home, so their in-app stamps are captures from earlier in
  // the day, and a film chip says so ("Earlier · Fri 4:05 pm"). The Australian invoice is Melbourne's own clock.
  const earlier = { proposed: "7:10 am", saved: "4:05 pm", approved: "4:20 pm", melbourne: "1:42 pm" };

  // The full tour's investigation: September against August, all outlets; labour explains the fall. Started after the
  // 10:00 pickup and before the 11:12 purchase order, the order the film shows them in.
  const investigation = {
    startedAt: "10:40 am",
    items: [
      { q: "Did supplier prices go up?", verdict: "Doesn't explain it", by: "Stock & Purchasing", cells: [["Hazelnuts", fmt.inr(148000)], ["was", fmt.inr(145000)]] },
      { q: "Did more food go to waste?", verdict: "Doesn't explain it", by: "Stock & Purchasing", cells: [["Waste", fmt.inr(612400)], ["was", fmt.inr(604800)]] },
      { q: "Did deals and discounts cost more?", verdict: "Doesn't explain it", by: "Menu & Pricing" },
      { q: "Did labour cost more?", verdict: "Explains it", by: "People", cells: [["Labour", fmt.inr(3840000)], ["was", fmt.inr(3072000)]] },
      { q: "Did you sell less, or a cheaper mix?", verdict: "Doesn't explain it", by: "Menu & Pricing" },
    ],
  };

  // The full tour's Cares question, after the shelter's pickup at 9:20 pm.
  ask.cares = {
    q: "How much food have we shared this month?",
    via: "Stock & Purchasing",
    parts: ["This month Cobnut Hazratganj made ", { ref: "handovers", value: cares.after.handovers, kind: "count" }, " hand-overs: ", { ref: "packed", value: cares.after.packed, kind: "count" }, " packed items, worth ", { ref: "value", value: cares.after.valueAtCost }, " at cost."],
  };

  // ---------------------------------------------------------------- the FalkorDB cut's graph scene (R74 V-2)
  // The supply graph core rebuilds from Cobnut's books, as the supplier map (pages/supplier-map.tsx, T-131) reads it: names
  // as the product shows them, with their "(synthetic)" and "(simulated)" marks and the "Simulated supplier" badge. Which dish
  // uses which ingredient is Cobnut's recipe table (mock-server/graph.ts USES). Butter's price and the margins are the
  // product's own figures (₹560.00 a kg; margin = (price − unit cost) / price over the last four weeks at Hazratganj);
  // the hazelnut row follows this film's story: Steady Wholesale supplies at the price Nandini approved, the other two
  // simulated suppliers only quoted.
  const graph = (() => {
    const sup = { dairy: "Riverbank Dairy (simulated)", steady: "Steady Wholesale (simulated)", premium: "Premium Provisions (simulated)", bargain: "Bargain Bulk Traders (simulated)" };
    const ing = { butter: "Butter (synthetic)", hazelnuts: "Roasted hazelnuts (synthetic)", flour: "Bread flour (synthetic)", cream: "Fresh cream (synthetic)" };
    const uses = {
      butter: ["hazelnut_croissant", "pain_au_chocolat", "cardamom_knot", "pistachio_danish", "praline_celebration_cake", "brown_butter_cookie", "eggless_choc_chip"],
      hazelnuts: ["hazelnut_croissant", "praline_celebration_cake", "gianduja_mousse", "brown_butter_cookie", "build_a_box", "hazelnut_hot_chocolate"],
      flour: ["hazelnut_croissant", "pain_au_chocolat", "cardamom_knot", "pistachio_danish", "praline_celebration_cake", "rose_tres_leches", "brown_butter_cookie", "eggless_choc_chip", "oat_jaggery_cookie"],
      cream: ["praline_celebration_cake", "gianduja_mousse", "rose_tres_leches", "build_a_box"],
    };
    const dishName = (slug) => (slug === "build_a_box" ? "Build-a-Box" : items[slug].name);
    const dishes = [...new Set(Object.values(uses).flat())];
    const supplies = [["dairy", "butter"], ["steady", "hazelnuts"]];
    const quoted = [["premium", "hazelnuts"], ["bargain", "hazelnuts"]];
    // Unit cost a dish carries over the last four weeks (paise), from the product's mock sales; margin in basis points.
    const cost = { hazelnut_croissant: 6150, cardamom_knot: 3310, pistachio_danish: 7480, brown_butter_cookie: 2960, eggless_choc_chip: 2410 };
    const marginBp = (slug) => Math.round(((items[slug].price - cost[slug]) * 10000) / items[slug].price);
    return {
      sup, ing, uses, dishes, dishName, supplies, quoted, outlets: ["hzg", "gmt"],
      butterPrice: 56000, hazelnutPrice: negotiation.po.price,
      sole: [["flour", null], ["butter", "dairy"], ["cream", null], ["hazelnuts", "steady"]],
      // The drawer's first four dishes (the camera does not scroll further): a margin cell, "Cannot verify" for the pain au
      // chocolat (its margin row costs an earlier recipe), and the pistachio danish paused (sold out) at both outlets.
      drawer: [
        { slug: "hazelnut_croissant", margin: marginBp("hazelnut_croissant") },
        { slug: "pain_au_chocolat", margin: null },
        { slug: "cardamom_knot", margin: marginBp("cardamom_knot") },
        { slug: "pistachio_danish", margin: marginBp("pistachio_danish"), paused: true },
      ],
    };
  })();
  // Ask, answered from the graph: the recorded run's own words (services/intel/tests/graph/fixtures/butter), with butter's
  // latest-price cell as its source.
  ask.butter = {
    q: "What does a price rise of Butter (synthetic) touch?",
    via: "Stock & Purchasing",
    parts: [
      "Butter (synthetic) costs ", { ref: "price", value: graph.butterPrice }, " at its latest price. A rise in that price reaches these dishes: ",
      "Brown Butter Hazelnut Cookie, Cardamom Knot, Eggless Choc-Chip Cookie, Hazelnut Croissant, Hazelnut Praline Cake, Pain au Chocolat and Pistachio Danish. ",
      "They are sold at Cobnut Gomti Nagar and Cobnut Hazratganj. Its latest price is ", { ref: "price", value: graph.butterPrice }, ".",
    ],
  };

  globalThis.FIX = {
    fmt, day, outlets, people, specialists, manager, items, categories, TAX, deal, coupons, price,
    cakeOrder, walkIn, salesByDay, netSalesWeek, labourWeek, labourBp, waste, hazelnuts, ownerHome, ownerHomeLate, negotiation, ask, cares,
    disclosure, endCard, au, rollup, kitchenDrift, investigation, earlier, graph,
  };
})();
