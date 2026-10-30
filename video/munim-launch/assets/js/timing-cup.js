// The Cup cut's clock (2:55): every scene window, every narration line and every event, in seconds from the start of
// the cut. Scenes read only from here (T.local turns a time into the scene's own seconds); the audio mix places the
// voice and the sound effects from the same numbers. Narration times are provisional until the voice is recorded
// (Task 4); the caption text must match script/cup.md word for word (tests/timing.test.mjs).
(function () {
  const order = [
    ["coldOpen", 10], ["meet", 10], ["brief", 18], ["order", 22], ["kitchen", 18],
    ["office", 27], ["negotiation", 30], ["cares", 17], ["dev", 13], ["close", 10],
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
    ["1.4", 6.2, 9.6, "Munim is the back office that keeps them honest.", "Moo-neem is the back office that keeps them honest."],
    ["2.1", 10.4, 13.8, "Munim runs the counter, the kitchen and the books.", "Moo-neem runs the counter, the kitchen, and the books."],
    ["2.2", 14.4, 19.2, "Cobnut Bakehouse runs on it: two outlets in Lucknow. Here's one day.", "Cobnut Bakehouse runs on it. Two outlets, in Lucknow. Here's one day."],
    ["3.1", 20.4, 23.8, "Ten past eight. Nandini, the owner, opens her day.", "Ten past eight. Nun-dee-nee, the owner, opens her day."],
    ["3.2", 24.0, 30.0, "Butter waste is three times a usual week: nearly five thousand rupees, against fifteen hundred.", "Butter waste is three times a usual week. Nearly five thousand rupees, against fifteen hundred."],
    ["3.3", 30.4, 34.4, "Tap any number, and Munim opens the rows it came from.", "Tap any number, and Moo-neem opens the rows it came from."],
    ["3.4", 34.8, 37.4, "Every number traces to a row.", "Every number traces to a row."],
    ["4.1", 38.3, 42.4, "Eight thirty. Zoya orders a birthday cake from Cobnut's own site.", "Eight thirty. Zoya orders a birthday cake, from Cobnut's own site."],
    ["4.2", 42.8, 45.6, "One kilo, eggless, a message on top.", "One kilo. Eggless. A message on top."],
    ["4.3", 46.2, 52.8, "Her first coupon is used up, and Munim's server says so. The next one takes ten percent off.", "Her first coupon is used up, and Moo-neem's server says so. The next one takes ten percent off."],
    ["4.4", 53.4, 58.6, "Pickup at ten, paid at the counter. She can follow the order live.", "Pickup at ten, paid at the counter. She can follow the order, live."],
    ["5.1", 60.6, 64.4, "The order lands on Kavya's kitchen board, timed to the pickup.", "The order lands on Kahv-yah's kitchen board, timed to the pickup."],
    ["5.2", 65.2, 66.8, "Start. Ready.", "Start. Ready."],
    ["5.3", 67.6, 74.0, "At the till, Imran records a card payment. Munim keeps the record; it never moves the money.", "At the till, Im-raan records a card payment. Moo-neem keeps the record. It never moves the money."],
    ["5.4", 74.6, 77.4, "And the cake goes out on time.", "And the cake goes out, on time."],
    ["6.1", 78.6, 84.0, "Behind the counter, Munim's AI back office keeps watch: eight specialists and a manager.", "Behind the counter, Moo-neem's A I back office keeps watch. Eight specialists, and a manager."],
    ["6.2", 84.6, 88.4, "They've spotted the butter, and hazelnuts running short.", "They've spotted the butter, and hazelnuts running short."],
    ["6.3", 89.2, 95.6, "Nandini asks why. The answer comes back with its sources, from her own books.", "Nun-dee-nee asks why. The answer comes back with its sources, from her own books."],
    ["6.4", 96.4, 103.8, "Ask it something it can't know, and it won't guess. It says: cannot verify.", "Ask it something it can't know, and it won't guess. It says, cannot verify."],
    ["7.1", 105.4, 110.6, "Hazelnuts are below their minimum. One tap asks three simulated suppliers to quote.", "Hazelnuts are below their minimum. One tap asks three simulated suppliers to quote."],
    ["7.2", 111.0, 116.6, "Munim's agent negotiates, round by round, inside limits set from the last price paid.", "Moo-neem's agent negotiates, round by round, inside limits set from the last price paid."],
    ["7.3", 117.2, 123.0, "The cheapest bid needs a bigger order than Cobnut can use. It fails the rules.", "The cheapest bid needs a bigger order than Cobnut can use. It fails the rules."],
    ["7.4", 123.6, 129.2, "The order is only a draft. Farah runs the other outlet, so she can't approve it.", "The order is only a draft. Farah runs the other outlet, so she can't approve it."],
    ["7.5", 129.8, 134.4, "Nandini can. Approved, by name, with every step on record.", "Nun-dee-nee can. Approved, by name, with every step on record."],
    ["8.1", 135.6, 139.6, "Closing time. Twenty sourdough loaves won't sell before their date.", "Closing time. Twenty sourdough loaves won't sell before their date."],
    ["8.2", 140.2, 146.4, "Munim drafts a donation and matches a shelter nearby. Nandini approves; pickup is at nine.", "Moo-neem drafts a donation, and matches a shelter nearby. Nun-dee-nee approves. Pickup is at nine."],
    ["8.3", 147.0, 151.4, "Food that would have been thrown away, counted in the books.", "Food that would have been thrown away, counted in the books."],
    ["9.1", 152.2, 156.2, "Everything you've seen has a public API, and a typed SDK.", "Everything you've seen has a public A P I, and a typed S D K."],
    ["9.2", 156.6, 164.6, "Plus a page builder for the storefront, campaigns that send only when approved, and Australia on its own country pack.", "Plus a page builder for the storefront. Campaigns that send only when approved. And Australia, on its own country pack."],
    ["10.1", 165.4, 170.4, "Nothing changes your books without your approval. Every number traces to a row.", "Nothing changes your books without your approval. Every number traces to a row."],
  ];

  // Events (absolute seconds) in ev; durations and steps (seconds) in d. Set against the recorded voice (bf_emma).
  const ev = (key, events, d = {}) => Object.assign(scenes[key], { ev: events, d: { wipe: 0.7, ...d } });
  ev("coldOpen", { stamp1: 0.6, stamp2: 2.05, stamp3: 3.45, total: 5.0, ghost: 6.0, logo: 6.3, wipeOut: 9.3 });
  ev("meet", { wipeIn: 10.0, toMap: 14.0, pinHzg: 15.4, pinGmt: 16.0, sticker: [16.6, 19.2] });
  ev("brief", {
    wipeIn: 20.0, laptopIn: 20.2, timeChip: [20.4, 23.4], countFrom: 21.0, camWaste: 23.4, encircle: 24.6, camDrift: 24.4,
    usualNote: [27.4, 30.2], cursorIn: 28.4, clickChip: 30.6, drawerOpen: 30.8, camDrawer: 31.0, highlight: 32.4, camBack: 34.4,
    sticker: [34.8, 37.2], wipeOut: 37.3,
  }, { count: 1.6, countStep: 0.12, cursorMove: 1.1 });
  ev("order", {
    wipeIn: 38.0, phoneIn: 38.2, chip: [38.4, 41.6], scroll2: 39.6, tapCake: 41.3, sheetIn: 41.5, tapOne: 42.9, tapEggless: 43.7,
    typeNote: 44.1, tapAdd: 45.6, checkout: 45.9, camCoupon: 46.2, typeFirst: 46.6, apply1: 47.4, remove: 49.0, typeCobnut: 49.3,
    apply2: 50.2, sticker: [50.6, 53.2], camBack: 52.4, scrollPlace: 53.0, tapPlace: 54.4, tracker: 54.7, accepted: 56.4, wipeOut: 59.3,
  });
  ev("kitchen", {
    wipeIn: 60.0, flight: 60.7, land: 61.7, chip: [64.0, 66.9], skip: 64.2, start: 65.3, ready: 66.3, toTill: 67.2, tapCroissant: 67.9,
    tapCroissant2: 68.3, tapHc: 68.8, place: 69.7, payment: 70.1, tapCard: 70.6, record: 71.3, sticker: [71.6, 74.2], toKds: 74.3,
    chip2: [74.4, 77.0], handed: 75.4, wipeOut: 77.3,
  });
  ev("office", {
    wipeIn: 78.0, watch: 79.4, toAsk: 88.4, typeQ1: 89.2, ask1: 90.6, think1: 90.8, answer1: 93.2, typeQ3: 96.6, ask3: 97.8, think3: 98.0,
    answer3: 100.0, encircleCV: 100.5, wipeOut: 104.3,
  });
  // The office replay: [time, spot, words, tone], words as lib/munim/office.ts writes them.
  scenes.office.steps = [
    [80.0, "manager", "Routing to Stock & Purchasing", "work"], [80.9, "inventory_purchasing", "Checking waste this week", "work"],
    [81.8, "inventory_purchasing", "Got the rows", "work"], [82.7, "inventory_purchasing", "Found something", "found"],
    [84.8, "inventory_purchasing", "Checking stock below its minimum", "work"], [85.8, "inventory_purchasing", "Found something", "found"],
    [86.8, "kitchen", "Checking kitchen ticket times", "work"], [87.6, "owner", "Needs your approval", "draft"],
  ];
  ev("negotiation", {
    wipeIn: 105.0, camLow: 105.3, clickRequest: 106.4, clickSend: 108.0, toChat: 109.2, r1: 109.8, r2: 112.6, r3: 114.8,
    sticker: [111.0, 116.6], review: 117.2, reviewFail: 119.0, proposed: 120.4, toPo: 122.6, note: [123.6, 128.6], gate: 125.6,
    toNandini: 129.0, approve: 130.5, applied: 130.8, sticker2: [131.2, 134.0], wipeOut: 134.3,
  }, { bidStep: 0.45 });
  ev("cares", {
    wipeIn: 135.0, chip: [135.4, 139.4], encircleRisk: 137.6, camListing: 139.8, rank: 141.6, approve: 143.6, applied: 143.9,
    toHome: 146.6, chip2: [146.8, 150.6], count: 147.4, sticker: [147.8, 151.0], wipeOut: 151.3,
  });
  ev("dev", { wipeIn: 152.0, download: 152.7, typeCode: 153.0, m1: 156.4, m2: 159.0, m3: 161.6, wipeOut: 164.3 }, { codeCps: 110 });
  ev("close", { wipeIn: 165.0, g1: 165.5, g2: 167.9, endcard: 170.6, disclosure: 171.2 });

  // Sound effects from the same events: [time, file in assets/audio/sfx, dB under the music bed (8–12, the plan's rule)].
  // A cue within 0.15 s of the one before is dropped (tests/timing.test.mjs checks the spacing).
  const raw = [];
  const cue = (t, name, under) => raw.push([+t.toFixed(3), name, under]);
  for (const k of order.map(([key]) => key)) {
    const e = scenes[k].ev;
    if (e.wipeOut !== undefined) cue(e.wipeOut, "page-turn", 9);
    for (const [name, v] of Object.entries(e)) {
      if (name.startsWith("stamp") || name === "logo") cue(v, "slam", 8);
      else if (/^(sticker|sticker2)$/.test(name)) cue(v[0], "slam", 9);
      else if (/^(chip|chip2|timeChip|usualNote|note)$/.test(name)) cue(v[0], "pop", 11);
      else if (/^(tap|click|apply|remove|approve|record|place|start|ready|handed|watch|ask\d|download|signIn)/.test(name)) cue(v, "click", 9);
      else if (/^(encircle|gate|reviewFail)/.test(name)) cue(v, "pen", 10);
      else if (/^(drawerOpen|sheetIn|checkout|tracker|toTill|toKds|toAsk|toChat|toPo|toHome|toMap|payment|review)$/.test(name)) cue(v, "swish", 11);
      else if (name === "flight") cue(v, "swish", 9);
      else if (name === "land") cue(v, "chime", 9);
    }
    if (k === "kitchen") cue(e.record + 0.15, "register", 8);
    if (k === "close") cue(e.endcard, "slam", 8);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const sfx = [];
  for (const c of raw) if (!sfx.length || c[0] - sfx[sfx.length - 1][0] >= 0.15) sfx.push(c);

  globalThis.TIMING = globalThis.TIMING || {};
  globalThis.TIMING.cup = {
    cut: "cup",
    /** Lines a sticker or stamp carries word for word: they skip the caption band. */
    capSkip: ["3.4", "10.1"],
    /** The narrator (Task 4 audition: bf_emma fits every window at natural speed; bm_george runs past 3.1 and 3.2). */
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
