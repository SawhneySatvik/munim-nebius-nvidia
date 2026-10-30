# Munim launch film Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Load the `hyperframes` skill first (it routes to hyperframes-core, -animation, -keyframes, -cli, -creative, media-use);
> the `brag` skill's conventions apply except where the spec overrides them (length, two cuts, narration).

**Goal:** the two cuts of the Munim launch film (Cup cut < 3:00, full tour ~6:00) per
`docs/superpowers/specs/2026-10-16-munim-launch-film-design.md`, rendered to mp4, with founder checkpoints.

**Architecture:** one HyperFrames project at `video/munim-launch/`: a scene library of sub-compositions (one per spec scene,
each authored with a `full` and a `cup` timing variant), two thin roots (`cup.html`, `full.html`) that sequence them, a
fresh motion kit, one timing module per cut that drives picture, captions, narration and audio, a recreated-UI layer using
the real design tokens, and an audio pipeline (Kokoro narration, music composed in code, SFX synthesised, one pre-mix).

**Tech Stack:** HyperFrames CLI 0.8.163 (`npx hyperframes`), GSAP 3.x vendored locally, plain CSS with the Munim and Cobnut
tokens, Google Fonts (OFL) self-hosted in the project, Node for audio synthesis and mixing, ffmpeg (present at
`/opt/homebrew/bin/ffmpeg`).

**Rules (from the spec):** fresh code and original assets only (no file from `projects_26/the-snacky-shack` or anywhere
else; method only); in-app labels hidden, **one disclosure card**; payment processing never shown as real; the Cup cut
strictly under 3:00. Renders through `scripts/dev/heavy.sh`. No commits by the lane; no AI attribution anywhere.

---

## File structure

```
video/munim-launch/
  README.md                 how to build, edit and re-render; provenance log (fonts, icons, art, music, voice)
  .gitignore                renders/, assets/audio/*.wav, assets/voice/*.wav, node_modules
  hyperframes.json          project config
  cup.html  full.html       roots: sequence scenes; one <audio> each
  scenes/                   one sub-composition per spec scene: 01-cold-open.html … 10-close.html (+ full-only scenes)
  styles/tokens.css         Munim "Ledger, softened" + Cobnut tokens (copied values, not files)
  styles/video.css          stages, device frames, captions, stickers, determinism switches
  ui/                       recreated screens as HTML fragments (owner-home, inbox, ask, kds, till, storefront, …)
  assets/js/motion.js       the motion kit (fresh): camera, cursor, tap, encircle, highlight, count, type, stream, toast,
                            sticker, wipe, flight
  assets/js/timing-cup.js   every event time for the Cup cut (seconds)
  assets/js/timing-full.js  the same for the full tour
  assets/js/fixture.js      the demo fixture (people, menu, prices, figures, AI answers) — numbers add up
  assets/art/               the AI-office illustration (SVG, original) + provenance note
  audio/compose-music.mjs   the original instrumental, synthesised to WAV
  audio/sfx.mjs             SFX synthesised to WAV
  audio/voice.mjs           narration lines → Kokoro WAVs (npx hyperframes tts)
  audio/mix.mjs             music + SFX + narration → assets/audio/mix-{cup,full}.wav at -14 LUFS
  script/cup.md  script/full.md   the narration and captions, line by line with times
  tools/check-duration.mjs  fails if the Cup render is ≥ 180.0 s or the full tour is < 300 s
renders/                    (git-ignored) munim-cup.mp4, munim-full.mp4, posters
```

---

### Task 1: Scaffold, fixture and the script (no visuals yet)
**Files:** `video/munim-launch/{README.md,.gitignore,hyperframes.json}`, `assets/js/fixture.js`, `script/cup.md`, `script/full.md`.
- [ ] Scaffold with `npx hyperframes init` (or by hand per hyperframes-core) in `video/munim-launch/`; vendor GSAP locally.
- [ ] Write `fixture.js` from the real world: people, outlets, the menu and prices from `apps/web/mock-server/data.ts`,
      suppliers and recipients from `tools/worldgen/src/worlds/cobnut.ts`, waste ₹4,872 vs ₹1,512, hazelnut stock 5.8 kg vs
      reorder 8.5 kg, PO 1,000 g at ₹1,465.20 from Steady (simulated), the cake order with FIRST50; every total computed in
      the file, never typed. Add a tiny `node --test` check that the order total, coupon and GST add up.
- [ ] Write the two scripts (narration + captions) scene by scene, Cup cut ≤ 2:50 at a natural 150–160 wpm, full tour ~6:00.
      Plain, confident English; Munim is the subject; Cobnut is "a business that runs on Munim".
- [ ] Checkpoint 0: the scripts go to the founder with the style frames (Task 3).

### Task 2: Motion kit and timing (fresh)
**Files:** `assets/js/motion.js`, `assets/js/timing-cup.js`, `assets/js/timing-full.js`, `styles/{tokens,video}.css`.
- [ ] `motion.js` exports pure functions that add tweens to a passed GSAP timeline at given times (seek-safe, deterministic):
      `camera(tl, el, {at, zoom, x, y, dur})`, `cursor(tl, {at, to, state:'pointer'|'hand'|'text'})`, `tap(tl, el, at)`,
      `encircle(tl, el, at)` (hand-drawn SVG path, stroke-dashoffset), `highlight(tl, el, at)` (turmeric swipe),
      `count(tl, el, from, to, at, dur, format)`, `type(tl, el, text, at, cps)`, `stream(tl, el, tokens, at, {thinking})`
      (2–3 s thinking dots, then tokens; source chips pop as their refs arrive), `toast`, `sticker`, `wipe(tl, at)` (ledger
      page turn), `flight(tl, el, from, to, at)`.
- [ ] Timing modules export one object per scene with absolute times; scenes read only from it.
- [ ] `npx hyperframes check` passes on a blank root that loads the kit.

### Task 3: Style frames → founder checkpoint 1
- [ ] Build four still frames as real compositions frozen at one time: cold open, owner home with the encircle and source
      drawer, the AI office, the negotiation. Snapshot them (`npx hyperframes snapshot`) at 1920×1080.
- [ ] The orchestrator publishes them with the scripts on a private page for the founder. **Stop until the founder signs
      off** (the orchestrator messages "style approved" or the changes).

### Task 4: Spike — scene 3 complete → founder checkpoint 2
- [ ] Recreate the owner home (laptop frame) from `apps/web/components/staff/pages/owner-home.tsx` and its CSS, labels hidden.
- [ ] Animate scene 3 fully (figures count up, encircle, source drawer, captions) with its narration (Kokoro: audition
      `bm_george` and `bf_emma`, pick one, record the choice) and a first cut of the music.
- [ ] Render scene 3 alone; the orchestrator sends it to the founder. **Stop until "spike approved".**

### Task 5: The remaining scenes
- [ ] Scenes 1, 2, 4–10 for the Cup cut, then the full-tour extensions (spec "The full tour adds"), each a sub-composition
      with `cup`/`full` timing; recreate each screen from the real components (storefront, item modal, checkout, tracker,
      KDS, till, inbox, draft detail, Ask, suppliers/negotiation, Cares, developer portal, page builder, campaign drafts,
      AU outlet). The AI office art is original SVG with a provenance note.
- [ ] After each scene: `npx hyperframes check` 0 errors; snapshot 3 frames; read them; fix overlaps/clipping.

### Task 6: Audio
- [ ] `compose-music.mjs`: an original instrumental (tempo ~100–110 BPM, warm, light percussion), long enough for the full
      tour with a loopable middle and a resolved ending; render to WAV. If a free local music model is available through
      the hyperframes/media-use tooling, compare and pick; never a paid service without asking.
- [ ] `sfx.mjs`: click, tap, whoosh, stamp, order chime, "recorded" cha-ching; `voice.mjs`: every narration line to WAV.
- [ ] `mix.mjs`: place narration from the timing modules, duck music by 8–10 dB under voice, SFX 8–12 dB under music;
      loudness −14 LUFS integrated, −1 dBFS true peak; never two SFX within 0.15 s.

### Task 7: Render, gate, deliver → founder checkpoint 3
- [ ] `scripts/dev/heavy.sh npx hyperframes render --quality delivery` for both roots → `renders/munim-cup.mp4`,
      `renders/munim-full.mp4`; posters.
- [ ] Gates: `node tools/check-duration.mjs` (Cup < 180.0 s, full ≥ 300 s; red-prove by pointing it at a 181 s file);
      `ffprobe` 1920×1080, 30 fps; loudness measured on the mp4; spot-check 12 frames per cut (read them); captions readable;
      the disclosure card present in both cuts; no in-app "Sample data"/"Simulated" label visible; "recorded" wording on
      every payment; nothing implies real money moving.
- [ ] README: how to edit and re-render, the provenance log, what was compressed or shown as built.
- [ ] The orchestrator publishes both renders' posters and links for the founder.
