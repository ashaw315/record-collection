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
    id: id.slice(0, 8),
    shared: fractionAt(id, shared),
    own: fractionAt(id, own),
    capped: own >= shared * CAP - 1e-9,
    gain: own / shared,
  };
});

const pct = (f) => `${(f * 100).toFixed(3)}%`;
const sorted = [...rows].sort((a, b) => a.own - b.own);
const median = sorted[Math.floor(sorted.length / 2)];

console.log(`\n===== §5.5's FLOOR on the extremes fixture (${rows.length} records) =====`);
console.log(`  §33 scales each record to its OWN forms, capped at ${CAP}x the shared frame's scale.\n`);
console.log('  id        shared     §33        gain   capped');
for (const r of sorted) {
  console.log(
    `  ${r.id}  ${pct(r.shared).padStart(8)}  ${pct(r.own).padStart(8)}  ${r.gain.toFixed(2)}x  ${r.capped ? 'CAPPED' : ''}`,
  );
}
console.log(`\n  WORST  : ${pct(sorted[0].own)}  (was ${pct(sorted[0].shared)})   floor is ${pct(FLOOR)}`);
console.log(`  MEDIAN : ${pct(median.own)}  (was ${pct(median.shared)})`);
console.log(`  CAPPED : ${rows.filter((r) => r.capped).length} of ${rows.length} records hit the 1.5x cap`);
const below = sorted.filter((r) => r.own < FLOOR);
console.log(`  BELOW THE FLOOR: ${below.length}${below.length ? ' — ' + below.map((r) => `${r.id} ${pct(r.own)}`).join(', ') : ''}`);
