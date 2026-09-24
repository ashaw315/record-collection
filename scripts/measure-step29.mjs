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

console.log(`\n===== §22's ADVANCE RATE, over ${N} ids =====`);
const advances = [];
let scaledToFit = 0;
for (const id of ids) {
  const c = construction(id);
  advances.push(c.advances);
  if (c.scaledToFit === true) scaledToFit += 1;
}
const rejected = advances.filter((a) => a > 0).length;
const rate = rejected / N;
const deepest = Math.max(...advances);

console.log(`  advance rate : ${(rate * 100).toFixed(1)}%   (was 14.1%)`);
console.log(`  deepest      : ${deepest}            (was 5, cap ${HASH_ADVANCE_CAP})`);
console.log(`  ids rejected : ${rejected} of ${N}`);
console.log(`  scaledToFit  : ${scaledToFit} of ${N}`);

const histogram = new Map();
for (const a of advances) histogram.set(a, (histogram.get(a) ?? 0) + 1);
console.log('  distribution :');
for (const [a, n] of [...histogram.entries()].sort((p, q) => p[0] - q[0])) {
  console.log(`      ${String(a).padStart(2)} advance(s): ${String(n).padStart(5)}  ${((n / N) * 100).toFixed(2)}%`);
}

/* ---- §5.5's floor on the extremes fixture, at §33's per-record scale ---- */

const { REAL_RECORD_IDS } = await import('../src/app/records/[id]/real-records.ts');
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
/** §33's fit BEFORE the cap, so the cap's effect can be seen. */
const uncappedScale = (id) => {
  const scene = construction(id);
  const xs = [], ys = [];
  for (const form of scene.forms)
    for (const face of form.faces)
      for (const [x, y] of face.points) { xs.push(x); ys.push(y); }
  if (xs.length === 0) return sharedScale(id);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return Math.min(CELL_W / w, CELL_H / h);
};

const ownScale = (id) => {
  const scene = construction(id);
  const xs = [], ys = [];
  for (const form of scene.forms)
    for (const face of form.faces)
      for (const [x, y] of face.points) { xs.push(x); ys.push(y); }
  if (xs.length === 0) return sharedScale(id);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const fit = Math.min(CELL_W / w, CELL_H / h);
  return Math.min(fit, sharedScale(id) * CAP);
};

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
    capped: own >= shared * CAP - 1e-9,
    gain: own / shared,
    /* What the record would take if 1.5 did not stop it -- the cap's real cost. */
    uncappedGain: uncappedScale(id) / shared,
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
console.log(`  §33 scales each record to its OWN forms, capped at ${CAP}x the shared frame's scale.\n`);
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
console.log(`\n  CAPPED : ${rows.filter((r) => r.capped).length} of ${rows.length} records hit the ${CAP}x cap`);
const below = ownStat.sorted.filter((r) => r.own < FLOOR);
console.log(`  BELOW THE FLOOR: ${below.length}${below.length ? ' — ' + below.map((r) => `${r.id} ${pct(r.own)}`).join(', ') : ''}`);

console.log(`\n===== THE 1.5x CAP: per-record scale factors =====`);
console.log('  Design chose 1.5 without measuring. The distribution, ascending:\n');
const byGain = [...rows].sort((a, b) => a.gain - b.gain);
for (const r of byGain) {
  const bar = '#'.repeat(Math.round((r.gain - 1) * 40));
  console.log(`  ${r.id}  ${r.gain.toFixed(3)}x  ${r.uncappedGain.toFixed(3)}x uncapped  ${bar}${r.capped ? '  <- CAPPED' : ''}`);
}
const gains = byGain.map((r) => r.gain);
console.log(`\n  min ${gains[0].toFixed(3)}x   median ${gains[Math.floor(gains.length / 2)].toFixed(3)}x   max ${gains[gains.length - 1].toFixed(3)}x`);
