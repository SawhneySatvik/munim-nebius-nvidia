// The film's motion kit (window.MK), written for this film. Every helper adds tweens to the GSAP timeline it is given, at
// explicit times, so any frame can be rendered on its own: no clocks, no unseeded randomness, no reading the DOM while
// the timeline plays. Text that changes over time (counts, typing, streaming answers, captions) is written by one
// driver per timeline from that timeline's own time, so scrubbing back un-types it.
//
// A scene builds like this:
//   MK.ready(() => {
//     const tl = gsap.timeline({ paused: true });
//     const M = MK.measure(root, () => ({ waste: MK.rect(el, layer), ... }));   // measure once, laid out
//     MK.encircle(tl, layer, M.waste, 4.2);  ...
//     MK.finish(tl, sceneDuration);                                              // the driver, then register
//     window.__timelines["scene-id"] = tl;
//   });
(function () {
  const W = 1920;
  const H = 1080;
  const MK = { W, H };
  const svgNS = "http://www.w3.org/2000/svg";

  // ---------------------------------------------------------------- setup
  /** Waits for every face the film uses (with ₹, so the latin-ext files load too), then builds. A scene that is not
   *  showing yet never fetches its own fonts, so each one asks for them here. */
  const FACES = [
    '700 40px "Atkinson Hyperlegible"', '400 40px "Atkinson Hyperlegible"', '800 40px "Bricolage Grotesque"', '600 40px "Bricolage Grotesque"',
    '400 40px "IBM Plex Mono"', '600 40px "IBM Plex Mono"', '600 40px Fraunces', 'italic 600 40px Fraunces',
    '400 40px Inter', '600 40px Inter', '700 40px Inter', '800 40px Inter',
  ];
  MK.ready = (build) => {
    Promise.all(FACES.map((f) => document.fonts.load(f, "Aa ₹1,234.50"))).then(() => document.fonts.ready).then(build);
  };

  /** Runs `fn` with every hidden ancestor of `el` shown (a sub-composition is display:none until its slot is live),
   *  then restores them exactly. Measure everything here, once, before any tween exists. */
  MK.measure = (el, fn) => {
    const changed = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (getComputedStyle(n).display !== "none") continue;
      changed.push([n, n.style.getPropertyValue("display"), n.style.getPropertyPriority("display")]);
      // Drop an inline "none" first, so a flex or grid root measures as itself; force block only if still hidden.
      if (n.style.getPropertyValue("display") === "none") n.style.removeProperty("display");
      if (getComputedStyle(n).display === "none") n.style.setProperty("display", "block", "important");
    }
    try {
      return fn();
    } finally {
      for (const [n, v, p] of changed.reverse()) {
        if (v) n.style.setProperty("display", v, p);
        else n.style.removeProperty("display");
      }
    }
  };

  /** `el`'s box in `container`'s own CSS pixels (whatever scale sits above both): {x, y, w, h, cx, cy}. */
  MK.rect = (el, container) => {
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const s = c.width / container.offsetWidth || 1;
    const x = (r.left - c.left) / s;
    const y = (r.top - c.top) / s;
    const w = r.width / s;
    const h = r.height / s;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  };

  /** A point or rect inside a device screen, as canvas pixels for a device at `pose` ({x, y, scale}), where the
   *  screen's top-left sits at `origin` (canvas px at pose x = y = 0, scale 1) and the device scales about `origin`. */
  MK.onDevice = (r, origin, pose, devScale) => {
    const k = (pose.scale ?? 1) * (devScale ?? 1);
    const map = (px, py) => [origin.x + pose.x + px * k, origin.y + pose.y + py * k];
    const [x, y] = map(r.x ?? r.cx, r.y ?? r.cy);
    const out = { x, y, w: (r.w ?? 0) * k, h: (r.h ?? 0) * k };
    out.cx = out.x + out.w / 2;
    out.cy = out.y + out.h / 2;
    return out;
  };

  /** mulberry32: a seeded generator for every "random" wobble, so frames are the same on every render. */
  MK.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------------------------------------------------------------- the per-timeline driver
  const drivers = new WeakMap();
  const fnsOf = (tl) => {
    if (!drivers.has(tl)) drivers.set(tl, []);
    return drivers.get(tl);
  };
  /** Calls `fn(t)` with the timeline's time on every rendered frame (and once at t = 0 when the scene is finished). */
  MK.drive = (tl, fn) => {
    fnsOf(tl).push(fn);
  };
  /** Ends a build: one tween spans the whole scene and runs every driver function from the timeline's own time. */
  MK.finish = (tl, duration) => {
    const fns = fnsOf(tl);
    const run = (t) => {
      for (const f of fns) f(t);
    };
    const clock = { t: 0 };
    tl.fromTo(clock, { t: 0 }, { t: duration, duration, ease: "none", immediateRender: false, onUpdate: () => run(clock.t) }, 0);
    run(0);
    return tl;
  };

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const backOut = (x, s = 2.2) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);

  // ---------------------------------------------------------------- text over time
  /** A number rolling from `from` to `to` over [at, at + dur], written by `format`. */
  MK.count = (tl, el, from, to, at, dur, format) => {
    const f = format || ((v) => String(Math.round(v)));
    MK.drive(tl, (t) => {
      const p = easeOutCubic(clamp01((t - at) / dur));
      el.textContent = f(from + (to - from) * p);
    });
  };

  /** Types `text` into `el` from `at` at `cps` characters a second. Returns the keypress times (for the sound mix). */
  MK.type = (tl, el, text, at, cps = 14) => {
    MK.drive(tl, (t) => {
      const n = Math.max(0, Math.min(text.length, Math.floor((t - at) * cps)));
      el.textContent = text.slice(0, n);
    });
    return Array.from(text, (_, i) => +(at + (i + 1) / cps).toFixed(3)); // the moment each character appears
  };

  /** Discrete text states: [[t, "text"], ...] in time order; before the first, the first. */
  MK.states = (tl, el, list) => {
    MK.drive(tl, (t) => {
      let cur = list[0][1];
      for (const [at, text] of list) if (t >= at) cur = text;
      el.textContent = cur;
    });
  };

  /** An AI answer: `thinking` seconds of dots in `think`, then `parts` stream into `el` at `cps` characters a second.
   *  A part is a string (streamed) or an Element (a value with its Source chip), which pops in when the stream reaches
   *  it. Returns {start, end, pops: [times]}. */
  MK.stream = (tl, el, parts, at, opts = {}) => {
    const thinking = opts.thinking ?? 2.5;
    const cps = opts.cps ?? 42;
    const think = opts.think || null;
    const dots = think ? Array.from(think.querySelectorAll("i")) : [];
    el.textContent = "";
    let cursor = at + thinking;
    const pieces = parts.map((p) => {
      if (typeof p === "string") {
        const span = document.createElement("span");
        el.appendChild(span);
        const piece = { kind: "text", node: span, text: p, from: cursor };
        cursor += p.length / cps;
        return piece;
      }
      p.classList.add("mk-pop");
      el.appendChild(p);
      const piece = { kind: "pop", node: p, from: cursor };
      cursor += 0.22;
      return piece;
    });
    const end = cursor;
    MK.drive(tl, (t) => {
      if (think) {
        const on = t >= at && t < at + thinking;
        think.style.opacity = on ? "1" : "0";
        dots.forEach((d, i) => {
          const phase = ((t - at) * 2.4 - i * 0.28) % 1;
          d.style.opacity = on ? String(0.25 + 0.75 * Math.max(0, Math.sin(Math.PI * (phase < 0 ? phase + 1 : phase)))) : "0.25";
        });
      }
      for (const piece of pieces) {
        if (piece.kind === "text") {
          const n = Math.max(0, Math.min(piece.text.length, Math.floor((t - piece.from) * cps)));
          piece.node.textContent = piece.text.slice(0, n);
        } else {
          const p = clamp01((t - piece.from) / 0.28);
          piece.node.style.opacity = p > 0 ? "1" : "0";
          piece.node.style.transform = `scale(${p > 0 ? (0.6 + 0.4 * backOut(p)).toFixed(4) : 0.6})`;
        }
      }
    });
    return { start: at + thinking, end, pops: pieces.filter((p) => p.kind === "pop").map((p) => +p.from.toFixed(3)) };
  };

  /** Caption lines in one element: [[enter, exit, text], ...] (scene-local seconds), each fading 0.15 s in and out. */
  MK.captions = (tl, el, lines) => {
    MK.drive(tl, (t) => {
      const line = lines.find(([a, b]) => t >= a - 0.15 && t < b + 0.15);
      if (!line) {
        el.style.opacity = "0";
        return;
      }
      const [a, b, text] = line;
      if (el.textContent !== text) el.textContent = text;
      el.style.opacity = String(Math.min(clamp01((t - (a - 0.15)) / 0.15), clamp01((b + 0.15 - t) / 0.15)));
    });
  };

  // ---------------------------------------------------------------- moves with memory (chained fromTo)
  // Each element's last authored state, so a chain of moves is a chain of explicit fromTo tweens: seek-safe in any
  // order. Calls for one element must be made in time order.
  const poses = new WeakMap();
  const poseOf = (el, init) => {
    if (!poses.has(el)) poses.set(el, { ...init });
    return poses.get(el);
  };
  /** Tween `el` to `props` over [at, at + dur] from wherever the last move left it. */
  MK.move = (tl, el, props, at, dur = 0.6, ease = "power3.inOut", init = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }) => {
    const pose = poseOf(el, init);
    const from = {};
    for (const k of Object.keys(props)) from[k] = pose[k] ?? init[k] ?? 0;
    tl.fromTo(el, from, { ...props, duration: dur, ease, immediateRender: false }, at);
    Object.assign(pose, props);
  };

  /** The camera: put point (x, y) of `el`'s own canvas at `anchor` (default the frame's centre), scaled by `zoom`. */
  MK.camera = (tl, el, { at, zoom = 1, x = W / 2, y = H / 2, dur = 0.8, ease = "power3.inOut", anchor = [W / 2, H / 2] }) => {
    gsap.set(el, { transformOrigin: "0px 0px" }); // static, like CSS: the rig scales about its top-left corner
    MK.move(tl, el, { x: anchor[0] - zoom * x, y: anchor[1] - zoom * y, scale: zoom }, at, dur, ease);
  };

  /** A button press: 2 px down and back, as the app's buttons do on :active. */
  MK.press = (tl, el, at) => {
    tl.fromTo(el, { y: 0, scale: 1 }, { y: 2, scale: 0.97, duration: 0.07, ease: "power2.out", immediateRender: false }, at);
    tl.fromTo(el, { y: 2, scale: 0.97 }, { y: 0, scale: 1, duration: 0.16, ease: "power2.out", immediateRender: false }, at + 0.07);
  };

  /** Fades `el` in over [at, at + dur] (CSS starts it at opacity 0). */
  MK.show = (tl, el, at, dur = 0.3, from = { y: 14 }) => {
    tl.fromTo(el, { opacity: 0, ...from }, { opacity: 1, x: 0, y: 0, duration: dur, ease: "power2.out", immediateRender: false }, at);
  };
  /** Fades `el` out over [at, at + dur]. */
  MK.hide = (tl, el, at, dur = 0.25) => {
    tl.fromTo(el, { opacity: 1 }, { opacity: 0, duration: dur, ease: "power1.in", immediateRender: false }, at);
  };

  // ---------------------------------------------------------------- emphasis
  /** A caption sticker: springs in at `enter` (0.35 s), leaves at `exit` (0.25 s). CSS starts it at opacity 0. */
  MK.sticker = (tl, el, enter, exit, { rot = -2 } = {}) => {
    tl.fromTo(el, { opacity: 0, scale: 0.6, rotation: rot + (rot < 0 ? -7 : 7) }, { opacity: 1, scale: 1, rotation: rot, duration: 0.35, ease: "back.out(2.2)", immediateRender: false }, enter);
    if (exit !== null && exit !== undefined) {
      tl.fromTo(el, { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.92, duration: 0.25, ease: "power2.in", immediateRender: false }, exit);
    }
  };

  /** An ink stamp landing at `at`: drops from 1.5× in 0.11 s, squashes, settles. */
  MK.stamp = (tl, el, at, { rot = -3 } = {}) => {
    tl.fromTo(el, { opacity: 0, scale: 1.5, rotation: rot - 4 }, { opacity: 1, scale: 0.96, rotation: rot, duration: 0.11, ease: "power4.in", immediateRender: false }, at - 0.11);
    tl.fromTo(el, { scale: 0.96 }, { scale: 1, duration: 0.3, ease: "elastic.out(1, 0.5)", immediateRender: false }, at);
  };

  /** A hand-drawn ink circle around `rect` (in `layer` px), drawn on over `dur` from `at`. */
  MK.encircle = (tl, layer, rect, at, { dur = 0.6, pad = 18, color = "var(--m-red)", width = 6, seed = 7, turns = 1.12, tilt = -4, until } = {}) => {
    const rnd = MK.rng(seed);
    const rx = rect.w / 2 + pad;
    const ry = rect.h / 2 + pad * 0.55;
    const margin = width * 2 + 20;
    const N = 96;
    const pts = [];
    const start = -Math.PI * 0.62;
    const tiltR = (tilt * Math.PI) / 180;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const a = start + u * turns * Math.PI * 2;
      // The wobble grows along the stroke, so the end overshoots and does not meet the start.
      const wob = 1 + (rnd() - 0.5) * 0.035 + u * 0.06 * Math.sin(u * 9.3 + seed);
      const ex = Math.cos(a) * rx * wob;
      const ey = Math.sin(a) * ry * wob;
      pts.push([rx + margin + ex * Math.cos(tiltR) - ey * Math.sin(tiltR), ry + margin + ex * Math.sin(tiltR) + ey * Math.cos(tiltR)]);
    }
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "mk-encircle");
    svg.setAttribute("width", String(2 * (rx + margin)));
    svg.setAttribute("height", String(2 * (ry + margin)));
    svg.style.left = `${rect.cx - rx - margin}px`;
    svg.style.top = `${rect.cy - ry - margin}px`;
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(" ")).join("L")}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.style.strokeDasharray = `${len + 2}`;
    path.style.strokeDashoffset = `${len + 2}`;
    svg.appendChild(path);
    layer.appendChild(svg);
    // Round caps paint a dot even at full offset, so the circle stays transparent until it starts drawing.
    tl.fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 0.01, immediateRender: false }, at);
    tl.fromTo(path, { strokeDashoffset: len + 2 }, { strokeDashoffset: 0, duration: dur, ease: "power2.out", immediateRender: false }, at);
    // The marks sit on the camera's fx layer, not in the screen: one that outlives its screen must be lifted (`until`).
    if (until !== undefined) tl.fromTo(svg, { opacity: 1 }, { opacity: 0, duration: 0.25, immediateRender: false }, until);
    return svg;
  };

  /** A turmeric highlighter swept behind `rect` (multiply blend, so the text stays crisp) from the left. */
  MK.highlight = (tl, layer, rect, at, { dur = 0.35, padX = 10, padY = 4, rot = -1, until } = {}) => {
    const bar = document.createElement("div");
    bar.className = "mk-highlight";
    Object.assign(bar.style, { left: `${rect.x - padX}px`, top: `${rect.y - padY}px`, width: `${rect.w + 2 * padX}px`, height: `${rect.h + 2 * padY}px` });
    layer.appendChild(bar);
    tl.fromTo(bar, { scaleX: 0, rotation: rot }, { scaleX: 1, rotation: rot, duration: dur, ease: "power2.out", immediateRender: true }, at);
    if (until !== undefined) tl.fromTo(bar, { opacity: 1 }, { opacity: 0, duration: 0.25, immediateRender: false }, until);
    return bar;
  };

  // ---------------------------------------------------------------- hands
  /** A finger tap on a phone at `p` ({x, y} or a rect) in `layer` px: a dot from 0.08 s before, a ring after. */
  MK.tap = (tl, layer, p, at) => {
    const x = p.cx ?? p.x;
    const y = p.cy ?? p.y;
    const dot = document.createElement("div");
    dot.className = "mk-tap-dot";
    const ring = document.createElement("div");
    ring.className = "mk-tap-ring";
    for (const n of [dot, ring]) {
      n.style.left = `${x - 17}px`;
      n.style.top = `${y - 17}px`;
      layer.appendChild(n);
    }
    tl.fromTo(dot, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.08, ease: "power2.out", immediateRender: false }, at - 0.08);
    tl.fromTo(dot, { opacity: 1 }, { opacity: 0, duration: 0.25, ease: "power1.in", immediateRender: false }, at + 0.18);
    tl.fromTo(ring, { opacity: 0.9, scale: 0.4 }, { opacity: 0, scale: 2.4, duration: 0.55, ease: "power2.out", immediateRender: false }, at);
  };

  // Cursor states, drawn for this film: the arrow's tip, the hand's fingertip and the I-beam's middle are the hotspot.
  const CURSORS = {
    pointer: { hot: [3, 2], svg: '<svg width="44" height="54" viewBox="0 0 22 27"><path d="M2 1.5v20l5.2-4.6 3.4 7.6 3.6-1.6-3.4-7.4 7-.6z" fill="#fbf6ea" stroke="#1b1611" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
    hand: { hot: [17, 3], svg: '<svg width="50" height="56" viewBox="0 0 25 28"><path d="M8.5 13V3.6a1.9 1.9 0 0 1 3.8 0V11l.1-1.6a1.9 1.9 0 0 1 3.7.2v1.8a1.9 1.9 0 0 1 3.7.3v1.6a1.9 1.9 0 0 1 3.6.5V18c0 4.5-3 8.2-7.6 8.2h-1.3c-2.6 0-4.4-1-6-3.1l-3.9-5.4a1.9 1.9 0 0 1 2.9-2.4L8.5 16.6z" fill="#fbf6ea" stroke="#1b1611" stroke-width="1.7" stroke-linejoin="round"/></svg>' },
    text: { hot: [11, 22], svg: '<svg width="22" height="44" viewBox="0 0 11 22"><path d="M2 1.5h2.2c.7 0 1.3.5 1.3 1.2 0-.7.6-1.2 1.3-1.2H9M5.5 2.7v16.6M2 20.5h2.2c.7 0 1.3-.5 1.3-1.2 0 .7.6 1.2 1.3 1.2H9M3.6 11h3.8" fill="none" stroke="#1b1611" stroke-width="1.7" stroke-linecap="round"/></svg>' },
  };
  /** A desktop cursor in `layer`, starting at {x, y}. Returns {go({at, to: [x, y], dur, ease, state}), state(at, name),
   *  click(at, el?), show(at), hide(at)}. Each state image is offset by its own hotspot, so the tip stays on target when
   *  the state changes. `hidden`: invisible until show(at). */
  MK.cursor = (tl, layer, { x, y, state = "pointer", scale = 1, hidden = false } = {}) => {
    const root = document.createElement("div");
    root.className = "mk-cursor";
    const imgs = {};
    for (const [name, c] of Object.entries(CURSORS)) {
      const holder = document.createElement("div");
      holder.innerHTML = c.svg;
      const svg = holder.firstChild;
      svg.style.left = `${-c.hot[0] * 2 * scale}px`;
      svg.style.top = `${-c.hot[1] * 2 * scale}px`;
      if (scale !== 1) {
        svg.setAttribute("width", String(Number(svg.getAttribute("width")) * scale));
        svg.setAttribute("height", String(Number(svg.getAttribute("height")) * scale));
      }
      root.appendChild(svg);
      imgs[name] = svg;
    }
    layer.appendChild(root);
    const ring = document.createElement("div");
    ring.className = "mk-click-ring";
    layer.appendChild(ring);
    tl.set(root, { x, y, opacity: hidden ? 0 : 1 }, 0);
    const pos = poseOf(root, { x, y, scale: 1 });
    let current = state;
    tl.set(imgs[state], { opacity: 1 }, 0);
    const setState = (at, name) => {
      if (name === current) return;
      tl.fromTo(imgs[current], { opacity: 1 }, { opacity: 0, duration: 0.06, ease: "none", immediateRender: false }, at);
      tl.fromTo(imgs[name], { opacity: 0 }, { opacity: 1, duration: 0.06, ease: "none", immediateRender: false }, at);
      current = name;
    };
    return {
      state: setState,
      go({ at, to, dur = 0.7, ease = "power2.inOut", state: s }) {
        MK.move(tl, root, { x: to[0], y: to[1] }, at, dur, ease, { x, y });
        if (s) setState(at + dur - 0.1, s);
      },
      click(at, el) {
        tl.fromTo(root, { scale: 1 }, { scale: 0.84, duration: 0.07, ease: "power2.out", immediateRender: false }, at);
        tl.fromTo(root, { scale: 0.84 }, { scale: 1, duration: 0.14, ease: "power2.out", immediateRender: false }, at + 0.07);
        tl.fromTo(ring, { x: pos.x - 17, y: pos.y - 17, opacity: 0.9, scale: 0.4 }, { x: pos.x - 17, y: pos.y - 17, opacity: 0, scale: 2.2, duration: 0.45, ease: "power2.out", immediateRender: false }, at);
        if (el) MK.press(tl, el, at);
      },
      show(at) {
        tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", immediateRender: false }, at);
      },
      hide(at) {
        MK.hide(tl, root, at, 0.2);
      },
    };
  };

  // ---------------------------------------------------------------- transitions
  /** The ledger-page wipe. "out": a fresh ruled page slides in from the right edge until it covers the frame (the scene
   *  ends on it). "in": the scene starts on the page, which slides away to the left. `page` is a .mk-page in the scene
   *  (one element per wipe); `edge` is its .mk-page-edge shadow. The same page on both sides makes the cut invisible. */
  MK.wipe = (tl, page, at, { mode = "out", dur = 0.7, edge = null } = {}) => {
    if (mode === "out") {
      tl.fromTo(page, { clipPath: "inset(0px 0px 0px 100%)" }, { clipPath: "inset(0px 0px 0px 0%)", duration: dur, ease: "power3.inOut", immediateRender: false }, at);
      if (edge) {
        tl.fromTo(edge, { opacity: 1, x: W }, { opacity: 1, x: -46, duration: dur, ease: "power3.inOut", immediateRender: false }, at);
        tl.fromTo(edge, { opacity: 1 }, { opacity: 0, duration: 0.05, immediateRender: false }, at + dur);
      }
    } else {
      tl.fromTo(page, { clipPath: "inset(0px 0% 0px 0px)" }, { clipPath: "inset(0px 100% 0px 0px)", duration: dur, ease: "power3.inOut", immediateRender: true }, at);
      if (edge) {
        tl.fromTo(edge, { opacity: 1, x: W - 46 }, { opacity: 1, x: -46, duration: dur, ease: "power3.inOut", immediateRender: false }, at);
        tl.fromTo(edge, { opacity: 1 }, { opacity: 0, duration: 0.05, immediateRender: false }, at + dur);
      }
    }
  };

  /** A toast: rises into place at `at`, holds `hold` seconds, fades. CSS starts it at opacity 0. */
  MK.toast = (tl, el, at, hold = 2.4) => {
    tl.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out", immediateRender: false }, at);
    tl.fromTo(el, { opacity: 1 }, { opacity: 0, duration: 0.25, ease: "power1.in", immediateRender: false }, at + 0.3 + hold);
  };

  /** A card flying from `from` to `to` (canvas px, the card's top-left) on an arc: x in one move, y up then down. */
  MK.flight = (tl, el, from, to, at, { dur = 1.0, lift = 240, rot = [-8, 6], scale = [1, 0.5], fadeAtEnd = true } = {}) => {
    const top = Math.min(from.y, to.y) - lift;
    tl.fromTo(el, { x: from.x }, { x: to.x, duration: dur, ease: "power2.inOut", immediateRender: false }, at);
    tl.fromTo(el, { y: from.y }, { y: top, duration: dur / 2, ease: "power2.out", immediateRender: false }, at);
    tl.fromTo(el, { y: top }, { y: to.y, duration: dur / 2, ease: "power2.in", immediateRender: false }, at + dur / 2);
    tl.fromTo(el, { rotation: rot[0], scale: scale[0], opacity: 1 }, { rotation: rot[1], scale: scale[1], duration: dur, ease: "sine.inOut", immediateRender: false }, at);
    if (fadeAtEnd) tl.fromTo(el, { opacity: 1 }, { opacity: 0, duration: 0.12, immediateRender: false }, at + dur - 0.06);
  };

  window.MK = MK;
})();
