# C6 — the Cup submission pack (plan 07 C6, Track S; light lane)

Read first: `CLAUDE.md` (hard rules 1–7; simulated means labelled), `docs/admin/cup-tnc-snapshot-2026-10-13.md` (the
rules and what a submission must contain), `scripts/export-cup/root/README.md` and `ARCHITECTURE.md` (the judge-facing
story, committed ff4a397), `video/munim-launch/script/cup.md` (the film's Cup cut, 2:55 — the video script already
exists), `infra/gcp/README.md` (the GCP runbook).

## Deliverables (`docs/submission/cup/` here; nothing in the export unless named)
1. **T&C re-snapshot and diff (gotcha 19):** fetch the live Cup T&C / rules / submission pages (the URLs in the 13 Oct
   snapshot), save `docs/admin/cup-tnc-snapshot-2026-10-16.md` in the same format, and write `tnc-diff.md`: every change
   since 13 Oct, and anything that touches the deadline, video length, repo rules, eligibility, judging criteria or IP.
   **If anything changed that touches a hard rule, money or eligibility, stop and report it first.**
2. **`submission-form.md`:** every field the submission form asks for (from the T&C pages), drafted: title, one-line
   pitch, short and long description, problem, solution, how Google Cloud and Gemini are used (only what the code does —
   Cloud Run, Cloud SQL, Secret Manager, Identity Platform, GCS as `infra/gcp/` builds it; Gemini via ADK), the AI layer,
   the One Guarantee, what is simulated (suppliers and recipients simulated, synthetic data, payments recorded not
   processed), links (placeholders `CLOUD-RUN-URL`, `REPO-URL`, `VIDEO-URL`, `DECK-URL`), team. Character limits
   respected where the rules state them.
3. **`deck-outline.md`:** 10–12 slides — problem, who it is for, the product (the day at Cobnut), the One Guarantee,
   architecture, the AI layer (specialists, cite-or-abstain, approvals), supplier negotiation (simulated, A2A), Cares,
   Google Cloud, what is measured on synthetic data, roadmap, team. Per slide: title, 3–5 bullets, the visual (a named
   film frame or a diagram from ARCHITECTURE.md), speaker note. Judging criteria from the T&C mapped to slides.
4. **`DEPLOY.md` (exported):** write `scripts/export-cup/root/DEPLOY.md` — a numbered checklist the founder follows
   on a fresh Google Cloud project, pointing to `infra/gcp/README.md` for each step's commands (do not edit that file;
   the clean-up lane owns it until it lands — read it as it is now and re-read before you finish). Include the budget
   alert, the seed, the smoke checks, and how to get the Cloud Run URL for the film's end card and the form.
5. **`checklist.md`:** the founder's submission-day list in order, with what is ready and what only the founder can do
   (create the GitHub repo, push, deploy, record/upload the video, the deck, submit), and the deadline in IST.

## Rules
Light lane: no builds, test suites or `make check`. Gate: `python3 scripts/export-cup/test_rules.py` green and 0
forbidden words in `scripts/export-cup/root/DEPLOY.md` (grep the FORBIDDEN list in `scripts/export-cup/rules.py`).
Plain, confident English; every claim true of the code. No internal ledger ids in anything public. Never open `.env`; no
commits, no staging; no AI attribution. Report: files, the T&C diff summary, open questions for the founder.
