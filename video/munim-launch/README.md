# The Munim launch film

This project contains historical Cup and FalkorDB cuts as well as the current Nebius × NVIDIA hackathon cut. The older cuts are
kept as production history; they are not the hackathon submission. The current submission composition is `nebius` below.

"A day at Cobnut Bakehouse" has four historical cuts, all built from one HyperFrames scene library:

- **The Cup cut, 4:00** (`cup4`, R74 V-1): the founder's final Cup cut, the 2:55 story with more of the product shown.
  The Cup T&C ask for a video "strictly under three (3) minutes"; the founder chose about 4:00 knowing that.
- **The Cup cut, 2:55** (`cup`): strictly under 3:00, approved; kept as the fallback.
- **The FalkorDB cut, 3:30** (`falkor`, R74 V-2): the 2:55 story plus the supply graph after the negotiation.
- **The full tour, 6:00** (`full`).

The 4:00 and FalkorDB clocks are not typed out: `assets/js/clock-edit.js` opens time in the 2:55 clock (`gap`) or
inserts a scene (`scene`), and `timing-cup4.js` / `timing-falkor.js` say where and what goes in. Every 2:55 line stays
word for word (tests/timing.test.mjs checks it), and the 4:00 cut's new lines are the full tour's own, so
`audio/voice.mjs` copies their recordings instead of running Kokoro again.

## The Nebius cut, 2:49 target (`nebius`)

The revised submission cut follows the product from an owner question through the AI back office and a sourced supplier workflow,
then makes the graph itself the payoff. It includes 27 seconds in the office, a 12-second configured-role explanation and a
35-second graph sequence that draws supplier → ingredient → dish → outlet links, traces a price impact, opens the supplier map,
and shows a graph-backed answer. The target runtime is 169 seconds, within the under-three-minute requirement.

The office and graph compositions are reused from the existing product-film library (`scenes/06-office.html` and
`scenes/07b-graph.html`). The captured application panels remain in `assets/screens/nebius/` with their source labels. The
configured Nebius Token Factory role IDs are the ones in `scripts/dev/nemotron-roles.ts`; the owner verified live application
inference through Token Factory. Historical NVIDIA-endpoint captures are not represented as Token Factory benchmarks.

| | |
|---|---|
| Clock and voice script | `assets/js/timing-nebius.js`, `script/nebius.md` |
| Architecture/story notes | `docs/nebius/FILM-SCRIPT.md` |
| Scenes | `n1-morning`, `06-office`, `n2-models`, `n4-quotes`, `n5-order`, `07b-graph`, `n6-verify`, `n8-end` |
| Nebius captured-screen kit | `assets/js/nebius.js`, `assets/screens/nebius/shots.js`, `styles/nebius.css` |
| Audio | `assets/voice/nebius/bf_emma/`, `assets/audio/music-nebius.wav`, `assets/audio/mix-nebius.wav` |
| Disclosures | Synthetic business data; simulated suppliers; payments recorded, never processed. |

To rebuild after changing the clock or narration:

```bash
node tools/make-roots.mjs
node tools/root.mjs nebius
HYPERFRAMES_PYTHON=<project venv python> node audio/voice.mjs --cut nebius --voice bf_emma
node audio/sfx.mjs
node audio/compose-music.mjs --cut nebius
node audio/mix.mjs --cut nebius --music assets/audio/music-nebius.wav --out assets/audio/mix-nebius.wav
npx hyperframes@0.8.163 check --json
npx hyperframes@0.8.163 preview --port 4560 --no-open
npx hyperframes@0.8.163 render --quality delivery --workers 1 -o renders/nebius-picture.mp4
```

The storyboard and audio for the Nebius cut are ready for final preview approval. The current MP4 was rendered from the
superseded script and must be replaced after checking the preview. The delivery render also needs visual and duration inspection
before uploading to YouTube. The end card intentionally leaves only the demo URL for deployment.

Spec: `docs/superpowers/specs/2026-10-16-munim-launch-film-design.md`. Plan: `docs/superpowers/plans/2026-10-16-munim-launch-film.md`. Ledger: R65.

**Current submission status:** The 169-second Nebius cut has a revised storyboard, timed narration, music/SFX mix, and passes the
HyperFrames composition check. A phone-size snapshot review was captured. The final delivery MP4 is not yet rendered; the MP4 in
`renders/` is superseded. Historical cut records below are retained as project history only.

The style frames are in `snapshots/style-frames/` (git-ignored; `1-cold-open.png`, `2-owner-home.png`, `3-ai-office.png`, `4-negotiation.png`), taken from `roots/frames.html`. They passed these checks:

- `check` on `roots/kit.html` and `roots/frames.html`: 0 lint, runtime, layout or motion findings, and 90/90 contrast checks.
- `node --test tests/*.test.mjs`: 15 of 15 pass. Both gates were red-proven to exit non-zero: a broken price, a 181 s Cup cut and a drifted caption each fail them.

## Quick start

You need Node 22+ and ffmpeg. Run everything from this folder. The CLI is pinned to `hyperframes@0.8.163`; heavy commands go through the shared lock in `scripts/dev/heavy.sh`.

```bash
node --test tests/*.test.mjs               # the numbers add up; the clocks are contiguous and match the scripts
node tools/root.mjs frames                 # choose the root that check / snapshot / preview will read (index.html)
npx hyperframes@0.8.163 lint
../../scripts/dev/heavy.sh npx hyperframes@0.8.163 check
../../scripts/dev/heavy.sh npx hyperframes@0.8.163 snapshot --at 1,3,5,7 --describe false --no-end -o <dir>
npx hyperframes@0.8.163 preview --port 4560 --no-open    # Studio; stop it with: preview --stop
```

`--describe false` matters: the CLI otherwise sends frames to Gemini whenever a key is in the environment.

The sound is built in four steps, all local and all from the cut's clock:

```bash
uv venv .venv && uv pip install --python .venv/bin/python kokoro-onnx soundfile   # once: the local Kokoro runtime (git-ignored)
node audio/voice.mjs --cut cup --voice bf_emma [--ids 3.1,3.2]       # narration → assets/voice/cup/bf_emma/<id>.wav (via heavy.sh)
node audio/compose-music.mjs --cut cup                                # → assets/audio/music-cup.wav (sections from the clock)
node audio/sfx.mjs                                                    # → assets/audio/sfx/*.wav
node audio/mix.mjs --cut cup --music assets/audio/music-cup.wav --out assets/audio/mix-cup.wav
```

Run the same with `--cut full` for the full tour. The music follows the clock's scenes: an intro under the cold open,
the A section under the day, a B section under the office and the negotiation, a warmer passage under Cares and an
outro that rings out on the end card.

To render a cut, after the mix:

```bash
node tools/make-roots.mjs                  # roots/cup.html and roots/full.html, generated from the two clocks
node tools/root.mjs cup
../../scripts/dev/heavy.sh npx hyperframes@0.8.163 render --quality delivery --workers 2 -o renders/cup-picture.mp4
ffmpeg -i renders/cup-picture.mp4 -i assets/audio/mix-cup.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -ar 48000 \
  -shortest -movflags +faststart renders/munim-cup-review.mp4      # the mix itself under the picture (see below)
node tools/check-duration.mjs cup renders/munim-cup-review.mp4      # Cup < 180.0 s, 1920×1080, 30 fps, AAC
node tools/check-cup-url.mjs                                         # fails until the Cloud Run URL replaces the placeholder
```

The full tour renders with `--workers 1`: two workers capture to disk first and need about 22 GB of free space for six
minutes. The renderer's own audio pass came out about 0.9 LU under the mix, so the delivered file carries the mix
itself, encoded once to AAC; the mix leaves −1.5 dBTP so the AAC file stays under −1 dBTP.

`mix.mjs` places each line at its clock time and puts the music bed 8 dB under the voice. It ducks the bed a further 9 dB under every line, with 0.2 s ramps, and puts each sound effect at its cue. Then two loudnorm passes take the mix to −14 LUFS integrated and −1 dBTP.

## How it is put together

| Path | What it holds |
|---|---|
| `roots/` | The roots: `cup` and `full` (Task 5 onwards), `frames` (the style frames), `spike` (Task 4) and `kit` (a check that the shared runtime loads). HyperFrames' check, snapshot and preview read only `index.html`, and lint refuses a second root-level composition, so `node tools/root.mjs <name>` copies one of these to `index.html`. That file is git-ignored; never edit it. |
| `frames/` | The four style-frame sub-compositions, frozen at one moment each, plus `kit.html` |
| `scenes/` | One sub-composition per spec scene: `01-cold-open` to `10-close`, with `09b-also` in the full tour only, and `captions.html` over the whole cut. A scene builds the beats its cut's clock has events for, so one file serves both cuts. |
| `ui/` | The recreated Cobnut screens. They are markup functions (`ui/cobnut.js`) with the app's styles written out as plain CSS for the device's own width (`ui/cobnut.css`). The app's demo badges are left off (R65 V-5). |
| `ui/shop.js`, `ui/staff.js`, `ui/more.js`, `ui/site.js` | The storefront (menu, item sheet, checkout, tracker); the staff screens (kitchen board, till, payment, Ask Munim, the office page, the purchase order, Cares); the screens the T-128 lane built (the page builder, campaigns, the investigation, the all-outlets view) with the sign-in picker and the Australian board; Munim's own site, map, developer portal and close |
| `ui/negotiation.js` | The agent-to-agent chat and the deal review, in Munim chrome, labelled "Behind the scenes" |
| `ui/office.js` | The first AI-office illustration, used only by the style frames (the film now shows the product's office page) |
| `assets/js/scene.js`, `assets/js/beats.js` | Scene plumbing (devices with layered screens, the page wipes, screen swaps, start-up) and the builder and campaign beats both cuts share |
| `tools/make-roots.mjs` | Writes `roots/cup.html`, `cup4.html`, `falkor.html` and `full.html` from the clocks; never edit those by hand |
| `assets/js/clock-edit.js`, `timing-cup4.js`, `timing-falkor.js`, `clocks.mjs` | The 4:00 Cup and FalkorDB clocks as edits of the 2:55 one, and the loader the audio scripts, tools and tests share |
| `ui/graph.js`, `scenes/07b-graph.html` | The FalkorDB cut's supply graph: the graph board (film chrome), the supplier map and its "What a price change touches" drawer (recreated from `pages/supplier-map.tsx`, T-131), and Ask answering from the graph |
| `tools/check-duration.mjs`, `tools/check-cup-url.mjs` | Render gates: length and format per cut (2:55 < 180 s; 4:00 235–240 s; FalkorDB 200–220 s; full ≥ 300 s); `check-cup-url.mjs cup|cup4|falkor` fails while that cut's end card shows a URL placeholder |
| `styles/` | `fonts.css` (generated by `tools/fetch-fonts.mjs`), `tokens.css` (Munim and Cobnut values), `video.css` (stages, devices, captions, stickers, stamps, and the CSS-motion kill switch) and `chrome.css` (the office, slips, chat and review) |
| `assets/js/fixture.js` | The demo fixture. Every total is computed with the app's own rounding; `tests/fixture.test.mjs` checks the results against hand-worked values. |
| `assets/js/timing-cup.js`, `timing-full.js` | The clock for each cut: scene windows, narration lines (caption and voice text) and events. Scenes read only from here, and so will the audio mix. |
| `assets/js/motion.js` | The motion kit, `window.MK`. Its API is below. |
| `script/cup.md`, `script/full.md` | The narration and captions, line by line, with provisional times. `tests/timing.test.mjs` fails if a clock drifts from its script. |
| `vendor/gsap.min.js` | GSAP 3.14.2, from npm (`gsap` package, standard no-charge licence), so nothing is fetched at render time |

### Rules the build follows

These are from the spec, R65 and hard rules 1 and 5:

- In-app "Sample data" and "Simulated" badges, and the "(synthetic)" and "(simulated)" name suffixes, are not drawn. The film carries one disclosure card instead.
- The narration still says "simulated suppliers".
- A payment is only ever shown as *recorded*.
- The suppliers' bids, the deal review and the purchase order follow the recorded intel run (`services/intel/fixtures/recorded/`). The waste figures follow the seeded Cobnut world (`tools/worldgen/src/worlds/cobnut.ts`). `apps/web/mock-server/staff-data.ts` holds a different, older negotiation, and the film does not use it.
- A narration line that a sticker carries word for word is not repeated in the caption band.

## The motion kit (`window.MK`)

Every helper adds explicit-time tweens to the timeline it is given. Text that changes over time is written by one driver per timeline, from that timeline's own time, so any frame renders on its own and scrubbing back un-types it.

A scene's build follows this order:

1. `MK.ready(build)`
2. `MK.measure(root, …)`, once, before any tween
3. the helpers
4. `MK.finish(tl, sceneDuration)`
5. register `window.__timelines[id]`

| Helper | Signature |
|---|---|
| Setup | `MK.ready(build)` · `MK.measure(el, fn)` · `MK.rect(el, container)` → `{x, y, w, h, cx, cy}` · `MK.onDevice(rect, origin, pose, devScale)` · `MK.rng(seed)` |
| Driver | `MK.drive(tl, fn(t))` · `MK.finish(tl, duration)` |
| Text over time | `MK.count(tl, el, from, to, at, dur, format)` · `MK.type(tl, el, text, at, cps)` → keypress times · `MK.states(tl, el, [[t, text], …])` · `MK.stream(tl, el, parts, at, {thinking = 2.5, cps = 42, think})` → `{start, end, pops}` · `MK.captions(tl, el, [[enter, exit, text], …])` |
| Moves | `MK.move(tl, el, props, at, dur, ease)` (chained `fromTo` from the last state) · `MK.camera(tl, el, {at, zoom, x, y, dur, ease, anchor})` · `MK.press(tl, el, at)` · `MK.show(tl, el, at, dur)` · `MK.hide(tl, el, at, dur)` |
| Emphasis | `MK.sticker(tl, el, enter, exit, {rot})` · `MK.stamp(tl, el, at, {rot})` · `MK.encircle(tl, layer, rect, at, {dur, pad, color, width, seed, turns, tilt})` · `MK.highlight(tl, layer, rect, at, {dur, padX, padY, rot})` |
| Hands | `MK.tap(tl, layer, point, at)` · `MK.cursor(tl, layer, {x, y, state})` → `{go({at, to, dur, ease, state}), state(at, name), click(at, el), hide(at)}` (states `pointer`, `hand`, `text`) |
| Transitions | `MK.wipe(tl, page, at, {mode: "out" \| "in", dur, edge})` (the ledger-page turn) · `MK.toast(tl, el, at, hold)` · `MK.flight(tl, el, from, to, at, {dur, lift, rot, scale})` |

## Provenance

| What | Source | Licence |
|---|---|---|
| Fonts: Bricolage Grotesque, Atkinson Hyperlegible and IBM Plex Mono (Munim), Fraunces and Inter (Cobnut) | Google Fonts, latin and latin-ext subsets, fetched by `tools/fetch-fonts.mjs` on 16 Oct 2026 | SIL Open Font License 1.1 |
| GSAP 3.14.2 | npm `gsap` | GreenSock standard no-charge licence |
| Art, icons and cursors | Authored as SVG code for this film (`assets/art/PROVENANCE.md`) | Original |
| Voice | Local Kokoro-82M (`bf_emma`) through `npx hyperframes tts`, with kokoro-onnx in the project's own `.venv` | Kokoro-82M Apache 2.0; kokoro-onnx MIT |
| Music | `audio/compose-music.mjs`: an original piece at 104 BPM in D major, composed note by note and synthesised in code (FM electric piano, bass, kick, rim, shaker, marimba, Schroeder reverb). No samples, loops or model. | Original |
| Sound effects | `audio/sfx.mjs`: page turn, click, pen, slam, swish, pop, the kitchen chime and a payment recorded, synthesised from noise and sine waves. Each sits 8–12 dB under the music bed (`T.sfx`, checked by `tests/timing.test.mjs`). | Original |

## What is compressed or shown as built

- **Recreated from the product's own screens:** the office page and its desks (`pages/office.tsx`), the investigation (`pages/investigation.tsx`), the storefront page builder (`pages/storefront-builder.tsx`), campaigns (`pages/campaigns.tsx`) and the all-outlets view (`staff/rollup.tsx`), all built by the T-128 lane and uncommitted when the film was made. The Australian outlet is the seeded Laneway Cafe Fitzroy on the AU pack; its board is film chrome around a tax invoice.
- **One day, in order:** the brief at 8:10 am (four orders since the 8 am opening), Zoya's cake at 8:31 (#12), the cake on the kitchen board at 9:45, Imran's walk-in at 9:50 (#24, inside the 08:00–11:00 morning bake), the pickup at 10:00, the investigation at 10:40 (full tour), the purchase order at 11:12, Cares at 8:30 pm and the owner home again at 9:20 pm (41 orders; the week's net sales with Friday in). The negotiation opens on the owner home scrolled to its low-stock card, under the sticky staff bar, as the product scrolls. The developer montage and scene 9b come after 9:20 pm, so they are marked as earlier captures with film chips ("Earlier · Fri 4:05 pm", "Earlier · Fri 4:20 pm", "Melbourne · Fri 1:42 pm") that match their in-app stamps (`FIX.earlier`). `tests/fixture.test.mjs` checks both orders: the day's counts, and the stamps.
- **Behind the scenes, not an app screen:** the agent-to-agent chat and the deal review in scene 7 picture the real backend run. Both are labelled "Behind the scenes".
- **Film annotations, not app elements:**
  - Scene 3: the time chip, the ink circle, the "A usual week: ₹1,512.00" margin note and the turmeric highlighter. The margin note shows the same snapshot cell (`median_minor`) that the source drawer shows.
  - The count-ups are an effect. The app shows each figure once it has loaded.
- **Scene 3 at 8:10 am:** Orders today and Kitchen tickets today show 4, the orders since the 8 am opening.

## Renders and gates (16 Oct 2026, second pass: stamps in film order, the negotiation's opening frame)

| | Cup cut (review render) | Full tour |
|---|---|---|
| File (git-ignored) | `renders/munim-cup-review.mp4`, poster `renders/munim-cup-review-poster.jpg` | `renders/munim-full.mp4`, poster `renders/munim-full-poster.jpg` |
| `tools/check-duration.mjs` | 175.00 s · 1920×1080 · 30/1 fps · AAC: pass | 360.00 s · 1920×1080 · 30/1 fps · AAC: pass |
| Loudness, measured on the mp4 | −14.1 LUFS integrated, −1.3 dBTP | −14.1 LUFS integrated, −1.4 dBTP |
| `hyperframes check` | 0 lint, runtime, layout or motion errors; contrast 9/9 | 0 lint, runtime, layout or motion errors; contrast 32/32 |
| `tools/check-cup-url.mjs` | **fails, as it must:** the end card still shows `CLOUD-RUN-URL-PENDING-FROM-FOUNDER` | (not applicable) |
| Frames read by eye (this pass) | 29 | 48, plus the investigation's stamp cropped at full size |

The Cup file is named `-review` because it is not a release until the Cloud Run URL is in `assets/js/fixture.js`
(`endCard.cup.url`) and the cut is rendered again; `check-cup-url.mjs` then passes.

`freezedetect` (no change for 3 s or more): the Cup cut holds still only on its end card. The full tour has fifteen
narrated holds of 3.0–4.9 s (at 54, 75, 104, 138, 144, 158, 227, 246, 250, 267, 288, 320, 328, 335 and 341 s), each a
screen held while its line is read, plus the end card.

`node --test tests/*.test.mjs`: 22 of 22 pass. The two order tests can fail: the day's counts fail on the old walk-in
(#13 at 8:40 am), and the stamps fail on an 11:40 am investigation or a campaign approved after 8:30 pm.

Nobody has listened to either mix yet: the levels above are measured, not heard.

## Renders and gates (17 Oct 2026, R74: the two final cuts)

| | Cup cut, 4:00 (`cup4`) | FalkorDB cut (`falkor`) |
|---|---|---|
| File (git-ignored) | `renders/munim-cup4-review.mp4`, poster `renders/munim-cup4-review-poster.jpg` | `renders/munim-falkor-review.mp4`, poster `renders/munim-falkor-review-poster.jpg` |
| `tools/check-duration.mjs` | 238.60 s (3:58.6) · 1920×1080 · 30/1 fps · AAC: pass (235–240 s) | 210.00 s (3:30) · 1920×1080 · 30/1 fps · AAC: pass (200–220 s) |
| Loudness, measured on the mp4 | −14.1 LUFS integrated, −1.3 dBTP | −14.1 LUFS integrated, −1.4 dBTP |
| `hyperframes check` | 0 lint, runtime, layout or motion errors; contrast 33/33 | 0 errors; contrast 32/32 |
| `tools/check-cup-url.mjs <cut>` | **fails, as it must:** CLOUD-RUN-URL-PENDING-FROM-FOUNDER | **fails, as it must:** LIVE-URL-PENDING |
| Frames read by eye | 61 (44 from the render, 17 snapshots) | 59 from two renders' sweeps (the last after the graph moved clear of the ledger margin), 27 snapshots |

Both are review renders until the founder's URLs are in `assets/js/fixture.js` (`endCard.cup4.url`, `endCard.falkor.url`).
Both rendered with `--workers 1` and the mix muxed onto the picture, as above. `freezedetect` (3 s or more): the 4:00 cut
holds at 25 s (the all-outlets view, 3.5 s) and 157 s (the agents' chat, 3.2 s), each while its line is read, and on the
end card; an office opening that held 5.4 s now has a slow push-in. The FalkorDB cut holds only on its end card.

`node --test tests/*.test.mjs`: 35 of 35 pass, including: the two new clocks keep every 2:55 line word for word; the graph
scene follows the negotiation and runs 35 s; butter reaches seven dishes at two outlets with the product's figures; the
new end cards and their placeholders. The 2:55 Cup render (`renders/munim-cup-review.mp4`) is the fallback (R74 V-1)
and was not re-rendered; neither was the full tour.
