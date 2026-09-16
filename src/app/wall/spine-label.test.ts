import { describe, expect, it } from 'vitest';
import { SPINE_TEXT_BUDGET, spineLabel } from './spine-text';

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
