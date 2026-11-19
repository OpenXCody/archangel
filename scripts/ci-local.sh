#!/usr/bin/env bash
# The database half of CI, as one script, so it can be run on a developer's
# machine exactly as GitHub runs it (.github/workflows/ci.yml, job `suites`).
#
#   createdb archangel_ci
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/archangel_ci bash scripts/ci-local.sh
#
# Against an EMPTY database on this machine it runs the unit checks, then:
#   1. builds the schema from nothing and loads sample data
#      (scripts/create-db.mjs --sample: migrations 0000-0009, the runner's
#      migrations, the seed, then the runner's migrations a second time);
#   2. builds the app and serves the built page and the API;
#   3. runs the six API suites (accounts, jobs, seeker, admin, email, industries),
#      the employer loader's suite (loader), which needs only the database, and
#      intake's (intake), which drives the runner and then the API;
#   4. runs the Playwright device suite against the built page.
# Every suite runs even if an earlier one fails; the exit code is non-zero if
# any did. The servers it started are stopped on the way out.
#
# Settings (all optional except DATABASE_URL):
#   PORT=3000 WEB_PORT=5173   where the API and the page listen
#   VITE_MAP_TOKEN            defaults to a placeholder: the map then draws on
#                             a plain canvas, which is what the suite expects
#   CI_LOG_DIR                server logs and the mail outbox (default ci-results/;
#                             not test-results/, which Playwright empties)
# Needs node, psql and curl on the PATH, and Playwright's Chromium
# (`npm run test:ui:install`).
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

: "${DATABASE_URL:?Set DATABASE_URL to an empty database on this machine.}"
export DATABASE_URL
API_PORT=${PORT:-3000}
WEB_PORT=${WEB_PORT:-5173}
LOGS=${CI_LOG_DIR:-$ROOT/ci-results}
mkdir -p "$LOGS"
OUTBOX="$LOGS/outbox.jsonl"
: > "$OUTBOX"
export VITE_MAP_TOKEN=${VITE_MAP_TOKEN:-ci-placeholder}

API_URL="http://localhost:$API_PORT/api"
WEB_URL="http://localhost:$WEB_PORT"
pids=()
stop_servers() {
  for pid in "${pids[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null
  done
  wait 2>/dev/null
}
trap stop_servers EXIT

step() { printf '\n== %s\n' "$1"; }
die() {
  echo "ci-local: $1"
  for log in api web; do
    [ -s "$LOGS/$log.log" ] && { echo "-- last lines of $log.log"; tail -n 30 "$LOGS/$log.log"; }
  done
  exit 1
}
wait_for() { # url name
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "$1" && return 0
    sleep 1
  done
  die "$2 did not answer at $1 within 60 seconds."
}
port_free() { ! curl -s -o /dev/null "http://localhost:$1/"; }

port_free "$API_PORT" || die "something is already listening on port $API_PORT (set PORT)."
port_free "$WEB_PORT" || die "something is already listening on port $WEB_PORT (set WEB_PORT)."

step "Unit checks"
node --import tsx --test tests/unit/*.unit.ts > "$LOGS/unit.log" 2>&1 || { grep -B2 -A12 '^not ok' "$LOGS/unit.log" | head -n 60; die "the unit checks failed."; }
grep -E '^# (tests|pass|fail) ' "$LOGS/unit.log" | tr '\n' ' '; echo

step "Schema from nothing, sample data"
node scripts/create-db.mjs --sample > "$LOGS/create-db.log" 2>&1 || { tail -n 40 "$LOGS/create-db.log"; die "the database could not be built."; }
grep -c '^migrate: applied [0-9]' "$LOGS/create-db.log" | sed 's/$/ migrations applied by the runner/'
grep -c '^migrate: applied again' "$LOGS/create-db.log" | sed 's/$/ applied a second time over the sample data/'
tail -n 1 "$LOGS/create-db.log"

step "Build"
npm run build > "$LOGS/build.log" 2>&1 || { tail -n 40 "$LOGS/build.log"; die "the build failed."; }
tail -n 3 "$LOGS/build.log"
# The built page's inline scripts are the ones the Content-Security-Policy allows.
node scripts/check-csp.mjs dist/index.html || die "the built page and the policy in vercel.json disagree."

step "Servers"
PORT=$API_PORT NODE_ENV=development EMAIL_OUTBOX="$OUTBOX" APP_URL="$WEB_URL" \
  node --import tsx server/index.ts > "$LOGS/api.log" 2>&1 &
pids+=($!)
PORT=$API_PORT node node_modules/vite/bin/vite.js preview --port "$WEB_PORT" --strictPort > "$LOGS/web.log" 2>&1 &
pids+=($!)
wait_for "$API_URL/health" "The API"
wait_for "$WEB_URL/" "The page"
# The page reaches the API through its own address, as it does in production.
wait_for "$WEB_URL/api/health" "The API behind the page"
echo "API $API_URL, page $WEB_URL (built)"

failed=()
run_suite() { # name command...
  local name=$1; shift
  step "$name"
  if "$@" > "$LOGS/$name.log" 2>&1; then
    echo "passed: $(grep -c '^ok ' "$LOGS/$name.log") checks"
  else
    grep '^FAIL' "$LOGS/$name.log" | head -n 40
    echo "FAILED: $(grep -c '^FAIL' "$LOGS/$name.log") of $(grep -c '^ok \|^FAIL' "$LOGS/$name.log") checks (full output: $LOGS/$name.log)"
    failed+=("$name")
  fi
}
export API=$API_URL DB=$DATABASE_URL
run_suite accounts bash tests/api/accounts.sh
run_suite jobs bash tests/api/jobs.sh
run_suite seeker env OUTBOX="$OUTBOX" bash tests/api/seeker.sh
run_suite admin bash tests/api/admin.sh
run_suite email env OUTBOX="$OUTBOX" APP_URL="$WEB_URL" bash tests/api/email.sh
run_suite industries bash tests/api/industries.sh
run_suite loader bash tests/api/loader.sh
run_suite intake bash tests/api/intake.sh

step "Device suite"
if BASE_URL=$WEB_URL npx playwright test --trace off > "$LOGS/devices.log" 2>&1; then
  tail -n 3 "$LOGS/devices.log"
else
  tail -n 60 "$LOGS/devices.log"
  failed+=(devices)
fi

step "Result"
if [ ${#failed[@]} -gt 0 ]; then
  echo "Failed: ${failed[*]}"
  exit 1
fi
echo "All suites passed."
