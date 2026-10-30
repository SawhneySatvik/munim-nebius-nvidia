// Nebius submission cut: an evidence-backed product day, an AI-office walkthrough and the graph story.
// Model-role and UI facts are source-documented; this film makes no Token Factory benchmark claims.
(function () {
// Original source clock retained below so the proven screen events can be remapped without losing their provenance.
  const sourceOrder = [
    ["nbMorning", 30], // 1 the owner home · 2 Ask · 3 the Source drawer and the waste finding
    ["nbModels", 12], // 4 the model roles and provider verification
    ["nbInvoice", 28], // 5 the invoice photo read into a draft · 6 the price check (market line placeholder until NB-7)
    ["nbQuotes", 30], // 7 three simulated suppliers, round by round, and the deal check
    ["nbOrder", 34], // 8 the purchase order draft · 9 the human approval gate
    ["nbVerify", 16], // 10 Cannot verify
    ["nbLimits", 18], // 11 the limits card (historical NVIDIA-endpoint figures, provider clearly labelled)
    ["nbEnd", 10], // 12 the end card and submission links
  ];
  const scenes = {};
  let t = 0;
  for (const [key, dur] of sourceOrder) {
    scenes[key] = { start: t, dur, end: t + dur, ev: {}, d: {} };
    t += dur;
  }

  // [id, start, end, caption, text for the voice]. The narration names the Nemotron roles without assigning unsupported provider-specific model results.
  const vo = [
    ["1.1", 0.5, 2.7, "Nandini owns two bakeries.", "Nun-dee-nee owns two bakeries."],
    ["1.2", 2.7, 5.0, "Every morning, she has one question.", "Every morning, she has one question."],
    ["2.1", 5.3, 6.8, "She asks Munim.", "She asks Moo-neem."],
    ["2.2", 9.8, 11.7, "It answers from her books.", "It answers from her books."],
    ["2.3", 12.0, 15.0, "Every number is a chip you can open.", "Every number is a chip you can open."],
    ["3.1", 17.0, 20.4, "Tap a number, and see the rows behind it.", "Tap a number, and see the rows behind it."],
    ["3.2", 20.8, 22.7, "And Munim found a leak.", "And Moo-neem found a leak."],
    ["3.3", 23.2, 27.1, "Butter waste: nearly five thousand rupees, against fifteen hundred.", "Butter waste. Nearly five thousand rupees, against fifteen hundred."],
    ["4.1", 30.6, 34.4, "Nemotron Lightning routes. Super reasons with scoped records.", "Nee-mo-tron Lightning routes. Super reasons with scoped records."],
    ["4.2", 34.6, 38.6, "Super VL reads invoices. Token Factory serves each role.", "Super V L reads invoices. Token Factory serves each role."],
    ["4.3", 38.6, 40.4, "Code checks every number.", "Code checks every number."],
    ["5.1", 42.8, 46.0, "The hazelnut supplier's invoice arrives as a photo.", "The hazelnut supplier's invoice arrives as a photo."],
    ["5.2", 46.6, 48.5, "A vision model reads it.", "A vision model reads it."],
    ["5.3", 49.6, 53.4, "Every figure points back to a spot on the page.", "Every figure points back to a spot on the page."],
    ["6.1", 56.6, 58.1, "Is the price fair?", "Is the price fair?"],
    ["6.2", 58.6, 62.0, "Munim checks it against what she paid last time,", "Moo-neem checks it against what she paid last time,"],
    ["6.3", 62.0, 63.9, "and against the market today.", "and against the market today."],
    ["7.1", 70.6, 72.9, "Now Munim asks three suppliers.", "Now Moo-neem asks three suppliers."],
    ["7.2", 73.4, 75.6, "They are simulated, and labelled.", "They are simulated, and labelled."],
    ["7.3", 76.4, 78.3, "The model writes the notes.", "The model writes the notes."],
    ["7.4", 78.6, 81.2, "Code sets every price it may offer.", "Code sets every price it may offer."],
    ["7.5", 82.0, 86.5, "Round by round, one supplier comes down below the last price paid.", "Round by round, one supplier comes down, below the last price paid."],
    ["7.6", 88.0, 92.1, "The cheapest bid needs a bigger order than Cobnut can use.", "The cheapest bid needs a bigger order than Cobnut can use."],
    ["7.7", 92.2, 94.1, "So it fails the rules.", "So it fails the rules."],
    ["8.1", 100.6, 102.7, "Munim prepares a purchase-order draft.", "Moo-neem prepares a purchase order draft."],
    ["8.2", 103.4, 107.2, "Its saving against the last price paid has a source.", "Its saving, against the last price paid, has a source."],
    ["8.3", 108.0, 109.9, "The proposal waits for a person.", "The proposal waits for a person."],
    ["8.4", 110.2, 112.1, "It cannot spend a rupee.", "It cannot spend a rupee."],
    ["9.1", 116.6, 118.2, "The owner can inspect its evidence.", "The owner can inspect its evidence."],
    ["9.2", 118.8, 120.1, "Only a person can approve.", "Only a person can approve."],
    ["9.3", 121.0, 124.4, "Core checks authority and the current records.", "Core checks authority and the current records."],
    ["9.4", 125.6, 127.8, "Nothing changes without a person.", "Nothing changes without a person."],
    ["10.1", 134.6, 138.7, "When the books cannot back a number, Munim does not guess.", "When the books cannot back a number, Moo-neem does not guess."],
    ["10.2", 138.8, 140.5, "It says: cannot verify.", "It says, cannot verify."],
    ["10.3", 142.6, 147.8, "And a figure read off a photo waits for a person to check it.", "And a figure read off a photo waits for a person to check it."],
    ["11.1", 150.6, 152.5, "What does not work yet.", "What does not work yet."],
    ["11.2", 153.0, 155.4, "Ask sometimes says cannot verify.", "Ask sometimes says, cannot verify."],
    ["11.3", 156.2, 159.6, "A hard question can run past its time budget.", "A hard question can run past its time budget."],
    ["11.4", 160.0, 162.0, "The suppliers are simulated.", "The suppliers are simulated."],
    ["11.5", 162.6, 164.6, "The money is only recorded.", "The money is only recorded."],
    ["12.1", 168.8, 171.8, "Munim. The back office that keeps honest books.", "Moo-neem. The back office that keeps honest books."],
    ["12.2", 172.2, 174.1, "Code and demo, linked below.", "Code and demo, linked below."],
  ];

  // Events (absolute seconds) in ev; durations in d. Set against the recorded voice (bf_emma).
  const ev = (key, events, d = {}) => Object.assign(scenes[key], { ev: events, d: { wipe: 0.7, ...d } });
  ev("nbMorning", {
    laptopIn: 0.0, camPush: 0.7, toAsk: 4.6, camAsk: 4.8, type: 5.3, clickAsk: 8.2, toThread: 8.6, chip: [8.8, 11.0],
    camAnswer: 8.8, hlOnHand: 12.4, hlMin: 13.0, circleChip: 13.6, clickChip: 15.6, toDrawer: 15.8, camDrawer: 16.0, hlFig: 17.6,
    toInbox: 20.2, circleWaste: 24.5, circleUsual: 26.0, sticker: [27.3, 29.4], wipeOut: 29.3,
  }, { cps: 20 });
  ev("nbModels", { title: 30.5, kick: 31.0, ph: 32.2, c1: 34.4, c2: 35.8, c3: 36.9, sticker: [38.6, 41.2], wipeOut: 41.3 });
  ev("nbInvoice", {
    photoIn: 42.3, labels: [43.2, 48.6], scan: 46.6, toSplit: 48.8, hlPhoto: 49.9, hlScreen: 50.8, circleReads: 51.7,
    note: [53.0, 55.4], toPrice: 55.8, rowA: 56.4, hlA: 57.0, rowB: 58.8, hlB: 60.4, rowC: 62.0, hlC: 63.0, ph: 64.6, wipeOut: 69.3,
  }, { scanDur: 1.6 });
  ev("nbQuotes", {
    camLow: 70.2, clickRequest: 71.3, clickSend: 72.4, toQuotes: 73.0, chip: [73.2, 75.6], sim: [73.6, 77.6], r1: 74.0, model: [76.4, 78.4],
    rule: [78.6, 86.6], r2: 82.2, r3: 83.6, hlSteady: 84.6, last: [85.2, 91.4], circlePrice: 88.4, circleMin: 89.6, hlQty: 90.6,
    fail: 92.4, toProposed: 94.6, wipeOut: 99.3,
  });
  ev("nbOrder", {
    camTitle: 100.3, camSaving: 103.2, hlSaving: 103.9, circleChip: 105.0, camDraft: 107.4, circleStatus: 108.1, draftSt: [108.2, 112.6],
    hlRecorded: 110.4, paid: [110.8, 115.2], toDraft: 115.6, read: 116.6, clickApprove: 119.4, approved: [119.8, 132.0], ph: 120.6,
    audit: 121.4, guarantee: [125.4, 132.6], wipeOut: 133.3,
  });
  ev("nbVerify", { camAnswer: 134.3, circleCv: 138.8, toInvoice: 141.6, circleReads: 143.4, hlWithhold: 144.8, wipeOut: 149.3 });
  ev("nbLimits", { k: 150.5, l1: 153.0, l2: 156.2, l3: 160.0, ph: 163.4, wipeOut: 167.3 }, { cps: 38 });
  ev("nbEnd", { endcard: 168.5, disclosure: 170.2 });

  // Sound effects from the same events: [time, file in assets/audio/sfx, dB under the music bed (8–12)]. A cue within
  // 0.15 s of the one before is dropped (tests/timing.test.mjs checks the spacing).
  const raw = [];
  const cue = (at, name, under) => raw.push([+at.toFixed(3), name, under]);
  for (const k of sourceOrder.map(([key]) => key)) {
    const e = scenes[k].ev;
    if (e.wipeOut !== undefined) cue(e.wipeOut, "page-turn", 9);
    for (const [name, v] of Object.entries(e)) {
      if (/^(sticker|sim|rule|draftSt|paid|approved|guarantee|labels)$/.test(name)) cue(v[0], "slam", 9);
      else if (/^(ph|fail)$/.test(name)) cue(v, "slam", 8);
      else if (/^(chip|note|last|model)$/.test(name)) cue(v[0], "pop", 11);
      else if (/^(click|row[ABC]$|c[123]$)/.test(name)) cue(v, "click", 9);
      else if (/^(circle|hl)/.test(name)) cue(v, "pen", 10);
      else if (/^(to[A-Z]|photoIn)/.test(name)) cue(v, "swish", 11);
    }
    if (k === "nbEnd") cue(e.endcard, "slam", 8);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const sfx = [];
  for (const c of raw) if (!sfx.length || c[0] - sfx[sfx.length - 1][0] >= 0.15) sfx.push(c);

  // Rebuild the cut around its two requested proof sequences: the AI back office and the supply graph.
  // Source captures remain the same; event times are mapped into the new scene windows.
  const plan = [
    ["nbMorning", 26], ["office", 27], ["nbModels", 12], ["nbQuotes", 25],
    ["nbOrder", 24], ["graph", 35], ["nbVerify", 13], ["nbEnd", 7],
  ];
  const oldWindows = {
    nbMorning: [0, 30], nbModels: [30, 42], nbInvoice: [42, 70], nbQuotes: [70, 100],
    nbOrder: [100, 134], nbVerify: [134, 150], nbLimits: [150, 168], nbEnd: [168, 178],
  };
  const newScenes = {};
  const newStarts = {};
  let cursor = 0;
  for (const [key, dur] of plan) {
    newStarts[key] = cursor;
    const original = scenes[key];
    if (original) {
      const [oldStart, oldEnd] = oldWindows[key];
      const ratio = dur / (oldEnd - oldStart);
      const remap = (value) => cursor + (value - oldStart) * ratio;
      const remapDeep = (value) => Array.isArray(value) ? value.map(remapDeep) : typeof value === "number" ? remap(value) : value;
      const ev = Object.fromEntries(Object.entries(original.ev).map(([name, value]) => [name, remapDeep(value)]));
      const d = { ...original.d };
      if (d.wipe) d.wipe *= ratio;
      if (d.scanDur) d.scanDur *= ratio;
      newScenes[key] = { start: cursor, dur, end: cursor + dur, ev, d };
    } else {
      newScenes[key] = { start: cursor, dur, end: cursor + dur, ev: {}, d: {} };
    }
    cursor += dur;
  }

  // Existing AI office interaction: the watcher sweep, then an Ask answer and an honest abstention.
  const office = newScenes.office;
  const officeBase = newStarts.office;
  office.ev = {
    wipeIn: officeBase, watch: officeBase + 1.4, toAsk: officeBase + 10.4,
    typeQ1: officeBase + 11.2, ask1: officeBase + 12.6, think1: officeBase + 12.8,
    answer1: officeBase + 15.2, typeQ3: officeBase + 18.6, ask3: officeBase + 19.8,
    think3: officeBase + 20.0, answer3: officeBase + 22.0, encircleCV: officeBase + 22.5,
    wipeOut: officeBase + 26.3,
  };
  office.steps = [
    [officeBase + 2.0, "manager", "Routing to Stock & Purchasing", "work"],
    [officeBase + 2.9, "inventory_purchasing", "Checking waste this week", "work"],
    [officeBase + 3.8, "inventory_purchasing", "Got the rows", "work"],
    [officeBase + 4.7, "inventory_purchasing", "Found something", "found"],
    [officeBase + 6.8, "inventory_purchasing", "Checking stock below its minimum", "work"],
    [officeBase + 7.8, "inventory_purchasing", "Found something", "found"],
    [officeBase + 8.8, "kitchen", "Checking kitchen ticket times", "work"],
    [officeBase + 9.6, "owner", "Needs your approval", "draft"],
  ];

  // Reuse the FalkorDB cut's real graph-draw sequence, but relabel the storyline for this product cut.
  const graph = newScenes.graph;
  const graphBase = newStarts.graph;
  const graphShift = (value) => graphBase + (value - 135);
  graph.ev = Object.fromEntries(Object.entries({
    wipeIn: 135.0, nodes: [135.7, 136.3, 136.9, 137.9], edges: [136.6, 137.5, 138.5], other: 141.2,
    sticker1: [141.4, 144.6], trace: 145.5, tag: 145.1, countChip: 147.6, toMap: 150.3,
    solePill: 152.3, camCard: 153.6, open: 156.5, margin: 158.3, toAsk: 160.9, typeQ: 161.2,
    ask: 162.6, think: 162.8, answer: 164.2, sticker2: [166.0, 169.0], wipeOut: 169.3,
  }).map(([name, value]) => [name, Array.isArray(value) ? value.map(graphShift) : graphShift(value)]));
  graph.d = { nodeStep: 0.06, edgeStep: 0.025, cps: 95, wipe: 0.7 };

  newScenes.nbOrder.ev.waiting = [newStarts.nbOrder + 12.2, newStarts.nbOrder + 23.0];

  const keepLine = (line) => {
    const t = line[1];
    return (t < 30) || (t >= 30 && t < 42) || (t >= 70 && t < 100) || (t >= 100 && t < 134) || (t >= 134 && t < 150) || (t >= 168);
  };
  const mapSourceTime = (value) => {
    const sourceKey = value < 30 ? "nbMorning" : value < 42 ? "nbModels" : value < 100 ? "nbQuotes" : value < 134 ? "nbOrder" : value < 150 ? "nbVerify" : "nbEnd";
    const [oldStart, oldEnd] = oldWindows[sourceKey];
    const targetKey = sourceKey;
    const targetStart = newStarts[targetKey];
    const targetDuration = newScenes[targetKey].dur;
    return targetStart + ((value - oldStart) / (oldEnd - oldStart)) * targetDuration;
  };
  const newVo = vo.filter(keepLine).map(([id, a, b, caption, tts]) => [id, mapSourceTime(a), mapSourceTime(b), caption, tts]);
  const lineStart = (id, at) => { const row = newVo.find((line) => line[0] === id); if (row) row[1] = at; };
  lineStart("1.2", newStarts.nbMorning + 2.5);
  lineStart("4.3", newStarts.nbModels + 8.8);
  lineStart("8.2", newStarts.nbOrder + 2.85);
  lineStart("8.3", newStarts.nbOrder + 5.8);
  lineStart("8.4", newStarts.nbOrder + 7.8);
  lineStart("9.2", newStarts.nbOrder + 13.85);
  lineStart("9.3", newStarts.nbOrder + 15.7);
  lineStart("9.4", newStarts.nbOrder + 18.4);
  lineStart("12.2", newStarts.nbEnd + 3.4);
  newVo.push(
    ["6.1", officeBase + 1.4, officeBase + 7.0, "The Manager routes to Stock & Purchasing. Its tools read scoped rows.", "The Manager routes to Stock and Purchasing. Its tools read scoped rows."],
    ["6.2", officeBase + 7.1, officeBase + 11.7, "Rules detect the waste. Nemotron explains cited evidence.", "Rules detect the waste. Nee-mo-tron explains cited evidence."],
    ["6.3", officeBase + 12.0, officeBase + 15.2, "Ask opens source chips.", "Ask opens source chips."],
    ["6.4", officeBase + 16.0, officeBase + 26.0, "When the books lack evidence, Munim says cannot verify.", "When the books lack evidence, Moo-neem says cannot verify."],
    ["7b.1", graphBase + 0.6, graphBase + 6.3, "The graph builds from suppliers to ingredients, dishes and outlets.", "The graph builds from suppliers to ingredients, dishes and outlets."],
    ["7b.2", graphBase + 6.6, graphBase + 10.1, "Each relationship comes from this business's books.", "Each relationship comes from this business's books."],
    ["7b.3", graphBase + 10.4, graphBase + 15.8, "Trace a butter price change through seven dishes and both outlets.", "Trace a butter price change through seven dishes and both outlets."],
    ["7b.4", graphBase + 16.0, graphBase + 24.0, "The supplier map reveals a single source. Open its impact and inspect each dish margin.", "The supplier map reveals a single source. Open its impact and inspect each dish margin."],
    ["7b.5", graphBase + 24.2, graphBase + 29.5, "Then Ask answers from the connected graph, with source chips.", "Then Ask answers from the connected graph, with source chips."],
  );
  newVo.sort((a, b) => a[1] - b[1]);
  const voiceSeconds = {
    "1.1": 1.96, "1.2": 2.01, "2.1": 1.28, "2.2": 1.51, "2.3": 2.01, "3.1": 2.33, "3.2": 1.51, "3.3": 3.69,
    "4.1": 3.90, "4.2": 4.01, "4.3": 1.58, "6.1": 4.29, "6.2": 3.99, "6.3": 1.75, "6.4": 3.07,
    "7.1": 2.11, "7.2": 1.96, "7.3": 1.58, "7.4": 2.11, "7.5": 3.97, "7.6": 3.20, "7.7": 1.39,
    "7b.1": 3.58, "7b.2": 2.69, "7b.3": 3.52, "7b.4": 5.40, "7b.5": 3.29,
    "8.1": 2.30, "8.2": 2.84, "8.3": 1.86, "8.4": 1.58, "9.1": 1.98, "9.2": 1.71, "9.3": 2.58, "9.4": 2.01,
    "10.1": 2.90, "10.2": 1.66, "10.3": 3.03, "12.1": 2.65, "12.2": 1.73,
  };
  newVo.forEach((line, index) => {
    const duration = voiceSeconds[line[0]];
    if (duration === undefined) return;
    const nextStart = newVo[index + 1]?.[1] ?? cursor;
    line[2] = Math.min(line[1] + duration, nextStart - 0.08);
  });

  const mappedSfx = sfx.flatMap(([time, ...rest]) => {
    if (time < 30 || (time >= 30 && time < 42) || (time >= 70 && time < 100) || (time >= 100 && time < 134) || (time >= 134 && time < 150) || time >= 168) {
      return [[mapSourceTime(time), ...rest]];
    }
    return [];
  });
  mappedSfx.push([officeBase, "page-turn", 9], [graphBase, "page-turn", 9], [graphBase + 10.5, "pen", 10], [graphBase + 29.3, "page-turn", 9]);
  mappedSfx.sort((a, b) => a[0] - b[0]);

  globalThis.TIMING = globalThis.TIMING || {};
  globalThis.TIMING.nebius = {
    cut: "nebius",
    /** Lines a sticker carries word for word: they skip the caption band. */
    capSkip: ["4.3"],
    voice: "bf_emma",
    sfx: mappedSfx,
    duration: cursor,
    order: plan.map(([key]) => key),
    scenes: newScenes,
    vo: newVo,
    files: { nbMorning: "n1-morning", nbModels: "n2-models", nbQuotes: "n4-quotes", nbOrder: "n5-order", nbVerify: "n6-verify", nbEnd: "n8-end" },
    /** Over every scene: the "Synthetic data" corner chip (hard rule 5), on its own track under the captions. */
    overlays: [{ id: "labels", file: "n0-labels", track: 3 }],
    /** The music's section under each scene (audio/compose-music.mjs). */
    sections: { nbMorning: "A", office: "B", nbModels: "warm", nbQuotes: "B", nbOrder: "B", graph: "A", nbVerify: "warm", nbEnd: "outro" },
    local: (key, abs) => +(abs - newScenes[key].start).toFixed(4),
  };
})();
