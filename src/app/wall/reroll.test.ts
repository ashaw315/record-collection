import { describe, expect, it } from 'vitest';
import { pickAnswer } from './reroll';
import type { PullState } from './WallLabelled';
import { OUT_MS, RETURN_MS } from './gesture';

/**
 * Target §P.3, step 156 unit 4: what an ask does on the near view, where the
 * answer is §W's pull. Each case is one sentence of §P.3 or §P.6.
 */
const out = (id: string, ms = OUT_MS): PullState => ({ id, direction: 'out', ms });
const back = (id: string, ms = 0): PullState => ({ id, direction: 'back', ms });

describe('pickAnswer', () => {
  it('pulls the named seat when nothing is out: "the first answer is §W’s pull, from the seat the pick names"', () => {
    expect(pickAnswer([], null, 'b')).toEqual({ kind: 'pull', id: 'b' });
  });

  it('puts the record out back and then pulls the named one: "an ask puts it back and then pulls the next"', () => {
    expect(pickAnswer([out('a')], null, 'b')).toEqual({ kind: 'reroll', back: 'a', pull: 'b' });
  });

  it('moves nothing where the pick names the record already out', () => {
    expect(pickAnswer([out('a')], null, 'a')).toEqual({ kind: 'stay' });
  });

  it('ignores an ask while the record is still coming out', () => {
    expect(pickAnswer([out('a', OUT_MS - 1)], null, 'b')).toEqual({ kind: 'ignore' });
  });

  it('ignores an ask while a record is going back', () => {
    expect(pickAnswer([back('a', RETURN_MS - 1)], null, 'b')).toEqual({ kind: 'ignore' });
  });

  it('ignores an ask during the arrows’ slide, one record back and its neighbour out', () => {
    expect(pickAnswer([back('a', 10), out('b', 10)], null, 'c')).toEqual({ kind: 'ignore' });
  });

  /* Between the put back landing and the queued pull starting, nothing is in `pulls`, and the re-roll is still under way. */
  it('ignores an ask while a re-roll’s pull is queued behind its put back, even with nothing in motion', () => {
    expect(pickAnswer([], 'b', 'c')).toEqual({ kind: 'ignore' });
  });

  it('draws nothing where the pool has no answer: §P.6’s “an ask the pool cannot answer draws nothing”', () => {
    expect(pickAnswer([], null, null)).toEqual({ kind: 'ignore' });
    expect(pickAnswer([out('a')], null, null)).toEqual({ kind: 'ignore' });
  });
});
