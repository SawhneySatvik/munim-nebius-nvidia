# Munim — every entry point. Targets owned by a later ticket call that owner's script and, until it
# exists, fail with "not implemented yet — owned by <ticket>" (a missing script must never pass).
# Dev runs as local processes against the hosted dev Supabase project in .env; no Docker (R31).
SHELL := /bin/bash
ROOT := $(CURDIR)
RUN := $(ROOT)/.run

# `pnpm -F <x> run y` exits 0 when no workspace project matches <x>; --fail-if-no-match makes that red.
# Filters are package directories, so a target never depends on a package name it has to guess.
PNPM_IN = pnpm --fail-if-no-match --filter ./$(1)

# $(call need_script,<package dir>,<script>,<owner>): fail unless <package dir>/package.json has <script>.
need_script = node -e 'const s=require("$(ROOT)/$(1)/package.json").scripts||{};process.exit(s["$(2)"]?0:1)' 2>/dev/null \
	|| { echo "make $@: not implemented yet — owned by $(3)" >&2; exit 1; }
# $(call need_file,<path>,<owner>)
need_file = [ -x "$(ROOT)/$(1)" ] || { echo "make $@: not implemented yet — owned by $(2)" >&2; exit 1; }
need_env = [ -f "$(ROOT)/.env" ] || { echo "make $@: FAIL — missing .env — see .env.example (R31)" >&2; exit 1; }

.PHONY: ontology up down dev-db falkordb-fetch falkordb-up smoke smoke-redproof smoke-live db-ping check lint typecheck boundaries boundaries-redproof intel-redproof test test-db contracts seed eval deploy-gcp export-cup

# ---- local dev ---------------------------------------------------------------------------------
db-ping:
	node $(ROOT)/scripts/db-ping.mts

# make up               core-api, core-worker, the intel stub and web against the hosted dev Supabase project
#                       (.env through packages/config; run `make dev-db` once first for the role passwords)
# make up LOCAL_DB=1    the same against a throwaway embedded Postgres (no hosted database; gone after `make down`)
# Each service runs in its own process group (set -m) so `make down` can stop it, and its children, by the
# recorded PID alone. Logs go to .run/<name>.log. Services run via node / node_modules/.bin, never pnpm (gotcha 27).
# `up` waits for core-api's /health and fails if it is not 200 (the processes stay up for `make down`).
start_svc = if [ -f $(RUN)/$(1).pid ] && kill -0 "$$(cat $(RUN)/$(1).pid)" 2>/dev/null; then \
		echo "$(1): already running (pid $$(cat $(RUN)/$(1).pid))"; \
	else \
		( cd $(2) && exec $(3) ) > $(RUN)/$(1).log 2>&1 & echo $$! > $(RUN)/$(1).pid; \
		echo "$(1): started (pid $$(cat $(RUN)/$(1).pid)), log $(RUN)/$(1).log"; \
	fi
# MUNIM_IDP=local make up LOCAL_DB=1   -> dev-only local sign-in (R44a); refuses NODE_ENV=production and any MUNIM_ENV other than dev (make up sets dev).
# make up also starts suppliers-sim (T-055: three SIMULATED supplier agents over A2A, no model, no secret) on
#                                          SUPPLIERS_SIM_PUBLIC_URL (default http://127.0.0.1:<SUPPLIERS_SIM_PORT, default 8090>;
#                                          its cards advertise it, gotcha 6).
# MUNIM_INTEL=real make up               -> the real intel service (services/intel, `python -m munim_intel`) instead of the
#                                          stub, on MUNIM_INTEL_URL (default 127.0.0.1:8081); MUNIM_INTEL=stub (default) keeps the stub.
up:
	@mkdir -p $(RUN)
	@set -m -euo pipefail; \
	export MUNIM_ENV=$${MUNIM_ENV:-dev}; \
	intel=$${MUNIM_INTEL:-stub}; \
	case "$$intel" in stub|real) ;; *) echo "make up: FAIL — MUNIM_INTEL must be exactly stub or real" >&2; exit 1 ;; esac; \
	if [ -n "$(LOCAL_DB)" ]; then \
		export MUNIM_RUN_DIR=$(RUN)/local; mkdir -p $(RUN)/local; \
		$(call start_svc,local-db,$(ROOT),node scripts/dev/local-db.ts); \
		for i in $$(seq 1 240); do [ -f $(RUN)/local/local-db.json ] && break; sleep 0.5; done; \
		[ -f $(RUN)/local/local-db.json ] || { echo "make up: FAIL — local-db not ready, see $(RUN)/local-db.log" >&2; exit 1; }; \
		export MUNIM_DATABASE_URL=$$(node -p 'require("$(RUN)/local/local-db.json").url'); \
	fi; \
	if [ "$${MUNIM_GRAPH:-}" = falkordb ] && [ -n "$(LOCAL_DB)" ]; then \
		$(MAKE) --no-print-directory falkordb-up; \
		export MUNIM_FALKORDB_URL=redis://127.0.0.1:$(FALKORDB_PORT); \
	fi; \
	node $(ROOT)/scripts/dev/preflight.ts; \
	if [ "$$intel" = real ]; then \
		$(call start_svc,intel,$(ROOT)/services/intel,uv run --locked python -m munim_intel); \
	else \
		$(call start_svc,intel-stub,$(ROOT),node scripts/dev/intel-stub.ts); \
	fi; \
	export SUPPLIERS_SIM_PUBLIC_URL=$${SUPPLIERS_SIM_PUBLIC_URL:-http://127.0.0.1:$${SUPPLIERS_SIM_PORT:-8090}}; \
	$(call start_svc,suppliers-sim,$(ROOT)/services/suppliers-sim,uv run --locked python -m suppliers_sim); \
	$(call start_svc,core-api,$(ROOT)/services/core-api,node src/server.ts); \
	$(call start_svc,core-worker,$(ROOT)/services/core-worker,node src/main.ts); \
	$(call start_svc,web,$(ROOT)/apps/web,node_modules/.bin/next dev -H 127.0.0.1 -p 3000); \
	port=$${PORT:-8787}; status=000; \
	for i in $$(seq 1 60); do \
		status=$$(curl -s -o $(RUN)/health.json -w '%{http_code}' "http://127.0.0.1:$$port/health" || true); \
		[ "$$status" = 200 ] && break; sleep 0.5; \
	done; \
	echo "core-api /health: $$status $$(cat $(RUN)/health.json 2>/dev/null)"; \
	[ "$$status" = 200 ] || { echo "make up: FAIL — core-api /health is $$status; see $(RUN)/core-api.log; \`make down\` stops everything" >&2; exit 1; }; \
	web=000; \
	for i in $$(seq 1 120); do \
		web=$$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/" || true); \
		[ "$$web" != 000 ] && break; kill -0 "$$(cat $(RUN)/web.pid)" 2>/dev/null || break; sleep 0.5; \
	done; \
	echo "web /: $$web"; \
	if [ "$$intel" = real ]; then \
		iurl=$${MUNIM_INTEL_URL:-http://127.0.0.1:8081}; istatus=000; \
		for i in $$(seq 1 60); do \
			istatus=$$(curl -s -o /dev/null -w '%{http_code}' "$${iurl%/}/health" || true); \
			[ "$$istatus" = 200 ] && break; sleep 0.5; \
		done; \
		echo "intel /health: $$istatus"; \
		[ "$$istatus" = 200 ] || { echo "make up: FAIL — intel /health is $$istatus; see $(RUN)/intel.log" >&2; exit 1; }; \
	fi; \
	dead=0; \
	for f in $(RUN)/*.pid; do \
		kill -0 "$$(cat "$$f")" 2>/dev/null || { n=$$(basename "$$f" .pid); echo "make up: FAIL — $$n exited; see $(RUN)/$$n.log" >&2; dead=1; }; \
	done; \
	[ $$dead = 0 ] && echo "up: every service running"

down:
	@shopt -s nullglob; stopped=0; \
	for f in $(RUN)/*.pid; do \
		pid=$$(cat "$$f"); \
		if kill -0 "$$pid" 2>/dev/null; then kill -TERM -- "-$$pid" 2>/dev/null || kill -TERM "$$pid"; stopped=$$((stopped+1)); fi; \
		rm -f "$$f"; \
	done; \
	echo "down: stopped $$stopped process group(s)"

# The FalkorDB test server the graph gates start (Redis 8.6.2 + FalkorDB 4.18.3 from the falkordblite wheel, sha256-pinned)
# into .run/falkordb/<platform>/; FALKORDB_TEST_VERSION=4.22.1 adds the official v4.22.1 module. Binaries are never committed.
falkordb-fetch:
	node $(ROOT)/scripts/dev/fetch-falkordb.ts

# make falkordb-up [FALKORDB_PORT=6380]   a local FalkorDB server as a `make up` service (no persistence; `make down` stops it).
# `MUNIM_GRAPH=falkordb make up LOCAL_DB=1` starts it and points MUNIM_FALKORDB_URL at it (the fully local set-up); without
# LOCAL_DB, MUNIM_FALKORDB_URL comes from .env (a hosted instance) through packages/config.
FALKORDB_PORT ?= 6380
falkordb-up: falkordb-fetch
	@mkdir -p $(RUN)/falkordb-data
	@set -m -euo pipefail; \
	bin=$(RUN)/falkordb/$$(node -p 'process.platform + "-" + process.arch')/redislite/bin; \
	$(call start_svc,falkordb,$(ROOT),$$bin/redis-server --port $(FALKORDB_PORT) --bind 127.0.0.1 --loadmodule $$bin/falkordb.so --save "" --appendonly no --dir $(RUN)/falkordb-data); \
	for i in $$(seq 1 50); do $$bin/redis-cli -p $(FALKORDB_PORT) PING 2>/dev/null | grep -q PONG && break; sleep 0.1; done; \
	$$bin/redis-cli -p $(FALKORDB_PORT) PING 2>/dev/null | grep -q PONG || { echo "make falkordb-up: FAIL — no PONG on $(FALKORDB_PORT); see $(RUN)/falkordb.log" >&2; exit 1; }; \
	echo "falkordb: redis://127.0.0.1:$(FALKORDB_PORT)"

# The hosted dev database: probes, migrations, role passwords (.run/db-roles.json), packs — through packages/config.
# THROUGH=NNNN applies only migrations up to that version (e.g. the frozen set).
dev-db:
	node $(ROOT)/scripts/dev/bootstrap-dev-db.ts $(if $(THROUGH),--through=$(THROUGH))

# ---- gates -------------------------------------------------------------------------------------
# Every gate runs even after one fails (gotcha 33: never stop before later results are reported); the
# summary names each failing gate and the exit is non-zero.
CHECK_GATES := lint typecheck boundaries test boundaries-redproof intel-redproof smoke smoke-redproof
check:
	@failed=""; results=""; \
	for t in $(CHECK_GATES); do \
		echo "=== make $$t"; \
		if $(MAKE) --no-print-directory $$t; then results="$$results  PASS  $$t\n"; \
		else results="$$results  FAIL  $$t\n"; failed="$$failed $$t"; fi; \
	done; \
	echo "=== make check: per-target results"; printf "$$results"; \
	if [ -n "$$failed" ]; then echo "make check: FAIL —$$failed" >&2; exit 1; fi; \
	echo "make check: ok"

# Each runs in every package even after one fails and prints a per-package PASS/FAIL list (W1 fix #68).
# TypeScript per package, then Python (ruff / mypy) per service; both halves run even when the first fails.
lint:
	@rc=0; $(ROOT)/scripts/check/pnpm-all.sh lint allow-none || rc=1; $(ROOT)/scripts/check/python.sh lint || rc=1; exit $$rc

typecheck:
	@rc=0; $(ROOT)/scripts/check/pnpm-all.sh typecheck || rc=1; $(ROOT)/scripts/check/python.sh typecheck || rc=1; exit $$rc

boundaries:
	$(ROOT)/scripts/check/boundaries.sh

# W1 integration smoke (T-009): real composition roots in-process on embedded Postgres + intel stub (~35 s).
smoke:
	node --test $(ROOT)/tests/smoke/smoke.test.ts

# T-059: the ONLY live-model target (real keys, real money). Explicit only: never in `check` or `test`. One call per
# provider per role; prints the provider x role matrix, the DM-mimic logprobs probe and the measured-tokens table.
smoke-live:
	MUNIM_MODEL_MODE=live uv run --locked --directory $(ROOT)/services/intel python tests/live/smoke_live.py

# Proves `make smoke` can fail: six wiring plants in a temp copy, each must exit non-zero naming its test (~4 min).
smoke-redproof:
	$(ROOT)/scripts/dev/smoke-redproof.sh

# Proves `make boundaries` can fail: plants each forbidden import in a temp copy of the tree.
boundaries-redproof:
	$(ROOT)/scripts/check/planted-violations.sh

# Proves intel's pytest gates can fail: plants each gate's defect in a temp copy, each must exit non-zero naming its test (~30 s).
# The graph red-proof's copies link .run/falkordb, so the FalkorDB test server is fetched first (cached; a CI gate job
# that runs only this target starts without it).
intel-redproof: falkordb-fetch
	$(ROOT)/scripts/check/intel-redproof.sh

# TypeScript: vitest per package. Python: pytest per service that has a pyproject.toml. The FalkorDB test server the graph
# adapter's gates start is fetched first (cached after the first run; a failed fetch fails the target, the suites still run).
test:
	@rc=0; \
	$(MAKE) --no-print-directory falkordb-fetch || { echo "make test: FAIL — falkordb-fetch (the graph adapter's gates need it)" >&2; rc=1; }; \
	$(ROOT)/scripts/check/pnpm-all.sh test || rc=1; \
	shopt -s nullglob; failed=""; ran=0; \
	for p in $(ROOT)/services/*/pyproject.toml; do \
		d=$$(dirname "$$p"); ran=$$((ran+1)); echo "pytest: $${d#$(ROOT)/}"; \
		uv run --locked --directory "$$d" --with pytest==9.1.1 pytest -q || failed="$$failed $${d#$(ROOT)/}"; \
	done; \
	if [ $$ran = 0 ]; then echo "pytest: SKIPPED — no services/*/pyproject.toml"; \
	elif [ -n "$$failed" ]; then echo "pytest: FAIL —$$failed" >&2; rc=1; \
	else echo "pytest: ok — $$ran service(s)"; fi; \
	exit $$rc

test-db:
	@$(call need_script,db,test,the migrator lane m-1 (M1))
	$(call PNPM_IN,db) test

# ---- generation, data, evals -------------------------------------------------------------------
# make ontology — regenerate packages/contracts/generated/ontology.json (T-080); run after `make contracts` and after any
# migration or contracts source change (its freshness gate goes red otherwise).
ontology:
	node $(ROOT)/packages/contracts/scripts/ontology.ts

contracts:
	@$(call need_script,packages/contracts,gen,T-002)
	$(call PNPM_IN,packages/contracts) gen

# make seed WORLD=restaurant_group|cloud_kitchen|store|au_outlet|cobnut [DAYS=183] [AS_OF=YYYY-MM-DD] [SEED=<seed>]
#   (cobnut: a fresh demo tenant each run unless SEED is given; needs an operator token and SUPPLIERS_SIM_PUBLIC_URL, the suppliers
#   simulator's public URL as intel has it, for its simulated suppliers' agent cards)
# Seeds a synthetic world into a RUNNING core-api (`make up` / `make up LOCAL_DB=1`) through the public /v1 API only (T-033).
# Local, no Supabase sign-ins (R44a):  MUNIM_IDP=local make up LOCAL_DB=1   then   make seed WORLD=store
# (tokens are minted only when neither variable below is set AND /health says idp "local"; dev only. `make up LOCAL_DB=1` keeps the server's
# signing key under .run/local, so that directory is used while its local-db.json exists (the local DB is up), else .run.)
# Otherwise needs MUNIM_SEED_TOKEN (the owner's bearer) or MUNIM_SEED_TOKENS (JSON, one per persona); MUNIM_API_URL defaults to
# http://127.0.0.1:$${PORT:-8787}. The world list and flags are validated by tools/worldgen/src/cli.ts. Read nothing from .env.
# Verify afterwards:  node tools/worldgen/verify/run.ts --world=$(WORLD) --as-of=<the as_of printed by seed>
seed:
	@[ -n "$(WORLD)" ] || { echo "make seed: FAIL — WORLD is required, e.g. make seed WORLD=restaurant_group" >&2; exit 1; }
	@if [ -z "$${MUNIM_SEED_TOKENS:-}" ] && [ -z "$${MUNIM_SEED_TOKEN:-}" ]; then \
		T=$$(node $(ROOT)/adapters/dev/idp-local/mint-seed-tokens.ts --world=$(WORLD) --url=$${MUNIM_API_URL:-http://127.0.0.1:$${PORT:-8787}} --run-dir=$(if $(wildcard $(RUN)/local/local-db.json),$(RUN)/local,$(RUN))) || { echo "make seed: FAIL — no tokens given and none can be minted (see above); set MUNIM_SEED_TOKENS for a Supabase-mode server" >&2; exit 1; }; \
		export MUNIM_SEED_TOKENS="$$T"; \
	fi; \
	node $(ROOT)/tools/worldgen/src/cli.ts --world=$(WORLD) $(if $(DAYS),--days=$(DAYS)) $(if $(LIVE_DAYS),--live-days=$(LIVE_DAYS)) $(if $(AS_OF),--as-of=$(AS_OF)) $(if $(SEED),--seed=$(SEED))

# make demo [WORLDS=restaurant_group,cloud_kitchen,store,au_outlet] [DAYS=183] [LIVE_DAYS=35] [AS_OF=YYYY-MM-DD]
# Seeds every world into a RUNNING core-api at once (one process per world; a world's own request log keeps its order, so the determinism
# gates still hold), then recomputes each world's answer key from the read routes and prints a per-world table (seconds, writes, planted,
# verify) and the total. Exit is non-zero if any world fails to seed or to verify. Logs: .run/demo/<world>.{seed,verify}.log.
# Six months of bills and waste go in as dated history files that the owner approves (R44b); attendance, rosters and temperature readings
# are still live commands and reach back LIVE_DAYS (14..DAYS, default 35) until their history kinds exist.
#   local sign-in:  MUNIM_IDP=local make up LOCAL_DB=1 && make demo      (tokens are minted; only against a server that reports idp "local")
#   Supabase:       make up && MUNIM_SEED_TOKENS_RESTAURANT_GROUP='{"owner":"…","manager":"…"}' MUNIM_SEED_TOKENS_CLOUD_KITCHEN='{"owner":"…","cashier":"…"}' \
#                   MUNIM_SEED_TOKENS_STORE='{"owner":"…"}' MUNIM_SEED_TOKENS_AU_OUTLET='{"owner":"…"}' make demo
#                   (one confirmed sign-in per persona per world; MUNIM_SEED_TOKENS is the fallback for any world without its own variable)
# MUNIM_API_URL defaults to http://127.0.0.1:$${PORT:-8787}. The seeded data is synthetic, suppliers are simulated, payments are recorded only.
demo:
	node $(ROOT)/tools/worldgen/demo.ts --run-dir=$(RUN) $(if $(WORLDS),--worlds=$(WORLDS)) $(if $(DAYS),--days=$(DAYS)) $(if $(LIVE_DAYS),--live-days=$(LIVE_DAYS)) $(if $(AS_OF),--as-of=$(AS_OF))

eval:
	@$(call need_file,evals/run.sh,T-034)
	$(ROOT)/evals/run.sh

# make eval-w3 (T-085): detectors vs the answer keys per specialist x world, investigation verdicts, recorded plumbing. Recorded models only.
.PHONY: eval-w3
eval-w3:
	$(ROOT)/evals/w3/run.sh

# ---- Cup -----------------------------------------------------------------------------------------
# make deploy-gcp PROJECT_ID=<id> [DEPLOY_ARGS="--only core-api,web --tag <tag> --skip-build --dry-run"]   (T-121)
# Builds the images with Cloud Build and deploys them to Cloud Run in asia-south1 (create or update, so re-running is safe), as
# whoever `gcloud auth` is signed in as. --dry-run prints every command and runs none. web needs MUNIM_DEMO_TENANT_ID=<the Cobnut
# tenant id the seed printed>. One-time setup, deploy order and rollback: infra/gcp/README.md. DEPLOY_ARGS goes to the script as is.
deploy-gcp:
	@$(call need_file,scripts/deploy-gcp.sh,T-121)
	$(ROOT)/scripts/deploy-gcp.sh $(DEPLOY_ARGS)

# make export-cup [EXPORT_ARGS="--out <dir> --ref <rev> --check --history"]   (T-123)
# The Cup repo, exported from a commit (default HEAD) to a new directory (default ../food-ops-cup, R60): only what the live
# services are built from (scripts/export-cup/rules.py), gated for forbidden words, secrets and dev-adapter imports.
# --check builds and tests the export on its own; --history makes it a git repository of this repo's history filtered to
# the export (on a throwaway clone; this repo is never rewritten). Never pushed, never given a remote.
export-cup:
	@$(call need_file,scripts/export-cup.sh,T-123)
	$(ROOT)/scripts/export-cup.sh $(EXPORT_ARGS)

# make export-falkor [EXPORT_ARGS="--out <dir> --ref <rev> --check"]
# The FalkorDB repository, exported from a commit (default HEAD) to a new directory (default business-graph beside the main
# checkout) as a git repository with one fresh commit: only what the live demo and the local set-up run
# (scripts/export-falkor/rules.py), gated for forbidden words, secrets, process words in its docs, the Cypher doc and links.
# --check builds and tests the export on its own (needs `make falkordb-fetch` first). Never pushed, never given a remote.
.PHONY: export-falkor
export-falkor:
	$(ROOT)/scripts/export-falkor.sh $(EXPORT_ARGS)

# make export-nebius [EXPORT_ARGS="--out <dir> --ref <rev> --check"]
# The public Munim repository (Apache-2.0), exported from a commit (default HEAD) to a new directory (default munim-nebius beside the
# main checkout) as a git repository with one fresh commit: the full source without the Snacky Shack or this repo's process files
# (scripts/export-nebius/rules.py), gated for forbidden words, secrets, process words in its docs, the licence text and links.
# --check builds and tests the export on its own (needs `make falkordb-fetch` first). Never pushed, never given a remote.
.PHONY: export-nebius
export-nebius:
	$(ROOT)/scripts/export-nebius.sh $(EXPORT_ARGS)
