# Submission-day checklist — AI Builder Cup JAPAC

**Deadline: Sunday 18 Oct 2026, 23:59 IST** (the event API's `submissionEnd` is `2026-10-18T18:29:00Z`, re-read on 16 Oct;
the T&C states no deadline, so read the countdown on the dashboard's "Forms" section too). Plan to **submit on Saturday
17 Oct in the evening** and use Sunday only for repairs. Today is Friday 16 Oct.

Legend: **F** only the founder can do it. **C** Claude can do it on the founder's word. **Ready** it exists now.

## What is ready, and what is not

| Item | State |
|---|---|
| Cup film script, 2:55, and a review render with a placeholder URL on the end card | Ready (`video/munim-launch/`) |
| README, ARCHITECTURE and `docs/` for the export; deploy runbook | Ready (`scripts/export-cup/root/`, `infra/gcp/README.md`) |
| `DEPLOY.md` (checklist for the runbook) | Ready; **not yet committed**, so not yet in any export |
| Submission form text | Ready (`submission-form.md`); placeholders to fill; the real form field list is unseen |
| Deck outline | Ready (`deck-outline.md`); **the deck itself is not built** |
| T&C re-snapshot and diff | Done 16 Oct; repeat on 18 Oct morning |
| Google Cloud project, deploy | **Not started. The runbook has never been run against a real project.** This is the critical path |
| Final film with the real URL | Waiting on the URL |
| GitHub repo | Waiting on the founder |
| Submission | Waiting on everything above |

## The critical path

deploy → URL → film end card → render → duration check → public upload → form. The deck and the repo run beside it.
If the deploy is not green by Saturday midday, tell Claude then; a deploy fixed at 22:00 on Sunday leaves no room.

## In order

### Friday 16 Oct (tonight): decisions, then start the deploy

1. **F — Answer the open questions** (end of this file). Two matter tonight: question 1 (team eligibility) and question 4
   (what the film shows). Neither needs more than a minute.
2. **F — Create or pick the Google Cloud project, link billing, choose the budget amount.** `DEPLOY.md` steps 1 and 2.
   Do the budget alert before anything else that costs money.
3. **C — Land everything that goes in the export.** The export reads a commit, never the working tree. Needed in
   commits first: `scripts/export-cup/root/DEPLOY.md`, the clean-up lane's changes (including `infra/gcp/README.md`), and
   anything else pending. The orchestrator stages by name and reads the cached diff before committing.
4. **F — Start the deploy** (`DEPLOY.md` steps 3 to 6). Cloud Build and Cloud SQL creation take minutes; start them tonight.

### Saturday 17 Oct

5. **F — Finish the deploy and the smoke checks** (`DEPLOY.md` steps 7 to 13). Keep a screenshot of each smoke check;
   they are also your evidence if a judge's page misbehaves. If anything in `infra/gcp/` had to change to work, tell
   Claude: the form and the deck describe that folder (`submission-form.md` §8, deck slide 9) and must match it.
6. **F — Give Claude the Cloud Run web URL** (`DEPLOY.md` step 15): `https://munim-web-<project number>.asia-south1.run.app`.
7. **C — Put the URL into the film and render it.** In `video/munim-launch/`: replace `CLOUD-RUN-URL-PENDING-FROM-FOUNDER`
   in `assets/js/fixture.js` (the `cup:` entry), then the render steps in the film's README. Gates, all must pass:
   `node tools/check-cup-url.mjs`, `node tools/check-duration.mjs cup renders/<file>.mp4` (under 180.0 s, 1920×1080), and
   `ffprobe -v error -show_entries format=duration -of csv=p=0 renders/<file>.mp4` (expect about 175 s). Watch the whole
   file once with sound: the disclosure card ("Synthetic business · simulated suppliers and recipients · payments recorded,
   not processed") must be on screen and no hosting name other than Google Cloud may appear.
8. **F — Upload the film and make it public.** YouTube or Vimeo (public, or at least visible to anyone with the link) or a
   public Google Drive link. Open the link in a private window while signed out; check the host reports a length under
   3:00. Keep the link as `VIDEO-URL`.
9. **F (C drafts) — Build the deck from `deck-outline.md`** and export it as a **PDF**. Put it where anyone can open it (a
   public Drive link, or in the repository) as `DECK-URL`. Before exporting, re-run the export's checks (step 10) and keep
   only the slide-10 numbers that the output shows.
10. **C — Make the export.** With step 3 committed: `scripts/dev/heavy.sh make export-cup EXPORT_ARGS="--history --check"`.
    Gates: forbidden words 0, secret shapes 0, `adapters/dev` imports 0, the history gate, and the export building and
    testing on its own. `--history` needs `git-filter-repo` (`brew install git-filter-repo`). Keep the output. The result is the sibling folder `food-ops-cup`, with no remote.
11. **F — Create the public GitHub repository on your own account** (no Google or Hack2skill collaborators) and say
    "push". **C — push the export** on that word and tag a release (R4 recommended tagging at the deadline so later commits
    do not read as post-deadline work). Then open the repository **signed out**: the README renders, the five-minute tour
    works, `DEPLOY.md` is there, one author on every commit, no secret files. Keep the URL as `REPO-URL`.
12. **F — Fill the placeholders** in `submission-form.md` (`CLOUD-RUN-URL`, `REPO-URL`, `VIDEO-URL`, `DECK-URL`,
    `TEAM-NAME`, `TEAMMATE-FULL-NAME`) and read the box "Check before pasting".
13. **F — Submit** in the dashboard's "Forms" section (see "Submitting" below). Do it Saturday evening, not Sunday night.

### Sunday 18 Oct

14. **C — Re-fetch the T&C and the rules pages and diff them** against `cup-tnc-snapshot-2026-10-16.md` (the script,
    with its expected output, is at the end of `tnc-diff.md`). Anything new that touches the deadline, eligibility, video length, the stack or IP
    goes to the founder before anything else.
15. **F — Check the submission from outside:** open the live URL, the video link, the deck link and the repository, each in
    a private window, on a phone.
16. **Keep the services running.** Do not park the deployment after submitting. Evaluation is 19 Oct to 6 Nov;
    finalists are announced 7 Nov; the finale is 4 Dec (`DEPLOY.md` step 14).

## Submitting (step 13)

- Open the dashboard from the Overview page's "click here" link for registered participants; do not leave the dashboard or
  the team's chat group while the event runs (T&C, Rules of Conduct).
- Compare the form's fields with `submission-form.md` before pasting; the field list there is inferred. Move blocks, keep
  the wording. No page says whether a submission can be edited after it is sent: assume it cannot.
- Name the theme **Retail & Commerce** and check it matches the dashboard.
- Give all four artifacts: the live URL, the video link, the repository, the deck PDF. English only.
- Screenshot the confirmation and keep any confirmation email. If the form has a deadline countdown, photograph it.
- The optional "Prompt your jersey" promotion is not a submission requirement and is not drafted (open question 3).

## After submitting

- Stay in the programme's Discord/Slack/Telegram channel and on the dashboard; the T&C allow disqualification for leaving.
- Watch the registered email on 7 Nov. If shortlisted: only two members may travel; about four weeks' notice; the visa is the
  attendee's responsibility and flights are not transferable (T&C and FAQ).
- Cost: set a calendar reminder for 7 Nov to decide about parking (`DEPLOY.md` step 16).

## Open questions for the founder

Decided 16 Oct (founder): both members confirmed eligible; theme Retail & Commerce; the film is submitted as it is,
with nothing said about how it was made; no sentence about tooling in the form. Still open:

1. **"Prompt your jersey".** An optional promotion on the Overview page (a Gemini or Imagen jersey design posted on LinkedIn
   or Instagram, link pasted in the dashboard). It is not part of the T&C's submission artifacts. Do you want to do it?
2. **Repository licence.** The README says "All rights reserved". No page requires a licence. Unchanged unless you say.
3. **ROFR email.** `docs/admin/rofr-clarification-email.md` is still an unsent draft. The right of first refusal and the
   marketing licence are accepted (D-002); sending it is optional and would not be answered before the deadline.
4. **Budget.** The amount for the alert, and whether you will keep the services up through 6 Nov (and 4 Dec if shortlisted).
   The runbook's cost notes are estimates, not measurements.
