import { describe, expect, it } from 'vitest';
import { bracketed } from '../../e2e/bracket';

/**
 * The bracketed read, for a test that compares two reads of a quantity every
 * other worker can move (pick-moods-157:154, option (b), the coordinator,
 * 5 Nov). A read is taken between two fingerprints of the database's
 * visibility; the reads count only when the fingerprints agree, and the
 * bracket reopens otherwise, a bounded number of times.
 *
 * **Equality of the quantity is not the bracket** (the coordinator's limit):
 * a compensating pair inside the window, one record created untagged and
 * one existing record tagged, leaves the two whole reads equal while the
 * filtered read was taken mid-flight. So the fingerprint is Postgres's own
 * snapshot, `pg_current_snapshot()`, which changes whenever a writing
 * transaction starts or ends and never otherwise; two equal snapshots mean
 * no committed state changed between them, whatever the quantity did.
 *
 * Each test names the branch it fails against: a bracket that returns on a
 * moved fingerprint; one that retries forever or not at all; one that
 * accepts an equal quantity across a moved fingerprint.
 */
describe('bracketed', () => {
  it('returns the read on the first attempt when the fingerprint is unchanged across it', async () => {
    let reads = 0;
    const result = await bracketed(async () => 'snap-1', async () => ({ n: ++reads }), { attempts: 3 });
    expect(result).toEqual({ value: { n: 1 }, attempts: 1, reopened: [] });
  });

  it('reopens when the fingerprint moved across the read, and returns the first closed attempt', async () => {
    const snaps = ['a', 'b', 'c', 'c'];
    let reads = 0;
    const result = await bracketed(async () => snaps.shift() ?? 'c', async () => ({ n: ++reads }), { attempts: 3 });
    expect(result.value).toEqual({ n: 2 });
    expect(result.attempts).toBe(2);
    expect(result.reopened).toEqual(['a -> b']);
  });

  it('rejects a read whose quantity came back equal while the fingerprint moved: a compensating pair is not a closed bracket', async () => {
    const snaps = ['p', 'q', 'r', 'r'];
    const result = await bracketed(async () => snaps.shift() ?? 'r', async () => ({ whole: 23, filtered: 23 }), { attempts: 3 });
    expect(result.attempts, 'the equal pair inside p -> q was not accepted').toBe(2);
  });

  it('fails after the bound, naming every pair of fingerprints it saw', async () => {
    let i = 0;
    await expect(bracketed(async () => `s${i++}`, async () => 1, { attempts: 3 })).rejects.toThrow(
      'the bracket did not close in 3 attempts: s0 -> s1, s2 -> s3, s4 -> s5',
    );
  });
});
