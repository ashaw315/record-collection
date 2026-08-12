import { describe, expect, it } from 'vitest';
import { describeError } from './describe';

/**
 * Flattening an error and everything that caused it, for a SERVER-SIDE log.
 *
 * Written because a real cover failure logged "The image could not be stored."
 * — our own sentence, naming no cause. The SDK's error was attached as `cause`
 * and nothing read it, so the chain stopped one frame short of the only place
 * it mattered.
 *
 * This is for logs only. §5's error shape is what reaches a client, and a cause
 * chain there would leak deployment detail — the same reason the 503 for a
 * missing token never names the variable.
 */

describe('describeError', () => {
  it('returns the message of a plain error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('appends the cause, so our wrapper does not hide the reason', () => {
    const error = new Error('The image could not be stored.', {
      cause: new Error('Access denied, please provide a valid token'),
    });

    const described = describeError(error);

    expect(described).toContain('The image could not be stored.');
    expect(described, 'the actionable half').toContain('Access denied');
  });

  it('walks a chain several links deep', () => {
    // Both we and the SDK wrap, so one level of unwrapping is not enough.
    const error = new Error('outer', {
      cause: new Error('middle', { cause: new Error('the real reason') }),
    });

    expect(describeError(error)).toContain('the real reason');
  });

  it('does not REVISIT a link it has already described, on a cycle', () => {
    /**
     * A self-referencing cause is legal to construct. Two properties are worth
     * separating, because the link cap alone provides one of them:
     *
     *   - termination — the cap gives that for free, so asserting "it returns"
     *     proves nothing about the cycle guard. A first version of this test
     *     did exactly that and a mutation removing the guard passed it.
     *   - not repeating — only the `seen` set gives that, and without it a
     *     two-link cycle prints "a ← caused by: b ← caused by: a …", which
     *     reads as a longer failure chain than actually occurred.
     */
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as Error & { cause?: unknown }).cause = b;

    const described = describeError(a);

    expect(described).toBe('a ← caused by: b');
    expect(
      described.match(/(?<![a-z])a(?![a-z])/g)?.length,
      'each link appears once, not once per lap',
    ).toBe(1);
  });

  it('handles a non-Error thrown value', () => {
    // `throw 'string'` and `throw undefined` are both legal.
    expect(describeError('just a string')).toContain('just a string');
    expect(describeError(undefined)).toBeTruthy();
    expect(describeError(null)).toBeTruthy();
  });

  it('reads a cause that is not an Error', () => {
    const error = new Error('wrapper', { cause: 'a bare string reason' });

    expect(describeError(error)).toContain('a bare string reason');
  });

  it('does not repeat an identical message twice', () => {
    // Some SDKs wrap an error in another with the same text; printing it twice
    // makes a log harder to read and suggests two failures where there is one.
    const error = new Error('same', { cause: new Error('same') });

    expect(describeError(error)).toBe('same');
  });

  it('is bounded, so a long chain cannot fill a log line', () => {
    let error = new Error('root');
    for (let i = 0; i < 50; i += 1) error = new Error(`level ${i}`, { cause: error });

    const described = describeError(error);

    expect(described.length).toBeLessThan(1000);
  });
});
