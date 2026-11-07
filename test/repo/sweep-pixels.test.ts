import { describe, expect, it } from 'vitest';
import { reportOf } from '../../scripts/sweep-pixels.mjs';

/**
 * A sweep prints its classification distribution beside its findings, always,
 * and a run where nothing was classified is a broken reader and not a clean
 * result (the coordinator, 6 Nov, from the twice sweep's first run, which
 * read 26 of 26 steps as other and would have reported a confident zero).
 * The pixel sweep's distribution is its calls by matcher; a log with no
 * numeric call read is a broken proxy, not a suite with no pixel assertion.
 *
 * Fails against a `read` that prints sites from an empty log as "0 sites".
 */
const call = (name: string, received: number, expected: number) => ({ name, received, args: [expected], pass: true, isNot: false, at: 'e2e/a.spec.ts:10:5' });

describe('reportOf: the calls by matcher are always printed, and none read is a broken reader', () => {
  it('prints calls by matcher beside the sites', () => {
    const r = reportOf([call('toBeCloseTo', 1.1, 1), call('toBeLessThanOrEqual', 3, 4), call('toBe', 2.5, 2.5)]);
    expect(r.broken).toBe(false);
    expect(r.lines.join('\n')).toMatch(/^calls by matcher: \{"toBeCloseTo":1,"toBeLessThanOrEqual":1,"toBe":1\} \(3 calls read\)$/m);
  });
  it('calls an empty log a broken reader, not a suite with no pixel assertion', () => {
    const r = reportOf([]);
    expect(r.broken).toBe(true);
    expect(r.lines[0]).toMatch(/^BROKEN READER: 0 calls read/);
  });
});
