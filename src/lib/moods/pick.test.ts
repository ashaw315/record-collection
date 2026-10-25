import { describe, expect, it } from 'vitest';
import { pickFrom } from './pick';

/**
 * SPEC.md target §P.2: "The same record is not served twice in a row while
 * another remains." The draw is uniform over the candidates less the
 * last-served record, unless that would leave nothing. SURPRISE ME passes the
 * whole pool; ASK will pass its highest tier.
 *
 * `random` stands in for Math.random, so each case names the index it lands on.
 */

const at = (value: number) => () => value;

describe('pickFrom', () => {
  it('draws nothing from an empty pool', () => {
    expect(pickFrom([], null, at(0))).toBeNull();
    expect(pickFrom([], 'a', at(0))).toBeNull();
  });

  it('draws uniformly across the pool, by where the random value falls', () => {
    const pool = ['a', 'b', 'c'];
    expect(pickFrom(pool, null, at(0))).toBe('a');
    expect(pickFrom(pool, null, at(0.34))).toBe('b');
    expect(pickFrom(pool, null, at(0.67))).toBe('c');
    expect(pickFrom(pool, null, at(0.999))).toBe('c');
  });

  it('never serves the last-served record while another remains', () => {
    const pool = ['a', 'b'];
    expect(pickFrom(pool, 'a', at(0))).toBe('b');
    expect(pickFrom(pool, 'a', at(0.999))).toBe('b');
    expect(pickFrom(pool, 'b', at(0))).toBe('a');
    expect(pickFrom(pool, 'b', at(0.999))).toBe('a');
  });

  /** The exclusion leaves one fewer to draw from, so the random value spans the rest, not the whole pool. */
  it('spreads the draw over the records that remain once the last-served is excluded', () => {
    const pool = ['a', 'b', 'c'];
    expect(pickFrom(pool, 'b', at(0))).toBe('a');
    expect(pickFrom(pool, 'b', at(0.5))).toBe('c');
  });

  it('serves the last-served record again when it is the only one', () => {
    expect(pickFrom(['a'], 'a', at(0))).toBe('a');
    expect(pickFrom(['a'], 'a', at(0.999))).toBe('a');
  });

  /** "The pool is what the screen shows": a filter can hide the last-served record, and then nothing is excluded. */
  it('draws from the whole pool when the last-served record is not in it', () => {
    const pool = ['a', 'b'];
    expect(pickFrom(pool, 'z', at(0))).toBe('a');
    expect(pickFrom(pool, 'z', at(0.999))).toBe('b');
  });
});
