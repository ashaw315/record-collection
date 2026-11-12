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

  it('falls back to the whole pool where leaving the last answer out would leave nothing', () => {
    expect(drawSurprise(pool, ['a', 'b', 'c'], () => 0)).toBe('a');
    expect(drawSurprise(['a'], ['a'], () => 0.9)).toBe('a');
  });

  it('is null for an empty pool, and draws by the random number’s place', () => {
    expect(drawSurprise([], [], () => 0.5)).toBeNull();
    expect(drawSurprise(pool, [], () => 0)).toBe('a');
    expect(drawSurprise(pool, [], () => 0.999)).toBe('c');
  });
});
