import { describe, expect, it } from 'vitest';
import { dedupeCorpus } from './corpus';

/**
 * **The rerun's corpus, deduplicated with Adam's block winning (the coordinator, 24 Nov).** Block two is the 23 Nov
 * corpus, which holds two of Adam's phrases verbatim and one asked on his behalf; if he names any in block one, the same
 * phrase would run in two blocks under two labels and the overall rate would count it twice. A phrase he names is his and
 * leaves every other block; the moves are reported. Fails against a dedupe that keeps the later label, one that compares
 * untrimmed or by case, and one that reports no moves.
 */
describe('dedupeCorpus', () => {
  it('keeps a phrase in the first block that holds it, by block order, and names what moved', () => {
    const corpus = [
      { group: 'block-1-adam', phrase: 'something calm' },
      { group: 'block-1-adam', phrase: 'quiet, warm' },
      { group: 'block-2-23-nov', phrase: 'Something calm ' },
      { group: 'block-2-23-nov', phrase: 'jazz for late at night' },
      { group: 'block-3-design', phrase: 'angry' },
    ];
    expect(dedupeCorpus(corpus)).toEqual({
      corpus: [
        { group: 'block-1-adam', phrase: 'something calm' },
        { group: 'block-1-adam', phrase: 'quiet, warm' },
        { group: 'block-2-23-nov', phrase: 'jazz for late at night' },
        { group: 'block-3-design', phrase: 'angry' },
      ],
      moved: [{ phrase: 'Something calm ', from: 'block-2-23-nov', to: 'block-1-adam' }],
    });
  });
});
