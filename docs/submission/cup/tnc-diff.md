# Cup T&C re-snapshot and diff — 16 Oct 2026

Snapshot saved as `docs/admin/cup-tnc-snapshot-2026-10-16.md`. Compared against `cup-tnc-snapshot-2026-10-13.md` (the T&C
text) and against the quotes in `docs/research/R4-verification.md` §A (the rules pages, about 9 Oct).

## Verdict

**Nothing changed that touches a hard rule, money, eligibility or the deadline. No stop condition was triggered.**

- The binding T&C Google Doc is **identical to 13 Oct**: 89 non-empty lines, equal line for line after collapsing
  whitespace (checked by script, not by eye). The only substantive change this project has ever recorded in it is the one
  already logged on 13 Oct (roster line, 11 Oct becomes 14 Oct).
- The rules pages on aibuildercup.com agree with every quote in R4. Four small differences are listed below; none is a rule.
- The deadline is unchanged: **Sun 18 Oct 2026, 23:59 IST**. See "The deadline" for what is verified and what is not.

## How this was compared, and the limits

| Item | Method | Limit |
|---|---|---|
| T&C Google Doc | Fetched with `curl`, tags stripped, whitespace collapsed, compared line by line with the 13 Oct block | A second fetch through a summarising reader showed the same roster line, but a summariser is not a text source; only the `curl` text was compared |
| aibuildercup.com `/`, `/themes.html`, `/Faqs.html`, `/rewards.html` | Fetched with `curl`, stripped; compared with the quotes in R4 §A | **No full earlier snapshot exists.** R4 holds quotes, not whole pages, so "same" below means "same as every quote R4 holds". Today's file is the first full baseline |
| Event dates | The call the Hack2skill event page itself makes: `https://hack2skill.com/api/v1/event/aibuildercup2026/event-details`; diffed against `hackathon/ai-builder-cup-2026/raw/event-details.json` (16 Sep) | Not the dashboard |
| Submission form | Not reachable: it lives in the logged-in dashboard ("Forms" section). The field list in `submission-form.md` is inferred from the public pages | The founder must compare it with the real form (checklist step 9) |

## What changed since 13 Oct

| # | Where | Change | Touches | Action |
|---|---|---|---|---|
| 1 | T&C Google Doc | None | — | — |
| 2 | Overview page | Shows "Registration Closed" in several places. The API field `isRegistrationOverride` went from `False` (16 Sep) to `True` | Nothing: registration closed on 11 Oct as stated everywhere | None |
| 3 | Overview page | The timeline lists "Team Formation 1 Sept - 14 Oct, 2026" beside "Registration 1 Sept - 11 Oct, 2026". R4 recorded only the 11 Oct date. The FAQ says the same ("Registration closes on October 11 and team formation closes on October 14") | Roster. Consistent with the 13 Oct T&C change. The roster was submitted (R17) and is closed on both dates | None |
| 4 | Overview page | A "Prompt your jersey" promotion: design a team jersey with Gemini or Imagen, post it on LinkedIn or Instagram with the programme hashtag, paste the post link in the "Forms" section of the dashboard. R4 does not mention it; whether it is new is unknown | Nothing in the T&C or FAQ makes it a submission requirement. It is optional and unrelated to judging | Founder's call (open question 3) |
| 5 | API | Registrations shown 24,952 (10,480 on 16 Sep); impressions 156,658 (59,943) | Context only: the field is larger than the 16 Sep estimate | None |

## Everything that matters for the submission, as it stands on 16 Oct

| Topic | What the pages say | Source | Changed? | What the pack does |
|---|---|---|---|---|
| Deadline | Overview: "Prototype submission deadline Oct 18, 2026". API `submissionEnd` `2026-10-18T18:29:00Z` = 23:59 IST. The T&C states no deadline | Overview, API | No | `checklist.md` targets the evening of 17 Oct and treats 23:59 IST on 18 Oct as the hard stop |
| Evaluation and finale | Evaluation 19 Oct - 6 Nov; finalists announced 7 Nov; finale in Singapore 4 Dec | Overview | No | `DEPLOY.md` and the checklist keep the services running through 6 Nov (4 Dec if shortlisted) |
| Mandatory artifacts | a) working deployed live URL on Cloud Run/GCP/Firebase, b) video demonstration strictly under three minutes, c) public GitHub repository with the source, d) comprehensive deck explaining the architecture and the business case | T&C "Prototype & Deliverables"; FAQ agrees | No | One page per artifact in the checklist. The film is 2:55 |
| Deck format | "a deck/PPT converted into a PDF"; problem, community benefit, feasibility, scalability. No slide limit or template on any public page | Challenges page | No | `deck-outline.md`, 12 slides, exported as PDF |
| Video link | "a public YouTube or Vimeo video or public Google drive link (3 minutes)". The T&C says "strictly under three (3) minutes" and prevails | Challenges page; T&C | No (the "(3 minutes)" wording is old copy) | Target 2:55; public link |
| Language | All submission materials in English | Challenges page | No | All of it is |
| Stack | "built primarily using the Google Cloud tech stack"; must use Gemini or Gemma, or an agentic platform; deployed on Cloud Run or Firebase. A competing cloud is ineligible | T&C; Challenges page; FAQ | No | Cloud Run (five services), Cloud SQL, Identity Platform, Secret Manager, Cloud Storage; Gemini through ADK. Nothing from a rival cloud in the export (its word gate refuses the dev host, the deploy platform and the rival clouds by name) |
| Fresh code | "exclusively of fresh code and original assets created during the official hackathon timeline"; FAQ: nothing started before the programme launch. Submission window opened 7 Sep | T&C; FAQ; API | No | Hard rule 1. Oldest file in this repo is dated 4 Oct (R4 §A). The art is generated fresh |
| Judging | Technical Merit and Gen AI Implementation 40%; Problem Alignment and Impact 25%; Innovation and Creativity 25%; User Experience and Solution Design 10%. Same weights for every theme. Panel announced near the finale | T&C; Challenges page; FAQ | No | Mapped slide by slide in `deck-outline.md` |
| Themes | Six themes; one per team. Retail and Commerce: "Intelligent Customer and Business Experiences" | Challenges page | No | `submission-form.md` names Retail and Commerce (see open question 2) |
| Team | 2 to 4 members; 21+; working professionals, entrepreneurs, startups; a student anywhere in a team disqualifies the whole team, even after the finale; JAPAC residents only; IDs and employment may be verified at any point. Two members travel to the finale | T&C; FAQ; Overview | No | Hard rule 6. Open question 1 |
| One entry | One team, one solution, one theme per person; breaches disqualify every associated entry | T&C; FAQ | No | One entry only. The FalkorDB entry is a separate event |
| IP | Organiser's 6-month right of first refusal on any exclusive licence of the Materials (30 days to accept); organiser may publish the ideas worldwide with no time limit; sponsors get a perpetual, irrevocable, non-exclusive marketing licence; the participant warrants being sole author and owner and that nothing infringes | T&C | No | Accepted by the founder (D-002). The ROFR clarification email is still an unsent draft (`rofr-clarification-email.md`) |
| Prizes | USD 10,000 / 7,000 / 5,000 and four USD 2,000 awards (Best use of Google Cloud AI tools, Most Impactful, Social Choice, Best UI/UX). The page's headline pool reads "USD 0", a page bug (the overview says USD 30,000) | Rewards page; Overview | No | The deck does not quote prizes |
| Cost | Free to register and participate. No cloud credits | T&C; FAQ | No | The founder pays for Google Cloud (hard rule 2); the budget alert is `DEPLOY.md` step 2 |
| Conduct | Participants must not leave the online communication platform and the dashboard once the hackathon begins | T&C | No | Checklist reminder |

## Stale or contradictory copy that remains (unchanged from R4)

- The Challenges page still lists "Healthcare, Education, Sustainability, Accessibility, Social Good" as categories and
  asks the project to align "with the hackathon's focus on social impact". Neither matches the six themes. The form draft
  names the real theme and says why it fits; it does not claim social impact.
- "(3 minutes)" on the Challenges page against "strictly under three (3) minutes" in the T&C. The T&C prevails, so the
  film is 2:55.
- The Rewards page shows "USD 0" for the pool.
- The T&C uses "Organiser" and "Organizer" and an undefined "Company".

## The deadline

- **Verified today:** the Overview page says "Oct 18, 2026" with no time. The API's `submissionEnd` reads
  `2026-10-18T18:29:00.000Z` on the 16 Oct fetch and was the same on 16 Sep. That is 23:59 IST on 18 Oct.
- **Not verified:** the T&C is silent, so the only source for the time of day is the API. The dashboard's own countdown or
  form may use another cut-off, and no public page says whether the form closes to edits at the deadline.
- **Rule for the founder:** read the countdown on the dashboard's "Forms" section on 17 Oct and submit that evening. Treat
  the 18 Oct 23:59 IST as a hard stop that is not to be tested.

## Open points the pages leave to the founder

1. **Editing after submitting.** Not stated anywhere. Assume a submission cannot be edited and finish everything first.
2. **Repository licence.** No page requires one. `README.md` says "All rights reserved". A permissive licence would be
   non-exclusive and would not trigger the ROFR (R4 Q1); this is the founder's choice and is unchanged.
3. **Libraries and "fresh code".** Read literally, "exclusively of fresh code" would bar npm and pip packages. The common
   reading allows libraries but not earlier code or assets. No clarification exists (R4, UNVERIFIED).
4. **AI-assisted code.** No rule either way. The T&C's "sole author" warranty is the one clause that touches it.
5. **Where the live URL is entered.** The public pages do not say; the dashboard "Forms" section is the likely place.

## Re-run before submitting

Re-fetch on 18 Oct (planned time: morning IST) and compare with `docs/admin/cup-tnc-snapshot-2026-10-16.md`. The T&C may
be amended "without prior notification", and it was amended silently once (gotcha 19). Anything new that touches the
deadline, eligibility, video length, the stack or IP goes to the founder before the submission, not after.

The method is the one used on 16 Oct: fetch with `curl`, drop scripts and tags, collapse whitespace, drop the repeated
navigation and banner lines of the microsite pages, then compare line by line with the fenced blocks in the snapshot. Run
from the repository root; it prints `same` or the changed lines for each page, and the event dates.

```bash
python3 - <<'PY'
import difflib, html, json, re, subprocess, urllib.request

UA = {"User-Agent": "Mozilla/5.0"}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read().decode("utf-8", "replace")
BOILER = {"If you had completed registration, click here", "to review the status of your application and access to the dashboard.",
          "›", "Select Language", "English", "Indonesian", "Simplified Chinese", "Korean", "Japanese", "✓", "Email copied", "OR EMAIL US AT"}
NAV = ["Overview", "Challenges & Requirements", "Rewards & Prizes", "FAQs"]

def text(raw, microsite):
    raw = re.sub(r"(?is)<(script|style|noscript|svg).*?</\1>", "", raw)
    ends = "p|li|h[1-6]|div|tr|section|a|button|span" if microsite else "p|li|h[1-6]|div|tr"   # as on 16 Oct
    raw = re.sub(rf"(?i)</({ends})>|<br\s*/?>", "\n", raw)
    lines = [re.sub(r"\s+", " ", l).strip() for l in html.unescape(re.sub(r"<[^>]+>", "", raw)).split("\n")]
    out, prev = [], None
    for l in lines:                      # drop empty lines and immediate repeats
        if l and l != prev: out.append(l)
        prev = l
    if not microsite: return out
    out = [l for l in out if l not in BOILER]
    res, i, seen = [], 0, 0              # keep the first navigation block only
    while i < len(out):
        if out[i:i + 4] == NAV:
            seen += 1
            if seen > 1: i += 4; continue
        res.append(out[i]); i += 1
    return [l for k, l in enumerate(res) if not (l == "Registration Closed" and k and res[k - 1] == l)]

snap = open("docs/admin/cup-tnc-snapshot-2026-10-16.md").read().split("```")
blocks = [snap[k] for k in range(1, len(snap), 2)]   # 1: T&C, 2: overview, 3: themes, 4: rewards, 5: FAQs
pages = [("T&C", "https://docs.google.com/document/d/e/2PACX-1vRm7ChZ6Ij9fG7uFDkxzUMpwgVeBmnQ6cMDnAIEEX84AiLBOOQ9cYbl3S5OzFBbcVb8TF55s-eVpiXb/pub", False),
         ("overview", "https://aibuildercup.com/", True), ("themes", "https://aibuildercup.com/themes.html", True),
         ("rewards", "https://aibuildercup.com/rewards.html", True), ("faqs", "https://aibuildercup.com/Faqs.html", True)]
norm = lambda b: [re.sub(r"\s+", " ", l).strip() for l in b.split("\n") if l.strip()]
for (name, url, micro), old in zip(pages, blocks):
    new, old = text(get(url), micro), norm(old)
    d = [l for l in difflib.unified_diff(old, new, "16 Oct", "now", lineterm="", n=0) if not l.startswith(("---", "+++", "@@"))]
    print(f"{name}: {'same' if not d else str(len(d)) + ' changed line(s)'}")
    for l in d[:40]: print("   ", l[:200])
ev = json.loads(get("https://hack2skill.com/api/v1/event/aibuildercup2026/event-details"))["data"]
print({k: ev.get(k) for k in ("registrationEnd", "submissionEnd", "isRegistrationOverride", "isDashboardEnabled")})
PY
```

Expected today: every page `same`; `submissionEnd` `2026-10-18T18:29:00.000Z`. The pages' headline counters (registrations and
impressions) are not compared. A page printed as changed is the thing to read first; a page the script could not fetch is not
"same".
