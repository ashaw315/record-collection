#!/usr/bin/env bash
#
# The unit's last commit, its push, its gate's dispatch and the run id, as one sequence.
#
#     scripts/ship.sh -m "message" [--workers N] path [path...]
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
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
workers=4
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --workers) shift; workers="${1:?--workers needs a count}"; shift ;;
    *) args+=("$1"); shift ;;
  esac
done

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

"$here/ci-gate.sh" "$head" "$workers"
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
