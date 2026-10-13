#!/usr/bin/env bash
#
# One spec, several times, against the machine's swap rate.
#
#   scripts/measure-swap.sh <out-dir> [spec] [times]
#
# What `scripts/gate.sh`'s swap limit was picked from (NOTES, 12 Oct). It runs
# in the gate's worktree, on the gate's database and port, at whatever commit
# that worktree is on, and samples swapped pages and the one-minute load every
# five seconds beside the runs. It does not make the machine swap: it reads
# whatever the machine is doing, so swap and load arrive together and are not
# separated by it.
#
# A run that is not a clean pass has its `test-results` copied to
# `<out-dir>/run-N-test-results` BEFORE the next run starts. The first time
# this loop was used it did not, and the one failure's trace was overwritten
# by the run after it.
#
# <out-dir> is to be outside both trees: a file written inside one is a change
# to the tree a run is checking.
set -uo pipefail

OUT="${1:?an output directory, outside the working tree and the worktree}"
SPEC="${2:-e2e/shelf-offered-134.spec.ts}"
TIMES="${3:-12}"
ROOT="$(git rev-parse --show-toplevel)"
GATE="${GATE_DIR:-$ROOT-gate}"

# Refused before the folder is made: staged, a check after `mkdir` had already written into the tree it was refusing.
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
case "$OUT/" in "$ROOT/"*|"$GATE/"*) echo "measure-swap: $OUT is inside a tree. Nothing run." >&2; exit 1 ;; esac
mkdir -p "$OUT" || exit 1
cd "$GATE" || { echo "measure-swap: no worktree at $GATE; scripts/gate.sh makes it" >&2; exit 1; }
if [ -n "$(git status --porcelain)" ]; then echo "measure-swap: $GATE has changes of its own. Nothing run." >&2; exit 1; fi

export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/record_collection_gate"
export DATABASE_URL="$TEST_DATABASE_URL" E2E_PORT=3101 GATE_WORKTREE=1

pages() { vm_stat | awk '/Swapins/ { i = $2 } /Swapouts/ { o = $2 } END { printf "%d", i + o }'; }
( while :; do echo "$(date +%s) $(pages) $(sysctl -n vm.loadavg | awk '{print $2}')"; /bin/sleep 5; done ) > "$OUT/samples.txt" &
SAMPLER=$!
trap 'kill $SAMPLER 2>/dev/null' EXIT

: > "$OUT/runs.txt"
for i in $(seq 1 "$TIMES"); do
  START="$(date +%s)"
  npx tsx scripts/run-tests.ts npx playwright test --project=chromium "$SPEC" --reporter=list > "$OUT/run-$i.log" 2>&1
  END="$(date +%s)"
  LINE="$(tail -1 "$OUT/run-$i.log")"
  echo "$i $START $END $LINE" >> "$OUT/runs.txt"
  # Copied first, before anything runs again: a retry that passed still leaves the failed attempt's trace here, and the next run removes it.
  case "$LINE" in
    *failed*|*flaky*|*"NOT OK"*) cp -R test-results "$OUT/run-$i-test-results" 2>/dev/null; echo "measure-swap: run $i was not a clean pass; its artefacts are in $OUT/run-$i-test-results" ;;
  esac
done
echo "measure-swap: $TIMES runs of $SPEC; $OUT/runs.txt (run, start, end, summary line) and $OUT/samples.txt (time, swapped pages, load)"
