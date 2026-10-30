// The clocks: contiguous scene windows, the Cup and Nebius cuts at most 3:00, narration that fits its windows at a natural pace,
// and captions word for word as the scripts (the scripts are the founder-facing source; the clocks must not drift).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadClock } from "../assets/js/clocks.mjs";

for (const cut of ["cup", "cup4", "falkor", "full", "nebius"]) await loadClock(cut);

const here = new URL("..", import.meta.url);
/** Narration rows of a script table: [id, start, end, caption]. */
function scriptRows(file) {
  const rows = [];
  for (const line of readFileSync(new URL(file, here), "utf8").split("\n")) {
    const m = /^\|\s*([\w.]+)\s*\|\s*([\d.]+)[–-]([\d.]+)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (m && m[4] !== "—") rows.push([m[1], Number(m[2]), Number(m[3]), m[4]]);
  }
  return rows;
}
const words = (s) => (s.match(/[A-Za-z0-9'’]+/g) || []).length;

for (const [cut, file, check] of [
  ["cup", "script/cup.md", (d) => assert.ok(d < 180 && d <= 175, `Cup cut is ${d} s; it must end by 175 s, strictly under 180`)],
  ["cup4", "script/cup4.md", (d) => assert.ok(d >= 235 && d <= 240, `the 4:00 Cup cut is ${d} s; R74 V-1 asks 3:55–4:00`)],
  ["falkor", "script/falkor.md", (d) => assert.ok(d >= 200 && d <= 220, `the FalkorDB cut is ${d} s; R74 V-2 asks about 3:30 (3:20–3:40)`)],
  ["full", "script/full.md", (d) => assert.ok(d >= 300, `full tour is ${d} s; it must run at least 300 s`)],
  ["nebius", "script/nebius.md", (d) => assert.ok(d <= 180, `the Nebius cut is ${d} s; the hackathon allows 3:00 at most`)],
]) {
  const T = globalThis.TIMING[cut];

  test(`${cut}: scene windows run back to back from 0`, () => {
    let t = 0;
    for (const key of T.order) {
      const s = T.scenes[key];
      assert.equal(s.start, t, `${key} starts at ${s.start}, expected ${t}`);
      assert.ok(s.dur > 0);
      t = s.end;
    }
    assert.equal(t, T.duration);
    check(T.duration);
  });

  test(`${cut}: narration lines are in order, inside their scene, and at a natural pace`, () => {
    let last = -1;
    for (const [id, a, b, caption] of T.vo) {
      assert.ok(a >= last, `${id} starts before the previous line ends`);
      assert.ok(b > a);
      const scene = T.order.find((k) => a >= T.scenes[k].start && a < T.scenes[k].end);
      assert.ok(scene && b <= T.scenes[scene].end, `${id} crosses out of its scene`);
      assert.ok(words(caption) / (b - a) <= 2.9, `${id} is ${(words(caption) / (b - a)).toFixed(2)} words a second`);
      last = b;
    }
  });

  test(`${cut}: captions and times are the script's, word for word`, () => {
    const rows = scriptRows(file);
    assert.ok(rows.length > 20, `only ${rows.length} narration rows read from ${file}`);
    assert.deepEqual(T.vo.map(([id, a, b, c]) => [id, a, b, c]), rows);
  });

  test(`${cut}: sound effects are in time order, inside the cut and never two within 0.15 s`, () => {
    const cues = T.sfx || [];
    for (let i = 0; i < cues.length; i++) {
      assert.ok(cues[i][0] >= 0 && cues[i][0] < T.duration, `sfx ${i} at ${cues[i][0]} is outside the cut`);
      if (i > 0) assert.ok(cues[i][0] - cues[i - 1][0] >= 0.15, `sfx ${i - 1} and ${i} are ${(cues[i][0] - cues[i - 1][0]).toFixed(2)} s apart`);
      assert.ok(cues[i][2] >= 8 && cues[i][2] <= 12, `sfx ${i} sits ${cues[i][2]} dB under the music; the plan says 8–12`);
    }
  });

  test(`${cut}: every scene event falls inside its scene`, () => {
    for (const key of T.order) {
      const s = T.scenes[key];
      for (const [name, v] of Object.entries(s.ev)) {
        for (const at of Array.isArray(v) ? v : [v]) {
          assert.ok(at >= s.start && at <= s.end, `${key}.${name} = ${at} is outside ${s.start}–${s.end}`);
        }
      }
    }
  });
}

test("the 4:00 Cup and FalkorDB cuts keep the 2:55 story: every 2:55 line is in them, in order, word for word", () => {
  const base = globalThis.TIMING.cup.vo.map(([id, , , c]) => [id, c]);
  for (const cut of ["cup4", "falkor"]) {
    const lines = globalThis.TIMING[cut].vo.map(([id, , , c]) => [id, c]);
    // The 4:00 cut swaps two 2:55 lines for the full tour's longer beats (5.3 at the till, 9.2 the montage).
    const kept = base.filter(([id]) => !(cut === "cup4" && ["5.3", "9.2"].includes(id)));
    assert.deepEqual(lines.filter(([id]) => kept.some(([k]) => k === id)), kept);
  }
  assert.equal(globalThis.TIMING.falkor.scenes.graph.start, globalThis.TIMING.cup.scenes.negotiation.end, "the graph scene follows the negotiation");
  assert.equal(globalThis.TIMING.falkor.scenes.graph.dur, 35);
});
