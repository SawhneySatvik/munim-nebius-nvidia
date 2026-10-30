// The full tour's clock (6:00): every scene window, every narration line and every event, in seconds from the start of
// the cut. The same scene library as the Cup cut, each scene longer, plus "also" (9b). Narration times are
// provisional until the voice is recorded (Task 4); the caption text must match script/full.md word for word
// (tests/timing.test.mjs). Scene events are filled in as each scene is built (Task 5).
(function () {
  const order = [
    ["coldOpen", 12], ["meet", 26], ["brief", 42], ["order", 36], ["kitchen", 40], ["office", 56],
    ["negotiation", 48], ["cares", 26], ["dev", 20], ["also", 40], ["close", 14],
  ];
  const scenes = {};
  let t = 0;
  for (const [key, dur] of order) {
    scenes[key] = { start: t, dur, end: t + dur, ev: {}, d: {} };
    t += dur;
  }

  // [id, start, end, caption, text for the voice]
  const vo = [
    ["1.1", 0.5, 1.8, "Thin margins.", "Thin margins."],
    ["1.2", 2.0, 3.2, "Late nights.", "Late nights."],
    ["1.3", 3.4, 5.8, "And books that don't add up.", "And books that don't add up."],
    ["1.4", 7.0, 11.2, "Munim is the back office that keeps them honest.", "Moo-neem is the back office that keeps them honest."],
    ["2.1", 12.6, 17.4, "Munim is an operating system for restaurants, cloud kitchens and shops.", "Moo-neem is an operating system for restaurants, cloud kitchens, and shops."],
    ["2.2", 18.0, 21.4, "It runs the counter, the kitchen and the books.", "It runs the counter, the kitchen, and the books."],
    ["2.3", 21.8, 26.4, "Its AI explains what happened, and drafts the fix for you to approve.", "Its A I explains what happened, and drafts the fix, for you to approve."],
    ["2.4", 27.0, 31.4, "Munim Cares links surplus food to the people who need it.", "Moo-neem Cares links surplus food to the people who need it."],
    ["2.5", 32.0, 37.4, "Cobnut Bakehouse runs on Munim: two outlets in Lucknow. Here's one day.", "Cobnut Bakehouse runs on Moo-neem. Two outlets, in Lucknow. Here's one day."],
    ["3.1", 38.6, 43.4, "Everyone signs in to their own view: owner, manager, counter and kitchen.", "Everyone signs in to their own view. Owner, manager, counter, and kitchen."],
    ["3.2", 44.0, 48.6, "What you can see and do follows your role and your outlets.", "What you can see and do follows your role, and your outlets."],
    ["3.3", 49.2, 52.6, "Ten past eight. Nandini, the owner, opens her day.", "Ten past eight. Nun-dee-nee, the owner, opens her day."],
    ["3.4", 53.2, 58.0, "One tap shows both outlets side by side, each from its own books.", "One tap shows both outlets side by side, each from its own books."],
    ["3.5", 58.6, 64.6, "Butter waste is three times a usual week: nearly five thousand rupees, against fifteen hundred.", "Butter waste is three times a usual week. Nearly five thousand rupees, against fifteen hundred."],
    ["3.6", 65.2, 69.2, "Tap any number, and Munim opens the rows it came from.", "Tap any number, and Moo-neem opens the rows it came from."],
    ["3.7", 69.6, 72.4, "Every number traces to a row.", "Every number traces to a row."],
    ["3.8", 73.0, 79.4, "Below, what needs her: findings from the AI, and proposals waiting for a yes or a no.", "Below, what needs her. Findings from the A I, and proposals waiting for a yes, or a no."],
    ["4.1", 80.4, 84.6, "Eight thirty. Zoya orders a birthday cake from Cobnut's own site.", "Eight thirty. Zoya orders a birthday cake, from Cobnut's own site."],
    ["4.2", 85.2, 90.0, "The menu, the morning deal, what's sold out: all live from the books.", "The menu, the morning deal, what's sold out. All live, from the books."],
    ["4.3", 90.6, 95.0, "She picks one kilo, eggless, and adds a message for the top.", "She picks one kilo, eggless, and adds a message for the top."],
    ["4.4", 95.6, 102.6, "Her first coupon is used up, and Munim's server says so. The next one takes ten percent off.", "Her first coupon is used up, and Moo-neem's server says so. The next one takes ten percent off."],
    ["4.5", 103.2, 108.2, "The tax is split the way an Indian bill needs it: central and state.", "The tax is split the way an Indian bill needs it. Central, and state."],
    ["4.6", 108.8, 115.2, "Pickup at ten, paid at the counter. She follows the order live, from placed to ready.", "Pickup at ten, paid at the counter. She follows the order live, from placed, to ready."],
    ["5.1", 116.6, 120.8, "The order lands on Kavya's kitchen board, timed to the pickup.", "The order lands on Kahv-yah's kitchen board, timed to the pickup."],
    ["5.2", 121.4, 127.2, "Later orders wait in their own lane, and move to Now when it's time to start.", "Later orders wait in their own lane, and move to Now, when it's time to start."],
    ["5.3", 127.8, 130.0, "Start. Ready.", "Start. Ready."],
    ["5.4", 130.4, 135.4, "At the till, Imran rings up a walk-in, choosing sizes as he goes.", "At the till, Im-raan rings up a walk-in, choosing sizes as he goes."],
    ["5.5", 135.8, 142.0, "The morning deal comes off by itself, and the bill is a proper GST tax invoice.", "The morning deal comes off by itself, and the bill is a proper G S T tax invoice."],
    ["5.6", 142.6, 149.0, "He records a card payment. Munim keeps the record; it never moves the money.", "He records a card payment. Moo-neem keeps the record. It never moves the money."],
    ["5.7", 149.6, 155.2, "At ten, Zoya collects her cake, right on time.", "At ten, Zoya collects her cake. Right on time."],
    ["6.1", 156.6, 162.0, "Behind the counter, Munim's AI back office keeps watch: eight specialists and a manager.", "Behind the counter, Moo-neem's A I back office keeps watch. Eight specialists, and a manager."],
    ["6.2", 162.6, 169.4, "Each one reads the books in its own area: menu, kitchen, stock, finance, people, customers, compliance, the market.", "Each one reads the books in its own area. Menu, kitchen, stock, finance, people, customers, compliance, the market."],
    ["6.3", 170.0, 175.0, "This morning they found the butter waste, and hazelnuts running short.", "This morning, they found the butter waste, and hazelnuts running short."],
    ["6.4", 175.6, 181.2, "A finding Nandini doesn't need, she dismisses with a reason. Munim remembers.", "A finding Nun-dee-nee doesn't need, she dismisses, with a reason. Moo-neem remembers."],
    ["6.5", 181.8, 188.4, "She asks why butter waste was so high. The answer comes back with its sources.", "She asks why butter waste was so high. The answer comes back, with its sources."],
    ["6.6", 189.0, 196.0, "Labour this week? About a quarter of sales, above her target, every figure traced.", "Labour this week? About a quarter of sales. Above her target, and every figure traced."],
    ["6.7", 196.6, 204.4, "Ask it something it can't know, and it won't guess. It says: cannot verify.", "Ask it something it can't know, and it won't guess. It says, cannot verify."],
    ["6.8", 205.0, 211.2, "Bigger questions get an investigation: it checks each cause, and only reads the books.", "Bigger questions get an investigation. It checks each cause, and only reads the books."],
    ["7.1", 212.6, 217.8, "Hazelnuts are below their minimum. One tap asks three simulated suppliers to quote.", "Hazelnuts are below their minimum. One tap asks three simulated suppliers to quote."],
    ["7.2", 218.2, 224.2, "Munim's agent negotiates with theirs, round by round, inside limits set from the last price paid.", "Moo-neem's agent negotiates with theirs, round by round, inside limits set from the last price paid."],
    ["7.3", 224.8, 231.0, "Its messages never carry a number; the prices come from the suppliers' own quotes.", "Its messages never carry a number. The prices come from the suppliers' own quotes."],
    ["7.4", 231.6, 237.8, "The cheapest bid needs a bigger order than Cobnut can use. It fails the rules.", "The cheapest bid needs a bigger order than Cobnut can use. It fails the rules."],
    ["7.5", 238.2, 243.8, "The order is only a draft. Farah runs the other outlet, so she can't approve it.", "The order is only a draft. Farah runs the other outlet, so she can't approve it."],
    ["7.6", 244.4, 249.2, "Nandini can. Approved, by name, with every step on record.", "Nun-dee-nee can. Approved, by name, with every step on record."],
    ["7.7", 249.8, 254.8, "On the suppliers screen, the order waits for delivery.", "On the suppliers screen, the order waits for delivery."],
    ["7.8", 255.4, 259.6, "When the hazelnuts arrive, Nandini records what came in.", "When the hazelnuts arrive, Nun-dee-nee records what came in."],
    ["8.1", 260.6, 264.6, "Closing time. Twenty sourdough loaves won't sell before their date.", "Closing time. Twenty sourdough loaves won't sell before their date."],
    ["8.2", 265.2, 271.0, "Munim drafts a donation and matches a shelter nearby. Only the owner can approve it.", "Moo-neem drafts a donation, and matches a shelter nearby. Only the owner can approve it."],
    ["8.3", 271.6, 275.6, "Nandini approves. Pickup is between nine and ten thirty.", "Nun-dee-nee approves. Pickup is between nine, and ten thirty."],
    ["8.4", 276.2, 285.4, "How much have we shared this month? Thirty-two items, two hand-overs, all traced to the books.", "How much have we shared this month? Thirty-two items. Two hand-overs. All traced to the books."],
    ["9.1", 286.6, 292.2, "Everything you've seen has a public API: an OpenAPI reference, and a typed SDK.", "Everything you've seen has a public A P I. An open A P I reference, and a typed S D K."],
    ["9.2", 292.8, 299.0, "Storefronts, tills and kitchen screens can be built on it. Cobnut's were.", "Storefronts, tills, and kitchen screens can be built on it. Cobnut's were."],
    ["9.3", 299.6, 305.2, "Download the SDK, and make your first call in a few lines.", "Download the S D K, and make your first call in a few lines."],
    ["9b.1", 306.6, 312.4, "A page builder for the storefront: pick the colours, drag the sections, and preview it.", "A page builder for the storefront. Pick the colours, drag the sections, and preview it."],
    ["9b.2", 313.0, 318.4, "Nothing goes live until someone with the right role publishes it.", "Nothing goes live until someone with the right role publishes it."],
    ["9b.3", 319.6, 325.4, "Campaigns: when regulars stop coming, Munim drafts a message to bring them back.", "Campaigns. When regulars stop coming, Moo-neem drafts a message to bring them back."],
    ["9b.4", 326.0, 331.2, "It's sent only after a person approves it, by name.", "It's sent only after a person approves it, by name."],
    ["9b.5", 332.4, 338.4, "And in Melbourne, Laneway Cafe runs on the Australian country pack.", "And in Melbourne, Laneway Cafe runs on the Australian country pack."],
    ["9b.6", 339.0, 345.4, "Australian dollars, GST included in the price, its own time zone. Same code.", "Australian dollars. G S T included in the price. Its own time zone. Same code."],
    ["10.1", 346.6, 352.0, "Nothing changes your books without your approval. Every number traces to a row.", "Nothing changes your books without your approval. Every number traces to a row."],
    ["10.2", 352.6, 354.4, "This is Munim.", "This is Moo-neem."],
  ];

  // Events (absolute seconds) in ev; durations and steps (seconds) in d. Set against the recorded voice (bf_emma).
  const ev = (key, events, d = {}) => Object.assign(scenes[key], { ev: events, d: { wipe: 0.7, ...d } });
  ev("coldOpen", { stamp1: 0.6, stamp2: 2.05, stamp3: 3.45, total: 5.2, ghost: 6.6, logo: 6.9, wipeOut: 11.3 });
  ev("meet", { wipeIn: 12.0, toGuarantee: 17.6, sticker0: [22.0, 26.4], toCares: 26.6, toMap: 31.6, pinHzg: 33.0, pinGmt: 33.6, sticker: [34.4, 37.2] });
  ev("brief", {
    wipeIn: 38.0, laptopIn: 38.2, picker: 38.2, roles: 44.0, signIn: 48.0, toHome: 48.6, timeChip: [49.0, 52.8], countFrom: 49.6,
    toAll: 53.4, backOutlet: 57.6, camWaste: 58.4, encircle: 59.6, camDrift: 59.4, usualNote: [62.6, 65.4], cursorIn: 63.4,
    clickChip: 65.6, drawerOpen: 65.8, camDrawer: 66.0, highlight: 67.4, camBack: 69.4, sticker: [69.6, 72.4], drawerClose: 72.6,
    camNeeds: 73.0, wipeOut: 79.3,
  }, { count: 1.6, countStep: 0.12, cursorMove: 1.1, roleStep: 1.1 });
  ev("order", {
    wipeIn: 80.0, phoneIn: 80.2, chip: [80.4, 84.0], scroll1: 85.2, scroll2: 87.4, tapCake: 90.6, sheetIn: 90.8, tapOne: 91.8,
    tapEggless: 92.6, typeNote: 93.1, tapAdd: 94.8, checkout: 95.2, camCoupon: 95.5, typeFirst: 95.9, apply1: 96.8, remove: 98.7,
    typeCobnut: 99.1, apply2: 100.0, sticker: [100.3, 103.0], taxHighlight: 103.8, camBack: 107.6, scrollPlace: 108.4, tapPlace: 110.2,
    tracker: 110.5, accepted: 112.6, wipeOut: 115.3,
  });
  ev("kitchen", {
    wipeIn: 116.0, flight: 116.8, land: 117.8, chip: [121.4, 124.8], skip: 121.6, start: 127.9, ready: 128.9, toTill: 130.0,
    tapCroissant: 131.0, tapCroissant2: 131.5, tapHc: 132.8, place: 135.0, payment: 135.4, receipt: 136.2, receiptMark: 138.2,
    tapCard: 142.8, record: 143.6, sticker: [144.0, 148.8], toKds: 149.2, chip2: [149.4, 152.6], handed: 151.0, wipeOut: 155.3,
  });
  ev("office", {
    wipeIn: 156.0, deskTour: 162.8, watch: 169.8, toInbox: 175.4, tapDismiss: 177.0, why: 178.0, confirm: 179.4, toAsk: 181.0,
    typeQ1: 181.6, ask1: 183.0, think1: 183.2, answer1: 185.4, typeQ2: 189.0, ask2: 190.4, think2: 190.6, answer2: 192.6,
    typeQ3: 196.6, ask3: 197.8, think3: 198.0, answer3: 200.0, encircleCV: 200.5, toInv: 204.8, sticker: [208.8, 211.2], wipeOut: 211.3,
  }, { deskStep: 0.72, invStep: 0.5 });
  // The office replay: [time, spot, words, tone], words as lib/munim/office.ts writes them.
  scenes.office.steps = [
    [170.3, "manager", "Routing to Stock & Purchasing", "work"], [171.1, "inventory_purchasing", "Checking waste this week", "work"],
    [171.9, "inventory_purchasing", "Found something", "found"], [172.8, "inventory_purchasing", "Checking stock below its minimum", "work"],
    [173.6, "inventory_purchasing", "Found something", "found"], [174.3, "kitchen", "Checking kitchen ticket times", "work"],
    [174.9, "owner", "Needs your approval", "draft"],
  ];
  ev("negotiation", {
    wipeIn: 212.0, camLow: 212.3, clickRequest: 214.2, clickSend: 216.4, toChat: 217.6, r1: 218.4, r2: 221.4, r3: 223.6,
    codeMark: 226.4, sticker: [218.6, 223.4], review: 231.2, reviewFail: 233.4, proposed: 235.2, toPo: 237.8, note: [238.6, 243.6],
    gate: 240.8, toNandini: 243.9, approve: 245.2, applied: 245.5, sticker2: [245.8, 249.2], toSuppliers: 249.6, tapReceive: 255.4,
    grn: 255.6, grnSave: 257.4, wipeOut: 259.3,
  }, { bidStep: 0.5 });
  ev("cares", {
    wipeIn: 260.0, chip: [260.4, 264.4], encircleRisk: 262.6, camListing: 265.0, rank: 267.0, approve: 272.0, applied: 272.3,
    toAsk: 275.8, typeQ: 276.2, ask: 277.6, think: 277.8, answer: 279.8, sticker: [281.6, 285.0], wipeOut: 285.3,
  });
  ev("dev", { wipeIn: 286.0, navMark: 288.0, camOut: 292.8, download: 299.8, typeCode: 300.4, wipeOut: 305.3 }, { codeCps: 75 });
  ev("also", {
    wipeIn: 306.0, preset: 307.8, scroll: 308.4, drag: 309.4, save: 311.6, publish: 315.2, sticker1: [313.2, 318.6], toCampaigns: 319.2,
    reachMark: 323.2, approve: 327.0, sticker2: [327.4, 331.4], toAu: 332.0, packRows: 333.2, sticker3: [339.2, 345.0], wipeOut: 345.3,
  });
  ev("close", { wipeIn: 346.0, g1: 346.6, g2: 349.0, endcard: 352.4, disclosure: 353.2 });

  // Sound effects, derived from the events exactly as the Cup clock does.
  const raw = [];
  const cue = (t, name, under) => raw.push([+t.toFixed(3), name, under]);
  for (const k of order.map(([key]) => key)) {
    const e = scenes[k].ev;
    if (e.wipeOut !== undefined) cue(e.wipeOut, "page-turn", 9);
    for (const [name, v] of Object.entries(e)) {
      if (name.startsWith("stamp") || name === "logo") cue(v, "slam", 8);
      else if (/^(sticker|sticker0|sticker1|sticker2|sticker3)$/.test(name)) cue(v[0], "slam", 9);
      else if (/^(chip|chip2|timeChip|usualNote|note)$/.test(name)) cue(v[0], "pop", 11);
      else if (/^(tap|click|apply|remove|approve|record|place|start|ready|handed|watch|ask\d?$|confirm|preset|save|publish|grnSave|download|signIn)/.test(name)) cue(v, "click", 9);
      else if (/^(encircle|gate|reviewFail|codeMark|reachMark)/.test(name)) cue(v, "pen", 10);
      else if (/^(drawerOpen|drawerClose|sheetIn|checkout|tracker|toTill|toKds|toAsk|toChat|toPo|toHome|toMap|toGuarantee|toCares|toAll|toInbox|toInv|toSuppliers|toCampaigns|toAu|payment|review|receipt)$/.test(name)) cue(v, "swish", 11);
      else if (name === "flight" || name === "drag") cue(v, "swish", 9);
      else if (name === "land") cue(v, "chime", 9);
    }
    if (k === "kitchen") cue(e.record + 0.15, "register", 8);
    if (k === "close") cue(e.endcard, "slam", 8);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const sfx = [];
  for (const c of raw) if (!sfx.length || c[0] - sfx[sfx.length - 1][0] >= 0.15) sfx.push(c);

  globalThis.TIMING = globalThis.TIMING || {};
  globalThis.TIMING.full = {
    cut: "full",
    /** Lines a sticker or stamp carries word for word: they skip the caption band. */
    capSkip: ["3.7", "10.1"],
    /** The narrator (the spike's audition: bf_emma). */
    voice: "bf_emma",
    sfx,
    duration: t,
    order: order.map(([k]) => k),
    scenes,
    vo,
    /** A time in the cut → seconds into that scene. */
    local: (key, abs) => +(abs - scenes[key].start).toFixed(4),
  };
})();
