// The film's sound effects, synthesised here from noise and sine waves (no samples): a ledger page turning, a click, a
// marker circling a figure, a sticker landing, a drawer sliding, a small pop, the kitchen's chime, a payment recorded. Each is a short WAV (both channels the
// same) in assets/audio/sfx/. Usage: node audio/sfx.mjs
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SR, biquad, rng, sweepBandpass, writeWav } from "./wav.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = rng(77);
const make = (name, seconds, fn) => {
  const n = Math.floor(seconds * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = fn(i / SR, i);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) x[i] *= 0.9 / peak;
  writeWav(join(ROOT, "assets/audio/sfx", `${name}.wav`), [x, x]);
};
const bell = (t, mid, width) => Math.exp(-Math.pow((t - mid) / width, 2));

// A ledger page turning: paper noise whose band sweeps up, swelling and falling, with a soft flap at the end.
{
  const bp = biquad("bandpass", 1200, 0.9);
  const sw = sweepBandpass();
  make("page-turn", 0.75, (t) => {
    const n = R() * 2 - 1;
    const swept = sw(n, 900 + 2600 * Math.min(1, t / 0.55), 0.9);
    return 0.6 * bp(n) * bell(t, 0.32, 0.18) + 0.5 * swept * bell(t, 0.4, 0.14) + 0.4 * Math.sin(2 * Math.PI * 95 * t) * bell(t, 0.62, 0.03);
  });
}
// A click: a 2 ms tick and a short bright body.
make("click", 0.06, (t) => (t < 0.002 ? R() * 2 - 1 : 0) + 0.5 * Math.sin(2 * Math.PI * 3100 * t) * Math.exp(-t * 160));
// A marker drawn round a figure: band-passed noise, its grain pulsing as the pen moves.
{
  const bp = biquad("bandpass", 2600, 1.4);
  make("pen", 0.6, (t) => bp(R() * 2 - 1) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 28 * t)) * Math.min(1, t / 0.03) * Math.min(1, (0.6 - t) / 0.08));
}
// A sticker landing: a low thump and a paper slap.
{
  const bp = biquad("bandpass", 1500, 0.7);
  make("slam", 0.3, (t) => 0.9 * Math.sin(2 * Math.PI * (70 + 60 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18) + 0.6 * bp(R() * 2 - 1) * Math.exp(-t * 45));
}
// A drawer sliding in: a short, rising swish.
{
  const sw = sweepBandpass();
  make("swish", 0.35, (t) => sw(R() * 2 - 1, 600 + 3000 * (t / 0.35), 1.1) * bell(t, 0.15, 0.09));
}
// A small pop: a sine blip that rises.
make("pop", 0.1, (t) => Math.sin(2 * Math.PI * (520 + 500 * (t / 0.1)) * t) * Math.exp(-t * 40) * Math.min(1, t / 0.003));
// The kitchen's new-ticket chime: two soft bell notes, a fifth apart.
const bellNote = (t, f, at) => (t < at ? 0 : Math.sin(2 * Math.PI * f * (t - at)) * Math.exp(-(t - at) * 5) + 0.3 * Math.sin(2 * Math.PI * 2.76 * f * (t - at)) * Math.exp(-(t - at) * 9));
make("chime", 0.9, (t) => bellNote(t, 880, 0) + 0.9 * bellNote(t, 1318.5, 0.16));
// A payment recorded: a bright double ping over a short coin rattle (it records; nothing is charged).
{
  const hp = biquad("highpass", 3500, 0.8);
  make("register", 0.7, (t) => 0.8 * bellNote(t, 1567.98, 0) + 0.7 * bellNote(t, 2093, 0.09) + 0.25 * hp(R() * 2 - 1) * Math.exp(-t * 18) * (t < 0.2 ? 1 : 0));
}
console.log("assets/audio/sfx: page-turn, click, pen, slam, swish, pop, chime, register");
