# Munim, run on your machine: an embedded Postgres and every service as a local process. Node 22.18+, pnpm 11, uv; no Docker and no
# cloud account. The AI service answers from recorded model responses unless MUNIM_MODEL_MODE=live is set with a provider key in
# .env (README: "Where Nemotron and Token Factory are used").
#   make up                          embedded Postgres, the AI service (intel), the simulated suppliers, core-api and core-worker
#   make demo [WORLD=cobnut]         seeds a demo business through the public API, then starts the web app as that business:
#                                    WORLD=cobnut (Cobnut Bakehouse, the default) or WORLD=blr_kitchen (Kosambari Kitchens)
#   make web [WORLD=cobnut]          (re)starts the web app as a business already seeded
#   make demo-tokens [WORLD=cobnut]  fresh sign-in tokens for the demo picker (they last one hour); no restart needed
#   make down                        stops everything; the local database is thrown away
# Everything listens on 127.0.0.1: web 3000 (WEB_PORT=…), core-api 8787, intel 8081, simulated suppliers 8090.
SHELL := /bin/bash
ROOT := $(CURDIR)
RUN := $(ROOT)/.run
LOCAL := $(RUN)/local
WORLD ?= cobnut
WEB_PORT ?= 3000
API := http://127.0.0.1:8787
INTEL := http://127.0.0.1:8081
SIM_URL := http://127.0.0.1:8090

.PHONY: up demo web demo-tokens down

# Starts one service in its own process group (set -m), so `make down` can stop it and its children by the recorded PID.
start_svc = if [ -f $(RUN)/$(1).pid ] && kill -0 "$$(cat $(RUN)/$(1).pid)" 2>/dev/null; then \
		echo "$(1): already running (pid $$(cat $(RUN)/$(1).pid))"; \
	else \
		( cd $(2) && exec $(3) ) > $(RUN)/$(1).log 2>&1 & echo $$! > $(RUN)/$(1).pid; \
		echo "$(1): started (pid $$(cat $(RUN)/$(1).pid)), log $(RUN)/$(1).log"; \
	fi

# Every service reads the same development settings: the local sign-in (MUNIM_IDP=local, which core-api accepts only with
# MUNIM_ENV=dev) and the run directory that holds the local database's address, the run-token keys and each business's site files.
dev_env = export MUNIM_ENV=dev MUNIM_IDP=local MUNIM_RUN_DIR=$(LOCAL) SUPPLIERS_SIM_PUBLIC_URL=$(SIM_URL)

world_ok = case "$(WORLD)" in cobnut|blr_kitchen) ;; *) echo "make $@: FAIL — WORLD must be cobnut or blr_kitchen" >&2; exit 1 ;; esac

up:
	@mkdir -p $(LOCAL)
	@set -m -euo pipefail; \
	$(dev_env); \
	$(call start_svc,local-db,$(ROOT),node scripts/dev/local-db.ts); \
	for i in $$(seq 1 240); do [ -f $(LOCAL)/local-db.json ] && break; sleep 0.5; done; \
	[ -f $(LOCAL)/local-db.json ] || { echo "make up: FAIL — local-db not ready, see $(RUN)/local-db.log" >&2; exit 1; }; \
	export MUNIM_DATABASE_URL=$$(node -p 'require("$(LOCAL)/local-db.json").url'); \
	node $(ROOT)/scripts/dev/preflight.ts; \
	$(call start_svc,intel,$(ROOT)/services/intel,uv run --locked python -m munim_intel); \
	$(call start_svc,suppliers-sim,$(ROOT)/services/suppliers-sim,uv run --locked python -m suppliers_sim); \
	$(call start_svc,core-api,$(ROOT)/services/core-api,node src/server.ts); \
	$(call start_svc,core-worker,$(ROOT)/services/core-worker,node src/main.ts); \
	for svc in "core-api $(API)" "intel $(INTEL)"; do \
		set -- $$svc; status=000; \
		for i in $$(seq 1 120); do \
			status=$$(curl -s -o /dev/null -w '%{http_code}' "$$2/health" || true); \
			[ "$$status" = 200 ] && break; sleep 0.5; \
		done; \
		echo "$$1 /health: $$status"; \
		[ "$$status" = 200 ] || { echo "make up: FAIL — $$1 /health is $$status; see $(RUN)/$$1.log; \`make down\` stops everything" >&2; exit 1; }; \
	done; \
	dead=0; \
	for f in $(RUN)/*.pid; do \
		kill -0 "$$(cat "$$f")" 2>/dev/null || { n=$$(basename "$$f" .pid); echo "make up: FAIL — $$n exited; see $(RUN)/$$n.log" >&2; dead=1; }; \
	done; \
	[ $$dead = 0 ] && echo "up: every service running, models $${MUNIM_MODEL_MODE:-recorded}; next: make demo"

# Seeds the business through the public API as its synthetic people, with tokens the local sign-in mints. A platform operator
# provisions it (its "Sample data" flag, its AI budget and, for Cobnut, the AI roles' prices are platform settings an operator
# approves); scripts/dev/local-operator.ts adds that operator to the local database first. Each run seeds a fresh business.
demo:
	@$(world_ok)
	@[ -f $(LOCAL)/local-db.json ] || { echo "make demo: FAIL — nothing is running; run make up first" >&2; exit 1; }
	@set -euo pipefail; \
	$(dev_env); \
	node $(ROOT)/scripts/dev/local-operator.ts --world=$(WORLD); \
	T=$$(MUNIM_SEED_OPERATOR=1 node $(ROOT)/adapters/dev/idp-local/mint-seed-tokens.ts --world=$(WORLD) --url=$(API) --run-dir=$(LOCAL)); \
	MUNIM_SEED_TOKENS="$$T" MUNIM_API_URL=$(API) node $(ROOT)/tools/worldgen/src/cli.ts --world=$(WORLD)
	@$(MAKE) --no-print-directory web WORLD=$(WORLD)

# The web app, live against core-api through its own /api rewrite, as one seeded business (its storefront key and demo tenant from
# the seed's site.env; NEXT_PUBLIC_MUNIM_SITE picks the business's look at build time). The demo picker signs in as its people.
# A business other than Cobnut builds into its own directory (.next-<world>), so switching businesses never serves the other's
# compiled pages; next dev adds that directory to tsconfig.json when it starts, and the committed file is put back once it answers.
web: demo-tokens
	@set -m -euo pipefail; \
	$(dev_env); \
	if [ -f $(RUN)/web.pid ]; then kill -TERM -- "-$$(cat $(RUN)/web.pid)" 2>/dev/null || true; rm -f $(RUN)/web.pid; sleep 1; fi; \
	set -a; . $(LOCAL)/$(WORLD)/site.env; set +a; \
	export MUNIM_DEMO_SIGNIN=1 NEXT_PUBLIC_MUNIM_API=/api MUNIM_API_ORIGIN=$(API) MUNIM_DEMO_TOKENS=$(LOCAL)/$(WORLD)/demo-tokens.json NEXT_PUBLIC_MUNIM_SITE=$(WORLD); \
	if [ "$(WORLD)" != cobnut ]; then export MUNIM_WEB_DIST_DIR=.next-$(WORLD); cp $(ROOT)/apps/web/tsconfig.json $(RUN)/tsconfig.web.json; fi; \
	$(call start_svc,web,$(ROOT)/apps/web,node_modules/.bin/next dev -H 127.0.0.1 -p $(WEB_PORT)); \
	web=000; \
	for i in $$(seq 1 240); do \
		web=$$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$(WEB_PORT)/staff/sign-in" || true); \
		[ "$$web" = 200 ] && break; sleep 0.5; \
	done; \
	if [ -f $(RUN)/tsconfig.web.json ]; then cp $(RUN)/tsconfig.web.json $(ROOT)/apps/web/tsconfig.json; rm -f $(RUN)/tsconfig.web.json; fi; \
	echo "web /staff/sign-in: $$web"; \
	[ "$$web" = 200 ] || { echo "make web: FAIL — the web app did not answer; see $(RUN)/web.log" >&2; exit 1; }; \
	echo "web: open http://127.0.0.1:$(WEB_PORT)/staff/sign-in and pick the owner"

# The demo picker reads the tokens file at each sign-in, so new tokens work at once.
demo-tokens:
	@$(world_ok)
	@[ -f $(LOCAL)/$(WORLD)/site.env ] || { echo "make $@: FAIL — $(WORLD) is not seeded yet; run make demo WORLD=$(WORLD)" >&2; exit 1; }
	@umask 077; $(dev_env); \
	node $(ROOT)/adapters/dev/idp-local/mint-seed-tokens.ts --world=$(WORLD) --url=$(API) --run-dir=$(LOCAL) > $(LOCAL)/$(WORLD)/demo-tokens.json.tmp \
		&& mv $(LOCAL)/$(WORLD)/demo-tokens.json.tmp $(LOCAL)/$(WORLD)/demo-tokens.json \
		&& echo "demo-tokens: wrote $(LOCAL)/$(WORLD)/demo-tokens.json (valid for an hour)"

down:
	@shopt -s nullglob; stopped=0; \
	for f in $(RUN)/*.pid; do \
		pid=$$(cat "$$f"); \
		if kill -0 "$$pid" 2>/dev/null; then kill -TERM -- "-$$pid" 2>/dev/null || kill -TERM "$$pid"; stopped=$$((stopped+1)); fi; \
		rm -f "$$f"; \
	done; \
	echo "down: stopped $$stopped process group(s)"
