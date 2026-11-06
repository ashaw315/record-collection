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
read_refusal=0
while [ $# -gt 0 ]; do
  case "$1" in
    -m) shift; message="${1:-}"; [ $# -gt 0 ] && shift ;;
    --read) read_refusal=1; shift ;;
    --) shift ;;
    *) paths+=("$1"); shift ;;
  esac
done

# A refusal stands until it is read (the coordinator, 4 Nov). A chain piped
# two refusals through `tail` and a later commit carried an earlier one's
# notes, out of order; so a refusal leaves a marker naming its log, the
# next commit refuses on the marker alone, and `--read` prints the log and
# clears it. A passing commit clears it too: nothing passes without the check.
logs="$(git rev-parse --path-format=absolute --git-common-dir)/commit-checked"
mkdir -p "$logs"
unread="$logs/unread"
if [ "$read_refusal" -eq 1 ]; then
  if [ -f "$unread" ]; then
    refused_log="$(cat "$unread")"
    echo "the refusal at $refused_log, read:"
    [ -f "$refused_log" ] && tail -40 "$refused_log"
    rm -f "$unread"
  else
    echo "no unread refusal"
  fi
  exit 0
fi

if [ -z "$message" ] || [ ${#paths[@]} -eq 0 ]; then
  echo "usage: commit-checked.sh -m \"message\" path [path...]   |   commit-checked.sh --read" >&2
  exit 2
fi

if [ -f "$unread" ]; then
  echo "NOT COMMITTED: the refusal at $(cat "$unread") is unread. Read it, then scripts/commit-checked.sh --read clears it." >&2
  exit 5
fi

if ! git diff --cached --quiet; then
  echo "NOT COMMITTED: something is already staged, and the check would read a tree it was not asked about. Unstage it (git restore --staged .) and name the paths here." >&2
  exit 1
fi

# A named path that is untracked is intent-added for the check's duration.
# The fresh-clone migration test copies `git ls-files`, so a new migration
# failed it on three units while the journal already named it (NOTES 4137,
# 5433, 5951; a fourth on 27 Oct), and staging its content would trip the
# refusal above. intent-to-add puts the path in the index with no content,
# which `git diff --cached --quiet` does not count (verified on 27 Oct), so
# the check reads the tree it was asked about and sees every path it will
# commit. Undone on a refusal, so the tree is as it was.
intent=()
for p in "${paths[@]}"; do
  if [ -e "$p" ] && [ -z "$(git ls-files -- "$p")" ]; then intent+=("$p"); fi
done
if [ ${#intent[@]} -gt 0 ]; then git add --intent-to-add -- "${intent[@]}"; fi
undo_intent() { if [ ${#intent[@]} -gt 0 ]; then git reset -q -- "${intent[@]}"; fi; }

# The test set is the intake's (scripts/document-suite.mjs), so the two ways
# into a commit cannot drift apart. An empty list would run every suite and
# say nothing about why, so it is refused.
if [ -z "${COMMIT_CHECK:-}" ]; then
  suite="$(node scripts/document-suite.mjs | tr '\n' ' ')"
  if [ -z "${suite// /}" ]; then
    echo "NOT COMMITTED: scripts/document-suite.mjs named no tests. Nothing was staged." >&2
    undo_intent
    exit 1
  fi
fi
# Lint and typecheck gate the suite by their own exit status (the coordinator, 6 Nov): a chain
# printed two lint errors and pushed them, because reading what a chain prints is a note, and
# an exit status is a watch. Nothing here reads the output; `&&` reads the status.
check="${COMMIT_CHECK:-npm run lint && npm run typecheck && npx tsx scripts/run-tests.ts npx vitest run $suite}"
# The check is told what this commit will carry, so a guard can tell the
# commit's own edit from a stray one (scripts/commit-paths.mjs).
export COMMIT_PATHS="$(printf '%s\n' "${paths[@]}")"
# A refusal keeps its log (26 Oct): a refused run's output went to the
# terminal through a filter and the failing test could not be named, so the
# one run whose log was needed was the one nothing kept. It is kept in the
# common git directory, which outlives the throwaway worktree a commit is
# made in and is never committed; a passing run's log is dropped.
log="$logs/$(date +%Y%m%d-%H%M%S)-$$.log"
if ! bash -o pipefail -c "$check" 2>&1 | tee "$log"; then
  echo "NOT COMMITTED: the check failed. Nothing was staged. Its output is kept at $log" >&2
  printf '%s\n' "$log" > "$unread"
  undo_intent
  exit 1
fi
rm -f "$log"

git add -- "${paths[@]}" || exit 1

# A commit carries what it names (the coordinator, 4 Nov). The check reads
# the working tree and the commit carries the named paths, so twice in one
# day CI failed a commit whose check had passed: a governed list naming
# spec files still untracked, and a migration journal naming a migration
# still untracked. Every path-like token in a staged text file that names
# a file the tree holds and git does not, and the journal's tags as
# drizzle/<tag>.sql, refuses the commit and leaves nothing staged.
unnamed=()
while IFS= read -r staged; do
  [ -f "$staged" ] || continue
  case "$staged" in *.png|*.jpg|*.jpeg|*.gif|*.ico|*.woff2|*.woff|*.ttf|*.pdf|*.zip) continue ;; esac
  tokens="$(grep -oE '[A-Za-z0-9_./-]+\.(ts|tsx|mts|mjs|cjs|js|sql|json|md|css|html|sh|yml|yaml)' "$staged" 2>/dev/null | sort -u || true)"
  if [ "$staged" = "drizzle/meta/_journal.json" ]; then
    tags="$(grep -oE '"tag": *"[^"]+"' "$staged" | sed -E 's/"tag": *"([^"]+)"/drizzle\/\1.sql/' || true)"
    tokens="$(printf '%s\n%s\n' "$tokens" "$tags")"
  fi
  while IFS= read -r tok; do
    tok="${tok#./}"
    [ -n "$tok" ] || continue
    # Exact case: the filesystem answers `-f notes.md` with NOTES.md, and git, case-sensitive, calls that untracked (found on the guard's second real commit).
    [ -n "$(find "$(dirname "./$tok")" -maxdepth 1 -name "$(basename "$tok")" -type f -print -quit 2>/dev/null)" ] || continue
    # An ignored file is held by the tree on purpose (node_modules, test-results), not left out of a commit by omission: the guard's first real commit named two.
    git check-ignore -q -- "$tok" && continue
    if [ -z "$(git ls-files -- "$tok")" ]; then unnamed+=("$staged names $tok, which the tree holds untracked"); fi
  done <<<"$tokens"
done < <(git diff --cached --name-only)
if [ ${#unnamed[@]} -gt 0 ]; then
  git reset -q -- "${paths[@]}"
  undo_intent
  guard_log="$logs/$(date +%Y%m%d-%H%M%S)-$$-carries.log"
  printf '%s\n' "${unnamed[@]}" > "$guard_log"
  printf '%s\n' "$guard_log" > "$unread"
  echo "NOT COMMITTED: the commit would not carry what it names. Name each alongside, or leave it out:" >&2
  printf '  %s\n' "${unnamed[@]}" >&2
  exit 6
fi

git commit -q -m "$message" && git log --oneline -1 || exit 1
rm -f "$unread"

# The export follows the commit (the coordinator, 29 Oct). Design rules
# against the handoff Code exports, and an export taken at the intake is
# taken before the commit it names. A commit touching the shared documents
# exports HEAD as just committed. A failed export leaves the commit made,
# and says so with status 3, neither a pass nor a refusal.
# `COMMIT_EXPORT` replaces the command, which is how
# `test/repo/commit-checked.test.ts` stages it without writing to ~/Downloads.
# Read whole before matching: `grep -q` leaves at its first match, and under
# pipefail a writer cut off by SIGPIPE fails the condition.
changed="$(git diff-tree --no-commit-id --name-only -r HEAD)"
if grep -qE '^(docs/design/|scripts/handoff-code-region\.json$)' <<<"$changed"; then
  if ! bash -o pipefail -c "${COMMIT_EXPORT:-node scripts/export-handoff.mjs}"; then
    echo "COMMITTED, but the export was NOT written: run node scripts/export-handoff.mjs and read why." >&2
    exit 3
  fi
fi

# A step's captures follow the commit that names them (the coordinator,
# 4 Nov): the folders the message names as docs/captures/<name> are
# exported from the working tree, since captures are untracked and three
# times a step's look was held while Adam found PNGs by hand. Names are
# read as `scripts/export-captures.mjs` reads them, once each, in order.
# `COMMIT_EXPORT_CAPTURES` replaces the command, for the test.
captures=()
while IFS= read -r name; do [ -n "$name" ] && captures+=("$name"); done < <(grep -oE 'docs/captures/[A-Za-z0-9][A-Za-z0-9._-]*' <<<"$message" | sed 's#^docs/captures/##; s#[._-]*$##' | awk '!seen[$0]++')
if [ ${#captures[@]} -gt 0 ]; then
  if ! bash -o pipefail -c "${COMMIT_EXPORT_CAPTURES:-node scripts/export-captures.mjs} \"\$@\"" -- "${captures[@]}"; then
    echo "COMMITTED, but the captures were NOT exported: run node scripts/export-captures.mjs ${captures[*]} and read why." >&2
    exit 3
  fi
fi
