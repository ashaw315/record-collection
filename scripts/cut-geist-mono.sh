#!/usr/bin/env bash
# §63 (step 167): cut the family's own GeistMono-Variable once, to Google's
# Latin range plus the arrows U+2190 to 2199, and commit the result at
# src/app/fonts/GeistMono-latin-arrows.woff2, which layout.tsx serves through
# next/font/local wherever the app sets Geist Mono.
#
# Why a cut and not the family's whole file: the whole file is 71,272 bytes,
# 48KB over what a cold load fetched from Google, for 1,159 glyphs of which
# the app draws a few hundred. Why these subsetter options and not the
# defaults: with every layout feature kept the cut came to 35,044, 12KB over
# Google's 23,108, and the 12KB was the stylistic sets and the `aalt` closure
# (160 alternate glyphs and a GSUB of 10,982 bytes against 554), not the
# axis, the hinting or the arrows. With Google's own feature list the cut is
# 22,520, under today's file, and the arrows cost 556 of it (4 Nov).
#
# Run once, by hand, and commit the output; nothing runs this at build time.
# Needs python3 with fonttools and brotli (`pip install 'fonttools[woff]'`),
# and npm, to fetch geist@1.9.0 and take the file from it. The subsetter is
# found on PATH or named in PYFTSUBSET.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=src/app/fonts/GeistMono-latin-arrows.woff2
PYFTSUBSET="${PYFTSUBSET:-pyftsubset}"
command -v "$PYFTSUBSET" >/dev/null || { echo "cut-geist-mono: $PYFTSUBSET not found; pip install 'fonttools[woff]' or set PYFTSUBSET" >&2; exit 2; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
(cd "$WORK" && npm pack geist@1.9.0 --silent >/dev/null && tar -xzf geist-1.9.0.tgz)
SRC="$WORK/package/dist/fonts/geist-mono/GeistMono-Variable.woff2"
[ -f "$SRC" ] || { echo "cut-geist-mono: $SRC is not in geist@1.9.0" >&2; exit 3; }

# Google's latin unicode-range, as its CSS declares it for Geist Mono, plus the arrows.
LATIN='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
ARROWS='U+2190-2199'
# The features Google's latin file keeps, read from its GSUB and GPOS (4 Nov).
FEATURES='ccmp,dnom,frac,locl,numr,mark,mkmk'

mkdir -p "$(dirname "$OUT")"
"$PYFTSUBSET" "$SRC" \
  --unicodes="$LATIN,$ARROWS" \
  --layout-features="$FEATURES" \
  --flavor=woff2 \
  --no-hinting \
  --output-file="$OUT"

printf 'cut-geist-mono: %s, %s bytes (the family file %s bytes)\n' "$OUT" "$(wc -c < "$OUT" | tr -d ' ')" "$(wc -c < "$SRC" | tr -d ' ')"
