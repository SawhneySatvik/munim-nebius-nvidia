// Editing a clock into another (R74): the 4:00 Cup cut and the FalkorDB cut are the 2:55 Cup clock with time opened up
// for more beats. `gap` opens time inside a scene (everything at or after the point moves later, the scene grows),
// `scene` inserts a whole new scene, and `done` rebuilds the windows, the sound cues and the helpers. Times are absolute
// seconds, as in every clock. Written for this film.
(function () {
  const r = (x) => +x.toFixed(3);
  const shiftEv = (ev, at, d) => {
    for (const [k, v] of Object.entries(ev)) {
      if (Array.isArray(v)) ev[k] = v.map((x) => (x >= at ? r(x + d) : x));
      else if (typeof v === "number" && v >= at) ev[k] = r(v + d);
    }
  };
  const CLOCK = {
    /** A deep copy of a clock (windows, lines, events, steps) to edit under a new cut name. */
    from(base, cut) {
      const c = { cut, voice: base.voice, capSkip: [...base.capSkip], order: [...base.order], vo: base.vo.map((l) => [...l]), scenes: {} };
      for (const k of base.order) {
        const s = base.scenes[k];
        c.scenes[k] = { start: s.start, dur: s.dur, end: s.end, ev: JSON.parse(JSON.stringify(s.ev)), d: { ...s.d } };
        if (s.steps) c.scenes[k].steps = s.steps.map((x) => [...x]);
      }
      return c;
    },
    /** Opens `d` seconds at time `at`: the scene it falls in grows, and every line, event and step from `at` on moves. */
    gap(c, at, d) {
      let found = false;
      for (const k of c.order) {
        const s = c.scenes[k];
        if (!found && at >= s.start && at < s.end) {
          s.dur = r(s.dur + d);
          found = true;
        }
        shiftEv(s.ev, at, d);
        if (s.steps) s.steps.forEach((x) => x[0] >= at && (x[0] = r(x[0] + d)));
      }
      if (!found) throw new Error(`gap at ${at} is in no scene`);
      for (const l of c.vo) if (l[1] >= at) [l[1], l[2]] = [r(l[1] + d), r(l[2] + d)];
      CLOCK.windows(c);
    },
    /** Inserts scene `key` of `dur` seconds right after `after`; everything later moves. */
    scene(c, key, after, dur) {
      const at = c.scenes[after].end;
      for (const k of c.order) {
        shiftEv(c.scenes[k].ev, at, dur);
        if (c.scenes[k].steps) c.scenes[k].steps.forEach((x) => x[0] >= at && (x[0] = r(x[0] + dur)));
      }
      for (const l of c.vo) if (l[1] >= at) [l[1], l[2]] = [r(l[1] + dur), r(l[2] + dur)];
      c.order.splice(c.order.indexOf(after) + 1, 0, key);
      c.scenes[key] = { start: at, dur, end: r(at + dur), ev: {}, d: { wipe: 0.7 } };
      CLOCK.windows(c);
    },
    /** Lays the scene windows back to back from 0. */
    windows(c) {
      let t = 0;
      for (const k of c.order) {
        const s = c.scenes[k];
        s.start = r(t);
        s.end = r(t + s.dur);
        t = s.end;
      }
      c.duration = r(t);
    },
    /** Sound cues from the events, by the rules both hand-set clocks use; a cue within 0.15 s of the one before drops. */
    sfx(c) {
      const raw = [];
      const cue = (t, name, under) => raw.push([r(t), name, under]);
      for (const k of c.order) {
        const e = c.scenes[k].ev;
        if (e.wipeOut !== undefined) cue(e.wipeOut, "page-turn", 9);
        for (const [name, v] of Object.entries(e)) {
          const t = Array.isArray(v) ? v[0] : v;
          if (name.startsWith("stamp") || name === "logo") cue(t, "slam", 8);
          else if (/^sticker\d?$/.test(name)) cue(t, "slam", 9);
          else if (/^(chip|chip2|timeChip|usualNote|note|tag|countChip)$/.test(name)) cue(t, "pop", 11);
          else if (/^(tap|click|apply|remove|approve|record|place|start|ready|handed|watch|ask\d?$|confirm|preset|save|publish|grnSave|download|signIn|open$)/.test(name)) cue(t, "click", 9);
          else if (/^(encircle|gate|reviewFail|codeMark|reachMark|margin$)/.test(name)) cue(t, "pen", 10);
          else if (/^(drawerOpen|drawerClose|sheetIn|checkout|tracker|toTill|toKds|toAsk|toChat|toPo|toHome|toMap|toGuarantee|toCares|toAll|toInbox|toInv|toSuppliers|toCampaigns|toAu|payment|review|receipt)$/.test(name)) cue(t, "swish", 11);
          else if (name === "flight" || name === "drag" || name === "trace") cue(t, "swish", 9);
          else if (name === "land") cue(t, "chime", 9);
        }
        if (k === "kitchen") cue(e.record + 0.15, "register", 8);
        if (k === "close") cue(e.endcard, "slam", 8);
      }
      raw.sort((a, b) => a[0] - b[0]);
      const out = [];
      for (const x of raw) if (!out.length || x[0] - out[out.length - 1][0] >= 0.15) out.push(x);
      return out;
    },
    /** Finishes a clock: windows, lines in time order, sound cues, and the scene-time helper. */
    done(c) {
      CLOCK.windows(c);
      c.vo.sort((a, b) => a[1] - b[1]);
      c.sfx = CLOCK.sfx(c);
      c.local = (key, abs) => +(abs - c.scenes[key].start).toFixed(4);
      return c;
    },
  };
  globalThis.CLOCK = CLOCK;
})();
