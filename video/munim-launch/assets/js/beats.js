// Beats shared by the Cup cut's "also in Munim" montage (scene 9) and the full tour's scene 9b: the storefront page
// builder (a colour preset, a section dragged up, the preview following; in the full tour, saved and published), a
// campaign approved by name, and the Australian outlet on its own pack. Each takes the scene context, the measured
// rects and absolute times. Written for this film.
(function () {
  const BEATS = {};
  /** The builder. t: {preset, scroll?, drag?, save?, publish?}; ids by prefix `p`. `scroll` moves the page under the
   *  sticky staff bar so the sections, the save button and the versions are on screen. */
  BEATS.builder = (ctx, p, M, t, fx) => {
    const { tl, $, L } = ctx;
    const dy = t.scroll !== undefined ? M.shift * M.k : 0;
    if (t.scroll !== undefined) MK.move(tl, M.main, { y: -M.shift }, L(t.scroll), 0.7, "power2.inOut", { y: 0 });
    MK.tap(tl, fx, { x: M.preset.cx, y: M.preset.cy }, L(t.preset));
    const [, a, b, c] = UI.PRESETS[1];
    const pv = $(`${p}pv`);
    MK.drive(tl, (tt) => {
      const on = tt >= L(t.preset);
      $(`${p}radio-0`).classList.toggle("on", !on);
      $(`${p}radio-1`).classList.toggle("on", on);
      pv.style.setProperty("--pv-primary", on ? a : "#7b3f1d");
      pv.style.setProperty("--pv-secondary", on ? b : "#9e2f4e");
      pv.style.setProperty("--pv-accent", on ? c : "#f6d9c8");
    });
    if (t.drag === undefined) return;
    // "Cards" is dragged from last to second: the list item travels up, the others make room; the preview follows.
    const card = $(`${p}sec-cards`);
    const step = M.secStep;
    tl.fromTo(card, { y: 0, scale: 1, boxShadow: "0 0 0 rgba(0,0,0,0)" }, { y: -step * 0.15, scale: 1.03, boxShadow: "0 16px 28px -14px rgba(42,26,18,0.55)", duration: 0.18, ease: "power2.out", immediateRender: false }, L(t.drag));
    tl.fromTo(card, { y: -step * 0.15 }, { y: -step * 2, duration: 0.7, ease: "power2.inOut", immediateRender: false }, L(t.drag) + 0.18);
    tl.fromTo(card, { scale: 1.03 }, { scale: 1, boxShadow: "0 0 0 rgba(0,0,0,0)", duration: 0.2, immediateRender: false }, L(t.drag) + 0.88);
    for (const k of ["outlets", "ribbon"]) tl.fromTo($(`${p}sec-${k}`), { y: 0 }, { y: step, duration: 0.5, ease: "power2.inOut", immediateRender: false }, L(t.drag) + 0.3);
    tl.fromTo($(`${p}pv-cards`), { y: 0 }, { y: -M.pvOutletsH - M.pvRibbonH, duration: 0.6, ease: "power2.inOut", immediateRender: false }, L(t.drag) + 0.8);
    tl.fromTo([$(`${p}pv-outlets`), $(`${p}pv-ribbon`)], { y: 0 }, { y: M.pvCardsH, duration: 0.6, ease: "power2.inOut", immediateRender: false }, L(t.drag) + 0.8);
    if (t.save !== undefined) {
      MK.tap(tl, fx, { x: M.save.cx, y: M.save.cy - dy }, L(t.save));
      MK.press(tl, $(`${p}save`), L(t.save));
      MK.states(tl, $(`${p}editing`), [[0, "Editing from version 2."], [L(t.save) + 0.2, "Saved as version 3. The live storefront has not changed."]]);
    }
    if (t.publish !== undefined) {
      SC.reveal(tl, $(`${p}versions`), L(t.save) + 0.3);
      MK.tap(tl, fx, { x: M.publish.cx, y: M.publish.cy - dy }, L(t.publish));
      MK.drive(tl, (tt) => {
        const live = tt >= L(t.publish) + 0.2;
        $(`${p}live3`).style.display = live ? "" : "none";
        $(`${p}publish`).style.display = live ? "none" : "";
        $(`${p}live2`).style.display = live ? "none" : "";
      });
    }
  };
  /** The campaign proposal approved by the owner. t: {approve}. */
  BEATS.campaigns = (ctx, p, M, t, fx) => {
    const { tl, $, L, F } = ctx;
    MK.tap(tl, fx, { x: M.approve.cx, y: M.approve.cy }, L(t.approve));
    MK.drive(tl, (tt) => {
      const done = tt >= L(t.approve) + 0.2;
      $(`${p}decide`).style.display = done ? "none" : "";
      $(`${p}approved`).style.display = done ? "" : "none";
    });
    const proposed = `Proposed by Customers · 16 Oct, ${F.earlier.proposed}`;
    MK.states(tl, $(`${p}lineage`), [[0, proposed], [L(t.approve) + 0.2, `${proposed} · Approved by ${F.people.owner.name} · 16 Oct, ${F.earlier.approved}`]]);
  };
  /** What the builder beat needs: rects in the camera rig's pixels, section steps and heights in the screen's own CSS px. */
  BEATS.measureBuilder = (ctx, p, cam) => {
    const { $ } = ctx;
    const r = (id) => MK.rect($(id), cam);
    const main = $(`${p}secs`).closest("main");
    const page = main.parentElement;
    Object.assign(page.querySelector(".staff-bar").style, { position: "relative", zIndex: "3" });
    const k = page.getBoundingClientRect().height / page.offsetHeight;
    const last = $(`${p}versions`) || $(`${p}save`);
    const shift = Math.max(0, Math.round((last.getBoundingClientRect().bottom - page.getBoundingClientRect().top) / k - page.offsetHeight + 24));
    return {
      main, k, shift,
      preset: r(`${p}preset-1`), save: r(`${p}save`), publish: $(`${p}publish`) ? r(`${p}publish`) : null,
      secStep: $(`${p}sec-outlets`).offsetTop - $(`${p}sec-hero`).offsetTop,
      pvOutletsH: $(`${p}pv-outlets`).offsetHeight, pvRibbonH: $(`${p}pv-ribbon`).offsetHeight, pvCardsH: $(`${p}pv-cards`).offsetHeight,
    };
  };
  /** What the campaign beat needs. */
  BEATS.measureCampaign = (ctx, p, cam) => ({ approve: MK.rect(ctx.$(`${p}approve`), cam) });
  /** The film chips that mark scene 9 and 9b as earlier captures: [[enter, exit, text], …] in absolute seconds. */
  BEATS.chips = (ctx, host, chips) => {
    const { tl, L } = ctx;
    host.innerHTML = chips.map((_, i) => `<div class="time-chip beat-chip" id="${host.id}-${i}"></div>`).join("");
    chips.forEach(([enter, exit, text], i) => {
      const el = ctx.$(`${host.id}-${i}`);
      el.textContent = text;
      MK.sticker(tl, el, L(enter), L(exit), { rot: 3 });
    });
  };
  window.BEATS = BEATS;
})();
