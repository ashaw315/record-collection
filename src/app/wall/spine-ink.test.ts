import { describe, expect, it } from 'vitest';
import { INK_CANDIDATES, pickInk } from './spine-ink';
import { contrastRatio } from '@/lib/colour/record-colour';
import { COLLECTION_SPINES } from '../../../test/fixtures/collection-spines';

describe('the label ink is picked per fill from four candidates (5b §1)', () => {
  it('names the four the drawing uses', () => {
    expect([...INK_CANDIDATES]).toEqual(['#0a0a0a', '#ffffff', '#161412', '#5c564f']);
  });

  it('picks the candidate with the highest contrast, on every fill in the collection', () => {
    /*
      The rule, not a table of answers: for each fill the pick must beat every
      other candidate. A pick that returned the right ink for the wrong reason
      — say, always white on dark fills — would fail on a fill where the
      near-black edges white out.
    */
    for (const row of COLLECTION_SPINES) {
      if (row.resampled === null) continue;
      const { ink, ratio } = pickInk(row.resampled);

      for (const other of INK_CANDIDATES) {
        expect(ratio, `${row.title}: ${ink} beats ${other}`).toBeGreaterThanOrEqual(
          contrastRatio(row.resampled, other),
        );
      }
    }
  });

  it('is deterministic and reports the ratio it picked by', () => {
    const a = pickInk('#94698a');
    const b = pickInk('#94698a');
    expect(a).toEqual(b);
    expect(a.ratio).toBeCloseTo(contrastRatio('#94698a', a.ink), 6);
  });
});
