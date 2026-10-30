"""The Cup export's rules (T-123), shared by the tree export and the history filter (scripts/export-cup.sh).

keep(path)      which repo paths the export carries (R54 P-4: only the code the live URL runs, plus a README and one
                architecture doc). Every exclusion inside an included directory carries its reason.
replace(data)   the reviewed text map (replace-text.txt), applied to every exported blob, current and historical, exactly
                as `git filter-repo --replace-text` applies it (binary blobs untouched).
subject(msg)    a commit message reduced to one plain line (R60).
AUTHOR          the one identity every exported commit carries, author and committer (R60).
FORBIDDEN       what no path, blob, message or identity of the export may contain (the history-wide gate).
"""

from __future__ import annotations

import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

# What the deployed services are built from. The packages are the workspace dependency closure of apps/web,
# services/core-api and services/core-worker (export.py `closure` checks this list against pnpm's own graph).
INCLUDE = [
    "apps/web/",
    "services/core-api/",
    "services/core-worker/",
    "services/intel/",
    "services/suppliers-sim/",
    "packages/config/",
    "packages/contracts/",
    "packages/core-domain/",
    "packages/sdk/",
    "db/",
    "tools/worldgen/",
    "adapters/gcp/",
    "infra/gcp/",
    "scripts/deploy-gcp.sh",
    "scripts/dev/intel-stub.ts",  # the recorded intel stand-in the exported tests start
    "scripts/dev/package.json",  # its "type": "module"
    "package.json",
    "tsconfig.base.json",
    "tsconfig.depcruise.json",
    ".dependency-cruiser.cjs",
    "pyproject.toml",
    "uv.lock",
]

# (pattern, reason). A path under INCLUDE that matches one of these is left out.
EXCLUDE: list[tuple[str, str]] = [
    # What the storefront's own 12 commits held (re-rooted under apps/web/ by the history filter's first pass).
    (r"^apps/web/\.claude/", "assistant tooling from the storefront's own repo"),
    (r"^apps/web/(AGENTS|CLAUDE)\.md$", "assistant instructions from the storefront's own repo"),
    (r"^apps/web/\.vercel/", "a deploy-platform link folder"),
    (r"^apps/web/package-lock\.json$", "the storefront's npm lockfile; the workspace's pnpm lockfile replaces it"),
    (r"^apps/web/docs/", "the storefront's old screenshots"),
    (r"^apps/web/public/", "create-next-app template images (third-party art)"),
    # Other worlds (R54 P-4: the Cobnut world only).
    (r"^tools/worldgen/src/worlds/(au_outlet|cloud_kitchen|restaurant_group|store)\.ts$", "an evaluation world, not Cobnut"),
    (r"^tools/worldgen/(answer-key|verify)/", "the evaluation worlds' answer keys and their recompute"),
    (r"^tools/worldgen/demo\.ts$", "seeds every evaluation world at once"),
    (r"\.(orig|rej|bak)$|~$", "an editor or merge backup file"),
    # Gate harnesses of this repo's make targets: they copy this repo's tree and run its Makefile.
    (r"(^|/)[^/]*redproof[^/]*\.sh$", "a red-proof harness for this repo's make targets"),
    # Tests of this repo's development set-up.
    (r"^packages/config/test/dev-env\.test\.ts$", "tests the dev mapping under adapters/dev, which is not exported"),
    (r"^services/core-api/test/seed-minter\.test\.ts$", "drives this repo's Makefile and its dev token minter"),
    (r"^db/tests/static-gate(\.test)?\.ts$", "scans the migrations for the dev database host's own constructs"),
    # Tests built on what the export leaves out (the evaluation worlds, their answer keys and recompute).
    (r"^db/tests/templates-worlds\.ts$", "seeds the restaurant_group and store worlds"),
    (r"^services/core-api/test/investigations-plan-world\.test\.ts$", "seeds the restaurant_group world"),
    (r"^tools/worldgen/test/(budget-draft-id|clock|determinism)\.test\.ts$", "runs an evaluation world (store, restaurant_group, all of them)"),
    (r"^tools/worldgen/test/(coverage|pending-inputs|verify-cache|worlds)\.test\.ts$", "checks the evaluation worlds against their answer keys and recompute"),
    (r"^tools/worldgen/test/cli\.test\.ts$", "drives the evaluation worlds and verify/ through the CLI"),
    (r"^tools/worldgen/test/no-sql(\.test)?\.ts$", "scans verify/ (the evaluation worlds' recompute) as well as src/"),
    # Tests that check the code against the planning documents (docs/plan/packs, the ADRs), which the export leaves out.
    (r"^packages/contracts/test/(specialists|ontology)\.test\.ts$", "parses the specialists' pack documents under docs/plan"),
    (r"^db/tests/(mc1bc|templates)\.test\.ts$", "parses the pack documents' template specs under docs/plan"),
    (r"^services/intel/tests/packs/(compliance/test_compliance|customers/test_customers)_offline\.py$", "parses the pack documents under docs/plan"),
    (r"^services/intel/tests/live/test_smoke_live\.py$", "checks the live smoke against an ADR under docs/plan"),
    # intel's end-to-end suites seed the evaluation worlds through a real core-api and score them against their answer keys.
    (r"^services/intel/tests/.+_e2e\.py$", "seeds the evaluation worlds and reads their answer keys"),
    (r"^services/intel/tests/packs/cares/test_cares_intel\.py$", "reads the store world's answer key"),
    (r"^services/intel/tests/evals/", "scores runs against the evaluation set under evals/, which the export leaves out"),
    (r"^services/core-api/(test/investigations\.test\.ts|src/modules/inbox/ranking\.test\.ts)$", "reads the restaurant_group world's answer key"),
    (r"^services/core-api/test/read-routes\.test\.ts$", "diffs the routes against a planning document under docs/plan"),
    (r"^services/core-api/test/routes-contract\.test\.ts$", "its census counts response parses in test files left out above (read-routes, investigations)"),
    # The curated graph question's end-to-end test and its recorded fixtures run on core's graph adapter, which the Cup leaves out.
    (r"^services/intel/tests/graph/(butter_stack\.mts|test_butter_question_e2e\.py|fixtures/butter/)", "drives core's graph adapter, which the Cup leaves out"),
]

_EXCLUDE = [(re.compile(p), why) for p, why in EXCLUDE]


def excluded_by(path: str) -> str | None:
    for rx, why in _EXCLUDE:
        if rx.search(path):
            return why
    return None


def included(path: str) -> bool:
    return any(path == i or (i.endswith("/") and path.startswith(i)) for i in INCLUDE)


def keep(path: str) -> bool:
    return included(path) and excluded_by(path) is None


# ---- the text map ------------------------------------------------------------------------------------------------
def _load_map() -> tuple[list[tuple[bytes, bytes]], list[tuple[re.Pattern[bytes], bytes]]]:
    literals: list[tuple[bytes, bytes]] = []
    regexes: list[tuple[re.Pattern[bytes], bytes]] = []
    for line in (HERE / "replace-text.txt").read_bytes().splitlines():
        if not line.strip():
            continue
        old, new = line.rsplit(b"==>", 1)
        if old.startswith(b"regex:"):
            regexes.append((re.compile(old[len(b"regex:"):]), new))
        else:
            literals.append((old, new))
    return literals, regexes


LITERALS, REGEXES = _load_map()


def replace(data: bytes) -> bytes:
    """Exactly `git filter-repo --replace-text`: a binary blob (a NUL in its first 8 KiB) is left alone; otherwise every
    literal rule applies in file order, then every regex rule in file order."""
    if b"\0" in data[:8192]:
        return data
    for old, new in LITERALS:
        data = data.replace(old, new)
    for rx, new in REGEXES:
        data = rx.sub(new, data)
    return data


# ---- commit messages (R60: one plain line, from the subject) --------------------------------------------------------
# A subject's own label ("T-117 + T-116: ", "W3.2 wiring (i-2): ", "Handoff: ") is dropped when it names a ticket, a wave
# or a process step; a plain component label ("intel: ", "feat: ") stays.
_LABEL = re.compile(r"^([^:]{1,70}):\s+")
_INTERNAL_LABEL = re.compile(r"[0-9]|\b(?:handoff|board|journal|decisions|briefs?|gotcha|lane|wave|wip|review|merge|wiring|"
                             r"integration|consolidation|close|spine|fix|cycles?|pack|ledger|council|"
                             r"feat|chore|style|docs|refactor|test|perf)\b", re.I)
_IDS = [
    re.compile(r"\(?\b(?:[TMW]-[0-9A-Z]{1,4}[a-z]?|R[0-9]{1,2}[a-z]?(?: [A-Z]{1,2}-?[0-9]{1,2}[a-z]?)?|[A-Z]-[0-9]{1,2}[a-z]?)"
               r"(?:(?:, | \+ | and | / )(?:[TMW]-[0-9A-Z]{1,4}[a-z]?|R[0-9]{1,2}[a-z]?|[A-Z]-[0-9]{1,2}[a-z]?))*\b\)?"),
    re.compile(r"\((?:lane build|pre-review|lane|orchestrator|founder answer|handoff|ledger|council|shipyard)[^)]*\)", re.I),
    re.compile(r"\b(?:the )?(?:lane|orchestrator|council|founder'?s? answer|handoff|ledger|shipyard)s?\b", re.I),
    re.compile(r"\bW[0-9](?:\.[0-9])?\b"),  # wave ids
]
_CUT = (" — ", " – ", "; ")
_MAX = 120


def _clean(text: str) -> str:
    for rx in _IDS:
        text = rx.sub("", text)
    return re.sub(r"\s{2,}", " ", text).strip(" ,;:+-–—·")


def subject(msg: bytes, paths: list[bytes]) -> bytes:
    """The one line the export keeps for a commit: its subject, with the label, ids, process words and anything the map
    rewords removed, cut at the first em dash or semicolon and at 120 characters (on a word). Bodies are dropped."""
    line = replace(msg).decode("utf8", "replace").strip().split("\n", 1)[0]
    m = _LABEL.match(line)
    if m and _INTERNAL_LABEL.search(m.group(1)):
        line = line[m.end():]
    head, tail = line, ""
    for sep in _CUT:
        if sep in head:
            head, rest = head.split(sep, 1)
            tail = rest
    if tail and (len(_clean(head)) < 12 or " " not in _clean(head)):  # "db — migrations …": the label alone says nothing
        for sep in _CUT:
            tail = tail.split(sep, 1)[0]
        head = f"{_clean(head)}: {tail}"
    line = head
    for rx in _IDS:
        line = rx.sub("", line)
    line = re.sub(r"\(\s*[,;+]?\s*\)", "", line)
    line = re.sub(r"(?<=\s)[-.–·/+]+(?=[\s,;]|$)", "", line)  # what an id leaves behind, e.g. "W2-R1..R9" → "-.."
    line = re.sub(r"\s+([,.;:)])", r"\1", re.sub(r"\s{2,}", " ", line)).strip(" ,;:+-–—·")
    line = re.sub(r"\bthe the\b", "the", line)
    if len(line) > _MAX:
        line = line[:_MAX].rsplit(" ", 1)[0].rstrip(" ,;:(")
    while line.count("(") > line.count(")"):  # a cut inside a parenthesis drops it
        line = line[: line.rfind("(")].rstrip(" ,;:")
    if len(line) < 8:
        tops = sorted({"/".join(p.decode().split("/")[:2]) for p in paths}) or ["the repository"]
        line = "Update " + ", ".join(tops[:3]) + (" and more" if len(tops) > 3 else "")
    return (line[:1].upper() + line[1:]).encode() + b"\n"


# One identity on every exported commit, author and committer (R60): the founder's, as this repo records it.
AUTHOR = (b"Satvik Sawhney", b"satvik.sawhney2005@gmail.com")


# ---- the gate ------------------------------------------------------------------------------------------------------
FORBIDDEN = re.compile(
    rb"supabase|vercel|\baws\b|claude|anthropic|juspay|snacky"
    rb"|manjeetpathak"  # the teammate's e-mail; the founder's is the one identity every commit carries (R60)
    # No mention of an AI coding tool or of how the code was made. `.claude/` is caught by `claude`. Product words stay
    # legal: "AI", "agent", "subagent" (an ADK trace kind), "openai" (a configured model provider), "regenerated with".
    rb"|codex|copilot|chatgpt|co-authored-by|\bgenerated with\b|\b(?:ai|llm)[- ](?:assisted|generated)\b"
    rb"|coding[- ](?:assistant|agent)|shipyard"
    rb"|(?<![\w.-])agents\.md(?![\w-])"  # an AGENTS.md file or mention; docs/ai-agents.md is not one
    rb"|falkor",  # the graph database of another build (R72): main has none, the map rewords the historical mentions
    re.I,
)

# Secret shapes. The public mock storefront key (sfk_mock_...) is public by design; SECRET_ALLOW lists the synthetic
# values tests plant on purpose, each read and confirmed synthetic (T-123 report).
_SECRET_SHAPES = re.compile(
    rb"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"
    rb"|\bsk-[A-Za-z0-9_-]{16,}"
    rb"|AIza[0-9A-Za-z_-]{30,}"
    rb"|\bgh[pousr]_[A-Za-z0-9]{30,}"
    rb"|-----BEGIN [A-Z ]*PRIVATE KEY-----(?:\\n|\n)?[A-Za-z0-9+/=]{0,64}"
    rb"|\bsfk_(?!mock_)[A-Za-z0-9_]{8,}"
    # C1 S3-18: the provider keys this repo's .env.example names, an OAuth client secret, a cloud access key id, and a
    # database URL with a literal password (8+ URL-safe characters: a `${template}` or a one-letter placeholder is not one).
    rb"|\bnvapi-[A-Za-z0-9_-]{20,}"
    rb"|\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}"
    rb"|\bGOCSPX-[A-Za-z0-9_-]{20,}"
    rb"|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"
    rb"|\bpostgres(?:ql)?://[A-Za-z0-9._%-]+:[A-Za-z0-9._~%!*+=-]{8,}@"
)
SECRET_ALLOW = {
    b"sfk_wrong_key_000000",  # apps/web smoke: a deliberately wrong storefront key
    b"sfk_synthetic_key_value_0123456789abcdef",  # contracts sample
    b"sfk_not_a_real_key_000000000000000000",  # core-api cors test
    b"sfk_not_a_real_key_0000000000000000",  # core-api storefront test
    b"eyJhbGciOiJFZERTQSJ9.eyJydW5faWQiOiJ4In0.c2lnbmF0dXJl",  # contracts samples: {"alg":"EdDSA"}.{"run_id":"x"}."signature"
    b"sk-live-NOT-A-REAL-KEY-7731",  # intel ingest test: a planted key the redaction must remove
    b"-----BEGIN PRIVATE KEY-----\\nMC4CAQAwBQYDK2VwBCIEIPl4ntedPrivKeyBodyLine0000000000000000",  # config test: planted
}


def secret_hits(data: bytes) -> list[bytes]:
    return [m.group(0) for m in _SECRET_SHAPES.finditer(data) if m.group(0) not in SECRET_ALLOW]
