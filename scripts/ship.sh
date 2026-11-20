#!/usr/bin/env bash
#
# The unit's last commit, its push, its gate's dispatch and the run id, as one sequence.
#
#     scripts/ship.sh -m "message" path [path...]
#
# Four incidents, each fixed locally, and each next chain typed by hand and
# free to omit the guard (the coordinator, 6 Nov): two refusals piped through
# `tail` (4 Nov); lint errors printed and pushed (6 Nov); push and dispatch not
# gated on the commit's status, a duplicate gate on fda52ef cancelled by hand
# (6 Nov); a passing check and a failing stage, leaving paths staged (6 Nov).
# The family member is ci-gate.sh's: a guard present, correct and not on the
# path, where the path was assembled fresh each time. Here it is not
# assembled: each step runs only on the status of the one before, nothing is
# piped, and the run id printed is the one whose head is the pushed commit.
#
# NOTES-only commits still go through commit-checked.sh alone and ride with
# the next unit; ci-gate.sh stays callable for a gate on request.
# test/repo/ship.test.ts stages every refusal with stub scripts.
#
# No worker count passes through here (the coordinator, 20 Nov): the count is
# playwright.config.ts's, one number in one place, and the gate runs it. Until
# then this passed four while the config said two, and local never ran what
# the gate ran. `--workers` is refused by name rather than read as a path, so
# an old chain fails here and not in commit-checked's refusal of the path.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --workers) echo 'ship: --workers is gone; the worker count is playwright.config.ts'"'"'s, one number in one place (a one-off count goes through scripts/ci-gate.sh <ref> [workers])' >&2; exit 2 ;;
    *) args+=("$1"); shift ;;
  esac
done

# Called with nothing to commit, it said how (10 Nov): "${args[@]}" on an empty array is "unbound" under set -u in
# bash 3.2, and the chain that called it read exit 0 through tail. This script is for the unit's last commit; a unit
# already committed is pushed and gated by ci-gate.sh.
if [ ${#args[@]} -eq 0 ]; then
  echo 'usage: scripts/ship.sh -m "message" path [path...]   (the unit'"'"'s last commit, its push and its gate; a unit already committed is pushed and gated by scripts/ci-gate.sh)' >&2
  exit 2
fi

"$here/commit-checked.sh" "${args[@]}"
status=$?
if [ $status -ne 0 ]; then
  echo "ship: NOT SHIPPED. commit-checked refused with status $status; nothing pushed, nothing dispatched." >&2
  exit $status
fi

head="$(git rev-parse HEAD)"
if ! git push -q origin HEAD; then
  echo "ship: committed ${head}, but the push FAILED; nothing dispatched." >&2
  exit 1
fi

"$here/ci-gate.sh" "$head"
status=$?
if [ $status -ne 0 ]; then
  echo "ship: pushed ${head}, but the dispatch FAILED with status $status." >&2
  exit $status
fi

# The run is the one on this head, not the newest in the list: a list read by
# hand found the duplicate on fda52ef, which the chain never would have.
run=""
for _ in 1 2 3 4 5 6; do
  run="$(gh run list --workflow=gate.yml -L 10 --json databaseId,headSha,status 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s||"[]").find(x=>x.headSha===process.argv[1]);if(r)console.log(`${r.databaseId} ${r.status}`)})' "$head")"
  [ -n "$run" ] && break
  sleep 3
done
if [ -z "$run" ]; then
  echo "ship: pushed and dispatched ${head}, but no gate run on that head is listed yet; read gh run list." >&2
  exit 8
fi
echo "ship: gate run ${run%% *} on ${head} (${run#* })"
