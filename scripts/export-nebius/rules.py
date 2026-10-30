"""The Nebius export's rules (scripts/export-nebius.sh): what the public Munim repository carries, the reviewed text map, the words
and secret shapes no exported file may hold, and the one identity its single commit carries.

keep(path)      which repo paths the export carries: Munim's full source (every service, the web app, the packages, the database,
                the adapters the composition roots load, the local set-up, worldgen with Cobnut Bakehouse and Kosambari Kitchens),
                plus the overlay (root/). Every exclusion inside an included directory carries its reason.
replace(data)   the reviewed text map, applied to every exported text file (binary files untouched).
FILE_MAP        reviewed rewrites of named files, applied to the source text before the text map (The Snacky Shack's lines in
                shared files, links into pages left out, process notes in the files the README points at); each must apply
                exactly once, or the export stops (its target changed: review it again).
FORBIDDEN       what no exported path, file or commit message may contain.
OVERLAY_WORDS   what the overlay's own docs may not contain on top (internal process words and ids).
secret_hits     the Cup export's secret-shape check, with the synthetic values the exported tests plant on purpose.

The Snacky Shack is a real business whose owner has not agreed to be shown: none of its files, its name, its town or its menu's
own dish names may leave this repository. Its files are excluded below; FILE_MAP takes it out of the files it shares with the
other businesses; FORBIDDEN stops the export on any mention left anywhere.
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
    "adapters/dev/",  # the local sign-in (idp-local) the local set-up runs on, and the hosted dev database's sign-in and storage
    "adapters/gcp/",  # core-api (src/idp.ts, src/blob-store.ts) and apps/web (lib/server/demo-session.ts) import it statically
    "adapters/falkordb/",  # the optional graph backend (MUNIM_GRAPH=falkordb); Postgres is this build's default
    "deploy/vercel/",  # the hosted deployment's build and environment set-up
    "deploy/nebius/",  # the isolated Nebius Token Factory Vercel/Supabase deployment profile
    "docs/nebius/DEPLOY.md",  # public, credential-free deployment runbook
    "scripts/dev/local-db.ts",  # the local set-up's embedded Postgres
    "scripts/dev/preflight.ts",  # `make up` checks config before any service starts
    "scripts/dev/intel-stub.ts",  # the AI stand-in the exported tests start
    "scripts/dev/local-operator.ts",  # adds the platform operator a demo seed signs in as (local database only)
    "scripts/dev/restart-svc.sh",  # restarts one service of the local stack (intel in live mode, say) and keeps the seeded data
    "scripts/dev/nemotron-roles.ts",  # points the model roles at Nemotron (NVIDIA's endpoint or Token Factory)
    "scripts/dev/nemotron-roles-hosted.ts",  # configures and verifies hosted Token Factory roles through audited operator drafts
    "scripts/dev/nemotron-smoke.ts",  # the live Nemotron smoke: every call must be served live by the configured provider
    "scripts/dev/fetch-falkordb.ts",  # the pinned FalkorDB server, for MUNIM_GRAPH=falkordb and the graph adapter's tests
    "scripts/dev/probe-falkordb.ts",  # checks a hosted FalkorDB answers the commands the rebuild needs
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
    # The Snacky Shack: a real business; its owner has not agreed to be shown.
    (r"^apps/web/lib/businesses/snacky_shack/", "The Snacky Shack (a real business, not shown without its owner's consent)"),
    (r"^apps/web/tests/business-au\.test\.ts$", "builds the web as The Snacky Shack"),
    (r"^tools/worldgen/src/worlds/snacky_shack\.ts$", "The Snacky Shack's world"),
    (r"^tools/worldgen/answer-key/demo/snacky_shack\.json$", "The Snacky Shack's answer key"),
    (r"^tools/worldgen/test/snacky_shack\.test\.ts$", "seeds The Snacky Shack's world"),
    # What the storefront's own early commits held.
    (r"^apps/web/\.claude/", "assistant tooling from the storefront's own repo"),
    (r"^apps/web/(AGENTS|CLAUDE)\.md$", "assistant instructions from the storefront's own repo"),
    (r"^apps/web/\.vercel/", "a deploy-platform link folder"),
    (r"^apps/web/package-lock\.json$", "the storefront's npm lockfile; the workspace's pnpm lockfile replaces it"),
    (r"^apps/web/docs/", "the storefront's old screenshots"),
    (r"^apps/web/public/", "create-next-app template images (third-party art)"),
    # Worlds: the two demo businesses (Cobnut Bakehouse, Kosambari Kitchens), not the evaluation worlds.
    (r"^tools/worldgen/src/worlds/(au_outlet|cloud_kitchen|restaurant_group|store)\.ts$", "an evaluation world, not a demo business"),
    (r"^tools/worldgen/answer-key/(au_outlet|cloud_kitchen|restaurant_group|store|detector-map)\.json$",
     "an evaluation world's answer key (or the map of their entries to detectors)"),
    (r"^tools/worldgen/verify/(coverage|pending-inputs)\.ts$", "checks the evaluation worlds' answer keys"),
    (r"^tools/worldgen/demo\.ts$", "seeds every evaluation world at once"),
    (r"\.(orig|rej|bak)$|~$", "an editor or merge backup file"),
    # Gate harnesses of this repo's make targets: they copy this repo's tree and run its Makefile.
    (r"(^|/)[^/]*redproof[^/]*\.sh$", "a red-proof harness for this repo's make targets"),
    (r"^services/core-api/test/seed-minter\.test\.ts$", "drives this repo's Makefile and its dev token minter"),
    # The hosted deploy's runbook is this repo's own (its accounts, project ids and process).
    (r"^deploy/vercel/README\.md$", "this repo's own deploy runbook (its accounts and project ids)"),
    # Tests built on what the export leaves out (the evaluation worlds, their answer keys and recompute).
    (r"^db/tests/templates-worlds\.ts$", "seeds the restaurant_group and store worlds"),
    (r"^services/core-api/test/investigations-plan-world\.test\.ts$", "seeds the restaurant_group world"),
    (r"^tools/worldgen/test/(budget-draft-id|clock|determinism)\.test\.ts$", "runs an evaluation world (store, restaurant_group, all of them)"),
    (r"^tools/worldgen/test/(coverage|pending-inputs|verify-cache|worlds)\.test\.ts$", "checks the evaluation worlds against their answer keys and recompute"),
    (r"^tools/worldgen/test/cli\.test\.ts$", "drives the evaluation worlds and verify/ through the CLI"),
    # Tests that check the code against the planning documents, which the export leaves out.
    (r"^packages/contracts/test/(specialists|ontology)\.test\.ts$", "parses the specialists' pack documents under docs/plan"),
    (r"^db/tests/(mc1bc|templates)\.test\.ts$", "parses the pack documents' template specs under docs/plan"),
    (r"^services/intel/tests/packs/(compliance/test_compliance|customers/test_customers)_offline\.py$", "parses the pack documents under docs/plan"),
    (r"^services/intel/tests/live/test_smoke_live\.py$", "checks the live smoke against an ADR under docs/plan"),
    # intel's end-to-end suites seed the evaluation worlds through a real core-api and score them against their answer keys. The
    # butter question's end-to-end test seeds Cobnut on the FalkorDB graph and stays.
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

# ---- the file map ----------------------------------------------------------------------------------------------------
# path -> [(text before, text the export carries)], applied to the source text before the text map. Each pair must match exactly
# once in that file.
# The source gate takes a file's pairs out before it looks for forbidden words, so only these exact, reviewed lines may name the
# Shack; a mention anywhere else (or a changed line here) stops the export.
GCP_LINK = b"[`infra/gcp/README.md`](../../infra/gcp/README.md)"
GCP_TEXT = b"the Google Cloud runbook (`infra/gcp/README.md`, not part of this repository)"
FILE_MAP: dict[str, list[tuple[bytes, bytes]]] = {
    "tools/worldgen/src/run.ts": [
        (b" *  `blr_kitchen`, a Bengaluru cloud kitchen, and `snacky_shack`, a Geelong smash-burger takeaway (real menu, synthetic history); the last\n"
         b" *  two have keys in answer-key/demo/. cli.ts reseeds each fresh and writes its site files. */\n"
         b'export const DEMO_WORLDS = ["cobnut", "blr_kitchen", "snacky_shack"] as const;\n',
         b" *  and `blr_kitchen`, a Bengaluru cloud kitchen, whose key is in answer-key/demo/. cli.ts reseeds each fresh and writes its site\n"
         b" *  files. */\n"
         b'export const DEMO_WORLDS = ["cobnut", "blr_kitchen"] as const;\n'),
    ],
    "tools/worldgen/src/cli.ts": [
        (b"// A demo business behind apps/web (cobnut, the demo bakery; blr_kitchen, the Bengaluru cloud kitchen; snacky_shack, the Geelong\n"
         b"// smash-burger takeaway) is a fresh tenant on every run unless\n",
         b"// A demo business behind apps/web (cobnut, the demo bakery; blr_kitchen, the Bengaluru cloud kitchen) is a fresh tenant on every\n"
         b"// run unless\n"),
    ],
    "apps/web/tests/businesses.test.ts": [
        (b'import * as snackyShackModule from "@/lib/businesses/snacky_shack";\n'
         b'import { SNACKY_SHACK } from "@/lib/businesses/snacky_shack/profile";\n', b""),
        (b"  for (const b of [COBNUT, BLR_KITCHEN, SNACKY_SHACK]) {\n", b"  for (const b of [COBNUT, BLR_KITCHEN]) {\n"),
        (b"[[COBNUT, cobnutModule], [BLR_KITCHEN, blrKitchenModule], [SNACKY_SHACK, snackyShackModule]] as const",
         b"[[COBNUT, cobnutModule], [BLR_KITCHEN, blrKitchenModule]] as const"),
        (b"  it(\"only The Snacky Shack's menu is real: its labels say so, the others stay all synthetic\", () => {\n"
         b"    expect(BLR_KITCHEN.dataWords).toEqual(COBNUT.dataWords);\n"
         b'    for (const words of Object.values(SNACKY_SHACK.dataWords)) expect(words.toLowerCase()).toContain("real menu, synthetic history");\n',
         b'  it("both businesses say all of their data is synthetic", () => {\n'
         b"    expect(BLR_KITCHEN.dataWords).toEqual(COBNUT.dataWords);\n"),
        (b'  it("snacky_shack: an Australian shop reads Australian mobile numbers", () => {\n'
         b'    expect(SNACKY_SHACK.country).toBe("AU");\n'
         b'    expect(SNACKY_SHACK.locale).toBe("en-AU");\n'
         b'    expect(SNACKY_SHACK.tz).toBe("Australia/Melbourne");\n',
         b'  it("an Australian shop reads Australian mobile numbers", () => {\n'),
    ],
    # The one-business-per-build gate, for the two businesses this repository carries. Cobnut's build must not carry Kosambari's
    # name or display face (as before); Kosambari's must not carry Cobnut's display face (Fraunces, only in lib/businesses/cobnut).
    "apps/web/scripts/bundle-isolation.sh": [
        (b"A real business that has not agreed to be shown\n# must never ship inside another's build (next.config.ts).",
         b"A business\n# must never ship inside another's build (next.config.ts)."),
        (b"#   apps/web/scripts/bundle-isolation.sh [cobnut|blr_kitchen|snacky_shack ...]    (default: all three)\n",
         b"#   apps/web/scripts/bundle-isolation.sh [cobnut|blr_kitchen ...]    (default: both)\n"),
        (b"forbidden() { case $1 in cobnut) echo 'snacky|shack|kosambari|bowlby|baloo' ;; blr_kitchen) echo 'snacky|shack|bowlby' ;; snacky_shack) echo 'kosambari|baloo' ;; esac; }\n",
         b"forbidden() { case $1 in cobnut) echo 'kosambari|baloo' ;; blr_kitchen) echo 'fraunces' ;; esac; }\n"),
        (b"own() { case $1 in cobnut) echo 'Cobnut' ;; blr_kitchen) echo 'Kosambari' ;; snacky_shack) echo 'Snacky' ;; esac; }\n",
         b"own() { case $1 in cobnut) echo 'Cobnut' ;; blr_kitchen) echo 'Kosambari' ;; esac; }\n"),
        (b"    snacky_shack) echo 'The Snacky Shack \xe2\x80\x94 smash burgers, real menu, synthetic history (sample shop)' ;;\n", b""),
        (b"if [ $# -eq 0 ]; then sites=(cobnut blr_kitchen snacky_shack); else sites=(\"$@\"); fi\n",
         b"if [ $# -eq 0 ]; then sites=(cobnut blr_kitchen); else sites=(\"$@\"); fi\n"),
        (b"  case $s in cobnut | blr_kitchen | snacky_shack) ;; *) echo \"bundle-isolation: unknown business '$s' (cobnut, blr_kitchen, snacky_shack)\" >&2; exit 2 ;; esac\n",
         b"  case $s in cobnut | blr_kitchen) ;; *) echo \"bundle-isolation: unknown business '$s' (cobnut, blr_kitchen)\" >&2; exit 2 ;; esac\n"),
    ],
    # Both businesses here are invented outright; the line no longer points at a third.
    "apps/web/components/chrome.tsx": [
        (b"most are invented outright; one shows a real menu.", b"both businesses here are invented outright."),
    ],
    # The two files the README sends a reader to first: their headers without this repo's planning notes.
    "scripts/dev/nemotron-roles.ts": [
        (b"// Points platform.model_role at Nemotron (events build, P1). Local only:", b"// Points platform.model_role at Nemotron. Local only:"),
        (b"real prices are the founder's call", b"real prices are the operator's call"),
        (b"Token Factory model ids are provider-specific; the project owner has verified live inference from the application through Token Factory.",
         b"Token Factory model ids are provider-specific; live inference from the application through Token Factory has been verified."),
    ],
    "scripts/dev/nemotron-smoke.ts": [
        (b"// Live Nemotron smoke on a locally seeded world (events build, P1). Local only:", b"// Live Nemotron smoke on a locally seeded world. Local only:"),
        (b"`--rfq` only (events build, P2): a request", b"`--rfq` only: a request"),
        (b"went stale at the owner's approval (A.report.md, P2). Local database only.", b"went stale at the owner's approval. Local database only."),
    ],
    # This export's Makefile starts the local stack with `make up` alone (embedded Postgres and the local sign-in are its only mode).
    "scripts/dev/restart-svc.sh": [
        (b"# Restart ONE service of a running `MUNIM_IDP=local make up LOCAL_DB=1` stack, leaving local-db up.",
         b"# Restart ONE service of a running `make up` stack, leaving local-db up."),
    ],
    # Links into pages this export does not carry.
    "adapters/gcp/README.md": [(GCP_LINK, GCP_TEXT)],
    "packages/config/README.md": [(GCP_LINK, GCP_TEXT)],
    "services/core-worker/README.md": [(GCP_LINK, GCP_TEXT)],
    "services/core-api/README.md": [
        (GCP_LINK, GCP_TEXT),
        (b"). See\n[`docs/api.md`](../../docs/api.md) for the summary.\n", b").\n"),
    ],
    "packages/contracts/README.md": [
        (b"See [`docs/api.md`](../../docs/api.md) for the API this describes.\n",
         b"The OpenAPI documents generated into [`generated/openapi/`](./generated/openapi/) describe the API.\n"),
    ],
    "services/intel/README.md": [
        (b"The design is in [`ARCHITECTURE.md`](../../ARCHITECTURE.md) and",
         b"The design is in [`docs/core-architecture.md`](../../docs/core-architecture.md) and"),
    ],
    "db/README.md": [
        (b"The data-model page in [`../docs/data-model.md`](../docs/data-model.md) is a map of\nthe result.",
         b"The core architecture page, [`../docs/core-architecture.md`](../docs/core-architecture.md), describes\nthe result."),
    ],
}


def file_map(path: str, data: bytes) -> bytes:
    """The reviewed rewrites of one file; a pair that does not match exactly once stops the export."""
    for old, new in FILE_MAP.get(path, []):
        n = data.count(old)
        if n != 1:
            raise SystemExit(f"export: the reviewed rewrite of {path} matched {n} time(s), not once (the file changed; review it): {old.decode()[:70]!r}")
        data = data.replace(old, new)
    return data


# ---- the commit ----------------------------------------------------------------------------------------------------
AUTHOR = ("Satvik Sawhney", "satvik.sawhney2005@gmail.com")
MESSAGE = "Munim: the restaurant operating system whose agents answer from the books, on NVIDIA Nemotron"

# ---- the gates -----------------------------------------------------------------------------------------------------
# No mention of an AI coding tool or of how the code was made, no employer and no private project, no address but the author's,
# and nothing of The Snacky Shack: its name, its town, its display face, or a dish name only its menu has. Product words stay legal:
# "AI", "agent", "subagent", "openai" (a configured model provider), "regenerated with", the hosting and graph words, and
# "Smashed Avo" (a synthetic Australian dish in the country pack's golden receipt).
FORBIDDEN = re.compile(
    rb"claude|anthropic|juspay"
    rb"|snacky|shack|geelong|bowlby"
    rb"|smash mate|moo (?:&|&amp;|and) cluck|double trouble|aussie mate|lava chicken|avo ranch"
    rb"|manjeetpathak"  # the teammate's e-mail
    rb"|codex|copilot|chatgpt|co-authored-by|\bgenerated with\b|\b(?:ai|llm)[- ](?:assisted|generated)\b"
    rb"|coding[- ](?:assistant|agent)|shipyard"
    rb"|(?<![\w.-])agents\.md(?![\w-])",  # an AGENTS.md file or mention; docs/ai-agents.md is not one
    re.I,
)

# The overlay's docs describe the product, never how it was built: no process words, no planning ids, no evidence labels.
OVERLAY_WORDS = re.compile(
    rb"(?i:\bfounder|\borchestrat|\blanes?\b|\bgotcha|\bcouncil\b|\bhandoff\b|\bdecision ledger\b|\bhackathon|"
    rb"\bspike\b|\bsubmission page\b|\bwave\b)"
    rb"|\b(?:R[0-9]{1,2}|T-[0-9]{3}[a-z]?|[DFG]-?[0-9]{1,2}|[MW][0-9](?:\.[0-9])?|ADR-[0-9]+|EV-[A-Z0-9]+|P[0-6])\b"
    rb"|\b(?:FACT|INFERENCE|UNVERIFIED)\b|\xc2\xa7"  # the planning docs' evidence labels, and section signs pointing into them
)

# Synthetic values the exported tests plant on purpose, each read.
SECRET_ALLOW: set[bytes] = {
    b"sb_secret_synthetic_0123456789",  # adapters/dev/blob-supabase/test/blob.test.ts
    b"sb_secret_synthetic_two_process_0123",  # adapters/dev/blob-supabase/test/two-process.test.ts
    b"sb_secret_synthetic_not_real",  # adapters/dev/idp-supabase/test/demo-accounts.test.ts
    b"sb_publishable_synthetic_not_real",  # the same test
    b"sfk_PLANT_storefront_77",  # deploy/vercel/test/env-setup.test.ts: a planted storefront key the setup must forward
}


def secret_hits(data: bytes) -> list[bytes]:
    return [h for h in cup.secret_hits(data) if h not in SECRET_ALLOW]
