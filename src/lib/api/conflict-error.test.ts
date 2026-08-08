import { describe, expect, it } from 'vitest';
import { ConflictError, conflict, isConflictError } from './errors';

/**
 * The typed conflict added in step 6 unit 3 (SPEC.md §5.3).
 *
 * `withErrorHandling` turns every escaping throw into a 500, which is correct
 * for the errors nobody anticipated and wrong for a DEFINED conflict raised
 * from inside a transaction — where throwing is the only way to roll back. The
 * loser of an acquire race was getting a 500 and writing a false fault to the
 * log.
 *
 * Tested here rather than only through the endpoint because the discrimination
 * is the whole point: `isConflictError` must say yes to this and no to
 * everything else, including the driver errors it sits next to.
 */

describe('ConflictError', () => {
  it('carries a code the handler turns into a response', () => {
    const error = new ConflictError('That has already been acquired', 'ALREADY_ACQUIRED');

    expect(error.code).toBe('ALREADY_ACQUIRED');
    expect(error.message).toBe('That has already been acquired');
  });

  it('is a real Error, so a stack survives for the log', () => {
    // It travels through a Drizzle transaction and vitest's rejects matcher;
    // an object that merely looks like an error loses both.
    const error = new ConflictError('x', 'Y');

    expect(error).toBeInstanceOf(Error);
    expect(error.stack).toBeDefined();
    expect(error.name).toBe('ConflictError');
  });

  describe('isConflictError', () => {
    it('recognises a conflict', () => {
      expect(isConflictError(new ConflictError('x', 'Y'))).toBe(true);
    });

    /**
     * The half that matters. If this returned true for an ordinary Error, the
     * handler would answer 409 to a genuine database fault — a silent failure
     * dressed as a conflict, which is the same defect as the 500 it replaced
     * but pointing the other way.
     */
    it.each([
      ['a plain Error', new Error('That want-list item has already been acquired')],
      ['a TypeError', new TypeError('x')],
      ['a string', 'ALREADY_ACQUIRED'],
      ['null', null],
      ['undefined', undefined],
      ['a lookalike object', { name: 'ConflictError', code: 'ALREADY_ACQUIRED', message: 'x' }],
    ])('rejects %s', (_label, value) => {
      expect(isConflictError(value)).toBe(false);
    });
  });

  describe('conflict()', () => {
    it('answers 409 with the error code, not a generic body', async () => {
      const response = conflict(new ConflictError('Already acquired', 'ALREADY_ACQUIRED'));

      expect(response.status).toBe(409);
      expect(await response.json()).toStrictEqual({
        error: { message: 'Already acquired', code: 'ALREADY_ACQUIRED' },
      });
    });

    it('does not leak a stack trace into the body', async () => {
      // CLAUDE.md §6 and SPEC.md §5: no stack traces in responses. This error
      // is constructed server-side and its stack points at query-layer
      // internals.
      const response = conflict(new ConflictError('Already acquired', 'ALREADY_ACQUIRED'));

      expect(JSON.stringify(await response.json())).not.toMatch(/at |\.ts:/);
    });
  });
});
