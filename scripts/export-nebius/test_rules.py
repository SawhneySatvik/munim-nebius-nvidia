"""Gates for the Nebius export's rules: what is kept and left out (rules.keep), forbidden words in paths and files
(rules.FORBIDDEN, The Snacky Shack's among them), the reviewed text map and file map (rules.replace, rules.file_map) and the source
gate's reviews (export.unreviewed), secret shapes (rules.secret_hits), the overlay's own words (rules.OVERLAY_WORDS), and the licence
and links gates (export.licence, export.links), each with a case that must fail. Standard library only; scripts/export-nebius.sh
runs it before every export:
  python3 scripts/export-nebius/test_rules.py   (exit 1 on any failure)

Each planted secret is synthetic and built from parts at run time, so this file never holds a whole secret shape itself; the
Shack's words in the cases are built from parts the same way."""

from __future__ import annotations

import contextlib
import io
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export  # noqa: E402

rules = export.rules
SN, SH, GE = "Sna" + "cky", "Sha" + "ck", "Gee" + "long"
SN_ID = SN.lower() + "_" + SH.lower()  # its world's id

KEPT = [
    "services/intel/munim_intel/llm/providers.py", "services/intel/munim_intel/ingest/quarantine.py", "services/intel/tests/test_openai_request.py",
    "services/intel/tests/test_hero_chain.py", "services/intel/tests/fixtures/nemotron/router.json", "services/intel/tests/fixtures/record_nemotron.py",
    "services/intel/tests/fixtures/invoice/riverbank-sample.png", "services/intel/tests/graph/test_graph.py",
    "services/intel/tests/graph/test_butter_question_e2e.py", "services/core-api/src/internal/graph/postgres/index.ts",
    "services/core-api/src/server.ts", "services/core-worker/src/main.ts", "services/suppliers-sim/suppliers_sim/agent.py",
    "apps/web/lib/businesses/cobnut/profile.ts", "apps/web/lib/businesses/blr_kitchen/profile.ts", "apps/web/lib/businesses/index.ts",
    "apps/web/tests/businesses.test.ts", "apps/web/scripts/bundle-isolation.sh", "apps/web/tests/models.test.ts", "apps/web/next.config.ts",
    "tools/worldgen/src/worlds/cobnut.ts", "tools/worldgen/src/worlds/blr_kitchen.ts", "tools/worldgen/src/run.ts", "tools/worldgen/src/cli.ts",
    "tools/worldgen/answer-key/demo/blr_kitchen.json", "tools/worldgen/verify/run.ts", "tools/worldgen/verify/recompute.ts",
    "tools/worldgen/test/blr_kitchen.test.ts", "tools/worldgen/test/no-sql.test.ts", "tools/worldgen/test/cli-messages.test.ts",
    "db/migrations/0036_ev3_nebius_provider.sql", "db/tests/providers-0036.test.ts", "adapters/falkordb/src/index.ts",
    "adapters/dev/idp-local/mint-seed-tokens.ts", "adapters/gcp/idp-identity-platform/demo-accounts.ts", "deploy/vercel/build.mjs",
    "scripts/dev/local-db.ts", "scripts/dev/local-operator.ts", "scripts/dev/nemotron-roles.ts", "scripts/dev/nemotron-smoke.ts",
    "scripts/dev/intel-stub.ts", "scripts/dev/preflight.ts", "scripts/dev/restart-svc.sh", ".env.example", "uv.lock", "package.json",
]
LEFT_OUT = [
    # The Snacky Shack.
    f"apps/web/lib/businesses/{SN_ID}/profile.ts", f"apps/web/lib/businesses/{SN_ID}/art.tsx", f"apps/web/lib/businesses/{SN_ID}/theme.css",
    "apps/web/tests/business-au.test.ts", f"tools/worldgen/src/worlds/{SN_ID}.ts", f"tools/worldgen/answer-key/demo/{SN_ID}.json",
    f"tools/worldgen/test/{SN_ID}.test.ts",
    # Other events' material and this repo's process.
    "scripts/export-falkor/rules.py", "scripts/export-falkor/root/README.md", "scripts/export-falkor.sh", "scripts/export-cup/rules.py",
    "scripts/export-cup.sh", "scripts/export-nebius/rules.py", "scripts/export-nebius/root/README.md", "scripts/export-nebius.sh",
    "docs/nebius/FEEDBACK-DRAFT.md", "docs/plan/08-events-build.md", "docs/plan/EVENTS-STATUS.md", "docs/plan/lanes/P6.md",
    "docs/plan/lanes/A.report.md", "docs/plan/lanes/pending/test_nebius_host.py.pending", "docs/plan/falkordb/design.md",
    "docs/DECISIONS.md", "docs/admin/x.md", "docs/handoff/x.md", "docs/research/x.md", "docs/specs/x.md", "docs/superpowers/x.md",
    "docs/shared/overview.md", "CLAUDE.md", "HANDOFF.md", "INITIAL-PROMPT.md", "SHIPYARD-PROMPT.md", "README.md", "Makefile",
    "video/munim-launch/index.html", "apps/site/app/page.tsx", "infra/gcp/README.md", "scripts/deploy-gcp.sh",
    "scripts/dev/bootstrap-dev-db.ts", "scripts/dev/heavy.sh", "scripts/dev/smoke-redproof.sh", "scripts/dev/secret-scan.ts",
    "scripts/check/boundaries.sh", ".claude/settings.json", ".github/workflows/ci.yml", "evals/run.sh", "e2e/a.ts", "tests/smoke/smoke.test.ts",
    "examples/storefront-min/package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".gitignore", ".env",
    ".run/falkordb/darwin-arm64/redislite/bin/redis-server",
    # Inside included directories, each with its reason.
    "apps/web/AGENTS.md", "apps/web/.claude/skills/a/SKILL.md", "apps/web/public/next.svg", "tools/worldgen/src/worlds/store.ts",
    "tools/worldgen/answer-key/store.json", "tools/worldgen/answer-key/detector-map.json", "tools/worldgen/verify/coverage.ts",
    "tools/worldgen/test/worlds.test.ts", "tools/worldgen/demo.ts", "deploy/vercel/README.md", "services/intel/tests/manager/redproof.sh",
    "services/intel/tests/manager/test_manager_e2e.py", "services/intel/tests/evals/measure.py", "services/core-api/test/read-routes.test.ts",
    "packages/contracts/test/ontology.test.ts",
]

# (word, a file text that names it, a path that names it)
WORDS = [
    ("the Shack's name", f"the {SN} {SH} repo", f"{SN_ID}.md"), ("its first word", f"{SN} Box for 1", f"apps/web/lib/businesses/{SN_ID}/x.ts"),
    ("its second word", f"The {SH} Burger", f"{SH.lower()}.json"), ("its town", f"{GE}, Victoria", f"{GE.lower()}/x.md"),
    ("its display face", "Bowl" + "by One", "bowl" + "by.css"),
    ("a dish only its menu has", "Beef Smash " + "Mate", "smash " + "mate.md"), ("another", "Moo & " + "Cluck", "moo & " + "cluck.md"),
    ("another (HTML)", "Moo &amp; " + "Cluck", "moo and " + "cluck.md"), ("another (2)", "Double " + "Trouble Burger", "double " + "trouble.md"),
    ("another (3)", "The Aussie " + "Mate", "aussie " + "mate.md"), ("another (4)", "Lava " + "Chicken Tenders", "lava " + "chicken.md"),
    ("another (5)", "Avo " + "Ranch Chicken Burger", "avo " + "ranch.md"),
    ("claude", "// asked Claude", "notes/claude.txt"), (".claude/", "settings in .claude/settings.json", "apps/web/.claude/x.md"),
    ("anthropic", "an Anthropic key", "anthropic.ts"), ("juspay", "at Juspay", "juspay/x"),
    ("teammate's e-mail", "manjeetpathak2003@gmail.com", "manjeetpathak.txt"), ("codex", "drafted in Codex", "tools/codex/run.ts"),
    ("copilot", "# Copilot suggestion", "docs/copilot.md"), ("chatgpt", "asked ChatGPT", "chatgpt.txt"),
    ("co-authored-by", "Co-Authored-By: Someone <someone@example.com>", "co-authored-by.txt"),
    ("generated with", "Generated with a tool", "generated with.md"), ("ai-assisted", "an AI-assisted change", "ai-assisted.md"),
    ("llm-generated", "LLM-generated tests", "llm-generated.md"), ("coding agent", "when it detects a coding agent", "coding agent.md"),
    ("shipyard", "the Shipyard method", "shipyard.md"), ("agents.md", "see `AGENTS.md`", "apps/web/AGENTS.md"),
]
# Product words, the other businesses' words, and dishes that only sound alike: legal here.
WORDS_CLEAN = [
    "the AI layer: a router agent and eight specialist agents; a subagent span",
    "providers: gemini, openai, openrouter, nvidia, nebius (Token Factory, an OpenAI-compatible endpoint)",
    "docs/ai-agents.md and team-agents.md and AGENTS.mdx",
    "FalkorDB, MUNIM_FALKORDB_URL, the supabase dev host, Vercel, deploy/vercel",
    "Smashed Avo, Smashed Avocado on Sourdough, a smash of butter",
    "Kosambari Kitchens, Baloo Tamma 2, Cobnut Bakehouse, Fraunces, Lucknow, Bengaluru",
    "Ontology regenerated with migration 0031", "a codec, a code export", "Butter Chicken Burger at a synthetic grill",
]

# The text map: (name, text before, the text the export carries).
MAP = [
    ("rules-file rule", "// CLAUDE.md rule 7: no country logic", "// project rule 7: no country logic"),
    ("rules-file name", "see CLAUDE.md", "see the project rules"),
    ("key-pair note", 'source: ".run/vercel/run-token.pem (generated with its public half)",', 'source: ".run/vercel/run-token.pem (made together with its public half)",'),
]
# The map rewords only the reviewed text: a new mention must still fail the words gate.
NOT_LAUNDERED = ["// asked Claude", "Co-Authored-By: x", "at Juspay", "Generated with a tool", "see AGENTS.md", f"the {SN} {SH}", f"{GE} shop"]

# The source gate (export.unreviewed): (name, path, text, must it fail)
RUN_TS = "tools/worldgen/src/run.ts"
RUN_BEFORE = rules.FILE_MAP[RUN_TS][0][0].decode()
SOURCE = [
    ("a rules-file reference", "x.ts", "// CLAUDE.md rule 7", False),
    ("the key-pair note", "x.ts", "(generated with its private half)", False),
    ("an assistant name", "x.ts", "// asked Claude", True),
    ("an employer", "x.ts", "// from juspay", True),
    ("a tool credit", "x.ts", "// generated with a tool", True),
    ("the Shack's reviewed lines in run.ts", RUN_TS, "// head\n" + RUN_BEFORE + "// tail\n", False),
    ("a new Shack mention beside the reviewed lines", RUN_TS, f"// the {SN} menu\n" + RUN_BEFORE, True),
    ("the reviewed lines in another file", "tools/worldgen/src/ctx.ts", RUN_BEFORE, True),
    ("the reviewed lines changed", RUN_TS, RUN_BEFORE.replace("cobnut", "cobnut2"), True),
    ("the reviewed lines twice", RUN_TS, RUN_BEFORE + RUN_BEFORE, True),
]

# The overlay's own words: (text, must it be caught)
OVERLAY = [
    ("the founder decided", True), ("ledger R68 says", True), ("T-131 adds it", True), ("a kitchen ticket", False), ("see design §3", True),
    ("one lane each", True), ("the orchestrator commits", True), ("decision D6", True), ("F4 writes it", True), ("wave W3", True),
    ("FACT: read in the code", True), ("the spike ran it", True), ("gotcha 10", True), ("ADR-014", True), ("EV-3 says", True),
    ("as P6 asks", True), ("the next wave", True), ("the hackathon", True), ("planted BK-F3", True), ("UNVERIFIED ids", True),
    ("every number shown traces to a ledger row", False), ("NVIDIA Nemotron through Nebius Token Factory", False),
    ("nvidia/nemotron-3-ultra-550b-a55b and nvidia/Nemotron-3_5-Lightning", False), ("Node 22.18, port 8787, Postgres 18", False),
    ("TODO before publishing: replace this line", False), ("about 1.3 seconds; 4 of 4 runs", False),
]

TAIL = "0123456789abcdefSYNTHETIC0123456789"
SECRETS_CAUGHT = [f"{'nvapi'}-{TAIL}", f"{'sb_secret'}_{TAIL}", f"{'sb_secret'}_synthetic_0123456789X",
                  f"{'postgres'}://munim_core:Synthetic-Pass-0001@10.0.0.1/m", f"{'sk'}-{TAIL}"]


def fails(fn, *args) -> bool:
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            fn(*args)
    except SystemExit as e:
        return e.code not in (0, None)
    return False


def gate_cases() -> list[tuple[bool, str]]:
    """export.licence, export.links and rules.file_map on small inputs: the clean case passes, each planted defect fails."""
    out = []
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        (root / "docs").mkdir()
        (root / "docs/a.md").write_text("# A\n")
        (root / "LICENSE").write_bytes((export.OVERLAY / "LICENSE").read_bytes())
        out.append((not fails(export.licence, root), "licence: the Apache License 2.0 passes"))
        (root / "LICENSE").write_bytes((export.OVERLAY / "LICENSE").read_bytes().replace(b"Version 2.0", b"Version 2.1"))
        out.append((fails(export.licence, root), "licence: one changed word fails"))
        (root / "LICENSE").unlink()
        out.append((fails(export.licence, root), "licence: no LICENSE fails"))
        (root / "README.md").write_text("[a](docs/a.md) [anchor](#x) [web](https://example.com) [dir](docs/)\n")
        out.append((not fails(export.links, root), "links: links to existing files, anchors and URLs pass"))
        (root / "README.md").write_text("[gone](docs/b.md)\n")
        out.append((fails(export.links, root), "links: a link to a missing file fails"))
    before = rules.FILE_MAP[RUN_TS][0][0]
    out.append((rules.file_map(RUN_TS, b"x\n" + before) == b"x\n" + rules.FILE_MAP[RUN_TS][0][1], "file map: the reviewed run.ts lines are rewritten"))
    out.append((fails(rules.file_map, RUN_TS, b"x\n"), "file map: a target that no longer matches stops the export"))
    out.append((fails(rules.file_map, RUN_TS, before + before), "file map: a target that matches twice stops the export"))
    out.append((rules.file_map("tools/worldgen/src/ctx.ts", before) == before, "file map: a file it does not name is untouched"))
    for path, pairs in rules.FILE_MAP.items():
        for old, new in pairs:
            out.append((not rules.FORBIDDEN.search(new), f"file map: {path}'s rewrite leaves no forbidden word"))
    return out


def main() -> int:
    failed, total = 0, 0

    def check(ok: bool, what: str) -> None:
        nonlocal failed, total
        total += 1
        if not ok:
            failed += 1
            print(f"FAIL  {what}")

    for p in KEPT:
        check(rules.keep(p), f"kept: {p}")
    for p in LEFT_OUT:
        check(not rules.keep(p), f"left out: {p} ({rules.excluded_by(p) or 'not included'})")
    for word, blob, path in WORDS:
        check(bool(rules.FORBIDDEN.search(blob.encode())), f"word in a file: {word} ({blob!r})")
        check(bool(rules.FORBIDDEN.search(path.encode())), f"word in a path: {word} ({path!r})")
    for text in WORDS_CLEAN:
        check(not rules.FORBIDDEN.search(text.encode()), f"clean text: {text!r} ({rules.FORBIDDEN.findall(text.encode())!r})")
    for name, before, after in MAP:
        got = rules.replace(before.encode())
        check(got == after.encode(), f"map: {name}\n  got:  {got!r}\n  want: {after.encode()!r}")
        check(not rules.FORBIDDEN.search(got), f"map leaves a forbidden word: {name}")
    for text in NOT_LAUNDERED:
        check(bool(rules.FORBIDDEN.search(rules.replace(text.encode()))), f"map launders a new mention: {text!r}")
    for name, path, text, must_fail in SOURCE:
        got = export.unreviewed(path, text.encode())
        check(bool(got) == must_fail, f"source gate: {name} ({got!r})")
    for text, caught in OVERLAY:
        check(bool(rules.OVERLAY_WORDS.search(text.encode())) == caught, f"overlay words: {text!r} ({rules.OVERLAY_WORDS.findall(text.encode())!r})")
    for s in SECRETS_CAUGHT:
        check(rules.secret_hits(f"x = '{s}'".encode()) != [], f"secret caught: {s[:16]}…")
    for s in sorted(rules.SECRET_ALLOW):
        check(rules.secret_hits(b"x = '" + s + b"'") == [], f"reviewed synthetic value passes: {s[:16]!r}…")
    cases = gate_cases()
    for ok, what in cases:
        check(ok, what)
    print(f"export-nebius: rules {total - failed}/{total} pass ({len(KEPT)} kept, {len(LEFT_OUT)} left out, {len(WORDS)} words, "
          f"{len(MAP)} map, {len(SOURCE)} source, {len(OVERLAY)} overlay, {len(SECRETS_CAUGHT) + len(rules.SECRET_ALLOW)} secret, "
          f"{len(cases)} gate cases)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
