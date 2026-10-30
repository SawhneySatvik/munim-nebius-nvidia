"""Gates for the business-graph export's rules: what is kept and left out (rules.keep), forbidden words in paths and files
(rules.FORBIDDEN), the reviewed text map (rules.replace) and the source gate's reviews (export.unreviewed), secret shapes
(rules.secret_hits), the overlay's own words (rules.OVERLAY_WORDS), and the cypher and links gates (export.cypher, export.links),
each with a case that must fail. Standard library only; scripts/export-falkor.sh runs it before every export:
  python3 scripts/export-falkor/test_rules.py   (exit 1 on any failure)

Each planted secret is synthetic and built from parts at run time, so this file never holds a whole secret shape itself."""

from __future__ import annotations

import contextlib
import io
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export  # noqa: E402

rules = export.rules

KEPT = [
    "adapters/falkordb/src/index.ts", "adapters/falkordb/cypher/read/sole_sources.cypher", "adapters/falkordb/projection.sql",
    "adapters/falkordb/env.ts", "adapters/falkordb/test/core-api.test.ts", "adapters/dev/env/index.ts", "adapters/dev/idp-local/mint-seed-tokens.ts",
    "adapters/gcp/idp-identity-platform/demo-accounts.ts", "deploy/vercel/build.mjs", "deploy/vercel/vercel.json",
    "services/core-api/src/internal/graph/index.ts", "services/core-api/src/modules/graph/index.ts", "services/core-api/test/graph-routes.test.ts",
    "services/core-worker/src/graph/index.ts", "services/intel/munim_intel/graph/tools.py", "services/intel/tests/graph/test_graph_tools.py",
    "services/intel/tests/graph/test_butter_question_e2e.py", "services/intel/tests/graph/butter_stack.mts",
    "services/intel/tests/graph/fixtures/butter/reason/x.json", "apps/web/app/staff/suppliers/map/page.tsx",
    "scripts/dev/fetch-falkordb.ts", "scripts/dev/probe-falkordb.ts", "scripts/dev/local-db.ts", "scripts/dev/intel-stub.ts",
    "tools/worldgen/src/worlds/cobnut.ts", "db/migrations/0001_roles_schemas.sql", ".env.example", "uv.lock", "package.json",
]
LEFT_OUT = [
    "services/core-api/src/internal/graph/postgres/visible.sql", "services/core-api/src/internal/graph/postgres/index.ts",
    "services/core-api/test/intel-graph.test.ts", "services/intel/tests/graph/test_graph.py", "services/intel/tests/graph/pg_bridge.mts",
    "services/intel/tests/graph/bridge.py", "services/intel/tests/graph/graph_world.py", "services/intel/tests/manager/test_manager_e2e.py",
    "adapters/falkordb/test/redproof-graph.sh", "apps/web/tests/redproof-map.sh", "deploy/vercel/README.md", "apps/web/AGENTS.md",
    "apps/web/.claude/skills/a/SKILL.md", "tools/worldgen/src/worlds/store.ts", "tools/worldgen/answer-key/store.json",
    "docs/plan/falkordb/design.md", "docs/admin/x.md", "docs/submission/x.md", "docs/handoff/x.md", "docs/research/x.md",
    "docs/specs/x.md", "docs/superpowers/x.md", "docs/shared/overview.md", "CLAUDE.md", "HANDOFF.md", "HANDOFF-PROD.md",
    "video/a.mp4", "apps/site/app/page.tsx", "infra/gcp/README.md", "scripts/deploy-gcp.sh", "scripts/export-cup/rules.py",
    "scripts/export-falkor/rules.py", "scripts/dev/heavy.sh", "scripts/dev/smoke-redproof.sh", ".claude/settings.json", ".agents/x",
    "skills-lock.json", ".impeccable/x", ".env", ".run/falkordb/darwin-arm64/redislite/bin/redis-server", "Makefile", "README.md",
    "evals/run.sh", "e2e/a.ts", "tests/smoke/smoke.test.ts", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".gitignore", ".github/workflows/ci.yml",
]

# (word, a file text that names it, a path that names it)
WORDS = [
    ("claude", "// asked Claude", "notes/claude.txt"), (".claude/", "settings in .claude/settings.json", "apps/web/.claude/x.md"),
    ("anthropic", "an Anthropic key", "anthropic.ts"), ("juspay", "at Juspay", "juspay/x"), ("snacky", "the Snacky Shack repo", "snacky.md"),
    ("teammate's e-mail", "manjeetpathak2003@gmail.com", "manjeetpathak.txt"), ("codex", "drafted in Codex", "tools/codex/run.ts"),
    ("copilot", "# Copilot suggestion", "docs/copilot.md"), ("chatgpt", "asked ChatGPT", "chatgpt.txt"),
    ("co-authored-by", "Co-Authored-By: Someone <someone@example.com>", "co-authored-by.txt"),
    ("generated with", "Generated with a tool", "generated with.md"), ("ai-assisted", "an AI-assisted change", "ai-assisted.md"),
    ("ai generated", "AI generated code", "ai generated.md"), ("llm-generated", "LLM-generated tests", "llm-generated.md"),
    ("coding agent", "when it detects a coding agent", "coding agent.md"), ("shipyard", "the Shipyard method", "shipyard.md"),
    ("agents.md", "see `AGENTS.md`", "apps/web/AGENTS.md"),
]
# Product words, hosting and graph words: legal here.
WORDS_CLEAN = [
    "the AI layer: a router agent and eight specialist agents; a subagent span",
    "providers: gemini, openai, openrouter, nvidia (an OpenAI-compatible endpoint)",
    "docs/ai-agents.md and team-agents.md and AGENTS.mdx",
    "FalkorDB, MUNIM_FALKORDB_URL, falkordb.so, the supabase dev host, Vercel, deploy/vercel",
    "Ontology regenerated with migration 0031", "a codec, a code export",
]

# The map: (name, text before, the text the export carries).
MAP = [
    ("rules-file rule", "// CLAUDE.md rule 7: no country logic", "// project rule 7: no country logic"),
    ("rules-file name", "see CLAUDE.md", "see the project rules"),
    ("key-pair note", 'source: ".run/vercel/run-token.pem (generated with its public half)",', 'source: ".run/vercel/run-token.pem (made together with its public half)",'),
    ("rule-3 detector", rules.DETECTOR_BEFORE.decode(), rules.DETECTOR_AFTER.decode()),
    ("rule-3 import", rules.RULE3_BEFORE.decode(), rules.RULE3_AFTER.decode()),
]
# The map rewords only the reviewed text: a new mention must still fail the words gate.
NOT_LAUNDERED = ["// asked Claude", "Co-Authored-By: x", "at Juspay", "Generated with a tool", "see AGENTS.md", "pip install anthropic"]

# The source gate (export.unreviewed): (name, text, must it fail)
SOURCE = [
    ("a rules-file reference", "// CLAUDE.md rule 7", False),
    ("the key-pair note", "(generated with its private half)", False),
    ("an assistant name", "// asked Claude", True),
    ("an employer", "// from juspay", True),
    ("a tool credit", "// generated with a tool", True),
    ("a planted AGENTS.md", "// writes AGENTS.md for a coding agent", True),
]

# The overlay's own words: (text, must it be caught)
OVERLAY = [
    ("the founder decided", True), ("ledger R68 says", True), ("T-131 adds it", True), ("a kitchen ticket", False), ("see design §3", True), ("one lane each", True),
    ("the orchestrator commits", True), ("decision D6", True), ("F4 writes it", True), ("wave W3", True), ("FACT: read in the code", True),
    ("the spike ran it", True), ("gotcha 10", True), ("ADR-014", True),
    ("every number shown traces to a ledger row", False), ("Track: Agents That Act on Connected Data", False),
    ("MUNIM_GRAPH=falkordb and GRAPH.RO_QUERY with TIMEOUT 1000", False), ("Node 22.18, port 6380, sha256", False),
    ("the Supplier map at /staff/suppliers/map", False), ("an unverified claim", False),
]

TAIL = "0123456789abcdefSYNTHETIC0123456789"
SECRETS_CAUGHT = [f"{'nvapi'}-{TAIL}", f"{'sb_secret'}_{TAIL}", f"{'sb_secret'}_synthetic_0123456789X", f"{'postgres'}://munim_core:Synthetic-Pass-0001@10.0.0.1/m"]


def fails(fn, *args) -> bool:
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            fn(*args)
    except SystemExit as e:
        return e.code not in (0, None)
    return False


def gate_cases() -> list[tuple[bool, str]]:
    """export.cypher and export.links on small trees: the clean tree passes, each planted defect fails."""
    out = []
    q = "MATCH (i:ingredient {id: $ingredient_id}) RETURN i.id AS id"
    w = "UNWIND $rows AS r CREATE (:outlet {id: r.id})"
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        (root / "adapters/falkordb/cypher/read").mkdir(parents=True)
        (root / "adapters/falkordb/cypher/write").mkdir(parents=True)
        (root / "docs").mkdir()
        (root / "adapters/falkordb/cypher/read/ingredient.cypher").write_text(q + "\n")
        (root / "adapters/falkordb/cypher/write/01_outlet.cypher").write_text(w + "\n")
        doc = root / "docs/cypher.md"
        good = f"# Q\n\n```cypher\n{q}\n```\n\ntext\n\n```cypher\n{w}\n```\n"
        doc.write_text(good)
        out.append((not fails(export.cypher, root), "cypher: the doc holding each file once passes"))
        doc.write_text(good.replace("i.id AS id", "i.id AS ids"))
        out.append((fails(export.cypher, root), "cypher: one character changed fails"))
        doc.write_text(f"```cypher\n{q}\n```\n")
        out.append((fails(export.cypher, root), "cypher: a file left out fails"))
        doc.write_text(good + f"\n```cypher\n{q}\n```\n")
        out.append((fails(export.cypher, root), "cypher: a file shown twice fails"))
        doc.write_text(good + "\n```cypher\nMATCH (n) RETURN n\n```\n")
        out.append((fails(export.cypher, root), "cypher: a block that is no file fails"))
        doc.write_text(good)
        (root / "README.md").write_text("[cypher](docs/cypher.md) [anchor](#x) [web](https://example.com) [dir](adapters/falkordb/)\n")
        out.append((not fails(export.links, root), "links: links to existing files, anchors and URLs pass"))
        (root / "README.md").write_text("[gone](docs/graph-model.md)\n")
        out.append((fails(export.links, root), "links: a link to a missing file fails"))
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
    for name, text, must_fail in SOURCE:
        check(bool(export.unreviewed(text.encode())) == must_fail, f"source gate: {name} ({export.unreviewed(text.encode())!r})")
    for text, caught in OVERLAY:
        check(bool(rules.OVERLAY_WORDS.search(text.encode())) == caught, f"overlay words: {text!r} ({rules.OVERLAY_WORDS.findall(text.encode())!r})")
    for s in SECRETS_CAUGHT:
        check(rules.secret_hits(f"x = '{s}'".encode()) != [], f"secret caught: {s[:16]}…")
    for s in sorted(rules.SECRET_ALLOW):
        check(rules.secret_hits(b"x = '" + s + b"'") == [], f"reviewed synthetic value passes: {s[:16]!r}…")
    for ok, what in gate_cases():
        check(ok, what)
    print(f"export-falkor: rules {total - failed}/{total} pass ({len(KEPT)} kept, {len(LEFT_OUT)} left out, {len(WORDS)} words, "
          f"{len(MAP)} map, {len(SOURCE)} source, {len(OVERLAY)} overlay, {len(SECRETS_CAUGHT) + len(rules.SECRET_ALLOW)} secret, 7 gate cases)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
