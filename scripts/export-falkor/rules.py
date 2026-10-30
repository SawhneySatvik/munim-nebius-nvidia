"""The business-graph export's rules (scripts/export-falkor.sh): what the FalkorDB repository carries, the reviewed text map,
the words and secret shapes no exported file may hold, and the one identity its single commit carries.

keep(path)      which repo paths the export carries: the code the live demo and the local set-up run, plus the overlay
                (root/). Every exclusion inside an included directory carries its reason.
replace(data)   the reviewed text map, applied to every exported text file (binary files untouched).
FORBIDDEN       what no exported path, file or commit message may contain.
OVERLAY_WORDS   what the overlay's own docs may not contain on top (internal process words and ids).
secret_hits     the Cup export's secret-shape check, with the synthetic values this export's extra files plant on purpose.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


# The Cup's rules, for its secret shapes and their reviewed synthetic values only (its keep list and words are its own).
cup = _load("cup_rules", HERE.parent / "export-cup" / "rules.py")

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
    "adapters/falkordb/",  # the graph backend
    "adapters/dev/",  # the hosted dev database's sign-in and storage, which the live demo runs on, and the local sign-in
    "adapters/gcp/",  # core-api (src/idp.ts, src/blob-store.ts) and apps/web (lib/server/demo-session.ts) import it statically
    "deploy/vercel/",  # the live demo's deploy
    "scripts/dev/fetch-falkordb.ts",  # the pinned FalkorDB server, for the local set-up and the graph tests
    "scripts/dev/probe-falkordb.ts",  # checks a hosted FalkorDB answers the commands the rebuild needs
    "scripts/dev/local-db.ts",  # the local set-up's embedded Postgres
    "scripts/dev/preflight.ts",  # `make up` checks config before any service starts
    "scripts/dev/intel-stub.ts",  # the recorded intel stand-in `make up` and the exported tests start
    "scripts/dev/package.json",  # its "type": "module"
    "package.json",
    "tsconfig.base.json",
    "tsconfig.depcruise.json",
    ".dependency-cruiser.cjs",
    ".env.example",
    "pyproject.toml",
    "uv.lock",
]

# (pattern, reason). A path under INCLUDE that matches one of these is left out.
EXCLUDE: list[tuple[str, str]] = [
    # What the storefront's own early commits held.
    (r"^apps/web/\.claude/", "assistant tooling from the storefront's own repo"),
    (r"^apps/web/(AGENTS|CLAUDE)\.md$", "assistant instructions from the storefront's own repo"),
    (r"^apps/web/\.vercel/", "a deploy-platform link folder"),
    (r"^apps/web/package-lock\.json$", "the storefront's npm lockfile; the workspace's pnpm lockfile replaces it"),
    (r"^apps/web/docs/", "the storefront's old screenshots"),
    (r"^apps/web/public/", "create-next-app template images (third-party art)"),
    # Other worlds: the Cobnut world only.
    (r"^tools/worldgen/src/worlds/(au_outlet|cloud_kitchen|restaurant_group|store)\.ts$", "an evaluation world, not Cobnut"),
    (r"^tools/worldgen/(answer-key|verify)/", "the evaluation worlds' answer keys and their recompute"),
    (r"^tools/worldgen/demo\.ts$", "seeds every evaluation world at once"),
    (r"\.(orig|rej|bak)$|~$", "an editor or merge backup file"),
    # Gate harnesses of this repo's make targets: they copy this repo's tree and run its Makefile.
    (r"(^|/)[^/]*redproof[^/]*\.sh$", "a red-proof harness for this repo's make targets"),
    (r"^services/core-api/test/seed-minter\.test\.ts$", "drives this repo's Makefile and its dev token minter"),
    # The live deploy's runbook is this repo's own (its accounts, project ids and process); root/deploy/vercel/README.md replaces it.
    (r"^deploy/vercel/README\.md$", "this repo's own deploy runbook; the overlay's page replaces it"),
    # No Postgres graph in this build: FalkorDB is the only graph backend (core-api finds the in-tree templates by a computed path, so
    # it builds without them, and MUNIM_GRAPH=postgres refuses at boot with "no graph backend postgres in this build").
    (r"^services/core-api/src/internal/graph/postgres/", "the Postgres graph templates: this build's only graph is FalkorDB"),
    (r"^services/core-api/test/intel-graph\.test\.ts$", "tests the Postgres graph templates"),
    (r"^services/intel/tests/graph/(test_graph\.py|bridge\.py|graph_world\.py|pg_bridge\.mts)$", "tests the Postgres graph templates"),
    # Tests built on what the export leaves out (the evaluation worlds, their answer keys and recompute).
    (r"^db/tests/templates-worlds\.ts$", "seeds the restaurant_group and store worlds"),
    (r"^services/core-api/test/investigations-plan-world\.test\.ts$", "seeds the restaurant_group world"),
    (r"^tools/worldgen/test/(budget-draft-id|clock|determinism)\.test\.ts$", "runs an evaluation world (store, restaurant_group, all of them)"),
    (r"^tools/worldgen/test/(coverage|pending-inputs|verify-cache|worlds)\.test\.ts$", "checks the evaluation worlds against their answer keys and recompute"),
    (r"^tools/worldgen/test/cli\.test\.ts$", "drives the evaluation worlds and verify/ through the CLI"),
    (r"^tools/worldgen/test/no-sql(\.test)?\.ts$", "scans verify/ (the evaluation worlds' recompute) as well as src/"),
    # Tests that check the code against the planning documents, which the export leaves out.
    (r"^packages/contracts/test/(specialists|ontology)\.test\.ts$", "parses the specialists' pack documents under docs/plan"),
    (r"^db/tests/(mc1bc|templates)\.test\.ts$", "parses the pack documents' template specs under docs/plan"),
    (r"^services/intel/tests/packs/(compliance/test_compliance|customers/test_customers)_offline\.py$", "parses the pack documents under docs/plan"),
    (r"^services/intel/tests/live/test_smoke_live\.py$", "checks the live smoke against an ADR under docs/plan"),
    # intel's end-to-end suites seed the evaluation worlds through a real core-api and score them against their answer keys. The
    # butter question's end-to-end test seeds Cobnut on the graph and stays.
    (r"^services/intel/tests/(?!graph/test_butter_question_e2e\.py$).+_e2e\.py$", "seeds the evaluation worlds and reads their answer keys"),
    (r"^services/intel/tests/packs/cares/test_cares_intel\.py$", "reads the store world's answer key"),
    (r"^services/intel/tests/evals/", "scores runs against the evaluation set under evals/, which the export leaves out"),
    (r"^services/core-api/(test/investigations\.test\.ts|src/modules/inbox/ranking\.test\.ts)$", "reads the restaurant_group world's answer key"),
    (r"^services/core-api/test/read-routes\.test\.ts$", "diffs the routes against a planning document under docs/plan"),
    (r"^services/core-api/test/routes-contract\.test\.ts$", "its census counts response parses in test files left out above (read-routes, investigations)"),
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
# Applied in order to every exported text file. Each entry rewords a reviewed mention; a new mention still fails the gates.
# The rule-3 test's detector: in this repo it proves the Postgres templates would be caught reading intel.edge; this build has no
# Postgres templates, so the export states that instead (and still takes intel.edge away while FalkorDB is stopped).
RULE3_BEFORE = (
    b'import { graphCaller, postgresGraph } from "../../../services/core-api/src/internal/graph/index.ts";\n'
)
RULE3_AFTER = b'import { postgresGraph } from "../../../services/core-api/src/internal/graph/index.ts";\n'
DETECTOR_BEFORE = (
    b"      // The detector works: the Postgres templates read intel.edge, and now cannot.\n"
    b"      const pg = (await postgresGraph())!;\n"
    b'      await expect(pg.template("price_shock_path", { ingredient_id: ids.butter!, depth: 2 }, graphCaller(stack.api.deps.pools.svc, A.tenantId, ["*"]))).rejects.toThrow(/permission denied/);\n'
)
DETECTOR_AFTER = (
    b"      // This build has no Postgres graph backend at all, so there is nothing to fall back to.\n"
    b"      expect(await postgresGraph()).toBeNull();\n"
)
RULE3_NOTE_BEFORE = b"test takes munim_svc's SELECT on it away; the Postgres backend then fails, which shows the detector works)"
RULE3_NOTE_AFTER = b"test takes munim_svc's SELECT on it away; this build has no Postgres graph backend to fall back to)"
RULE3_TITLE_BEFORE = b"nothing read intel.edge (the detector catches the Postgres templates)"
RULE3_TITLE_AFTER = b"nothing read intel.edge (and this build has no Postgres graph)"
# The mapping's test: in this repo an unset MUNIM_GRAPH keeps the in-tree Postgres templates; here FalkorDB is the only backend.
UNSET_BEFORE = (
    b'  it("unset MUNIM_GRAPH keeps Postgres in this build (it has both); a bad URL refuses without echoing it", async () => {\n'
    b"    const lines: string[] = [];\n"
    b"    const plain = loadConfig({ env: { MUNIM_FALKORDB_URL: URL_ } });\n"
    b'    expect((await graphFromConfig(plain, createLogger(plain, (l) => lines.push(l)))).mode).toBe("postgres");\n'
)
UNSET_AFTER = (
    b'  it("unset MUNIM_GRAPH is FalkorDB in this build (its only graph backend); a bad URL refuses without echoing it", async () => {\n'
    b"    const lines: string[] = [];\n"
    b"    const plain = loadConfig({ env: { MUNIM_FALKORDB_URL: URL_ } });\n"
    b'    expect((await graphFromConfig(plain, createLogger(plain, (l) => lines.push(l)))).mode).toBe("falkordb");\n'
)
GCP_LINK = b"[`infra/gcp/README.md`](../../infra/gcp/README.md)"
DATA_MODEL_BEFORE = b"The data-model page in [`../docs/data-model.md`](../docs/data-model.md) is a map of\nthe result."
DATA_MODEL_AFTER = b"The core architecture page, [`../docs/core-architecture.md`](../docs/core-architecture.md), describes\nthe result."
LITERALS: list[tuple[bytes, bytes]] = [
    (b"CLAUDE.md hard rule", b"project hard rule"),
    (b"CLAUDE.md rules", b"project rules"),
    (b"CLAUDE.md rule", b"project rule"),
    (b"CLAUDE.md gotcha", b"project gotcha"),
    (b"CLAUDE.md verification", b"the project's verification"),
    (b"CLAUDE.md gate table", b"the project's gate table"),
    (b"CLAUDE.md:", b"the project rules:"),
    (b"(CLAUDE.md)", b"(the project rules)"),
    (b"CLAUDE.md", b"the project rules"),
    (b"CLAUDE rule", b"project rule"),
    (b"CLAUDE gotcha", b"project gotcha"),
    (b"CLAUDE", b"PROJECT"),
    (b"(generated with its public half)", b"(made together with its public half)"),
    (b"(generated with its private half)", b"(made together with its private half)"),
    (RULE3_BEFORE, RULE3_AFTER),
    (DETECTOR_BEFORE, DETECTOR_AFTER),
    (RULE3_NOTE_BEFORE, RULE3_NOTE_AFTER),
    (RULE3_TITLE_BEFORE, RULE3_TITLE_AFTER),
    (UNSET_BEFORE, UNSET_AFTER),
    # Links into pages this export does not carry.
    (GCP_LINK, b"the Google Cloud runbook (`infra/gcp/README.md`, not part of this repository)"),
    (DATA_MODEL_BEFORE, DATA_MODEL_AFTER),
]


def replace(data: bytes) -> bytes:
    """A binary file (a NUL in its first 8 KiB) is left alone; otherwise every literal applies in order."""
    if b"\0" in data[:8192]:
        return data
    for old, new in LITERALS:
        data = data.replace(old, new)
    return data


# What the source gate accepts before the map: every other forbidden word in a source file stops the export, so the map never
# launders a new mention.
REVIEWED = re.compile(rb"\bCLAUDE(?:\.md)?\b|\(generated with its (?:public|private) half\)")
# Map entries that must apply, and to how many exported files (a change to their target would otherwise slip past unmapped).
MUST_APPLY = {RULE3_BEFORE: 1, DETECTOR_BEFORE: 1, RULE3_NOTE_BEFORE: 1, RULE3_TITLE_BEFORE: 1, UNSET_BEFORE: 1, GCP_LINK: 4,
              DATA_MODEL_BEFORE: 1}

# The shared docs are provider-neutral; where one says what the graph tools read, this build says FalkorDB. Each must apply once.
DOC_MAP: dict[str, list[tuple[bytes, bytes]]] = {
    "docs/shared/ai-layer.md": [(
        b"(`munim_intel/wiki/`) and the graph projector (`munim_intel/graph/project.py`). The route `/ingest` validates a token and\n"
        b"does nothing else. The graph tools exist on two skills and read whatever edges the database holds.",
        b"(`munim_intel/wiki/`) and intel's own edge projector (`munim_intel/graph/project.py`). The route `/ingest` validates a token\n"
        b"and does nothing else. The graph tools exist on two skills and read the FalkorDB graph that core builds from the books\n"
        b"([`graph-model.md`](./graph-model.md)).",
    )],
}

# ---- the commit ----------------------------------------------------------------------------------------------------
AUTHOR = ("Satvik Sawhney", "satvik.sawhney2005@gmail.com")
MESSAGE = "Business Graph: Munim on FalkorDB"

# ---- the gates -----------------------------------------------------------------------------------------------------
# No mention of an AI coding tool or of how the code was made, no employer and no private project, and no address but the author's.
# Product words stay legal: "AI", "agent", "subagent", "openai" (a configured model provider), "regenerated with", and here the
# hosting and graph words (the demo runs on them).
FORBIDDEN = re.compile(
    rb"claude|anthropic|juspay|snacky"
    rb"|manjeetpathak"  # the teammate's e-mail
    rb"|codex|copilot|chatgpt|co-authored-by|\bgenerated with\b|\b(?:ai|llm)[- ](?:assisted|generated)\b"
    rb"|coding[- ](?:assistant|agent)|shipyard"
    rb"|(?<![\w.-])agents\.md(?![\w-])",  # an AGENTS.md file or mention; docs/ai-agents.md is not one
    re.I,
)

# The overlay's docs describe the product, never how it was built: no process words, no planning ids, no evidence labels.
OVERLAY_WORDS = re.compile(
    rb"(?i:\bfounder|\borchestrat|\blanes?\b|\bgotcha|\bcouncil\b|\bhandoff\b|\bdecision ledger\b|\bhackathon|"
    rb"\bspike\b|\bsubmission page\b)"
    rb"|\b(?:R[0-9]{1,2}|T-[0-9]{3}[a-z]?|[DFG]-?[0-9]{1,2}|[MW][0-9](?:\.[0-9])?|ADR-[0-9]+)\b"
    rb"|\b(?:FACT|INFERENCE|UNVERIFIED)\b|\xc2\xa7"  # the planning docs' evidence labels, and section signs pointing into them
)

# Synthetic values this export's extra files (adapters/dev, adapters/falkordb, deploy/vercel tests) plant on purpose, each read.
SECRET_ALLOW: set[bytes] = {
    b"sb_secret_synthetic_0123456789",  # adapters/dev/blob-supabase/test/blob.test.ts
    b"sb_secret_synthetic_two_process_0123",  # adapters/dev/blob-supabase/test/two-process.test.ts
    b"sb_secret_synthetic_not_real",  # adapters/dev/idp-supabase/test/demo-accounts.test.ts
    b"sb_publishable_synthetic_not_real",  # the same test
    b"sfk_PLANT_storefront_77",  # deploy/vercel/test/env-setup.test.ts: a planted storefront key the setup must forward
}


def secret_hits(data: bytes) -> list[bytes]:
    return [h for h in cup.secret_hits(data) if h not in SECRET_ALLOW]
