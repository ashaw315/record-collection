#!/usr/bin/env bash
# Q67's tail, measured per spec: each spec that creates labels or pressings runs alone on chromium, and the ledger's
# start-to-end delta for labels, pressings, record_stores and tags is read from the teardown's lines. One line per spec.
set -u
cd /Users/adamshaw/Development/websites/record-collection || exit 1
S=$(mktemp -d)
OUT="${LEAK_OUT:-docs/measurements/leak-per-spec.tsv}"
printf 'spec\tsummary\tlabels\tpressings\tstores\ttags\n' > "$OUT"
specs=$(grep -ln "/api/labels\|INSERT INTO labels\|/api/pressings\|INSERT INTO pressings\|pressing" e2e/*.spec.ts | sort -u)
for spec in $specs; do
  log="$S/leak-$(basename "$spec" .spec.ts).log"
  npx playwright test "$spec" --project=chromium > "$log" 2>&1
  summary=$(grep -E "^\s+[0-9]+ (passed|failed|flaky)" "$log" | tr -s ' ' | tr '\n' ' ' | cut -c1-60)
  delta() { grep -h "\[ledger\] $1:" "$log" | sed -E 's/.*: ([0-9]+) at the start, ([0-9]+) at the end.*/\1 \2/' | awk '{print $2-$1}' | head -1; }
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(basename "$spec")" "$summary" "$(delta labels)" "$(delta pressings)" "$(delta record_stores)" "$(delta tags)" >> "$OUT"
done
echo "done: $(wc -l < "$OUT") lines"
