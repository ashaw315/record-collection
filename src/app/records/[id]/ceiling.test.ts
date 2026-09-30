import { describe, expect, it } from 'vitest';
import { aspectOfScene, ceilingEnvelope, emptyWidthAt, upperRowAt } from './ceiling';
import { construction } from './construction';
const aspectOf = (id: string) => aspectOfScene(construction(id));
import { REAL_RECORD_IDS } from './real-records';
import { readFileSync } from 'node:fs';

/**
 * **§30's ceiling as arithmetic on an arrangement's aspect**, so it can be
 * measured across the id space (§46) rather than on one seeded record.
 *
 * Anchored to rendered figures, not to itself: `floor-ceiling-measure.spec.ts`
 * read The Soft Parade's empty width at 449.6 at 1439 × 900 and 1920 × 900,
 * 35.6 at 1440 × 900 and 253.3 at 1920 × 1080 (29 Sep). Each case names the
 * term it fails against.
 */
const rows = JSON.parse(readFileSync('docs/captures/real-records.json', 'utf8')) as Array<{ id: string; title: string }>;
const idOf = (title: string) => rows.find((r) => r.title === title)!.id;

describe('upperRowAt: the first row\'s cells as the page draws them', () => {
  it('splits the first row half and half from 960 to 1439 as built (§41)', () => {
    expect(upperRowAt({ width: 1000, height: 900, geometry: 'built' })).toMatchObject({ stillW: 500, sleeveW: 500 });
  });
  it('gives the construction the rest beside a 480 identity under §47', () => {
    expect(upperRowAt({ width: 1000, height: 900, geometry: 'identity-480' })).toMatchObject({ stillW: 520, sleeveW: 520 });
  });
  it('takes the columns above 1440: 4/4/4 at 1440, 4/5/5 at 1680, 4/6/6 at 1920 (§30, §39)', () => {
    expect(upperRowAt({ width: 1440, height: 900, geometry: 'built' })).toMatchObject({ stillW: 480, sleeveW: 480 });
    expect(upperRowAt({ width: 1680, height: 900, geometry: 'built' })).toMatchObject({ stillW: 600, sleeveW: 600 });
    expect(upperRowAt({ width: 1920, height: 900, geometry: 'built' })).toMatchObject({ stillW: 720, sleeveW: 720 });
  });
  it('scales the band with the viewport above 1440: 547 at 900, 656.4 at 1080 (§30)', () => {
    expect(upperRowAt({ width: 1920, height: 900, geometry: 'built' }).band).toBeCloseTo(547, 1);
    expect(upperRowAt({ width: 1920, height: 1080, geometry: 'built' }).band).toBeCloseTo(656.4, 1);
  });
});

describe('emptyWidthAt: the construction\'s own empty width plus the width beside the square', () => {
  const soft = aspectOf(idOf('The Soft Parade'));
  it('reads 449.6 for The Soft Parade at 1439 × 900, as rendered', () => {
    expect(emptyWidthAt({ aspect: soft, width: 1439, height: 900, geometry: 'built' })).toBeCloseTo(449.6, 0);
  });
  it('reads 35.6 at 1440 × 900, where the cover cell is its own square and only the construction is slack', () => {
    expect(emptyWidthAt({ aspect: soft, width: 1440, height: 900, geometry: 'built' })).toBeCloseTo(35.6, 0);
  });
  it('reads 449.6 at 1920 × 900 and 253.3 at 1920 × 1080: a taller band shrinks both terms', () => {
    expect(emptyWidthAt({ aspect: soft, width: 1920, height: 900, geometry: 'built' })).toBeCloseTo(449.6, 0);
    expect(emptyWidthAt({ aspect: soft, width: 1920, height: 1080, geometry: 'built' })).toBeCloseTo(253.3, 0);
  });
  it('is zero for the construction when width binds (a wide drawing in a narrow cell)', () => {
    expect(emptyWidthAt({ aspect: 3, width: 960, height: 900, geometry: 'built' })).toBe(0);
  });
});

describe('ceilingEnvelope: the least aspect that keeps every width under one upper cell', () => {
  const widths = [960, 1000, 1200, 1439, 1440, 1680, 1919, 1920];
  it('binds where the row leaves the most width: 1439 and 1920 at 900 tall', () => {
    const e = ceilingEnvelope({ widths, height: 900, geometry: 'built' });
    expect(e.minAspect).toBeGreaterThan(0.7);
    expect(e.minAspect).toBeLessThan(0.76);
    expect(e.bindingWidths).toEqual(expect.arrayContaining([1439, 1920]));
  });
  it('admits every one of the collection\'s seventeen as built', () => {
    const e = ceilingEnvelope({ widths, height: 900, geometry: 'built' });
    for (const r of rows) expect(aspectOf(r.id), r.title).toBeGreaterThanOrEqual(e.minAspect);
  });
  it('is a claim about the page, so the unit fixture list is admitted too (§46: not the collection alone)', () => {
    const e = ceilingEnvelope({ widths, height: 900, geometry: 'built' });
    for (const id of REAL_RECORD_IDS) expect(aspectOf(id)).toBeGreaterThanOrEqual(e.minAspect);
  });
});

/**
 * **Step 55's first measurement (§47), which halted the step.** With the
 * identity pinned at 480 and the construction taking the rest of the first
 * row from 960 to 1439, the construction's cell reaches 959 at 1439 while its
 * drawing stays bound by the band's height, and the cover's row leaves 413
 * beside the square. Every one of the seventeen exceeds §30's ceiling there,
 * from Wired at 553 to The Soft Parade at 929 (29 Sep). §47 says the section
 * stops and reports if the ceiling fails on any record; this holds the
 * figure the halt rests on, and fails the day the geometry or the
 * arrangements make it untrue.
 */
describe('§47\'s geometry against §30\'s ceiling (step 55.1, the halt)', () => {
  it('leaves more than one upper cell of empty width on every one of the seventeen at 1439 × 900', () => {
    const over = rows.map((r) => ({ title: r.title, empty: emptyWidthAt({ aspect: aspectOf(r.id), width: 1439, height: 900, geometry: 'identity-480' }) }));
    for (const o of over) expect(o.empty, `${o.title}: over 480 under §47`).toBeGreaterThan(480);
    expect(Math.min(...over.map((o) => o.empty)), 'the least of them (Wired)').toBeGreaterThan(550);
    expect(Math.max(...over.map((o) => o.empty)), 'the most (The Soft Parade)').toBeGreaterThan(925);
  });
  it('where the built geometry keeps the same records under 480 at the same width', () => {
    for (const r of rows) expect(emptyWidthAt({ aspect: aspectOf(r.id), width: 1439, height: 900, geometry: 'built' }), r.title).toBeLessThanOrEqual(480);
  });
});
