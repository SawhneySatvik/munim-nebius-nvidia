// Render gate: the stream facts of a rendered cut. The 2:55 Cup cut must be under 180.0 s (the Cup T&C), the 4:00 Cup cut
// 3:55–4:00 (R74 V-1, the founder's call), the FalkorDB cut 3:20–3:40 (R74 V-2), the full tour at least 300 s and the
// Nebius cut at most 3:00 (NB-film); all 1920×1080 at 30 fps with an AAC track.
// Usage: node tools/check-duration.mjs cup|cup4|falkor|full|nebius <file.mp4>
import { execFileSync } from "node:child_process";

const [cut, file] = process.argv.slice(2);
if (!["cup", "cup4", "falkor", "full", "nebius"].includes(cut) || !file) {
  console.error("usage: node tools/check-duration.mjs cup|cup4|falkor|full|nebius <file.mp4>");
  process.exit(2);
}
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).toString());
const v = probe.streams.find((s) => s.codec_type === "video");
const a = probe.streams.find((s) => s.codec_type === "audio");
const dur = Number(probe.format.duration);
const fails = [];
if (cut === "cup" && !(dur < 180)) fails.push(`the Cup cut runs ${dur.toFixed(2)} s; it must be under 180.0 s`);
if (cut === "cup4" && !(dur >= 235 && dur <= 240)) fails.push(`the 4:00 Cup cut runs ${dur.toFixed(2)} s; it must be 235–240 s`);
if (cut === "falkor" && !(dur >= 200 && dur <= 220)) fails.push(`the FalkorDB cut runs ${dur.toFixed(2)} s; it must be 200–220 s`);
if (cut === "full" && !(dur >= 300)) fails.push(`the full tour runs ${dur.toFixed(2)} s; it must be at least 300 s`);
if (cut === "nebius" && !(dur <= 180)) fails.push(`the Nebius cut runs ${dur.toFixed(2)} s; the hackathon allows 3:00 at most`);
if (!v || v.width !== 1920 || v.height !== 1080) fails.push(`video is ${v ? `${v.width}×${v.height}` : "missing"}, not 1920×1080`);
if (!v || v.r_frame_rate !== "30/1") fails.push(`frame rate is ${v?.r_frame_rate}, not 30/1`);
if (!a || a.codec_name !== "aac") fails.push(`audio is ${a?.codec_name ?? "missing"}, not AAC`);
console.log(`${file}: ${dur.toFixed(2)} s · ${v?.width}×${v?.height} · ${v?.r_frame_rate} fps · audio ${a?.codec_name ?? "none"}`);
for (const f of fails) console.error(`FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
