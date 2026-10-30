// The 4:00 Cup cut's clock (R74 V-1, founder's call): the 2:55 Cup clock with more of the product shown. Time opens for
// the all-outlets view, the walk-in's GST tax invoice, the office's desks, a dismissed finding and an investigation, the
// negotiation's "never a number" line, and the full tour's scene 9b in place of the montage. Each new line is the full
// tour's own words (script/full.md), so its recording is reused. Edits run from the latest point back, so every time
// below is in the 2:55 clock's own seconds plus the offset inside the gap just opened. The caption text must match
// script/cup4.md word for word (tests/timing.test.mjs). Needs timing-cup.js and clock-edit.js loaded first.
(function () {
  const C = CLOCK.from(globalThis.TIMING.cup, "cup4");
  const line = (id, a, b, caption, tts) => C.vo.push([id, a, b, caption, tts ?? caption]);
  const set = (key, events, d) => Object.assign(C.scenes[key].ev, events) && d && Object.assign(C.scenes[key].d, d);

  // 9 · The developer portal alone (7 s), then scene 9b at length instead of the montage.
  C.vo = C.vo.filter(([id]) => id !== "9.2");
  C.scenes.dev.ev = { wipeIn: 152.0, download: 152.7, typeCode: 153.0, wipeOut: 164.3 };
  CLOCK.gap(C, 158.9, -6);
  CLOCK.scene(C, "also", "dev", 26);
  set("also", {
    wipeIn: 159.0, preset: 160.4, scroll: 161.0, drag: 162.0, save: 164.2, publish: 166.6, sticker1: [165.4, 169.2], toCampaigns: 169.4,
    reachMark: 172.6, approve: 175.4, sticker2: [175.8, 178.4], toAu: 178.6, packRows: 179.6, sticker3: [181.4, 184.0], wipeOut: 184.3,
  });
  line("9b.1", 159.6, 164.8, "A page builder for the storefront: pick the colours, drag the sections, and preview it.", "A page builder for the storefront. Pick the colours, drag the sections, and preview it.");
  line("9b.2", 165.1, 169.0, "Nothing goes live until someone with the right role publishes it.");
  line("9b.3", 169.6, 174.4, "Campaigns: when regulars stop coming, Munim drafts a message to bring them back.", "Campaigns. When regulars stop coming, Moo-neem drafts a message to bring them back.");
  line("9b.4", 174.5, 178.0, "It's sent only after a person approves it, by name.");
  line("9b.5", 179.0, 182.9, "And in Melbourne, Laneway Cafe runs on the Australian country pack.");

  // 7 · The negotiation: its messages never carry a number.
  CLOCK.gap(C, 117.0, 5.6);
  set("negotiation", { codeMark: 118.4 });
  line("7.2b", 117.1, 122.2, "Its messages never carry a number; the prices come from the suppliers' own quotes.", "Its messages never carry a number. The prices come from the suppliers' own quotes.");

  // 6 · The office: an investigation, a dismissed finding, the desks named in turn.
  CLOCK.gap(C, 104.0, 7.0);
  set("office", { toInv: 104.2, sticker: [107.8, 110.8] }, { invStep: 0.5 });
  line("6.4b", 104.4, 109.4, "Bigger questions get an investigation: it checks each cause, and only reads the books.", "Bigger questions get an investigation. It checks each cause, and only reads the books.");
  CLOCK.gap(C, 88.3, 6.0);
  set("office", { toInbox: 88.5, tapDismiss: 90.1, why: 91.1, confirm: 92.5 });
  line("6.2b", 88.6, 93.7, "A finding Nandini doesn't need, she dismisses with a reason. Munim remembers.", "A finding Nun-dee-nee doesn't need, she dismisses, with a reason. Moo-neem remembers.");
  CLOCK.gap(C, 79.3, 10.8);
  set("office", { deskTour: 84.2 }, { deskStep: 0.62 });
  line("6.1b", 84.4, 91.2, "Each one reads the books in its own area: menu, kitchen, stock, finance, people, customers, compliance, the market.", "Each one reads the books in its own area. Menu, kitchen, stock, finance, people, customers, compliance, the market.");

  // 5 · The till: sizes as he goes, the GST tax invoice, then the payment recorded.
  CLOCK.gap(C, 70.6, 8.6);
  set("kitchen", { receipt: 72.8, receiptMark: 74.8 });
  C.vo = C.vo.filter(([id]) => id !== "5.3");
  line("5.3a", 67.0, 71.9, "At the till, Imran rings up a walk-in, choosing sizes as he goes.", "At the till, Im-raan rings up a walk-in, choosing sizes as he goes.");
  line("5.3b", 72.3, 77.9, "The morning deal comes off by itself, and the bill is a proper GST tax invoice.", "The morning deal comes off by itself, and the bill is a proper G S T tax invoice.");
  line("5.3c", 78.2, 83.1, "He records a card payment. Munim keeps the record; it never moves the money.", "He records a card payment. Moo-neem keeps the record. It never moves the money.");

  // 3 · The brief: one tap shows both outlets.
  CLOCK.gap(C, 23.4, 5.6);
  set("brief", { toAll: 24.0, backOutlet: 28.4 });
  line("3.1b", 24.0, 28.8, "One tap shows both outlets side by side, each from its own books.");

  // The office opens on the page while 6.1 is read: a slow camera push-in (no still frame), from just after the wipe.
  C.scenes.office.ev.creep = +(C.scenes.office.ev.wipeIn + 0.8).toFixed(3);

  globalThis.TIMING = globalThis.TIMING || {};
  globalThis.TIMING.cup4 = CLOCK.done(C);
})();
