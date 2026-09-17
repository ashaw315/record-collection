import { describe, expect, it } from 'vitest';
import { GLYPH_ADVANCE_PX, SPINE_TEXT_BUDGET, spineLabel } from './spine-text';
import { SPINE_HEIGHT } from './geometry';
import { COLLECTION_SPINES } from '../../../test/fixtures/collection-spines';

describe('the 1:1 label (5b §1)', () => {
  it('is artist and title with the middle dot', () => {
    expect(spineLabel('Donovan', 'The Hurdy Gurdy Man')).toBe('Donovan · The Hurdy Gurdy Man');
  });

  it('truncates the drawn case exactly as drawn', () => {
    /* 5b: "Donna Summer · On The Radio: Greates…" — 36 glyphs and the mark. */
    const label = spineLabel('Donna Summer', 'On The Radio: Greatest Hits Vol. 1 & 2');

    expect(label).toBe('Donna Summer · On The Radio: Greates…');
    expect([...label].length).toBe(SPINE_TEXT_BUDGET);
  });

  it('never exceeds the budget, counting the ellipsis', () => {
    for (const title of ['x'.repeat(10), 'x'.repeat(37), 'x'.repeat(200)]) {
      expect([...spineLabel('A', title)].length).toBeLessThanOrEqual(SPINE_TEXT_BUDGET);
    }
  });

  it('does not add an ellipsis to a label that fits exactly', () => {
    const exact = 'A · ' + 'x'.repeat(SPINE_TEXT_BUDGET - 4);
    expect([...exact].length).toBe(SPINE_TEXT_BUDGET);
    expect(spineLabel('A', 'x'.repeat(SPINE_TEXT_BUDGET - 4))).toBe(exact);
  });
});

describe('Wall Density’s truncation count, re-gathered at the budget the code uses (8a §11)', () => {
  /**
   * Wall Density counted 21 of 120 labels truncating — three shelves of forty,
   * the collection's seventeen labels cycled — at a 36-character budget. The
   * budget is 37, and a truncation count is exactly the measurement a
   * one-character error moves, so it is re-gathered here or not cited.
   */
  const labels = COLLECTION_SPINES.map((row) => spineLabel(row.artist, row.title));
  const truncated = labels.filter((label) => label.endsWith('…'));

  it('three of the seventeen truncate at 37 — the same three as at 36', () => {
    expect(truncated).toHaveLength(3);
    expect(truncated.map((l) => l.slice(0, 12))).toEqual(['Donna Summer', 'Simon & Garf', 'The Blues Pr']);
    /* No label is exactly 37 long, which is why the character did not move the count. */
    expect(labels.some((l) => [...l].length === SPINE_TEXT_BUDGET && !l.endsWith('…'))).toBe(false);
  });

  it('cycled to 120 labels as Wall Density drew them, 21 truncate at 37 too', () => {
    const wall = Array.from({ length: 120 }, (_, i) => labels[i % labels.length]);
    expect(wall.filter((l) => l.endsWith('…'))).toHaveLength(21);
  });
});

describe('the budget is a rule, not a number: it derives to 37 at both scales', () => {
  /**
   * Design's check on the withdrawal: D2's 30 came from an advance of 7.03 —
   * its 6.5px size plus 0.5 letter-spacing applied at 5b's scale. The
   * measured advance is 0.6em and nothing else. Derived from named terms at
   * each scale, the two agree, which is what makes the budget scale-invariant
   * — a character count does not multiply with the unit.
   */
  it('floor(232 / 6.235) at 5b’s unit and floor(145 / 3.9) at D2’s are both the budget', () => {
    const at5b = Math.floor((SPINE_HEIGHT - 8) / GLYPH_ADVANCE_PX);
    const d2Height = 150;
    const d2Inset = 5;
    const d2Advance = 0.6 * 6.5;
    const atD2 = Math.floor((d2Height - d2Inset) / d2Advance);
    expect(at5b).toBe(SPINE_TEXT_BUDGET);
    expect(atD2).toBe(SPINE_TEXT_BUDGET);
    /* And the advance is the em ratio at the label's size, nothing added. */
    expect(GLYPH_ADVANCE_PX / 10.39).toBeCloseTo(0.6, 2);
  });
});
