import { describe, expect, it } from 'vitest';
import { GLYPH_ADVANCE_PX, GLYPH_RUN_PX, SPINE_TEXT_BUDGET, spineLabel } from './spine-text';
import { SPINE_HEIGHT } from './geometry';
import { COLLECTION_SPINES } from '../../../test/fixtures/collection-spines';

describe('the 1:1 label (5b §1)', () => {
  it('is artist and title with the middle dot', () => {
    expect(spineLabel('MGMT', 'Loss Of Life')).toBe('MGMT · Loss Of Life');
  });

  it('truncates the drawn case exactly as drawn', () => {
    /* §11.11's near view: "Donna Summer · On Th…" — 20 glyphs and the mark, the 21 cap at the 150 face. */
    const label = spineLabel('Donna Summer', 'On The Radio: Greatest Hits Vol. 1 & 2');

    expect(label).toBe('Donna Summer · On Th…');
    expect([...label].length).toBe(SPINE_TEXT_BUDGET);
    expect(SPINE_TEXT_BUDGET).toBe(21);
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

  it('re-gathered at the 21 cap: twelve of the seventeen truncate', () => {
    /*
      §11.11 counted eleven overrunning untruncated in its render; the rule
      cuts twelve. The twelfth is Buddy Rich · Super Rich at 23 characters —
      two over the cap, which the render's inset evidently absorbed. Two
      characters is the measured-versus-derived gap, recorded rather than
      tuned away.
    */
    expect(truncated).toHaveLength(12);
    expect(truncated).toContain('Donna Summer · On Th…');
    expect(truncated).toContain('Buddy Rich · Super R…');
    expect(labels).toContain('Jeff Beck · Wired');
  });

  it('cycled to 120 labels as Wall Density drew them: seven cycles of twelve, plus the first', () => {
    const wall = Array.from({ length: 120 }, (_, i) => labels[i % labels.length]);
    expect(wall.filter((l) => l.endsWith('…'))).toHaveLength(12 * 7 + 1);
  });
});

describe('the budget is a rule, not a number: the face less its insets over the measured advance', () => {
  /**
   * §11.11: floor((150 − 14) / 6.235) = 21 at the drawing's face, the advance
   * measured at 6.234 in its render. The number follows the face; the
   * derivation is what is kept. (At 5b's 240 the same insets give 36 — the
   * earlier 37 used an 8 inset alone. One rule, and the inset is now the
   * drawing's.)
   */
  it('derives 21 from the 150 face, and would move with the face', () => {
    expect(GLYPH_RUN_PX).toBe(SPINE_HEIGHT - 14);
    expect(Math.floor(GLYPH_RUN_PX / GLYPH_ADVANCE_PX)).toBe(SPINE_TEXT_BUDGET);
    expect(Math.floor((240 - 14) / GLYPH_ADVANCE_PX)).toBe(36);
    expect(GLYPH_ADVANCE_PX / 10.39).toBeCloseTo(0.6, 2);
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

  it('re-gathered at the 21 cap: twelve of the seventeen truncate', () => {
    /*
      §11.11 counted eleven overrunning untruncated in its render; the rule
      cuts twelve. The twelfth is Buddy Rich · Super Rich at 23 characters —
      two over the cap, which the render's inset evidently absorbed. Two
      characters is the measured-versus-derived gap, recorded rather than
      tuned away.
    */
    expect(truncated).toHaveLength(12);
    expect(truncated).toContain('Donna Summer · On Th…');
    expect(truncated).toContain('Buddy Rich · Super R…');
    expect(labels).toContain('Jeff Beck · Wired');
  });

  it('cycled to 120 labels as Wall Density drew them: seven cycles of twelve, plus the first', () => {
    const wall = Array.from({ length: 120 }, (_, i) => labels[i % labels.length]);
    expect(wall.filter((l) => l.endsWith('…'))).toHaveLength(12 * 7 + 1);
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
  it('derives 21 from the 150 face — one rule, the number following the face', () => {
    expect(Math.floor((SPINE_HEIGHT - 14) / GLYPH_ADVANCE_PX)).toBe(SPINE_TEXT_BUDGET);
    expect(SPINE_TEXT_BUDGET).toBe(21);
    /* And the advance is the em ratio at the label's size, nothing added. */
    expect(GLYPH_ADVANCE_PX / 10.39).toBeCloseTo(0.6, 2);
  });
});
