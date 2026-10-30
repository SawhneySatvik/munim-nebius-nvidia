#!/usr/bin/env bash
# Restart ONE service of a running `MUNIM_IDP=local make up LOCAL_DB=1` stack, leaving local-db up. local-db is a
# throwaway embedded Postgres: stopping it deletes every seeded world, so `make down` is never the way to pick up a code
# change. Usage:
#   scripts/dev/restart-svc.sh intel|core-api|core-worker|suppliers-sim
#   scripts/dev/restart-svc.sh web [world=cobnut] [port=3000]   the web, live against core-api (same-origin /api rewrite:
#                                                              core-api sends no CORS on member routes), as that seeded world
#                                                              (its site.env; fresh demo sign-in tokens)
#   scripts/dev/restart-svc.sh tokens [world=cobnut]           re-mint that world's demo sign-in tokens (they last 1 h);
#                                                              the web reads the file on each sign-in, so no restart
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
RUN=$ROOT/.run
svc=${1:?usage: restart-svc.sh intel|core-api|core-worker|web|suppliers-sim|tokens}
world=${2:-cobnut}
port=${3:-3000}
[ -f "$RUN/local/local-db.json" ] || { echo "restart-svc: no local-db.json; the stack is not running on the local database" >&2; exit 1; }
export MUNIM_ENV=dev MUNIM_IDP=local MUNIM_RUN_DIR=$RUN/local
export MUNIM_DATABASE_URL=$(node -p "require('$RUN/local/local-db.json').url")
case "$MUNIM_DATABASE_URL" in postgresql://127.0.0.1:*) ;; *) echo "restart-svc: database is not local; stop" >&2; exit 1 ;; esac
export SUPPLIERS_SIM_PUBLIC_URL=${SUPPLIERS_SIM_PUBLIC_URL:-http://127.0.0.1:${SUPPLIERS_SIM_PORT:-8090}}
mint() {
  local site=$RUN/local/$world
  [ -f "$site/site.env" ] || { echo "restart-svc: $site/site.env missing; seed $world first" >&2; exit 1; }
  umask 077
  node "$ROOT/adapters/dev/idp-local/mint-seed-tokens.ts" --world="$world" --url=http://127.0.0.1:${PORT:-8787} --run-dir="$RUN/local" > "$site/demo-tokens.json.tmp"
  mv "$site/demo-tokens.json.tmp" "$site/demo-tokens.json"
  echo "tokens: re-minted for $world (1 h)"
}
if [ "$svc" = tokens ]; then mint; exit 0; fi
pidname=$svc
case "$svc" in
  intel) dir=$ROOT/services/intel; cmd="uv run --locked python -m munim_intel" ;;
  suppliers-sim) dir=$ROOT/services/suppliers-sim; cmd="uv run --locked python -m suppliers_sim" ;;
  core-api) dir=$ROOT/services/core-api; cmd="node src/server.ts" ;;
  core-worker) dir=$ROOT/services/core-worker; cmd="node src/main.ts" ;;
  web)
    mint
    set -a; . "$RUN/local/$world/site.env"; set +a
    export MUNIM_DEMO_SIGNIN=1 NEXT_PUBLIC_MUNIM_API=/api MUNIM_API_ORIGIN=http://127.0.0.1:${PORT:-8787} MUNIM_DEMO_TOKENS=$RUN/local/$world/demo-tokens.json NEXT_PUBLIC_MUNIM_SITE=$world
    if [ "$port" != 3000 ]; then pidname=web-$world; export MUNIM_WEB_DIST_DIR=.next-$world; fi
    dir=$ROOT/apps/web; cmd="node_modules/.bin/next dev -H 127.0.0.1 -p $port" ;;
  *) echo "restart-svc: unknown service $svc (local-db is never restarted)" >&2; exit 1 ;;
esac
if [ -f "$RUN/$pidname.pid" ]; then
  pid=$(cat "$RUN/$pidname.pid")
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
fi
set -m
[ -n "${MUNIM_WEB_DIST_DIR:-}" ] && cp "$ROOT/apps/web/tsconfig.json" "$RUN/tsconfig.$pidname.json"
( cd "$dir" && exec $cmd ) > "$RUN/$pidname.log" 2>&1 & echo $! > "$RUN/$pidname.pid"
echo "$pidname: restarted (pid $(cat "$RUN/$pidname.pid")), log $RUN/$pidname.log"
if [ -n "${MUNIM_WEB_DIST_DIR:-}" ]; then
  # next dev adds its distDir's type paths to tsconfig.json on start; put the committed file back once it is up.
  for _ in $(seq 1 120); do grep -q "Ready in" "$RUN/$pidname.log" 2>/dev/null && break; sleep 0.5; done
  sleep 2; cp "$RUN/tsconfig.$pidname.json" "$ROOT/apps/web/tsconfig.json"; rm -f "$RUN/tsconfig.$pidname.json"
fi
