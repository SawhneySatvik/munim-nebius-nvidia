// The film's music: an original instrumental, composed and synthesised here, note by note (no samples, no loops, no
// model). Warm and unhurried: 104 BPM in D major, an FM electric piano comping, a round bass, soft kick, rim and shaker,
// and a marimba line over the D major pentatonic. The cut's clock decides the form: each bar plays the section of the
// scene it starts in, and the cold open's stamps and logo get hits at their exact times.
//   intro   (cold open)                 keys and shaker, a hit on every stamp
//   A       (the day: meet → kitchen, and dev/also)   Dmaj7 · Bm7 · Gmaj7 · A7sus4→A7, full groove, marimba
//   B       (the AI back office, the negotiation)     Bm7 · Gmaj7 · Dmaj7 · A7sus4→A7, busier shaker, a new marimba line
//   warm    (Munim Cares)               Gmaj7 · A · F♯m7 · Bm7, kick on one, no rim, long keys
//   outro   (the close)                 keys alone, then Dmaj9 rings out to the end
// Usage: node audio/compose-music.mjs --cut cup|cup4|falkor|full|nebius [--out assets/audio/music-<cut>.wav]
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SR, biquad, parseArgs, rng, writeWav } from "./wav.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2), ["cut", "out"]);
const cut = args.cut ?? "cup";
const { loadClock } = await import("../assets/js/clocks.mjs");
const T = await loadClock(cut);
const OUT = join(ROOT, args.out ?? `assets/audio/music-${cut}.wav`);
const SECONDS = T.duration;

const BPM = 104;
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;
const N = Math.ceil(SECONDS * SR);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const R = rng(1016);

const SECTION_OF = { coldOpen: "intro", office: "B", negotiation: "B", graph: "B", cares: "warm", close: "outro" };
// A cut with its own scenes (the Nebius cut) names their sections in its clock.
Object.assign(SECTION_OF, T.sections ?? {});
const sectionAt = (t) => {
  const key = T.order.find((k) => t >= T.scenes[k].start && t < T.scenes[k].end) ?? T.order[T.order.length - 1];
  return SECTION_OF[key] ?? "A";
};

// Buses (stereo) and the reverb send.
const bus = () => [new Float32Array(N), new Float32Array(N)];
const keys = bus(), bass = bus(), drums = bus(), pluck = bus(), send = bus();
const add = (b, i, l, r) => {
  if (i >= 0 && i < N) {
    b[0][i] += l;
    b[1][i] += r;
  }
};
const panLR = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

// ---------------------------------------------------------------- instruments
function epiano(m, t0, dur, vel) {
  const f = mtof(m);
  const [gl, gr] = panLR((m - 64) / 36);
  const len = Math.floor((dur + 0.5) * SR);
  const s0 = Math.floor(t0 * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const att = Math.min(1, t / 0.004);
    const rel = t > dur ? Math.exp(-(t - dur) / 0.14) : 1;
    const env = vel * att * rel * Math.exp(-t * 1.5);
    const index = 1.3 * Math.exp(-t * 5) + 0.22;
    const ph = 2 * Math.PI * f * t;
    const v = env * (Math.sin(ph + index * Math.sin(ph)) + 0.12 * Math.sin(4 * ph) * Math.exp(-t * 14));
    add(keys, s0 + i, v * gl, v * gr);
    add(send, s0 + i, v * gl * 0.3, v * gr * 0.3);
  }
}
function bassNote(m, t0, dur, vel) {
  const f = mtof(m);
  const len = Math.floor((dur + 0.12) * SR);
  const s0 = Math.floor(t0 * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const att = Math.min(1, t / 0.008);
    const rel = t > dur ? Math.exp(-(t - dur) / 0.06) : 1;
    const env = vel * att * rel * (0.25 + 0.75 * Math.exp(-t * 4));
    const ph = 2 * Math.PI * f * t;
    const v = Math.tanh(1.6 * env * (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.1 * Math.sin(3 * ph)));
    add(bass, s0 + i, v, v);
  }
}
function kick(t0, vel) {
  const s0 = Math.floor(t0 * SR);
  let phase = 0;
  for (let i = 0; i < 0.4 * SR; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * (45 + 80 * Math.exp(-t * 32))) / SR;
    const v = vel * Math.exp(-t * 9) * Math.sin(phase) + (t < 0.003 ? vel * 0.3 * (R() * 2 - 1) : 0);
    add(drums, s0 + i, v, v);
  }
}
function rim(t0, vel) {
  const s0 = Math.floor(t0 * SR);
  const bp = biquad("bandpass", 1900, 1.2);
  for (let i = 0; i < 0.25 * SR; i++) {
    const t = i / SR;
    const bursts = (t < 0.004 || (t > 0.011 && t < 0.015) ? 1 : 0.55) * Math.exp(-t * 22);
    const v = vel * (bp(R() * 2 - 1) * bursts * 1.6 + 0.3 * Math.sin(2 * Math.PI * 220 * t) * Math.exp(-t * 35));
    add(drums, s0 + i, v * 0.92, v);
    add(send, s0 + i, v * 0.15, v * 0.15);
  }
}
function shaker(t0, vel) {
  const s0 = Math.floor(t0 * SR);
  const hp = biquad("highpass", 6500, 0.8);
  for (let i = 0; i < 0.09 * SR; i++) {
    const t = i / SR;
    const env = vel * Math.min(1, t / 0.006) * Math.exp(-t * 34);
    const v = hp(R() * 2 - 1) * env;
    add(drums, s0 + i, v * 0.8, v);
  }
}
function marimba(m, t0, vel) {
  const f = mtof(m);
  const [gl, gr] = panLR(-0.3);
  const s0 = Math.floor(t0 * SR);
  for (let i = 0; i < 1.2 * SR; i++) {
    const t = i / SR;
    const att = Math.min(1, t / 0.002);
    const ph = 2 * Math.PI * f * t;
    const v = vel * att * (Math.sin(ph) * Math.exp(-t * 5) + 0.25 * Math.sin(4 * ph) * Math.exp(-t * 18) + 0.06 * Math.sin(10 * ph) * Math.exp(-t * 40));
    add(pluck, s0 + i, v * gl, v * gr);
    add(send, s0 + i, v * gl * 0.4, v * gr * 0.4);
  }
}
/** A stamp hit in the cold open: a low thump with a short piano stab on D. */
function hit(t0) {
  kick(t0, 0.75);
  for (const m of [50, 62, 69]) epiano(m, t0, 0.35, 0.3);
}

// ---------------------------------------------------------------- the score
const D = { chords: [[0, [62, 66, 69, 73]]], root: 38, fifth: 45 }; // Dmaj7
const Bm = { chords: [[0, [59, 62, 66, 69]]], root: 35, fifth: 42 }; // Bm7
const G = { chords: [[0, [55, 59, 62, 66]]], root: 31, fifth: 38 }; // Gmaj7
const A = { chords: [[0, [57, 62, 64, 67]], [2, [57, 61, 64, 67]]], root: 33, fifth: 40 }; // A7sus4 → A7
const Aplain = { chords: [[0, [57, 61, 64, 69]]], root: 33, fifth: 40 }; // A
const Fsm = { chords: [[0, [57, 61, 64, 66]]], root: 30, fifth: 37 }; // F♯m7 (A C♯ E F♯ over F♯)
const PROG = { intro: [D, Bm, G, A], A: [D, Bm, G, A], B: [Bm, G, D, A], warm: [G, Aplain, Fsm, Bm], outro: [G, A, D, D] };
const MEL = {
  A: [[[0, 78], [0.5, 81], [1, 83], [2, 81], [2.5, 78], [3, 76]], [[0, 74], [1, 78], [1.5, 76], [2.5, 74], [3, 71]], [[0, 74], [0.5, 76], [1, 78], [2, 81], [3, 78]], [[0, 76], [0.5, 78], [1, 76], [2, 73], [3, 69]]],
  B: [[[0, 71], [1, 74], [1.5, 78], [3, 76]], [[0, 74], [0.5, 71], [2, 74], [3, 79]], [[0, 78], [1, 81], [1.5, 78], [2.5, 76]], [[0, 76], [1, 73], [2, 76], [3, 81]]],
  warm: [[[0, 74], [2, 78]], [[0, 76], [2, 73]], [[0, 73], [2, 76]], [[0, 74], [2, 71]]],
};
const COMP = { A: [[0, 1.3, 0.34], [1.75, 0.45, 0.22], [2.5, 1.1, 0.28], [3.5, 0.4, 0.18]], B: [[0, 1.3, 0.3], [1.5, 0.45, 0.2], [2.5, 1.1, 0.26], [3.25, 0.5, 0.18]], warm: [[0, 3.6, 0.3]], intro: [[0, 1.8, 0.26], [2.5, 1.2, 0.2]], outro: [[0, 3.6, 0.28]] };
const human = () => (R() - 0.5) * 0.012;

const bars = Math.ceil(SECONDS / BAR);
let inSection = 0;
let last = null;
const endRing = SECONDS - 4.6; // the outro's last chord: Dmaj9 rings from here to the end
for (let b = 0; b < bars; b++) {
  const t = b * BAR;
  if (t >= endRing) break;
  const sec = sectionAt(t);
  inSection = sec === last ? inSection + 1 : 0;
  last = sec;
  const bar = PROG[sec][b % 4];
  for (const [cb, len, v] of COMP[sec]) {
    if (t + cb * BEAT >= endRing) continue;
    const chord = [...bar.chords].reverse().find(([at]) => cb >= at)[1];
    for (const m of chord) epiano(m, t + cb * BEAT + human(), Math.min(len * BEAT, endRing - (t + cb * BEAT)), v * (0.9 + 0.2 * R()));
  }
  const shakerStep = sec === "B" ? 0.25 : sec === "intro" ? 1 : 0.5;
  if (sec !== "outro") for (let e = 0; e < 4 / shakerStep; e++) shaker(t + e * shakerStep * BEAT + human(), (e % 2 ? 0.5 : 0.32) * (sec === "B" ? 0.75 : 1) * (0.85 + 0.3 * R()));
  if (sec === "intro" || sec === "outro") continue;
  bassNote(bar.root, t, (sec === "warm" ? 3.6 : 1.4) * BEAT, 0.55);
  if (sec !== "warm") {
    bassNote(bar.root, t + 1.5 * BEAT, 0.9 * BEAT, 0.55);
    bassNote(bar.fifth, t + 2.5 * BEAT, 1.2 * BEAT, 0.55);
  }
  kick(t, 0.9);
  if (sec !== "warm") {
    kick(t + 2 * BEAT, 0.8);
    if (b % 4 === 3) kick(t + 2.75 * BEAT, 0.55);
    rim(t + BEAT + human(), 0.32);
    rim(t + 3 * BEAT + human(), 0.36);
  }
  if (inSection >= 1 && MEL[sec]) for (const [mb, m] of MEL[sec][b % 4]) marimba(m, t + mb * BEAT + human(), (sec === "warm" ? 0.36 : 0.3) * (0.85 + 0.3 * R()));
}
// The cold open's hits, on the clock's own times.
const C = T.scenes.coldOpen?.ev ?? {};
for (const key of ["stamp1", "stamp2", "stamp3", "logo"]) if (C[key] !== undefined) hit(C[key]);
// The last chord: Dmaj9, held to the end.
for (const m of [50, 62, 64, 66, 69, 73]) epiano(m, endRing, 4.2, 0.3);
bassNote(38, endRing, 4.0, 0.45);

// ---------------------------------------------------------------- reverb (Schroeder: four combs, two allpasses)
function reverb(x, offset) {
  const y = new Float32Array(N);
  for (const ms of [29.7, 37.1, 41.1, 43.7]) {
    const d = Math.floor(((ms + offset) / 1000) * SR);
    const buf = new Float32Array(d);
    let k = 0, lp = 0;
    for (let i = 0; i < N; i++) {
      const out = buf[k];
      lp = out * 0.6 + lp * 0.4;
      buf[k] = x[i] + lp * 0.8;
      y[i] += out * 0.25;
      k = (k + 1) % d;
    }
  }
  for (const ms of [5.0, 1.7]) {
    const d = Math.floor((ms / 1000) * SR);
    const buf = new Float32Array(d);
    let k = 0;
    for (let i = 0; i < N; i++) {
      const v = y[i];
      const out = -0.7 * v + buf[k];
      buf[k] = v + 0.7 * out;
      y[i] = out;
      k = (k + 1) % d;
    }
  }
  return y;
}
const wet = [reverb(send[0], 0), reverb(send[1], 1.3)];

// ---------------------------------------------------------------- master
const L = new Float32Array(N), Rt = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.3) * Math.min(1, (SECONDS - t) / 1.2);
  for (const [out, c] of [[L, 0], [Rt, 1]]) {
    const v = 0.5 * keys[c][i] + 0.26 * bass[c][i] + 0.42 * drums[c][i] + 0.32 * pluck[c][i] + 0.4 * wet[c][i];
    out[i] = (Math.tanh(1.15 * v) / Math.tanh(1.15)) * Math.max(0, fade);
    peak = Math.max(peak, Math.abs(out[i]));
  }
}
const g = 0.89 / peak;
for (let i = 0; i < N; i++) {
  L[i] *= g;
  Rt[i] *= g;
}
writeWav(OUT, [L, Rt]);
console.log(`${OUT}: ${(N / SR).toFixed(2)} s, ${bars} bars at ${BPM} BPM, sections from the ${cut} clock`);
