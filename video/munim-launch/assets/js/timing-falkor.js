// The FalkorDB cut's clock (R74 V-2): the 2:55 Cup story with a 35 s scene after the negotiation, the supply graph
// (scenes/07b-graph.html), and its own end card (fixture endCard.falkor). The caption text must match script/falkor.md
// word for word (tests/timing.test.mjs). Needs timing-cup.js and clock-edit.js loaded first.
(function () {
  const C = CLOCK.from(globalThis.TIMING.cup, "falkor");
  const line = (id, a, b, caption, tts) => C.vo.push([id, a, b, caption, tts ?? caption]);
  CLOCK.scene(C, "graph", "negotiation", 35);
  const S = C.scenes.graph; // 135–170
  Object.assign(S.ev, {
    wipeIn: 135.0, nodes: [135.7, 136.3, 136.9, 137.9], edges: [136.6, 137.5, 138.5], other: 141.2, sticker1: [141.4, 144.6],
    trace: 145.5, tag: 145.1, countChip: 147.6, toMap: 150.3, solePill: 152.3, camCard: 153.6, open: 156.5, margin: 158.3,
    toAsk: 160.9, typeQ: 161.2, ask: 162.6, think: 162.8, answer: 164.2, sticker2: [166.0, 169.0], wipeOut: 169.3,
  });
  Object.assign(S.d, { nodeStep: 0.06, edgeStep: 0.025, cps: 95 });
  line("7b.1", 135.6, 140.6, "Munim rebuilds a graph from the books: suppliers, ingredients, dishes and outlets.", "Moo-neem rebuilds a graph from the books. Suppliers, ingredients, dishes, and outlets.");
  line("7b.2", 141.0, 144.4, "One graph per business, each from its own books.", "One graph per business, each from its own books.");
  line("7b.3", 145.0, 150.0, "If butter costs more, the graph traces it: seven dishes, at both outlets.", "If butter costs more, the graph traces it. Seven dishes, at both outlets.");
  line("7b.4", 150.6, 156.0, "The supplier map shows who the menu depends on. Butter has only one supplier.");
  line("7b.5", 156.6, 160.6, "Open it, and every dish shows its margin, from the books.");
  line("7b.6", 161.4, 167.4, "Ask what a price rise touches, and the answer comes from the graph, with its sources.", "Ask what a price rise touches, and the answer comes from the graph, with its sources.");
  globalThis.TIMING = globalThis.TIMING || {};
  globalThis.TIMING.falkor = CLOCK.done(C);
})();
