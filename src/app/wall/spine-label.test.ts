import { describe, expect, it } from 'vitest';
import { SPINE_TEXT_BUDGET, spineLabel } from './spine-text';
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
