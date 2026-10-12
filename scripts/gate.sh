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
# What it does NOT free: running tests. Both checkouts use the one test
# database (record_collection_test on 5433), and `test/helpers/db.ts`
# refuses a second runner by design. Edit during a gate; run nothing.
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

# Beside the worktree and not in it: a log growing inside the tree is a change to the tree the run is checking.
LOGS="$GATE-logs"
mkdir -p "$LOGS"
UNIT="$LOGS/$COMMIT-unit.log"
E2E="$LOGS/$COMMIT-e2e${WORKERS:+-w$WORKERS}.log"

npx tsx scripts/run-tests.ts npm test > "$UNIT" 2>&1
if [ -n "$WORKERS" ]; then
  npx tsx scripts/run-tests.ts npx playwright test "--workers=$WORKERS" > "$E2E" 2>&1
else
  npx tsx scripts/run-tests.ts npx playwright test > "$E2E" 2>&1
fi
cp -R test-results "$LOGS/$COMMIT-test-results" 2>/dev/null

echo "gate on $COMMIT${WORKERS:+, $WORKERS workers}, in $GATE"
echo "unit:       $(tail -1 "$UNIT")"
echo "playwright: $(tail -1 "$E2E")"
LC_ALL=C grep -h "\[projects\]\|\[reset\]\|SLEPT\| passed (\| flaky" "$E2E" | cut -c1-200
LC_ALL=C grep -h "\[margins\]" "$E2E" | sed -n 2p | cut -c1-200
