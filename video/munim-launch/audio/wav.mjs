// Shared audio plumbing for the film's audio scripts: WAV writing, decoding any file to 48 kHz stereo floats (ffmpeg),
// a seeded random generator and an RBJ biquad filter. Written for this film.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const SR = 48000;

/** 16-bit PCM WAV from channel arrays (floats in −1…1, clipped). */
export function writeWav(path, channels, sr = SR) {
  const n = channels[0].length;
  const ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * ch * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
}

/** Any audio file → [left, right] Float32Arrays at 48 kHz (ffmpeg resamples and upmixes). */
export function readStereo(path) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { maxBuffer: 1 << 30 });
  const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = f[2 * i];
    r[i] = f[2 * i + 1];
  }
  return [l, r];
}

/** mulberry32: the same "random" numbers on every run. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An RBJ biquad (lowpass, highpass or bandpass) as a per-sample function. */
export function biquad(type, freq, q = 0.707, sr = SR) {
  const w = (2 * Math.PI * freq) / sr;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  let b0, b1, b2;
  if (type === "lowpass") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === "highpass") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** `--flag value` and `--flag=value`, refusing anything not in `known`. */
export function parseArgs(argv, known) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m || !known.includes(m[1])) throw new Error(`unknown argument ${argv[i]} (known: ${known.map((k) => `--${k}`).join(" ")})`);
    out[m[1]] = m[2] ?? argv[++i];
  }
  return out;
}

/** A state-variable band-pass whose centre can move every sample (Chamberlin): f(x, freq, q). */
export function sweepBandpass(sr = SR) {
  let low = 0, band = 0;
  return (x, freq, q = 1) => {
    const f1 = 2 * Math.sin((Math.PI * Math.min(freq, sr / 6)) / sr);
    low += f1 * band;
    const high = x - low - band / q;
    band += f1 * high;
    return band;
  };
}
