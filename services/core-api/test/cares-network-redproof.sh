#!/usr/bin/env bash
# Red-proof of the T-095b gates (services/core-api/test/cares-network.test.ts). No flags (gotcha 17):
#   services/core-api/test/cares-network-redproof.sh
# The plants are reverts of the code under test, so they are made in a throwaway rsync copy of the repo (never the shared
# tree): MUNIM_REDPROOF_DIR, default <repo>/scratchpad/redproof-t095b (git-ignored), deleted at the end.
# 1. The clean copy must exit 0.
# 2. Per plant (an exact one-occurrence source replacement), the test file must exit non-zero (gotcha 33: judged by the
#    process exit code) AND its FAIL lines must name each gate the plant breaks.
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="${MUNIM_REDPROOF_DIR:-$ROOT/scratchpad/redproof-t095b}"
COPY="$WORK/tree"
OUT="$WORK/logs"
mkdir -p "$COPY" "$OUT"
rsync -a --delete --exclude .git --exclude .env --exclude .run --exclude /scratchpad --exclude .venv --exclude apps/site/.next "$ROOT/" "$COPY/"
API="$COPY/services/core-api"
fail=0
row() { printf '%-6s %-18s %s\n' "$1" "$2" "$3"; }
run() { (cd "$API" && node_modules/.bin/vitest run test/cares-network.test.ts >"$OUT/$1.log" 2>&1); }

# plant FILE OLD NEW: replace exactly one occurrence (a plant that does not apply is itself a failure).
plant() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path).read()
if s.count(old) != 1:
    sys.exit(f"plant does not apply exactly once: {old!r} in {path}")
open(path, "w").write(s.replace(old, new))
PY
}

row RESULT PLANT EXPECT
if run clean; then row ok clean "exit 0"; else row FAIL clean "exit 0 (see $OUT/clean.log)"; fail=1; fi

NET="src/modules/cares-network/index.ts"
LIM="src/lib/ratelimit.ts"
SF="src/modules/storefront/cares.ts"
MINT="src/modules/evidence/mint.ts"

# name | file | old | new | ';'-separated test-name fragments that must each appear on a FAIL line (extended regex)
check() {
  local name="$1" file="$2" old="$3" new="$4" want="$5" missing="" w
  cp "$ROOT/services/core-api/$file" "$API/$file"
  if ! plant "$API/$file" "$old" "$new" 2>"$OUT/$name.plant"; then row FAIL "$name" "plant did not apply ($OUT/$name.plant)"; fail=1; return; fi
  if run "$name"; then row FAIL "$name" "red, but exited 0 ($OUT/$name.log)"; fail=1
  else
    IFS=';' read -ra wants <<<"$want"
    for w in "${wants[@]}"; do grep -E "FAIL .*($w)" "$OUT/$name.log" >/dev/null || missing="$missing [$w]"; done
    if [ -n "$missing" ]; then row FAIL "$name" "red, but no FAIL naming:$missing ($OUT/$name.log)"; fail=1
    else row ok "$name" "exit≠0; $(grep -cE '^ FAIL ' "$OUT/$name.log") FAIL lines, naming: $want"
    fi
  fi
  cp "$ROOT/services/core-api/$file" "$API/$file"
}

check limit-off-by-one "$LIM" 'if (w.count >= this.limit)' 'if (w.count > this.limit)' \
  "the 60th request → 200, the 61st → 429;limited per IP across keys"
check xff-left-most    "$LIM" 'return entries[entries.length - hops]!;' 'return entries[hops - 1]!;' \
  "HOPS = 1 keys the right-most entry"
check no-ip-bucket     "$NET" '  [() => storefrontIpLimiter, (c) => clientIp(c, hops)],
' '' \
  "limited per IP across keys;70 different junk keys;spraying keys past the key cap"
check clear-at-cap     "$LIM" '  private evict(t: number) {
' '  private evict(t: number) {
    this.windows.clear();
' \
  "evicts the oldest open window"
check no-restart-order "$LIM" '      if (w) this.windows.delete(key);
      else if (this.windows.size >= this.maxKeys) this.evict(t);' '      if (!w && this.windows.size >= this.maxKeys) this.evict(t);' \
  "a restarted window counts as new"
check no-tz            "$NET" '    tz: r.outlet_tz,
' '' \
  "keys = allow-list exactly;keys = allow-list\);Cache-Control no-store; keys = allow-list"
check extra-column     "$NET" '    listing_id: r.listing_id,' '    listing_id: r.listing_id, outlet_id: r.listing_id,' \
  "keys = allow-list exactly;keys = allow-list\);Cache-Control no-store; keys = allow-list"
check storefront-all-tenants "$SF" 'return networkListings(q, { tenant: p.tenant_id });' 'return networkListings(q, {});' \
  "key A shows A's 2 live listings and 0 of B's"
check storefront-any-channel "$SF" '    await channelKind(q, p.channel_id);' '' \
  "a key on a counter channel → 404"
check impact-unpublished "$NET" "WHERE s.published_at IS NOT NULL AND s.template_id = \$1" "WHERE s.template_id = \$1" \
  "unpublished → impact 404"
check ref-row-shift    "$NET" 'ref: snapRef(s.id, i, col)' 'ref: snapRef(s.id, i + 1, col)' \
  "every value beside a ref that snapshots/\{id\} resolves"
check label-gated      "$NET" '    labels: IMPACT_LABELS,
    note_key: NOTE_KEY,
  };
}

async function publishedSnapshot' '    ...(s.rows[0]?.all_synthetic ? { labels: IMPACT_LABELS } : {}),
    note_key: NOTE_KEY,
  };
}

async function publishedSnapshot' \
  "labels unconditional"
check no-cache         "$NET" 'const TTL_MS = 30_000;' 'const TTL_MS = 0;' \
  "cached 30 s"
check member-mints-operator "$MINT" 'if (!tpl || tpl.min_role === "operator") throw new ApiError("not_found");' 'if (!tpl) throw new ApiError("not_found");' \
  "member and intel mints of the operator template are refused"

[ "${MUNIM_REDPROOF_KEEP:-}" = "1" ] || rm -rf "$COPY"
echo "cares-network-redproof: $([ $fail = 0 ] && echo PASS || echo FAIL)"
exit $fail
