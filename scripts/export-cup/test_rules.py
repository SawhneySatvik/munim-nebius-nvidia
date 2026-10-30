"""Gates for the export's rules: secret shapes (rules.secret_hits, C1 S3-18), forbidden words in paths, blobs and messages
(rules.FORBIDDEN, rules.subject), the reviewed text map (rules.replace) and the source gate's reviews (export.unreviewed).
Standard library only; scripts/export-cup.sh runs it before every export:  python3 scripts/export-cup/test_rules.py
(exit 1 on any failure).

Each planted secret is synthetic and built from parts at run time, so this file never holds a whole secret shape itself."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export  # noqa: E402
import rules  # noqa: E402

TAIL = "0123456789abcdefSYNTHETIC0123456789"

# (name, text that must be caught, the hit it must report)
CAUGHT = [
    ("nvidia key", f'NVIDIA_API_KEY="{"nvapi"}-{TAIL}"', f"{'nvapi'}-{TAIL}"),
    ("hosted-db secret key", f"key = {'sb_secret'}_{TAIL}", f"{'sb_secret'}_{TAIL}"),
    ("hosted-db publishable key", f"key = {'sb_publishable'}_{TAIL}", f"{'sb_publishable'}_{TAIL}"),
    ("oauth client secret", f"secret: {'GOCSPX'}-{TAIL}", f"{'GOCSPX'}-{TAIL}"),
    ("access key id", f"id={'AKIA'}SYNTHETIC0000000 ", f"{'AKIA'}SYNTHETIC0000000"),
    ("db url with a password", f"url={'postgres'}://munim_core:Synthetic-Pass-0001@10.0.0.1:5432/munim", f"{'postgres'}://munim_core:Synthetic-Pass-0001@"),
    ("db url, postgresql://, encoded", f"{'postgresql'}://postgres:abc%40def%2Fghi@127.0.0.1/db", f"{'postgresql'}://postgres:abc%40def%2Fghi@"),
]

# Not secrets: the template and placeholder URLs the exported tests use, a URL with no password, shape prefixes alone.
CLEAN = [
    ("db url, template password", "`postgresql://${role}:${db.password}@127.0.0.1/munim`"),
    ("db url, one-letter placeholders", "postgresql://u:p@localhost/db and postgresql://munim_svc:x@host/db"),
    ("db url, no password", "postgres://localhost/munim?host=/cloudsql/p:r:i and postgres://munim@db/munim"),
    ("prefixes alone", "nvapi- sb_secret_ GOCSPX- AKIA"),
    ("public mock storefront key", "sfk_mock_0123456789abcdef"),
]

# ---- forbidden words -----------------------------------------------------------------------------------------------
# (word, a blob that names it, a path that names it, a one-line commit message that names it)
WORDS = [
    ("codex", "// drafted in Codex", "tools/codex/run.ts", "Wire the parser from a Codex draft"),
    ("copilot", "# Copilot suggestion", "docs/copilot.md", "Accept the copilot suggestion for the parser"),
    ("chatgpt", "asked ChatGPT about it", "notes/chatgpt.txt", "Rework the parser as ChatGPT suggested"),
    ("co-authored-by", "Co-Authored-By: Someone <someone@example.com>", "co-authored-by.txt", "Co-authored-by: Someone <someone@example.com>"),
    ("generated with", "Generated with a tool", "generated with.md", "Parser generated with a tool"),
    ("ai-assisted", "an AI-assisted change", "docs/ai-assisted.md", "AI-assisted rewrite of the parser"),
    ("ai assisted", "an ai assisted change", "docs/ai assisted.md", "Ai assisted rewrite of the parser"),
    ("ai-generated", "AI-generated code", "docs/ai-generated.md", "Add the AI-generated parser"),
    ("ai generated", "AI generated code", "docs/ai generated.md", "Add the AI generated parser"),
    ("llm-generated", "LLM-generated tests", "docs/llm-generated.md", "Add the LLM-generated tests"),
    ("llm generated", "llm generated tests", "docs/llm generated.md", "Add the llm generated tests"),
    ("llm-assisted", "an LLM-assisted change", "docs/llm-assisted.md", "LLM-assisted rewrite of the parser"),
    ("coding assistant", "skills for the coding assistant", "docs/coding-assistant.md", "Notes for the coding assistant"),
    ("coding agent", "when it detects a coding agent", "docs/coding agent.md", "Ignore files a coding agent writes"),
    ("shipyard", "the Shipyard method", "docs/shipyard.md", None),  # subject() strips it from a message (below)
    ("agents.md", "see `AGENTS.md` for the rules", "apps/web/AGENTS.md", "Remove AGENTS.md from the web app"),
    ("agents.md (root)", "AGENTS.md", "AGENTS.md", "AGENTS.md: rules for the web app"),
    (".claude/", "settings live in .claude/settings.json", "apps/web/.claude/skills/a/SKILL.md", "Drop .claude/ from the web app"),
    ("falkor", "FalkorDB only", "adapters/dev/graph-falkordb/x.py", "Add the FalkorDB adapter"),
    ("falkor (upper)", "MUNIM_FALKORDB_HOST", "FALKORDB.md", "Read the FALKORDB host"),
]
# Product words and look-alikes that stay legal.
WORDS_CLEAN = [
    ("AI and agents", "the AI layer: a router agent and eight specialist agents; a subagent span"),
    ("openai provider", "providers: gemini, openai, openrouter, nvidia (an OpenAI-compatible endpoint via OpenAILlm)"),
    ("ai-agents doc", "[`docs/ai-agents.md`](../../docs/ai-agents.md) and docs/ai-agents.md"),
    ("other *-agents.md", "team-agents.md, my_agents.md, AGENTS.mdx"),
    ("graph wording", "a graph database, the graph store, the graph-database adapter, MUNIM_GRAPHDB_URL"),
    ("regenerated with", "Ontology regenerated with migration 0031"),
    ("model roles", '{"role": "assistant"} and a real Gemini client'),
    ("ai generation", "AI generation of drafts is off; AI-backed findings"),
    ("codec", "a codec, a code export"),
]
CLEAN_PATHS = ["docs/ai-agents.md", "services/intel/munim_intel/agents/router.py", "services/intel/tests/graph/test_graph.py"]
CLEAN_MESSAGES = [
    "Add the graph port with a Postgres-edges adapter",
    "feat: tests, docs, project skills; fix layout shift and click-swallowing bugs\n\n- .claude/skills: three",  # the storefront's skills commit, reworded by the map
    "Fix the parser\n\nCo-Authored-By: Someone <someone@example.com>",  # bodies are dropped: only the subject is kept
    "Use the shipyard method for the parser",  # subject() drops the word
]

# ---- the reviewed text map: (name, text before, the text the export carries) -----------------------------------------
README_BLOCK = (
    "scripts/smoke.ts           smoke test\n"
    ".claude/skills/            project skills for Claude Code: storefront-frontend, munim-sdk-integration, mock-backend\n"
    "```\n"
)
README_END = (
    "Fonts: Fraunces and Inter (both SIL OFL), served through `next/font`.\n\n"
    "## Claude Code skills in this repo\n\n"
    "`.claude/skills/` holds three project skills that Claude Code loads when the work matches: **storefront-frontend**\n"
    "(design system, Next 16 gotchas, review loop), **munim-sdk-integration** (the API layer and its rules) and\n"
    "**mock-backend** (the stand-in server and its data).\n"
)
MAP = [
    ("web readme, layout line", README_BLOCK, "scripts/smoke.ts           smoke test\n```\n"),
    ("web readme, skills section", README_END, "Fonts: Fraunces and Inter (both SIL OFL), served through `next/font`.\n"),
    ("next config",
     "  // `next dev` otherwise writes a managed apps/web/AGENTS.md when it detects a coding agent;\n  // repo instructions live in CLAUDE.md only.\n",
     "  // `next dev` otherwise writes a managed file into apps/web;\n  // repo instructions live in the project rules only.\n"),
    ("graph package",
     '"""Graph port, Postgres-edges adapter and projector (T-058). FalkorDB lives in adapters/dev/graph-falkordb (F7)."""',
     '"""Graph port, Postgres-edges adapter and projector (T-058)."""'),
    ("graph port",
     "SQL and binds `:tenant_id`, services/core-api/src/internal/graph/; FalkorDB: the adapter is built for one tenant).",
     "SQL and binds `:tenant_id`, services/core-api/src/internal/graph/; a graph-database adapter is built for one tenant)."),
    ("graph port, older", "`:tenant_id`; FalkorDB: the adapter is built for one tenant).", "`:tenant_id`; a graph-database adapter is built for one tenant)."),
    ("graph tests, docstring",
     "batch writers); FalkorDB only when the `falkordb` module and MUNIM_FALKORDB_URL are both present — skipped before any",
     "batch writers); a graph database only when the `graphdb` module and MUNIM_GRAPHDB_URL are both present — skipped before any"),
    ("graph tests, backend", """def falkor() -> Iterator[Backend]:
    url = os.environ.get("MUNIM_FALKORDB_URL")
    if not url or importlib.util.find_spec("falkordb") is None:
        pytest.skip("FalkorDB: no `falkordb` module or no MUNIM_FALKORDB_URL (F7: optional, skipped with no server)")
    path = REPO / "adapters/dev/graph-falkordb/graph_falkordb.py"
    spec = importlib.util.spec_from_file_location("graph_falkordb", path)
    sys.modules["graph_falkordb"] = mod
    ga, gb = mod.FalkorGraph(url, ta), mod.FalkorGraph(url, tb)
    yield Backend("falkordb", ga, gb)
@pytest.fixture(params=["postgres", "falkordb"])
        yield from falkor()
    Postgres (the bridge raises it), `idempotency_conflict` from the FalkorDB adapter (never a silent MERGE). Paired:""",
     """def graph_database() -> Iterator[Backend]:
    url = os.environ.get("MUNIM_GRAPHDB_URL")
    if not url or importlib.util.find_spec("graphdb") is None:
        pytest.skip("graph database: no `graphdb` module or no MUNIM_GRAPHDB_URL (F7: optional, skipped with no server)")
    path = REPO / "adapters/dev/graph-db/graph_db.py"
    spec = importlib.util.spec_from_file_location("graph_db", path)
    sys.modules["graph_db"] = mod
    ga, gb = mod.GraphDatabase(url, ta), mod.GraphDatabase(url, tb)
    yield Backend("graphdb", ga, gb)
@pytest.fixture(params=["postgres", "graphdb"])
        yield from graph_database()
    Postgres (the bridge raises it), `idempotency_conflict` from the graph-database adapter (never a silent MERGE). Paired:"""),
]
# The map rewords only the reviewed text above: a new mention must still fail the gate, not be laundered.
NOT_LAUNDERED = ["Claude Code loads skills", "see .claude/skills/", "FalkorDB is a graph database", "pip install falkordb",
                 "Co-Authored-By: x", "AGENTS.md"]

# ---- the source gate's reviews (export.unreviewed): (name, path, text, must it fail) ----------------------------------
# The only reviews are the rules file's own name and the applied migrations' comments: no path is exempt from the graph-database ban.
SOURCE = [
    ("a graph database name in core", "services/core-api/src/x.ts", "// FalkorDB here", True),
    ("a graph database name in the graph port", "services/intel/munim_intel/graph/port.py", "FalkorDB: the adapter is built for one tenant", True),
    ("a graph database name in the graph tests", "services/intel/tests/graph/test_graph.py", 'find_spec("falkordb") # FalkorDB', True),
    ("another word in the graph tests", "services/intel/tests/graph/test_graph.py", "# a devhost supabase url", True),
    ("a rules-file reference", "services/core-api/src/x.ts", "// CLAUDE.md rule 7", False),
    ("an assistant name", "services/core-api/src/x.ts", "// asked Claude", True),
    ("an applied migration's comment", "db/migrations/0001_roles_schemas.sql", "-- supabase falkordb", False),
    ("an AI-tool word in code", "apps/web/next.config.ts", "// writes AGENTS.md for a coding agent", True),
]


# A lockfile with one importer left after the export's filter: `a` and its dependency `b` (with a peer suffix) are reached;
# `c` and `d` served only a dropped importer and must go, from both sections; nothing may be added.
LOCK = """lockfileVersion: '9.0'

importers:

  apps/web:
    dependencies:
      a:
        specifier: 1.0.0
        version: 1.0.0
      '@munim/x':
        specifier: workspace:*
        version: link:../x

packages:

  a@1.0.0:
    resolution: {integrity: sha512-a}

  '@s/b@2.0.0':
    resolution: {integrity: sha512-b}

  c@3.0.0:
    resolution: {integrity: sha512-c}

  d@4.0.0:
    resolution: {integrity: sha512-d}

snapshots:

  a@1.0.0:
    dependencies:
      '@s/b': 2.0.0(a@1.0.0)

  '@s/b@2.0.0(a@1.0.0)': {}

  c@3.0.0:
    dependencies:
      d: 4.0.0
    transitivePeerDependencies:
      - a

  d@4.0.0: {}
"""


def lockfile_cases() -> int:
    """export.prune_unreached: the unreached entries go from `packages:` and `snapshots:`, the reached stay, nothing is added."""
    import export

    pruned, n = export.prune_unreached(LOCK)
    entries = [ln.strip() for ln in pruned.splitlines() if ln.startswith("  ") and not ln.startswith("   ")]
    want = ["apps/web:", "a@1.0.0:", "'@s/b@2.0.0':", "a@1.0.0:", "'@s/b@2.0.0(a@1.0.0)': {}"]
    added = [ln for ln in pruned.splitlines() if ln not in set(LOCK.splitlines())]
    ok = (n, entries, added, "c@3.0.0" in pruned or "d@4.0.0" in pruned) == (4, want, [], False)
    print(f"{'ok   ' if ok else 'FAIL '} lockfile: 4 unreached entries pruned, the reached kept, none added (got {n}, {entries}, added {added})")
    return 0 if ok else 1


def main() -> int:
    lock_failed = lockfile_cases()
    failed, total = 0, 0

    def check(ok: bool, what: str) -> None:
        nonlocal failed, total
        total += 1
        if not ok:
            failed += 1
            print(f"FAIL  {what}")

    for name, text, want in CAUGHT:
        hits = rules.secret_hits(text.encode())
        check(hits == [want.encode()], f"secret caught: {name} (hits {hits!r})")
    for name, text in CLEAN:
        hits = rules.secret_hits(text.encode())
        check(hits == [], f"secret clean: {name} (hits {hits!r})")
    secrets = total

    for word, blob, path, msg in WORDS:
        check(bool(rules.FORBIDDEN.search(blob.encode())), f"word in a blob: {word} ({blob!r})")
        check(bool(rules.FORBIDDEN.search(path.encode())), f"word in a path: {word} ({path!r})")
        if msg is not None:
            out = rules.subject(msg.encode(), [])
            check(bool(rules.FORBIDDEN.search(out)), f"word in a message: {word} ({msg!r} → {out!r})")
    for name, text in WORDS_CLEAN:
        hits = rules.FORBIDDEN.findall(text.encode())
        check(hits == [], f"clean text: {name} (hits {hits!r})")
    for p in CLEAN_PATHS:
        check(not rules.FORBIDDEN.search(p.encode()), f"clean path: {p}")
    for msg in CLEAN_MESSAGES:
        out = rules.subject(msg.encode(), [])
        check(not rules.FORBIDDEN.search(out), f"clean message: {msg!r} → {out!r}")
    out = rules.subject(CLEAN_MESSAGES[1].encode(), [])
    check(out == b"Tests and docs\n", f"the storefront's skills commit reads 'Tests and docs' ({out!r})")
    words = total - secrets

    for name, before, after in MAP:
        check(bool(rules.FORBIDDEN.search(before.encode())), f"map case plants a forbidden word: {name}")
        got = rules.replace(before.encode())
        check(got == after.encode(), f"map: {name}\n  got:  {got!r}\n  want: {after.encode()!r}")
        check(not rules.FORBIDDEN.search(got), f"map leaves a forbidden word: {name} ({rules.FORBIDDEN.findall(got)!r})")
    for text in NOT_LAUNDERED:
        check(bool(rules.FORBIDDEN.search(rules.replace(text.encode()))), f"map launders a new mention: {text!r}")
    mapped = total - secrets - words

    for name, path, text, fails in SOURCE:
        rest, _ = export.unreviewed(path, text.encode())
        check(bool(rest) == fails, f"source gate: {name} (unreviewed {rest!r})")
    print(f"export-cup: secret-shape cases {secrets}, forbidden-word cases {words}, map cases {mapped}, "
          f"source-review cases {total - secrets - words - mapped}: {total - failed}/{total} pass")
    return 1 if failed or lock_failed else 0


if __name__ == "__main__":
    sys.exit(main())
