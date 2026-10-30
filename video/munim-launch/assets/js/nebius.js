// The Nebius cut's screen kit (window.NB): real screens from assets/screens/nebius (shots.js, written by
// tools/capture-nebius.mjs) laid into SC.device layers, each in-app model tag covered with its NVIDIA-endpoint capture attribution, and
// invisible boxes at the captured marks so MK.rect / encircle / highlight / camera work as in the other scenes.
// Written for this film.
(function () {
  const NB = { dir: "assets/screens/nebius/" };
  const shots = () => globalThis.NB_SHOTS.shots;

  /** A shot's record ({file, w, h, marks}); throws on a name the capture did not take. */
  NB.shot = (name) => {
    const s = shots()[name];
    if (!s) throw new Error(`NB: no shot "${name}" (run tools/capture-nebius.mjs)`);
    return s;
  };
  /** A mark of a shot ({x, y, w, h} in the screen's CSS px); `i` picks from a list (rows, models). */
  NB.mark = (name, key, i) => {
    let m = NB.shot(name).marks[key];
    if (i !== undefined && m) m = m[i];
    if (!m) throw new Error(`NB: shot "${name}" has no mark "${key}${i === undefined ? "" : `[${i}]`}"`);
    return m;
  };
  /** The source label over a model tag, identifying the endpoint used for the captured screen. `clipX`: a drawer's left edge (a
   *  tag under the drawer's dimmed backdrop is covered only up to it). */
  const PH = "NVIDIA endpoint · captured run";
  NB.covers = (name, { clipX = Infinity } = {}) => {
    const s = NB.shot(name);
    return (s.marks.models || [])
      .filter((m) => m.y + m.h > 0 && m.y < s.h && m.x < clipX)
      .map((m) => `<span class="nb-ph-pill" style="left:${m.x - 2}px;top:${m.y - 1}px;width:${Math.min(m.w + 4, clipX - m.x + 2)}px;height:${m.h + 2}px">${PH}</span>`)
      .join("");
  };
  /** A device layer's content: the shot at 1280 CSS px wide, model tags attributed, and a hotspot per [key, i?] mark,
   *  id "<id>-<key><i>". The whole thing is one element (id "<id>-shot") the scene pans with MK.move({y}). */
  NB.screen = (name, id, hot = [], opts = {}) => {
    const s = NB.shot(name);
    const spots = hot.map(([key, i, pad = 0]) => {
      const m = NB.mark(name, key, i);
      return `<div class="nb-hot" id="${id}-${key}${i ?? ""}" style="left:${m.x - pad}px;top:${m.y - pad}px;width:${m.w + 2 * pad}px;height:${m.h + 2 * pad}px"></div>`;
    }).join("");
    return `<div class="nb-shot" id="${id}-shot" style="height:${Math.max(800, s.h)}px"><img class="nb-img" src="${NB.dir}${s.file}" width="1280" height="${s.h}" alt="" />${opts.covers === false ? "" : NB.covers(name, opts)}${spots}</div>`;
  };
  /** A hotspot inside a sub-box of a mark (a table cell's text line): {dx, dy, w, h} from the mark's top-left. */
  NB.sub = (name, key, i, { dx = 0, dy = 0, w, h }) => {
    const m = NB.mark(name, key, i);
    return { x: m.x + dx, y: m.y + dy, w: w ?? m.w - dx, h: h ?? m.h - dy };
  };
  /** A hotspot at an explicit box (for NB.sub results), id given. */
  NB.hot = (id, r) => `<div class="nb-hot" id="${id}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px"></div>`;
  /** A crop of a shot for film chrome: a window of `box` (screen px) shown at `scale`, model tags attributed as in NB.screen. */
  NB.crop = (name, box, scale = 1, id = "") => {
    const s = NB.shot(name);
    const covers = (s.marks.models || [])
      .filter((m) => m.x < box.x + box.w && m.x + m.w > box.x && m.y < box.y + box.h && m.y + m.h > box.y)
      .map((m) => `<span class="nb-ph-pill" style="left:${(m.x - 2 - box.x) * scale}px;top:${(m.y - 1 - box.y) * scale}px;width:${m.w + 4}px;height:${m.h + 2}px;transform:scale(${scale});transform-origin:0 0">${PH}</span>`)
      .join("");
    return `<div class="nb-crop"${id ? ` id="${id}"` : ""} style="width:${box.w * scale}px;height:${box.h * scale}px"><img src="${NB.dir}${s.file}" alt="" style="left:${-box.x * scale}px;top:${-box.y * scale}px;width:${1280 * scale}px;height:${s.h * scale}px" />${covers}</div>`;
  };
  /** `el`'s box in `container` px when the shot holding it has been panned up by `scroll` screen px. */
  NB.at = (el, container, scroll = 0) => {
    const r = MK.rect(el, container);
    const k = r.h / (el.offsetHeight || 1);
    const y = r.y - scroll * k;
    return { ...r, y, cy: y + r.h / 2 };
  };

  /** SC.scene, but the timeline is registered only once every image in the scene has decoded, so no frame is drawn
   *  with a screen missing. */
  NB.scene = (key, compId, build) => {
    MK.ready(() => {
      const root = document.querySelector(`[data-composition-id="${compId}"]`);
      const S = T.scenes[key];
      const ctx = {
        root, S, E: S.ev, D: S.d || {}, tl: gsap.timeline({ paused: true }),
        $: (id) => document.getElementById(id),
        L: (abs) => +(abs - S.start).toFixed(4),
        has: (name) => S.ev[name] !== undefined,
      };
      build(ctx);
      MK.finish(ctx.tl, S.dur);
      const imgs = Array.from(root.querySelectorAll("img"));
      Promise.all(imgs.map((i) => (i.complete && i.naturalWidth ? Promise.resolve() : i.decode().catch(() => {})))).then(() => {
        window.__timelines[compId] = ctx.tl;
      });
    });
  };
  window.NB = NB;
})();
