// One mixed soundtrack for a cut (or a window of it), placed entirely from the cut's clock: the narrator's lines at
// their start times, the music under them (ducked 9 dB while a line plays, 0.2 s ramps), the sound effects at their
// cues. The music bed sits 8 dB under the voice before ducking; each sound effect sits its cue's 8–12 dB under the bed
// (RMS of the effect against RMS of the bed); then loudnorm (two passes) brings the mix to −14 LUFS, −1.5 dBTP. Usage:
//   node audio/mix.mjs --cut cup --window 20,38 --music assets/audio/music-spike.wav --out assets/audio/mix-spike.wav [--voice bf_emma]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SR, parseArgs, readStereo, writeWav } from "./wav.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2), ["cut", "window", "music", "out", "voice"]);
const cut = args.cut ?? "cup";
const { loadClock } = await import("../assets/js/clocks.mjs");
const T = await loadClock(cut);
const [from, to] = (args.window ?? `0,${T.duration}`).split(",").map(Number);
if (!(to > from)) throw new Error(`--window ${args.window} is not start,end`);
const voice = args.voice ?? T.voice;
const musicFile = join(ROOT, args.music ?? "assets/audio/music.wav");
const out = join(ROOT, args.out ?? `assets/audio/mix-${cut}.wav`);
const N = Math.round((to - from) * SR);
const L = new Float32Array(N), Rt = new Float32Array(N);
const db = (d) => Math.pow(10, d / 20);

/** ffmpeg's log (stderr) for an analysis run. */
const ffLog = (argv) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...argv], { encoding: "utf8" }).stderr;
/** Integrated loudness (LUFS) of a file, by ffmpeg's EBU R128 meter. */
const lufs = (file) => {
  const log = ffLog(["-i", file, "-af", "ebur128", "-f", "null", "-"]);
  return Number(/I:\s+(-?[\d.]+) LUFS/.exec(log.slice(log.lastIndexOf("Summary")))[1]);
};

// ---- the narrator's lines in the window
const lines = T.vo.filter(([, a]) => a >= from && a < to).map(([id, a]) => {
  const file = join(ROOT, "assets/voice", cut, voice, `${id}.wav`);
  if (!existsSync(file)) throw new Error(`no voice file for line ${id}: run node audio/voice.mjs --cut ${cut} --voice ${voice}`);
  return { id, at: a - from, file, audio: readStereo(file) };
});
const voiceLufs = lines.length ? Math.max(...lines.map((l) => lufs(l.file))) : -20;

// ---- the music bed, 8 dB under the loudest line, ducked a further 9 dB under every line
const music = readStereo(musicFile);
const bedGain = db(voiceLufs - 8 - lufs(musicFile));
const spans = lines.map((l) => [l.at - 0.15, l.at + l.audio[0].length / SR + 0.25]);
const duckDb = (t) => {
  let d = 0;
  for (const [a, b] of spans) {
    const k = t < a - 0.2 || t > b + 0.2 ? 0 : t < a ? (t - (a - 0.2)) / 0.2 : t > b ? 1 - (t - b) / 0.2 : 1;
    d = Math.max(d, k);
  }
  return -9 * d;
};
for (let i = 0; i < N && i < music[0].length; i++) {
  const g = bedGain * db(duckDb(i / SR));
  L[i] += music[0][i] * g;
  Rt[i] += music[1][i] * g;
}
// ---- the voice, centred
for (const l of lines) {
  const s0 = Math.round(l.at * SR);
  for (let i = 0; i < l.audio[0].length && s0 + i < N; i++) {
    L[s0 + i] += l.audio[0][i];
    Rt[s0 + i] += l.audio[1][i];
  }
}
// ---- the sound effects, each its cue's dB under the music bed
/** RMS level (dBFS) of the parts of a signal above −60 dBFS. */
const rmsDb = (ch) => {
  let sum = 0, n = 0;
  for (const x of ch) if (Math.abs(x) > 0.001) (sum += x * x), n++;
  return n ? 10 * Math.log10(sum / n) : -120;
};
const bedDb = rmsDb(music[0]) + 20 * Math.log10(bedGain);
const cues = (T.sfx || []).filter(([t]) => t >= from && t < to);
for (const [t, name, underDb] of cues) {
  if (!(underDb >= 8 && underDb <= 12)) throw new Error(`sfx ${name} at ${t}: ${underDb} dB under the music is outside 8–12`);
  const [a, b] = readStereo(join(ROOT, "assets/audio/sfx", `${name}.wav`));
  const s0 = Math.round((t - from) * SR);
  const g = db(bedDb - underDb - rmsDb(a));
  for (let i = 0; i < a.length && s0 + i < N; i++) {
    L[s0 + i] += a[i] * g;
    Rt[s0 + i] += b[i] * g;
  }
}

// ---- loudness: two-pass loudnorm to −14 LUFS / −1.5 dBTP (AAC encoding adds about 0.3 dB of true peak; the mp4 must
// stay at or under −1 dBTP)
mkdirSync(dirname(out), { recursive: true });
const pre = out.replace(/\.wav$/, ".premix.wav");
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rt[i]));
if (peak > 0.98) for (let i = 0; i < N; i++) (L[i] /= peak / 0.98), (Rt[i] /= peak / 0.98);
writeWav(pre, [L, Rt]);
const target = "I=-14:TP=-1.5:LRA=11";
const p1 = ffLog(["-i", pre, "-af", `loudnorm=${target}:print_format=json`, "-f", "null", "-"]);
const m = JSON.parse(p1.slice(p1.lastIndexOf("{"), p1.lastIndexOf("}") + 1));
const second = `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", pre, "-af", second, "-ar", String(SR), "-ac", "2", "-c:a", "pcm_s16le", out]);
unlinkSync(pre);
const final = ffLog(["-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"]);
const sum = final.slice(final.lastIndexOf("Summary"));
console.log(`${out}: ${(N / SR).toFixed(2)} s · voice ${voice} (${lines.length} lines) · ${cues.length} sfx · ${/I:\s+(-?[\d.]+ LUFS)/.exec(sum)[1]} · true peak ${/Peak:\s+(-?[\d.]+ dBFS)/.exec(sum)[1]}`);
