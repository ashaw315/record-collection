#!/usr/bin/env bash
#
# Commit only if the check passed.
#
#     scripts/commit-checked.sh -m "message" path [path...]
#
# Runs the repository's checks, and stages and commits the named paths only
# if they passed. On 9 Oct a step was committed and pushed with a check
# reading "1 failed" on the line above, because the check and the commit
# were typed as one command and nothing made the second depend on the
# first. Here it does.
#
# Nothing is staged until the check has passed: `captures-unchanged` reads
# a staged capture as a changed one, so a tree staged beforehand fails for
# a reason that is not the commit's. For the same reason this refuses to
# start with anything already staged.
#
# The check is `COMMIT_CHECK` where that is set, which is how
# `test/repo/commit-checked.test.ts` stages a pass and a failure; otherwise
# the document suite (scripts/document-suite.mjs, the intake's list) through
# the judged runner, which exits non-zero unless the summary line says the
# run passed.
set -uo pipefail

message=""
paths=()
while [ $# -gt 0 ]; do
  case "$1" in
    -m) shift; message="${1:-}"; [ $# -gt 0 ] && shift ;;
    --) shift ;;
    *) paths+=("$1"); shift ;;
  esac
done

if [ -z "$message" ] || [ ${#paths[@]} -eq 0 ]; then
  echo "usage: commit-checked.sh -m \"message\" path [path...]" >&2
  exit 2
fi

if ! git diff --cached --quiet; then
  echo "NOT COMMITTED: something is already staged, and the check would read a tree it was not asked about. Unstage it (git restore --staged .) and name the paths here." >&2
  exit 1
fi

# The test set is the intake's (scripts/document-suite.mjs), so the two ways
# into a commit cannot drift apart. An empty list would run every suite and
# say nothing about why, so it is refused.
if [ -z "${COMMIT_CHECK:-}" ]; then
  suite="$(node scripts/document-suite.mjs | tr '\n' ' ')"
  if [ -z "${suite// /}" ]; then
    echo "NOT COMMITTED: scripts/document-suite.mjs named no tests. Nothing was staged." >&2
    exit 1
  fi
fi
check="${COMMIT_CHECK:-npx tsx scripts/run-tests.ts npx vitest run $suite}"
# The check is told what this commit will carry, so a guard can tell the
# commit's own edit from a stray one (scripts/commit-paths.mjs).
export COMMIT_PATHS="$(printf '%s\n' "${paths[@]}")"
if ! bash -o pipefail -c "$check"; then
  echo "NOT COMMITTED: the check failed. Nothing was staged." >&2
  exit 1
fi

git add -- "${paths[@]}" && git commit -q -m "$message" && git log --oneline -1
