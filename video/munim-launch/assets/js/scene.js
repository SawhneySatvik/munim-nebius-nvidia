// Scene plumbing shared by every scene file (window.SC): device frames with layered screens, the ledger-page wipes at
// each end, screen swaps, and the scene's start-up (fonts, measuring, the driver, registration). Written for this film.
(function () {
  const SC = {};
  /** A device: kind "laptop" | "tablet" | "phone". `layers` are [id, html, extraClass] drawn stacked in the screen; the
   *  first shows, the rest wait at opacity 0 for SC.swap. */
  SC.device = (kind, id, layers, { cls = "cb" } = {}) => {
    const screens = layers.map(([lid, html, extra], i) => `<div class="layer${i === 0 ? " first" : ""}${extra ? ` ${extra}` : ""}" id="${lid}">${html}</div>`).join("");
    return `<div class="dev dev-${kind}" id="${id}"><div class="dev-scale"><div class="dev-body"><div class="dev-screen ${cls}" id="${id}-screen" data-layout-ignore>${screens}</div></div>${kind === "laptop" ? '<div class="dev-base"></div>' : ""}</div></div>`;
  };
  /** The two ledger pages and their edges: the scene opens on one and closes on the other. */
  SC.pages = (p) => `<div class="mk-page" id="${p}page-in"></div><div class="mk-page-edge" id="${p}edge-in"></div><div class="mk-page" id="${p}page-out"></div><div class="mk-page-edge" id="${p}edge-out"></div>`;
  /** Wipe in at the scene's start and out at its end (either can be skipped: the cold open opens on paper already, the
   *  close ends on the end card). */
  SC.wipes = (tl, $, p, S, { inAt = S.start, outAt = S.end - 0.7, skipIn = false, skipOut = false } = {}) => {
    const L = (abs) => +(abs - S.start).toFixed(4);
    if (!skipIn) MK.wipe(tl, $(`${p}page-in`), L(inAt), { mode: "in", dur: 0.7, edge: $(`${p}edge-in`) });
    if (!skipOut) MK.wipe(tl, $(`${p}page-out`), L(outAt), { mode: "out", dur: 0.7, edge: $(`${p}edge-out`) });
  };
  /** Swap one layer for another: the old slides a little left and fades, the new comes in from the right. */
  SC.swap = (tl, from, to, at, { dur = 0.4, dx = 60 } = {}) => {
    if (from) tl.fromTo(from, { opacity: 1, x: 0 }, { opacity: 0, x: -dx, duration: dur, ease: "power2.in", immediateRender: false }, at);
    tl.fromTo(to, { opacity: 0, x: dx }, { opacity: 1, x: 0, duration: dur, ease: "power3.out", immediateRender: false }, at + (from ? dur * 0.6 : 0));
  };
  /** A screen element appearing in place (a card, a panel): fades and rises. */
  SC.reveal = (tl, el, at, { dur = 0.35, dy = 18 } = {}) => {
    tl.fromTo(el, { opacity: 0, y: dy }, { opacity: 1, y: 0, duration: dur, ease: "power3.out", immediateRender: true }, at);
  };
  /** Hides an element from the start until `at`, then shows it (for text that appears in a screen). */
  SC.appear = (tl, el, at, dur = 0.25) => {
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: dur, ease: "power1.out", immediateRender: true }, at);
  };
  /** Starts a scene: waits for fonts, gives the build a context, then runs the driver and registers the timeline. */
  SC.scene = (key, compId, build) => {
    MK.ready(() => {
      const root = document.querySelector(`[data-composition-id="${compId}"]`);
      const S = T.scenes[key];
      const ctx = {
        root, S, E: S.ev, D: S.d || {}, F: FIX, tl: gsap.timeline({ paused: true }),
        $: (id) => document.getElementById(id),
        L: (abs) => +(abs - S.start).toFixed(4),
        has: (name) => S.ev[name] !== undefined,
      };
      build(ctx);
      MK.finish(ctx.tl, S.dur);
      window.__timelines[compId] = ctx.tl;
    });
  };
  window.SC = SC;
})();
