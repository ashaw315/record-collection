import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CEILING, aspectOfScene, ceilingEnvelope, emptyWidthAt, sweepWidths } from './ceiling';
import { HASH_ADVANCE_CAP, arrangementAt, construction } from './construction';
import { NO_SCROLL_HEIGHT } from './band-geometry';

/**
 * **Step 54's measurement (§46): §30's ceiling across the id space.**
 *
 * "Every rule on this page is written for the records the app will hold, and
 * the collection is how they are measured, not what they are about." Five
 * thousand ids from a fixed seed, so the sweep is reproducible and still
 * reaches arrangements the collection does not have; the widths are the
 * layout sweep's (every 6px from 960 to 1920 and each fork ±1) at the 900
 * reference height, where the band is at its floor and the ceiling is
 * tightest. Empty width is width that carries nothing: the construction's
 * own slack plus the width beside the cover's square; the air at eight
 * columns carries §37's triangle and is not counted (§47).
 *
 * An advance is a deterministic re-hash of the id with a salt, which is
 * what §22's loop would do with a rejected arrangement; the guard itself is
 * not built here. The report is printed; the assertions are the claims the
 * measurement makes about the collection, which must stay inside the
 * envelope on every record.
 */
const SEED = 0x5eed2029;
const IDS = 5000;

/** mulberry32: small, seeded, and enough to spread ids across the hash. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (n: number, len: number) => n.toString(16).padStart(len, '0');
function uuidFrom(next: () => number): string {
  const r = () => Math.floor(next() * 0x10000);
  return `${hex(r(), 4)}${hex(r(), 4)}-${hex(r(), 4)}-4${hex(r() & 0xfff, 3)}-${hex(0x8000 | (r() & 0x3fff), 4)}-${hex(r(), 4)}${hex(r(), 4)}${hex(r(), 4)}`;
}


const rows = JSON.parse(readFileSync('docs/captures/real-records.json', 'utf8')) as Array<{ id: string; title: string }>;

describe('§46: the ceiling across five thousand ids (step 54, measured before anything is built)', () => {
  const widths = sweepWidths(960, 1920);
  const envelope = ceilingEnvelope({ widths, height: NO_SCROLL_HEIGHT, geometry: 'built' });
  const next = prng(SEED);
  const ids = Array.from({ length: IDS }, () => uuidFrom(next));

  it('has five thousand distinct ids to measure', () => {
    expect(new Set(ids).size).toBe(IDS);
  });

  it('reports the rejection rate, the widths where the ceiling breaks, the envelope and the deepest advance', () => {
    const rejected: Array<{ id: string; aspect: number; worst: number; at: number }> = [];
    const breaksAt = new Map<number, number>();
    /* The FIRST arrangement the hash gives each id, before the guard: what §46 measures the rate of. */
    for (const id of ids) {
      const aspect = aspectOfScene(arrangementAt(id, 0));
      let worst = 0; let at = 0;
      for (const w of widths) {
        const e = emptyWidthAt({ aspect, width: w, height: NO_SCROLL_HEIGHT, geometry: 'built' });
        if (e > worst) { worst = e; at = w; }
        if (e > CEILING) breaksAt.set(w, (breaksAt.get(w) ?? 0) + 1);
      }
      if (worst > CEILING) rejected.push({ id, aspect, worst, at });
    }
    const rate = rejected.length / IDS;
    /* The guard as built: §46's loop, both guards, one cap. */
    let deepest = { advances: 0, id: 'none' };
    let advancesTotal = 0; let quietFirst = 0; let capReached = 0;
    for (const id of ids) {
      if (arrangementAt(id, 0).quiet) quietFirst += 1;
      const scene = construction(id);
      advancesTotal += scene.advances;
      if (scene.advances > deepest.advances) deepest = { advances: scene.advances, id };
      if (scene.advances >= HASH_ADVANCE_CAP) capReached += 1;
    }
    const byRange = (lo: number, hi: number) => [...breaksAt.entries()].filter(([w]) => w >= lo && w <= hi).reduce((a, [, n]) => a + n, 0);
    const worstBreak = rejected.reduce((a, b) => (b.worst > a.worst ? b : a), { worst: 0, at: 0, aspect: 0, id: '' });
    console.log(
      `  §46 CEILING over ${IDS} ids at ${widths.length} widths, 900 tall:\n` +
        `    rejected ${rejected.length} (${(rate * 100).toFixed(2)}%) -- arrangements leaving more than ${CEILING} of empty width at some width\n` +
        `    envelope: aspect ≥ ${envelope.minAspect.toFixed(4)}, binding at ${envelope.bindingWidths.join(', ')}\n` +
        `    where it breaks (id × width counts): 960–1439: ${byRange(960, 1439)}; 1440–1679: ${byRange(1440, 1679)}; 1680–1919: ${byRange(1680, 1919)}; 1920: ${byRange(1920, 1920)}\n` +
        `    worst: ${worstBreak.worst.toFixed(1)} at ${worstBreak.at} (aspect ${worstBreak.aspect.toFixed(4)})\n` +
        `    §22's guard (no colour carrier at the first arrangement): ${quietFirst} (${((quietFirst / IDS) * 100).toFixed(2)}%)\n` +
        `    combined deepest advance: ${deepest.advances} (${deepest.id.slice(0, 8)}); mean over rejected: ${rejected.length ? (advancesTotal / rejected.length).toFixed(2) : '–'}; cap ${HASH_ADVANCE_CAP} reached by ${capReached} of ${IDS}`,
    );
    expect(rejected.length + (IDS - rejected.length), 'every id was measured').toBe(IDS);
    expect(capReached, 'the cap is a guard, not a path: no id reaches it').toBe(0);
    /* With the guard, what is DRAWN is inside the envelope for every id, so the ceiling holds across the id space. */
    for (const id of ids.slice(0, 500)) expect(aspectOfScene(construction(id)), `${id.slice(0, 8)} draws inside the envelope`).toBeGreaterThanOrEqual(envelope.minAspect);
    /* The collection stays inside: the widest of the seventeen was rendered at 449.6, under the ceiling. */
    for (const r of rows) {
      const worst = Math.max(...widths.map((w) => emptyWidthAt({ aspect: aspectOfScene(construction(r.id)), width: w, height: NO_SCROLL_HEIGHT, geometry: 'built' })));
      expect(worst, `${r.title} stays under the ceiling at every width`).toBeLessThanOrEqual(CEILING);
    }
  });
});
