#!/usr/bin/env bash
#
# Dispatch the gate on GitHub (`.github/workflows/gate.yml`) on one commit.
#
#   scripts/ci-gate.sh <ref> [workers]
#
# The workflow checks out `inputs.commit` by name, and actions/checkout reads
# a seven-character id as a branch that does not exist: two runs on 3 Nov
# (41734064967, 41738856433) failed at checkout in seconds, dispatched by hand
# with short ids after the full-id requirement was already written down.
# Remembering it is not the fix. This script is the one place a dispatch
# comes from, and it can only hand `gh` the forty characters: any ref
# `git rev-parse` resolves is accepted, and the id is derived here. A commit no
# remote branch holds is refused too, because checkout could not find it
# either, and the refusal is immediate where the run's was silent until its
# log was read. `test/repo/ci-gate.test.ts` holds both refusals and the
# derivation, with a fake `gh` on PATH.
set -euo pipefail

REF="${1:?usage: scripts/ci-gate.sh <ref> [workers]}"
# Empty by default (the coordinator, 20 Nov): the gate then runs playwright.config.ts's count, the one place it is
# set; a count here is a one-off override for the run it names.
WORKERS="${2:-}"
# Another dispatch-only workflow takes the same full-id guard (171's CI run, 8 Nov): CI_WORKFLOW names it.
WORKFLOW="${CI_WORKFLOW:-gate.yml}"
if [ ! -f "$(git rev-parse --show-toplevel)/.github/workflows/${WORKFLOW}" ]; then
  echo "ci-gate: no workflow .github/workflows/${WORKFLOW}" >&2
  exit 5
fi

if ! FULL="$(git rev-parse --verify --quiet --end-of-options "${REF}^{commit}")"; then
  echo "ci-gate: '${REF}' names no commit here" >&2
  exit 2
fi
case "$FULL" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) echo "ci-gate: rev-parse gave '${FULL}', not a forty-character id" >&2; exit 3 ;;
esac

if [ -z "$(git branch -r --contains "$FULL" 2>/dev/null)" ]; then
  echo "ci-gate: ${FULL} is not on any remote branch (unpushed); the runner could not check it out" >&2
  exit 4
fi

if [ -n "$WORKERS" ]; then
  gh workflow run "${WORKFLOW}" -f "commit=${FULL}" -f "workers=${WORKERS}"
else
  gh workflow run "${WORKFLOW}" -f "commit=${FULL}"
fi
echo "ci-gate: dispatched ${WORKFLOW} on ${FULL} (${REF}), workers ${WORKERS:-from playwright.config.ts}"
echo "ci-gate: gh run list --workflow=${WORKFLOW} -L 1"
