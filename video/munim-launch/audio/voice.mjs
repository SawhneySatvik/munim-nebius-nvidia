// Narration lines to WAV with the local Kokoro-82M voice (npx hyperframes tts): one file per line of the cut's clock,
// assets/voice/<cut>/<voice>/<id>.wav, from the clock's "text for the voice" column. Prints each line's duration so the
// clock can be set to the real voice. Run through scripts/dev/heavy.sh. Needs the project venv: uv venv .venv &&
// uv pip install --python .venv/bin/python kokoro-onnx soundfile (the first call downloads the Kokoro-82M model).
// HYPERFRAMES_PYTHON, when set, names another checkout's venv instead.
// Usage: node audio/voice.mjs --cut cup --voice bm_george [--ids 3.1,3.2] [--speed 1]
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KNOWN = ["cut", "voice", "ids", "speed"];
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
  if (!m || !KNOWN.includes(m[1])) throw new Error(`unknown argument ${argv[i]} (known: ${KNOWN.map((k) => `--${k}`).join(" ")})`);
  args[m[1]] = m[2] ?? argv[++i];
}
const cut = args.cut ?? "cup";
const voice = args.voice ?? "bm_george";
if (!/^[a-z]{2}_[a-z]+$/.test(voice)) throw new Error(`--voice ${voice} is not a Kokoro voice id`);
const speed = Number(args.speed ?? 1);
if (!(speed > 0.5 && speed < 1.5)) throw new Error(`--speed ${args.speed} is out of range`);

const { loadClock } = await import("../assets/js/clocks.mjs");
const T = await loadClock(cut);
// The 4:00 Cup and FalkorDB cuts reuse lines the 2:55 Cup and the full tour already recorded: same text, same voice,
// same file (Kokoro is run once per line of text).
const recorded = new Map();
for (const other of ["cup", "full"].filter((c) => c !== cut)) {
  for (const [id, , , , text] of (await loadClock(other)).vo) {
    const f = join(ROOT, "assets/voice", other, voice, `${id}.wav`);
    if (existsSync(f) && !recorded.has(text)) recorded.set(text, f);
  }
}
const want = args.ids ? args.ids.split(",") : null;
const lines = T.vo.filter(([id]) => !want || want.includes(id));
if (want && lines.length !== want.length) throw new Error(`unknown line ids in --ids ${args.ids}`);

const out = join(ROOT, "assets/voice", cut, voice);
mkdirSync(out, { recursive: true });
for (const [id, start, end, , text] of lines) {
  const file = join(out, `${id}.wav`);
  if (speed === 1 && recorded.has(text)) copyFileSync(recorded.get(text), file);
  else try {
    // kokoro-onnx lives in the project's own git-ignored venv (uv venv .venv && uv pip install kokoro-onnx soundfile).
    execFileSync("npx", ["--yes", "hyperframes@0.8.163", "tts", text, "--voice", voice, "--speed", String(speed), "--output", file], {
      env: { ...process.env, HYPERFRAMES_PYTHON: process.env.HYPERFRAMES_PYTHON ?? join(ROOT, ".venv/bin/python") },
      stdio: "pipe",
    });
  } catch (e) {
    throw new Error(`tts failed for line ${id}: ${String(e.stdout ?? "").replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").trim()}`);
  }
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
  console.log(`${id}\t${dur.toFixed(2)} s\twindow ${(end - start).toFixed(2)} s\t${dur > end - start ? "LONGER than its window" : "fits"}`);
}
