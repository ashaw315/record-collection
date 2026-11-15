import { describe, expect, it } from 'vitest';
import { drawSurprise } from './surprise';

/**
 * **SURPRISE ME under §P.2 as "Ask field reconciled" rules it (12 Nov; step 180):** the singular last-served record
 * and its tier fallback are withdrawn; the records the last answer named are left out, and the fallback is the whole
 * pool. The draw is random among what remains. Each case fails against a draw that keeps one last-served record, that
 * falls back to nothing, or that can serve a record the last answer named while another remains.
 */
describe('drawSurprise', () => {
  const pool = ['a', 'b', 'c'];

  it('draws from the pool with the last answer’s records left out', () => {
    for (const r of [0, 0.5, 0.999]) expect(drawSurprise(pool, ['a', 'b'], () => r)).toBe('c');
    expect(['a', 'c']).toContain(drawSurprise(pool, ['b'], () => 0.6));
  });

  /*
    §P.2: "The same record is not served twice in a row while another remains", re-serving for SURPRISE ME only "where
    the pool holds one". With the run's shown set (14 Nov) every record can be named, and the fallback then leaves out
    the most recently named, the set's last, while the pool holds another. Fails against a fallback to the whole pool,
    which at a draw of 0.999 served the record already out (pick-pull-156, pick-answer-156, 15 Nov).
  */
  it('falls back, where the run has named every record, to the pool less the record named last, and serves a pool of one again', () => {
    expect(drawSurprise(pool, ['a', 'b', 'c'], () => 0.999), 'never c, named last').toBe('b');
    expect(drawSurprise(pool, ['c', 'a', 'b'], () => 0)).toBe('a');
    expect(drawSurprise(pool, ['c', 'a', 'b'], () => 0.999), 'never b, named last').toBe('c');
    expect(drawSurprise(['a', 'b'], ['a', 'b'], () => 0.999), 'the arrowed record out, the other served').toBe('a');
    expect(drawSurprise(['a'], ['a'], () => 0.9), 'a pool of one serves it again').toBe('a');
  });

  it('is null for an empty pool, and draws by the random number’s place', () => {
    expect(drawSurprise([], [], () => 0.5)).toBeNull();
    expect(drawSurprise(pool, [], () => 0)).toBe('a');
    expect(drawSurprise(pool, [], () => 0.999)).toBe('c');
  });
});
