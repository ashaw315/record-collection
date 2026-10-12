#!/usr/bin/env bash
#
# The gate, in a checkout of its own.
#
#   scripts/gate.sh [commit] [workers]
#
# A gate is the full suites: `npm test`, then `npx playwright test` on both
# projects with no file argument. It takes about fifty minutes, and for all
# of them nothing under `src/`, `e2e/` or `scripts/` could be edited, because
# the run's "tree unchanged" is a statement about the tree it ran in. So the
# gate runs in a second worktree pinned at one commit, which nobody edits,
# and the working tree stays free. The check means what it meant.
#
# Running tests is free too. The gate has a database of its own
# (record_collection_gate, in the same local Postgres on 5433) and a server
# port of its own (3101), so `test/helpers/db.ts`, which refuses a second
# runner on ONE database, has nothing to refuse. A step's checks run in the
# working tree while a gate runs here.
#
# It refuses to start on a busy machine. A gate begun at a load of 77 on six
# cores took an hour and its wall clock was a fact about the machine. The
# one-minute load is read first and the run is refused above four times the
# physical cores; the load at the start and at the end is printed with the
# result.
#
# `.env.local` is NOT copied here: the production credential does not travel.
# The three tests that read it skip on GATE_WORKTREE=1, which only this
# script sets (`test/repo/dev-targets-neon.test.ts`).
#
# The worktree is a sibling directory, made once and moved to the commit on
# each run. Its dependencies are installed there (`npm ci`) when the lockfile
# differs from the one last installed: a symlinked node_modules is outside
# the project's root, which the dev server's bundler does not accept.
#
# `workers` is passed to Playwright where given; the config's own number
# stands otherwise. Logs go to a folder beside the worktree, named by commit,
# and the two judged summary lines are printed at the end.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
COMMIT="$(git -C "$ROOT" rev-parse --short "${1:-HEAD}")"
WORKERS="${2:-}"
GATE="${GATE_DIR:-$ROOT-gate}"

load() { sysctl -n vm.loadavg | awk '{print $2}'; }
CORES="$(sysctl -n hw.physicalcpu)"
MAX_LOAD="${GATE_MAX_LOAD:-$((CORES * 4))}"
LOAD_START="$(load)"
if awk -v l="$LOAD_START" -v m="$MAX_LOAD" 'BEGIN { exit !(l > m) }'; then
  echo "gate: refused. The one-minute load is $LOAD_START on $CORES cores, above $MAX_LOAD. Nothing run." >&2
  echo "gate: the busiest processes:" >&2
  ps -Ao pcpu,comm -r | sed -n 2,6p >&2
  exit 1
fi

if [ ! -d "$GATE" ]; then
  git -C "$ROOT" worktree add --detach "$GATE" "$COMMIT" || exit 1
else
  if [ -n "$(git -C "$GATE" status --porcelain)" ]; then
    echo "gate: $GATE has changes of its own; it is to be a clean checkout. Nothing run." >&2
    exit 1
  fi
  git -C "$GATE" checkout --quiet --detach "$COMMIT" || exit 1
fi

cd "$GATE" || exit 1
LOCK="$(shasum package-lock.json | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ "$(cat node_modules/.gate-lock 2>/dev/null)" != "$LOCK" ]; then
  npm ci --no-audit --no-fund > /dev/null 2>&1 || { echo "gate: npm ci failed in $GATE" >&2; exit 1; }
  echo "$LOCK" > node_modules/.gate-lock
fi

# A database and a port of its own, so a run in the working tree and this one never meet.
GATE_DB="record_collection_gate"
DB_CONTAINER="record-collection-test-db"
if ! docker exec "$DB_CONTAINER" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$GATE_DB'" | grep -q 1; then
  docker exec "$DB_CONTAINER" psql -U postgres -qc "CREATE DATABASE $GATE_DB" || { echo "gate: could not create $GATE_DB" >&2; exit 1; }
fi
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/$GATE_DB"
export DATABASE_URL="$TEST_DATABASE_URL"
export E2E_PORT=3101
export GATE_WORKTREE=1

# Beside the worktree and not in it: a log growing inside the tree is a change to the tree the run is checking.
LOGS="$GATE-logs"
mkdir -p "$LOGS"
UNIT="$LOGS/$COMMIT-unit.log"
E2E="$LOGS/$COMMIT-e2e${WORKERS:+-w$WORKERS}.log"

# `src/app/type-scale.test.ts` reads the CSS a build produces, and a fresh checkout has none.
# The build is not given the test database: it is to build as a deploy would, and reads none.
env -u TEST_DATABASE_URL -u DATABASE_URL npm run build > "$LOGS/$COMMIT-build.log" 2>&1 || { echo "gate: npm run build failed in $GATE; see $LOGS/$COMMIT-build.log" >&2; exit 1; }

npx tsx scripts/run-tests.ts npm test > "$UNIT" 2>&1
# GATE_ONLY names spec files, for trying the script itself without an hour's run. What it produces is NOT a gate, and says so.
# shellcheck disable=SC2086
npx tsx scripts/run-tests.ts npx playwright test ${WORKERS:+--workers=$WORKERS} ${GATE_ONLY:-} > "$E2E" 2>&1
cp -R test-results "$LOGS/$COMMIT-test-results" 2>/dev/null

if [ -n "${GATE_ONLY:-}" ]; then echo "NOT A GATE: Playwright ran only $GATE_ONLY"; fi
echo "gate on $COMMIT${WORKERS:+, $WORKERS workers}, in $GATE"
echo "load:       $LOAD_START at the start, $(load) at the end, on $CORES cores"
echo "unit:       $(tail -1 "$UNIT")"
echo "playwright: $(tail -1 "$E2E")"
LC_ALL=C grep -h "\[projects\]\|\[reset\]\|SLEPT\| passed (\| flaky" "$E2E" | cut -c1-200
LC_ALL=C grep -h "\[margins\]" "$E2E" | sed -n 2p | cut -c1-200
