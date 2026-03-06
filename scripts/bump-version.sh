#!/bin/bash
# bump-version.sh — compute version string, write version.json
# Called by CI (GitHub Action) on every push to main.
# Version format: vYYMMDD.NN H:MMa (date + daily counter + time)
#
# Optional: Set SUPABASE_DB_URL to also record releases in your Supabase DB.
# Without it, versioning still works using version.json only.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# ── read current version ─────────────────────────────────────────────
CURRENT=$(python3 -c "
import json, sys
try:
    d = json.load(open('version.json'))
    print(d.get('version', ''))
except:
    print('')
" 2>/dev/null || echo "")

# ── compute today's date (UTC) ──────────────────────────────────────
TODAY=$(date -u +"%y%m%d")

# ── compute sequence number ──────────────────────────────────────────
# If same day, increment NN. If new day, reset to 01.
if [[ "$CURRENT" == v${TODAY}.* ]]; then
  # Extract NN from "vYYMMDD.NN ..."
  NN=$(echo "$CURRENT" | sed 's/v[0-9]*\.\([0-9]*\).*/\1/')
  NN=$((10#$NN + 1))
else
  NN=1
fi

VERSION=$(printf "v%s.%02d" "$TODAY" "$NN")

# ── compute time string (UTC, 12-hour format) ───────────────────────
# Try Austin time first, fall back to UTC
if TZ="America/Chicago" date +"%l:%M%P" >/dev/null 2>&1; then
  TIME=$(TZ="America/Chicago" date +"%l:%M%P" | sed 's/^ //')
else
  TIME=$(date -u +"%l:%M%P" | sed 's/^ //')
fi

DISPLAY_VERSION="${VERSION} ${TIME}"
SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
FULL_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
ACTOR="${GITHUB_ACTOR:-$(git log -1 --pretty='%an' 2>/dev/null || echo unknown)}"
PUSHED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── build commits array ──────────────────────────────────────────────
FROM_SHA="${RELEASE_COMPARE_FROM_SHA:-}"
TO_SHA="${RELEASE_COMPARE_TO_SHA:-$FULL_SHA}"
COMMITS="[]"

if [ -n "$FROM_SHA" ] && [ "$FROM_SHA" != "0000000000000000000000000000000000000000" ]; then
  RANGE="${FROM_SHA}..${TO_SHA}"
  COMMITS=$(git log --reverse --pretty=format:'{"sha":"%h","message":"%s","author":"%an"}' "$RANGE" 2>/dev/null | python3 -c "
import sys, json
entries = []
for line in sys.stdin:
    line = line.strip()
    if line:
        try:
            entries.append(json.loads(line))
        except:
            pass
print(json.dumps(entries))
" 2>/dev/null || echo "[]")
fi

# ── optional: record in Supabase DB ──────────────────────────────────
DB_URL="${SUPABASE_DB_URL:-}"
if [ -n "$DB_URL" ]; then
  if command -v psql &>/dev/null || [ -x "/opt/homebrew/opt/libpq/bin/psql" ]; then
    PSQL="psql"
    [ -x "/opt/homebrew/opt/libpq/bin/psql" ] && PSQL="/opt/homebrew/opt/libpq/bin/psql"
    # Try to call record_release_event if it exists
    $PSQL "$DB_URL" -t -A --no-psqlrc -c "
      SELECT 1 FROM pg_proc WHERE proname = 'record_release_event';
    " >/dev/null 2>&1 && {
      $PSQL "$DB_URL" -t -A --no-psqlrc -c "
        SELECT display_version FROM record_release_event(
          '${FULL_SHA}', 'main', NULL, NULL,
          '${PUSHED_AT}'::timestamptz, '${ACTOR}',
          NULL, 'github-main-push', 'ci', '$(hostname -s 2>/dev/null || echo unknown)',
          '{}'::jsonb, '${COMMITS}'::jsonb
        );
      " 2>/dev/null || true
    }
  fi
fi

# ── rewrite version in static HTML files ─────────────────────────────
IS_GNU=false; sed --version 2>/dev/null | grep -q 'GNU' && IS_GNU=true

do_sed() {
  if [ "$IS_GNU" = true ]; then
    sed -i "$1" "$2"
  else
    sed -i '' "$1" "$2"
  fi
}

find . -name "*.html" -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./out/*" -not -path "./.next/*" | while read -r f; do
  if grep -q 'data-site-version' "$f"; then
    do_sed "s/\(data-site-version[^>]*>\)[^<]*/\1${DISPLAY_VERSION}/" "$f"
  fi
done

# ── write version.json ───────────────────────────────────────────────
cat > "$PROJECT_ROOT/version.json" << ENDJSON
{
  "version": "${DISPLAY_VERSION}",
  "release": ${NN},
  "sha": "${SHORT_SHA}",
  "fullSha": "${FULL_SHA}",
  "actor": "${ACTOR}",
  "pushedAt": "${PUSHED_AT}",
  "commits": ${COMMITS}
}
ENDJSON

echo "${DISPLAY_VERSION}"