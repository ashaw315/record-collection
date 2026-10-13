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
# one-minute load is read first and the run is refused above six times the
# physical cores, or while the machine is swapping more than 25,000 pages a
# second, which load does not see. Load, swap and free memory at the start
# and at the end are printed with the result.
#
# The 25,000 is a conservative pick from a confounded sample, not a measured
# boundary (12 Oct, NOTES; `scripts/measure-swap.sh`). One nine-test spec,
# twelve runs, on whatever the machine was doing: swap was not induced, and
# load rose with it, so the two are not separated. The times rise smoothly
# with the swap rate (25.0s at 22,700, 25.6s at 32,500) and show no step. The
# only clear degradation is one run at 146,800: 66s, with a failure. And this
# guard reads five seconds BEFORE a run, where those are rates DURING one. So
# 25,000 says only: well under the one rate known to hurt, and well over the
# 434 to 5,521 that three full runs started at without being slowed. It was
# 1,000, a round number that sat inside that ordinary range.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
COMMIT="$(git -C "$ROOT" rev-parse --short "${1:-HEAD}")"
WORKERS="${2:-}"
GATE="${GATE_DIR:-$ROOT-gate}"

load() { sysctl -n vm.loadavg | awk '{print $2}'; }
swap_pages() { vm_stat | awk '/Swapins/ { i = $2 } /Swapouts/ { o = $2 } END { printf "%d", i + o }'; }
# Pages swapped in or out per second, over five seconds. Load does not see this: a machine at a load of 16 that is
# swapping is in worse shape for a run than one at 30 that is computing.
swap_rate() { local a b; a="$(swap_pages)"; /bin/sleep 5; b="$(swap_pages)"; echo $(( (b - a) / 5 )); }
memory() { echo "swap $(sysctl -n vm.swapusage | awk '{print $6 " of " $3}' | tr -d 'M' | awk '{printf "%.1f of %.1f GB", $1 / 1024, $3 / 1024}'), $(memory_pressure | awk -F': ' '/free percentage/ {print $2}') free, $1 pages a second swapped"; }
CORES="$(sysctl -n hw.physicalcpu)"
MAX_LOAD="${GATE_MAX_LOAD:-$((CORES * 6))}"
MAX_SWAP_RATE="${GATE_MAX_SWAP_RATE:-25000}"
LOAD_START="$(load)"
RATE_START="$(swap_rate)"
MEMORY_START="$(memory "$RATE_START")"
REFUSED=""
if awk -v l="$LOAD_START" -v m="$MAX_LOAD" 'BEGIN { exit !(l > m) }'; then
  REFUSED="the one-minute load is $LOAD_START on $CORES cores, above $MAX_LOAD"
elif [ "$RATE_START" -gt "$MAX_SWAP_RATE" ]; then
  REFUSED="the machine is swapping, $RATE_START pages a second, above $MAX_SWAP_RATE"
fi
if [ -n "$REFUSED" ]; then
  echo "gate: refused: $REFUSED. Nothing run." >&2
  echo "gate: load $LOAD_START on $CORES cores; $MEMORY_START" >&2
  echo "gate: the busiest processes, then the largest:" >&2
  ps -Ao pcpu,comm -r | sed -n 2,6p >&2
  ps -Ao rss,comm -m | sed -n 2,6p | awk '{ printf "%5.1f GB %s\n", $1 / 1048576, $2 }' >&2
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

# The gate's own report, written at the start and finished at the end, so it
# outlives the session that launched it. On 13 Oct the gate on 88a0e7e was cut
# off with its session 74 tests short: the suites' logs were on disk, and what
# the gate had read around them (load, memory, swap) had gone to a stdout
# nobody saw. A report with a start and no "ended" line is a run cut off.
REPORT="$LOGS/$COMMIT-gate${WORKERS:+-w$WORKERS}.txt"
{
  echo "gate on $COMMIT${WORKERS:+, $WORKERS workers}, in $GATE, started $(date '+%d %b %H:%M')"
  echo "load:       $LOAD_START at the start, on $CORES cores"
  echo "memory:     at the start, $MEMORY_START"
  echo "logs:       $UNIT"
  echo "            $E2E"
} > "$REPORT"

# `src/app/type-scale.test.ts` reads the CSS a build produces, and a fresh checkout has none.
# The build is not given the test database: it is to build as a deploy would, and reads none.
env -u TEST_DATABASE_URL -u DATABASE_URL npm run build > "$LOGS/$COMMIT-build.log" 2>&1 || { echo "gate: npm run build failed in $GATE; see $LOGS/$COMMIT-build.log" >&2; exit 1; }

npx tsx scripts/run-tests.ts npm test > "$UNIT" 2>&1
# GATE_ONLY names spec files, for trying the script itself without an hour's run. What it produces is NOT a gate, and says so.
# shellcheck disable=SC2086
npx tsx scripts/run-tests.ts npx playwright test ${WORKERS:+--workers=$WORKERS} ${GATE_ONLY:-} > "$E2E" 2>&1
cp -R test-results "$LOGS/$COMMIT-test-results" 2>/dev/null

report() {
  if [ -n "${GATE_ONLY:-}" ]; then echo "NOT A GATE: Playwright ran only $GATE_ONLY"; fi
  echo "gate on $COMMIT${WORKERS:+, $WORKERS workers}, in $GATE, ended $(date '+%d %b %H:%M')"
  echo "load:       $LOAD_START at the start, $(load) at the end, on $CORES cores"
  echo "memory:     at the start, $MEMORY_START"
  echo "            at the end,   $(memory "$(swap_rate)")"
  echo "unit:       $(tail -1 "$UNIT")"
  echo "playwright: $(tail -1 "$E2E")"
  LC_ALL=C grep -h "\[projects\]\|\[reset\]\|SLEPT\| passed (\| flaky" "$E2E" | cut -c1-200
  LC_ALL=C grep -h "\[margins\]" "$E2E" | sed -n 2p | cut -c1-200
  # The tests that failed at least once, by line: a flake's artifacts are kept beside the log and this names them.
  LC_ALL=C grep -h "^  ✘" "$E2E" | cut -c1-200
}
report | tee -a "$REPORT"
