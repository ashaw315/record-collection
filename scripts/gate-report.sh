#!/usr/bin/env bash
#
# The gate's verdict, read from the logs its halves wrote.
#
#   scripts/gate-report.sh <commit> <unit log> <project>=<log> [<project>=<log> ...]
#
# Out of `scripts/gate.sh` so it can be run on logs without an hour's run
# (`test/repo/gate-report.test.ts`).
#
# The exit status is the verdict, from each half's last line, which
# `scripts/run-result.ts` wrote:
#
#   0  every half reads "— OK"
#   1  a half does not, has no log, or the logs are from more than one run
#   2  every half reads OK but GATE_ONLY narrowed the run: not a gate
#   3  every half passed, one with retries: run-result will not call that OK
#      and will not call it a failure, so neither does this
#
# Until 20 Oct the status was the last command's, the grep for mobile's
# failed tests, which under pipefail fails on finding none: a clean gate
# exited 1, and a gate with a mobile failure exited 0.
set -uo pipefail

COMMIT="$1"
UNIT="$2"
shift 2

red=0
flaky=0
# A log names its commit only by its file name, as gate.sh writes it. A copy kept aside
# (414e121-flaky-run/) keeps those names, so the same commit from two runs differs by directory.
dirs=""
# Prints the half's verdict line after its label, and records what it says.
judge() {
  local label="$1" log="$2" line
  if [ ! -s "$log" ]; then
    echo "${label}no log: $log"
    red=1
    return
  fi
  case "$(basename "$log")" in
    "$COMMIT"-*) ;;
    *) echo "${label}$(basename "$log") — FROM ANOTHER COMMIT, not $COMMIT"; red=1 ;;
  esac
  dirs="$(printf '%s\n%s' "$dirs" "$(cd "$(dirname "$log")" && pwd -P)")"
  line="$(tail -1 "$log")"
  echo "${label}${line}"
  case "$line" in
    *" — OK") ;;
    *" — GREEN WITH FLAKES ("*"), not OK") flaky=1 ;;
    *) red=1 ;;
  esac
}

if [ -n "${GATE_ONLY:-}" ]; then echo "NOT A GATE: Playwright ran only $GATE_ONLY"; fi
judge "unit:       " "$UNIT"
# One judgement per project; the gate is green only when every line is.
for PAIR in "$@"; do
  P="${PAIR%%=*}"
  E2E="${PAIR#*=}"
  judge "playwright: $P: " "$E2E"
  [ -s "$E2E" ] || continue
  LC_ALL=C grep -h "\[projects\]\|\[reset\]\|SLEPT\| passed (\| flaky" "$E2E" | cut -c1-200
  LC_ALL=C grep -h "\[margins\]" "$E2E" | sed -n 2p | cut -c1-200
  # The tests that failed at least once, by line: a flake's artifacts are kept beside the log and this names them.
  LC_ALL=C grep -h "^  ✘" "$E2E" | cut -c1-200
done

if [ "$(printf '%s\n' "$dirs" | sed '/^$/d' | sort -u | wc -l)" -gt 1 ]; then
  echo "REFUSED: the logs are from more than one run, in more than one directory:"
  printf '%s\n' "$dirs" | sed '/^$/d' | sort -u | sed 's/^/  /'
  red=1
fi

if [ "$red" -ne 0 ]; then exit 1; fi
if [ -n "${GATE_ONLY:-}" ]; then exit 2; fi
if [ "$flaky" -ne 0 ]; then exit 3; fi
exit 0
