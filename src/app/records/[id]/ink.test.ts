import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NO_SCROLL_HEIGHT } from './band-geometry';
import { construction, type Construction, type Form } from './construction';
import { COLUMN_COUNT_WIDTHS, fieldCapFor, inkCoverage, minimumInk, stillInnerBoxAt } from './ink';
import { REAL_RECORD_IDS } from './real-records';
import { TITLE_MEASURE } from './title-steps';

/**
 * **§50 and §52 (step 58): the tint field is capped by the construction's
 * ink, at the construction's minimum across the width range.** "Its area is
 * at most the construction's ink" (§50); "the construction's ink at its
 * minimum across every width from 480 up, so the field is the same at every
 * width and never outweighs the mark at any of them" (§52).
 *
 * Ink is counted at alpha 0.5 as §52 allows: a sample at each pixel centre
 * of the still's own viewBox, inside the disc or any face. Shadows are paper.
 */

/** A face with no footprint: `boundsOf` extends the box for top faces only. */
const face = (points: ReadonlyArray<readonly [number, number]>): Form['faces'][number] => ({ points, kind: 'left', step: 'grey' });
const form = (faces: Form['faces']): Form => ({ archetype: 'slab', slot: [0, 0], extent: 1, faces, depth: 0 });
const disc = (cx: number, cy: number, r: number): Construction['disc'] => ({ cx, cy, r, step: 'tint' });

const seventeen = JSON.parse(readFileSync('docs/captures/real-records.json', 'utf8')) as Array<{ id: string; title: string }>;
const idOf = (title: string): string => {
  const row = seventeen.find((r) => r.title === title);
  if (row === undefined) throw new Error(`no fixture titled ${title}`);
  return row.id;
};

describe('inkCoverage: the fraction of the viewBox with a form on it', () => {
  it('counts a half-box face plus a one-row face as 0.51 of a 100 × 100 box', () => {
    /* The square covers rows 0-49, the sliver row 99; the disc sits inside the square. */
    const scene = { forms: [form([face([[0, 0], [100, 0], [100, 50], [0, 50]])]), form([face([[0, 99], [100, 99], [100, 100], [0, 100]])])], disc: disc(50, 25, 5) };
    expect(inkCoverage(scene)).toBeCloseTo(0.51, 6);
  });

  it('does not count overlap twice: two identical faces cover what one does', () => {
    const square = face([[0, 0], [100, 0], [100, 50], [0, 50]]);
    const once = { forms: [form([square]), form([face([[0, 99], [100, 99], [100, 100], [0, 100]])])], disc: disc(50, 25, 5) };
    const twice = { forms: [form([square]), form([square]), form([face([[0, 99], [100, 99], [100, 100], [0, 100]])])], disc: disc(50, 25, 5) };
    expect(inkCoverage(twice)).toBe(inkCoverage(once));
  });

  it('counts the disc: a disc alone in its own box covers π/4 of it', () => {
    const scene = { forms: [], disc: disc(100, 100, 50) };
    expect(inkCoverage(scene)).toBeCloseTo(Math.PI / 4, 2);
  });
});

describe('stillInnerBoxAt: the still’s inner box at a width (§44 rows below 960, §48’s 520 to 1439, §39’s columns above)', () => {
  it('fills its 546 row from 480 to 959, at the page width less the margins, whatever the window height', () => {
    expect(stillInnerBoxAt(480)).toEqual({ width: 432, height: 498 });
    expect(stillInnerBoxAt(959)).toEqual({ width: 911, height: 498 });
    expect(stillInnerBoxAt(959, 1200)).toEqual({ width: 911, height: 498 });
  });

  it('is the page less the 520 identity from 960, and the band takes the window’s height', () => {
    expect(stillInnerBoxAt(960)).toEqual({ width: 392, height: 498 });
    expect(stillInnerBoxAt(1439)).toEqual({ width: 871, height: 498 });
    expect(stillInnerBoxAt(960, 1200).height).toBeCloseTo(680.3, 1);
  });

  it('is the still’s columns less margins and the hairline from 1440', () => {
    expect(stillInnerBoxAt(1440)).toEqual({ width: 431, height: 498 });
    expect(stillInnerBoxAt(1680)).toEqual({ width: 551, height: 498 });
    expect(stillInnerBoxAt(1920)).toEqual({ width: 671, height: 498 });
  });

  it('evaluates every column count from 480 up at the count’s first width, where its cell is smallest', () => {
    expect(COLUMN_COUNT_WIDTHS).toEqual([480, 960, 1440, 1680, 1920]);
  });
});

describe('minimumInk and fieldCapFor over the real collection (§52)', () => {
  it('finds the minimum at 960 on every record, bound by the 392 width so the window’s height does not move it', () => {
    for (const id of REAL_RECORD_IDS) {
      const m = minimumInk(construction(id));
      expect(m.width, id).toBe(960);
      expect(m.box.width, `${id}: width-bound at 960`).toBeCloseTo(392, 6);
      expect(m.box.height, `${id}: shorter than the row`).toBeLessThanOrEqual(stillInnerBoxAt(960, NO_SCROLL_HEIGHT).height);
    }
  });

  it('is the coverage times the box at the minimum, over the field’s width', () => {
    const scene = construction(idOf('Gaucho'));
    const m = minimumInk(scene);
    expect(m.area).toBeCloseTo(m.box.width * m.box.height * m.coverage, 6);
    expect(fieldCapFor(scene)).toBeCloseTo(m.area / TITLE_MEASURE, 6);
  });

  it('gives Wired 86 and Bridge Over Troubled Water 109, the two the cap suppresses, as measured in the browser on 30 Sep', () => {
    /* The canvas raster at alpha ≥ 0.5 gave 86.2 and 109.3; a point sample at pixel centres is that figure to within edge rounding. */
    expect(fieldCapFor(construction(idOf('Wired')))).toBeCloseTo(86.2, 0);
    expect(fieldCapFor(construction(idOf('Bridge Over Troubled Water')))).toBeCloseTo(109.3, 0);
  });
});
