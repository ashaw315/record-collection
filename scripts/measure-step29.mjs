/**
 * Step 29's three measurements, reported rather than asserted.
 *
 * Two of them are stale figures re-measured: §33 changes every drawn scale,
 * and colour eligibility lands on a form clearing §5.5's floor AT DRAWN
 * SCALE, so the advance rate measured against the old scale no longer
 * describes the build.
 */
const { construction, HASH_ADVANCE_CAP } = await import('../src/app/records/[id]/construction.ts');

const N = 5000;
const ids = Array.from({ length: N }, (_, i) => `sample-${i}`);

/*
  **These are TWO different gates, and only one of them advances the hash.**

  `constructionWithin`'s loop advances on `fitsFrame` alone -- §31's fit
  check. §22 never advances anything: it FILTERS the hash's order to the forms
  large enough to carry colour and takes the first two, and where fewer than
  two are eligible the record renders quiet. So a "rate" reported for §22 was
  the fit check's rejection rate wearing the wrong label, and 14.1%/deepest-5
  describe the gate that retires with the frame.
*/
console.log(`\n===== §31's FIT CHECK (retiring), over ${N} ids =====`);
const advances = [];
let scaledToFit = 0;
for (const id of ids) {
  const c = construction(id);
  advances.push(c.advances);
  if (c.scaledToFit === true) scaledToFit += 1;
}
const rejected = advances.filter((a) => a > 0).length;
console.log(`  rejection rate : ${((rejected / N) * 100).toFixed(1)}%   (recorded: 14.1%)`);
console.log(`  deepest advance: ${Math.max(...advances)}            (recorded: 5, cap ${HASH_ADVANCE_CAP})`);
console.log(`  scaled to fit  : ${scaledToFit} of ${N}   <- the fallback has never fired`);

console.log(`\n===== §22's COLOUR ELIGIBILITY (the gate that survives), over ${N} ids =====`);
console.log('  §22 is a FILTER, not an advance: it has no rate of its own.');
let quiet = 0;
const eligibleCounts = new Map();
for (const id of ids) {
  const c = construction(id);
  if (c.quiet === true) quiet += 1;
  const carriers = c.forms.filter((f) => f.faces.some((x) => x.step === 'base')).length;
  eligibleCounts.set(carriers, (eligibleCounts.get(carriers) ?? 0) + 1);
}
console.log(`  quiet records  : ${quiet} of ${N}  (${((quiet / N) * 100).toFixed(2)}%)  -- fewer than two eligible forms`);
console.log('  colour-carrying forms per record:');
for (const [n, count] of [...eligibleCounts.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`      ${n} form(s): ${String(count).padStart(5)}  ${((count / N) * 100).toFixed(2)}%`);
}

/* ---- §5.5's floor on the extremes fixture, at §33's per-record scale ---- */

const { REAL_RECORD_IDS } = await import('../src/app/records/[id]/real-records.ts');
const { ownFitViewBox } = await import('../src/app/records/[id]/own-fit.ts');
const { BANDS, GRID_COLUMNS, IDENTITY_SPANS, NO_SCROLL_HEIGHT, STILL_MARGIN } = await import(
  '../src/app/records/[id]/band-geometry.ts'
);

const CELL_W = (1440 / GRID_COLUMNS) * IDENTITY_SPANS[1] - 2 * STILL_MARGIN;
const CELL_H = BANDS.identity - 2 * STILL_MARGIN;
const PAGE = 1440 * NO_SCROLL_HEIGHT;
const FLOOR = 0.005;
/** §33: "capped at 1.5 times the scale the shared frame gave". */
const CAP = 1.5;

const faceArea = (points) => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
};

/** The shared frame's scale — what the build draws today. */
const sharedScale = (id) => {
  const [, , w, h] = construction(id).viewBox.split(' ').map(Number);
  return Math.min(CELL_W / w, CELL_H / h);
};

/**
 * §33's per-record fit: "Each record's drawing is scaled to the smaller of its
 * inner box's width and height over its OWN forms and disc, capped at 1.5
 * times the scale the shared frame gave."
 */
/**
 * §33's fit, from THE SHIPPING IMPLEMENTATION rather than re-derived here.
 * A measurement script that recomputes the rule measures its own copy of it,
 * which is how a build and its check drift apart while both look right.
 */
const ownFitScale = (id) => {
  const [, , w, h] = ownFitViewBox(construction(id)).split(' ').map(Number);
  return Math.min(CELL_W / w, CELL_H / h);
};

/* **The cap is gone**, so the record's own fit IS its scale. */
const ownScale = ownFitScale;

const fractionAt = (id, scale) => {
  const scene = construction(id);
  const base = scene.forms
    .flatMap((form) => form.faces.filter((face) => face.step === 'base'))
    .map((face) => faceArea(face.points));
  return (base.reduce((a, b) => a + b, 0) * scale * scale) / PAGE;
};

const rows = REAL_RECORD_IDS.map((id) => {
  const shared = sharedScale(id);
  const own = ownScale(id);
  return {
    /*
      **Head AND tail.** Five fixture ids are synthetic extremes of the form
      `4a1e2b7c-0000-4000-8000-00000000000N`, differing only in the last
      digit, so any leading slice prints the same label five times and reads
      as a duplicated row. All seventeen are distinct.
    */
    id: `${id.slice(0, 8)}…${id.slice(-4)}`,
    sharedScale: shared,
    ownScale: own,
    shared: fractionAt(id, shared),
    own: fractionAt(id, own),
    capped: false,
    gain: own / shared,
    uncappedGain: own / shared,
  };
});

const pct = (f) => `${(f * 100).toFixed(4)}%`;

/*
  **Each statistic is taken over its OWN ordering.** The first version sorted
  by the §33 value and then read the shared column off the reordered list, so
  the "was" figures were the shared values of whichever records happened to
  land first and middle -- 0.641% and 0.660% against the recorded 0.5084% and
  0.7535%. Real numbers, attached to the wrong rows. A baseline has to be
  computed, never read off a row that a different sort put there.
*/
const stat = (key) => {
  const s = [...rows].sort((a, b) => a[key] - b[key]);
  return { worst: s[0][key], median: s[Math.floor(s.length / 2)][key], sorted: s };
};
const sharedStat = stat('shared');
const ownStat = stat('own');

console.log(`\n===== §5.5's FLOOR on the extremes fixture (${rows.length} records) =====`);
console.log(`  1440 x ${NO_SCROLL_HEIGHT}, inner box ${CELL_W} x ${CELL_H}, base-step face area over the page.`);
console.log(`  §33 scales each record to its OWN forms. The 1.5x cap is WITHDRAWN.\n`);
console.log('  id              shared       §33       gain   scale(shared -> own)');
for (const r of ownStat.sorted) {
  console.log(
    `  ${r.id}  ${pct(r.shared).padStart(9)}  ${pct(r.own).padStart(9)}  ${r.gain.toFixed(3)}x  ` +
      `${r.sharedScale.toFixed(4)} -> ${r.ownScale.toFixed(4)}  ${r.capped ? 'CAPPED' : ''}`,
  );
}

console.log(`\n  SHARED FRAME (the recorded baseline, step 23)`);
console.log(`    worst  : ${pct(sharedStat.worst)}   <- recorded as 0.5084%`);
console.log(`    median : ${pct(sharedStat.median)}   <- recorded as 0.7535%`);
console.log(`\n  §33 PER-RECORD FIT`);
console.log(`    worst  : ${pct(ownStat.worst)}`);
console.log(`    median : ${pct(ownStat.median)}`);
console.log(`    floor  : ${pct(FLOOR)}`);
console.log(`\n  CAP    : withdrawn — no record is trimmed`);
const below = ownStat.sorted.filter((r) => r.own < FLOOR);
console.log(`  BELOW THE FLOOR: ${below.length}${below.length ? ' — ' + below.map((r) => `${r.id} ${pct(r.own)}`).join(', ') : ''}`);

/*
  **Evenness is a SHAPE question, and raw spread cannot answer it.** The
  interquartile range went 0.3127% -> 0.4018% when the pad came out, which
  read as "less even" -- but the whole distribution grew about 30%, so any
  statistic in its units grows about 30% whatever the shape does. Scale-free,
  on the same quartiles:

      IQR / median   0.2711 -> 0.2613   (-3.6%)
      Q3 / Q1        1.3202 -> 1.3165   (-0.3%)
      max / min      1.955  -> 2.062    (+5.5%)

  The middle half is marginally MORE even; the extremes spread slightly; both
  moves are small and opposite. The shape barely moved, and the capture judges
  it. Three answers to this question came from three wrong measures: gain
  endpoints taken from different records, a cap with nothing measured behind
  it, and a statistic that scales with its subject.
*/
console.log(`\n===== PER-RECORD SCALE FACTORS, cap withdrawn =====`);
const byGain = [...rows].sort((a, b) => a.gain - b.gain);
for (const r of byGain) {
  const bar = '#'.repeat(Math.round((r.gain - 1) * 40));
  console.log(`  ${r.id}  ${r.gain.toFixed(3)}x  ${bar}`);
}
const gains = byGain.map((r) => r.gain);
console.log(`\n  min ${gains[0].toFixed(3)}x   median ${gains[Math.floor(gains.length / 2)].toFixed(3)}x   max ${gains[gains.length - 1].toFixed(3)}x`);
