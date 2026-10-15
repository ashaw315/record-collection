#!/usr/bin/env bash
#
# What a run's memory went to, one line at a time.
#
#   scripts/memory-sample.sh <out-file> [seconds]
#   scripts/memory-sample.sh --peaks <out-file>     the worst each column reached
#
# Started by `scripts/gate.sh` beside the suites and stopped when they end.
# The gate for 146 (15 Oct, NOTES) was killed by the harness for memory at
# test 1303 of 1319, and nothing had sampled the run: the processes were gone
# at the reading and the holder could not be named. A one-worker cap went in
# as a precaution on that run, with nothing measured under it. This is the
# measurement, so the next kill has a cause and the cap a reading.
#
# Each line: unix time; the kernel's pressure level (1 normal, 2 warning,
# 4 critical, the figure macOS's own killer acts on); its free percentage;
# swap in use, MB; and the resident size in MB of the run's own processes
# by role: the Next server (`next`), the test browsers (Playwright's own
# Chromium and WebKit under `ms-playwright`, NOT the developer's Chrome),
# the Playwright runner, and vitest. `rss` is what each process holds
# itself; shared pages are counted once per process, so the sum of a role
# is a ceiling on it. The out-file is to be outside both trees.
set -uo pipefail

if [ "${1:-}" = "--peaks" ]; then
  # `+0` because the columns carry their units and awk would otherwise compare them as text.
  awk 'NR > 1 { if ($3+0 > l) l = $3+0; if ($7+0 > s) s = $7+0; if ($9+0 > n) n = $9+0; if ($11+0 > b) b = $11+0; if ($13+0 > r) r = $13+0; if ($15+0 > v) v = $15+0 }
    END { printf "pressure level %d, swap %dMB, next %dMB, browsers %dMB, runner %dMB, vitest %dMB, over %d samples\n", l, s, n, b, r, v, NR - 1 }' "${2:?the samples file}"
  exit
fi

OUT="${1:?an output file, outside the working tree and the worktree}"
EVERY="${2:-60}"

sample() {
  local level free swap
  level="$(sysctl -n kern.memorystatus_vm_pressure_level)"
  free="$(sysctl -n kern.memorystatus_level)"
  swap="$(sysctl -n vm.swapusage | awk '{print $6}' | tr -d 'M' | awk '{printf "%d", $1}')"
  ps -Ao rss,command | awk -v t="$(date +%s)" -v level="$level" -v free="$free" -v swap="$swap" '
    NR == 1 { next }
    /rss,command|memory-sample/ { next }
    /ms-playwright/ { browser += $1; next }
    /playwright test|playwright\/cli|@playwright\/test/ { runner += $1; next }
    /vitest/ { vitest += $1; next }
    /next dev|next start|next-server|next\/dist|\.next/ { next_server += $1; next }
    END { printf "%d level %d free %d%% swap %dMB next %dMB browsers %dMB runner %dMB vitest %dMB\n",
          t, level, free, swap, next_server / 1024, browser / 1024, runner / 1024, vitest / 1024 }'
}

echo "time level free swap next browsers runner vitest" > "$OUT"
while :; do sample >> "$OUT"; /bin/sleep "$EVERY"; done
