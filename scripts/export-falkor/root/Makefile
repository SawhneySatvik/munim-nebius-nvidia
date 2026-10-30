# Munim on FalkorDB: the fully local run. Node 22.18+, pnpm 11, uv; no Docker, no cloud account, no API key.
#   make falkordb-fetch   the pinned FalkorDB server (Redis 8.6.2 with the FalkorDB 4.18.3 module) into .run/falkordb/<platform>/
#   make up               an embedded Postgres, FalkorDB, intel (MUNIM_INTEL=stub, the default, or real), the simulated suppliers,
#                         core-api, core-worker and the web app, each in its own process group, logs in .run/<name>.log
#   make demo             seeds Cobnut Bakehouse (synthetic) through the public API, then restarts the web app signed in to it
#   make demo-tokens      fresh sign-in tokens for the demo picker (they last one hour); no restart needed
#   make down             stops everything; the local database is thrown away
# Everything listens on 127.0.0.1, on these ports (each can be changed, e.g. `make up WEB_PORT=3100`, given the same way to `make demo`).
SHELL := /bin/bash
ROOT := $(CURDIR)
RUN := $(ROOT)/.run
LOCAL := $(RUN)/local
WEB_PORT ?= 3000
API_PORT ?= 8787
INTEL_PORT ?= 8081
SIM_PORT ?= 8090
FALKORDB_PORT ?= 6380
API := http://127.0.0.1:$(API_PORT)
SIM_URL := http://127.0.0.1:$(SIM_PORT)

.PHONY: falkordb-fetch falkordb-up up demo demo-tokens down

# Starts one service in its own process group (set -m), so `make down` can stop it and its children by the recorded PID.
start_svc = if [ -f $(RUN)/$(1).pid ] && kill -0 "$$(cat $(RUN)/$(1).pid)" 2>/dev/null; then \
		echo "$(1): already running (pid $$(cat $(RUN)/$(1).pid))"; \
	else \
		( cd $(2) && exec $(3) ) > $(RUN)/$(1).log 2>&1 & echo $$! > $(RUN)/$(1).pid; \
		echo "$(1): started (pid $$(cat $(RUN)/$(1).pid)), log $(RUN)/$(1).log"; \
	fi

falkordb-fetch:
	node $(ROOT)/scripts/dev/fetch-falkordb.ts

# A local FalkorDB server with no persistence.
falkordb-up: falkordb-fetch
	@mkdir -p $(RUN)/falkordb-data
	@set -m -euo pipefail; \
	bin=$(RUN)/falkordb/$$(node -p 'process.platform + "-" + process.arch')/redislite/bin; \
	$(call start_svc,falkordb,$(ROOT),$$bin/redis-server --port $(FALKORDB_PORT) --bind 127.0.0.1 --loadmodule $$bin/falkordb.so --save "" --appendonly no --dir $(RUN)/falkordb-data); \
	for i in $$(seq 1 50); do $$bin/redis-cli -p $(FALKORDB_PORT) PING 2>/dev/null | grep -q PONG && break; sleep 0.1; done; \
	$$bin/redis-cli -p $(FALKORDB_PORT) PING 2>/dev/null | grep -q PONG || { echo "make falkordb-up: FAIL — no PONG on $(FALKORDB_PORT); see $(RUN)/falkordb.log" >&2; exit 1; }; \
	echo "falkordb: redis://127.0.0.1:$(FALKORDB_PORT)"

# The local sign-in (MUNIM_IDP=local) is for development only: core-api refuses it unless MUNIM_ENV=dev, which this sets.
up:
	@mkdir -p $(RUN) $(LOCAL)
	@set -m -euo pipefail; \
	export MUNIM_ENV=dev MUNIM_IDP=local MUNIM_GRAPH=falkordb MUNIM_RUN_DIR=$(LOCAL) PORT=$(API_PORT); \
	export MUNIM_INTEL_URL=http://127.0.0.1:$(INTEL_PORT) SUPPLIERS_SIM_PORT=$(SIM_PORT) SUPPLIERS_SIM_PUBLIC_URL=$(SIM_URL); \
	intel=$${MUNIM_INTEL:-stub}; \
	case "$$intel" in stub|real) ;; *) echo "make up: FAIL — MUNIM_INTEL must be exactly stub or real" >&2; exit 1 ;; esac; \
	$(call start_svc,local-db,$(ROOT),node scripts/dev/local-db.ts); \
	for i in $$(seq 1 240); do [ -f $(LOCAL)/local-db.json ] && break; sleep 0.5; done; \
	[ -f $(LOCAL)/local-db.json ] || { echo "make up: FAIL — local-db not ready, see $(RUN)/local-db.log" >&2; exit 1; }; \
	export MUNIM_DATABASE_URL=$$(node -p 'require("$(LOCAL)/local-db.json").url'); \
	$(MAKE) --no-print-directory falkordb-up; \
	export MUNIM_FALKORDB_URL=redis://127.0.0.1:$(FALKORDB_PORT); \
	node $(ROOT)/scripts/dev/preflight.ts; \
	if [ "$$intel" = real ]; then \
		$(call start_svc,intel,$(ROOT)/services/intel,uv run --locked python -m munim_intel); \
	else \
		$(call start_svc,intel-stub,$(ROOT),node scripts/dev/intel-stub.ts --port=$(INTEL_PORT)); \
	fi; \
	$(call start_svc,suppliers-sim,$(ROOT)/services/suppliers-sim,uv run --locked python -m suppliers_sim); \
	$(call start_svc,core-api,$(ROOT)/services/core-api,node src/server.ts); \
	$(call start_svc,core-worker,$(ROOT)/services/core-worker,node src/main.ts); \
	$(call start_svc,web,$(ROOT)/apps/web,node_modules/.bin/next dev -H 127.0.0.1 -p $(WEB_PORT)); \
	status=000; \
	for i in $$(seq 1 60); do \
		status=$$(curl -s -o $(RUN)/health.json -w '%{http_code}' "$(API)/health" || true); \
		[ "$$status" = 200 ] && break; sleep 0.5; \
	done; \
	echo "core-api /health: $$status $$(cat $(RUN)/health.json 2>/dev/null)"; \
	[ "$$status" = 200 ] || { echo "make up: FAIL — core-api /health is $$status; see $(RUN)/core-api.log; \`make down\` stops everything" >&2; exit 1; }; \
	dead=0; \
	for f in $(RUN)/*.pid; do \
		kill -0 "$$(cat "$$f")" 2>/dev/null || { n=$$(basename "$$f" .pid); echo "make up: FAIL — $$n exited; see $(RUN)/$$n.log" >&2; dead=1; }; \
	done; \
	[ $$dead = 0 ] && echo "up: every service running; next: make demo"

# Seeds Cobnut Bakehouse into the running core-api, then points the web app at it and restarts it. The seed signs in as the
# Cobnut people with tokens the local sign-in mints (they last one hour; run `make demo` again for a fresh business and fresh
# tokens). The platform operator it also needs is added to the local database first (scripts/dev/local-operator.ts).
demo:
	@[ -f $(LOCAL)/local-db.json ] || { echo "make demo: FAIL — nothing is running; run make up first" >&2; exit 1; }
	@set -m -euo pipefail; \
	node $(ROOT)/scripts/dev/local-operator.ts; \
	T=$$(MUNIM_SEED_OPERATOR=1 node $(ROOT)/adapters/dev/idp-local/mint-seed-tokens.ts --world=cobnut --url=$(API) --run-dir=$(LOCAL)); \
	MUNIM_SEED_TOKENS="$$T" SUPPLIERS_SIM_PUBLIC_URL=$(SIM_URL) MUNIM_API_URL=$(API) node $(ROOT)/tools/worldgen/src/cli.ts --world=cobnut; \
	{ echo "NEXT_PUBLIC_MUNIM_API=/api"; echo "MUNIM_API_ORIGIN=$(API)"; echo "MUNIM_GRAPH=falkordb"; \
	  echo "MUNIM_DEMO_SIGNIN=1"; echo "MUNIM_IDP=local"; cat $(RUN)/cobnut/site.env; } > $(ROOT)/apps/web/.env.local; \
	echo "demo: wrote apps/web/.env.local"; \
	if [ -f $(RUN)/web.pid ]; then kill -TERM -- "-$$(cat $(RUN)/web.pid)" 2>/dev/null || true; rm -f $(RUN)/web.pid; sleep 1; fi; \
	export MUNIM_GRAPH=falkordb; \
	$(call start_svc,web,$(ROOT)/apps/web,node_modules/.bin/next dev -H 127.0.0.1 -p $(WEB_PORT)); \
	web=000; \
	for i in $$(seq 1 120); do \
		web=$$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$(WEB_PORT)/staff/sign-in" || true); \
		[ "$$web" = 200 ] && break; sleep 0.5; \
	done; \
	echo "web /staff/sign-in: $$web"; \
	[ "$$web" = 200 ] || { echo "make demo: FAIL — the web app did not answer; see $(RUN)/web.log" >&2; exit 1; }; \
	echo "demo: open http://127.0.0.1:$(WEB_PORT)/staff/sign-in, pick the owner, then http://127.0.0.1:$(WEB_PORT)/staff/suppliers/map"

# The demo picker reads the tokens file at each sign-in, so new tokens work at once.
demo-tokens:
	@[ -f $(RUN)/cobnut/site.env ] || { echo "make demo-tokens: FAIL — no demo business yet; run make demo first" >&2; exit 1; }
	@umask 077; T=$$(node $(ROOT)/adapters/dev/idp-local/mint-seed-tokens.ts --world=cobnut --url=$(API) --run-dir=$(LOCAL)) \
		&& printf '%s\n' "$$T" > $(RUN)/cobnut/demo-tokens.json && echo "demo-tokens: wrote $(RUN)/cobnut/demo-tokens.json (valid for an hour)"

down:
	@shopt -s nullglob; stopped=0; \
	for f in $(RUN)/*.pid; do \
		pid=$$(cat "$$f"); \
		if kill -0 "$$pid" 2>/dev/null; then kill -TERM -- "-$$pid" 2>/dev/null || kill -TERM "$$pid"; stopped=$$((stopped+1)); fi; \
		rm -f "$$f"; \
	done; \
	echo "down: stopped $$stopped process group(s)"
