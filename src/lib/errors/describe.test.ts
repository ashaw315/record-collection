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

/**
 * **The leak these exist to stop.** Deferred at the step 7 security review with
 * R6 as its trigger; R6 reproduced it and this is the fix.
 *
 * `messageOf` used to fall back to `JSON.stringify` for a cause that is not an
 * Error, so a plain object attached as `cause` was serialised WHOLE into the
 * log line. Reproduced verbatim before the fix:
 *
 *   Upload failed ← caused by: {"status":401,"request":{"headers":
 *   {"authorization":"Bearer vercel_blob_rw_SUPERSECRET"}}}
 *
 * Latent while nothing put a credential in a `cause`; not latent the moment
 * logs leave the laptop and are retained by Vercel.
 *
 * Every test below fails against the `JSON.stringify(value)` fallback in
 * messageOf. They plant a real-shaped secret and assert the emitted line does
 * not contain it — the assertion the R3 note specified.
 */
describe('describeError does not leak a secret carried in a cause', () => {
  const BLOB_TOKEN = 'vercel_blob_rw_SUPERSECRETVALUE123';
  const PASSWORD = 'HUNTER2hunter2';
  const API_KEY = 'sk-ant-api03-REALLOOKINGKEYMATERIAL';

  it('does not serialise an object cause carrying an authorization header', () => {
    const error = new Error('Upload failed', {
      cause: { status: 401, request: { headers: { authorization: `Bearer ${BLOB_TOKEN}` } } },
    });

    const described = describeError(error);

    expect(described).not.toContain(BLOB_TOKEN);
    expect(described).not.toContain('authorization');
    // The wrapper's own sentence still survives: redaction must not cost the
    // operator the thing they came to read.
    expect(described).toContain('Upload failed');
  });

  it('does not serialise a connection string nested two links deep', () => {
    const error = new Error('Query failed', {
      cause: new Error('connect ECONNREFUSED', {
        cause: { connectionString: `postgresql://user:${PASSWORD}@ep-royal.neon.tech/neondb` },
      }),
    });

    const described = describeError(error);

    expect(described).not.toContain(PASSWORD);
    expect(described).not.toContain('neon.tech');
    expect(described).toContain('connect ECONNREFUSED');
  });

  it('does not serialise an SDK-shaped error object carrying an api key', () => {
    const error = new Error('LLM call failed', {
      cause: { error: { type: 'authentication_error' }, apiKey: API_KEY },
    });

    expect(describeError(error)).not.toContain(API_KEY);
  });

  /**
   * A pg error is a real Error, so its `message` is kept — but it also carries
   * `internalQuery` and `where`, which embed literal values from the failing
   * statement. Those must not ride along.
   */
  it('keeps a pg error message and SQLSTATE but not its query internals', () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      name: 'error',
      code: '23505',
      internalQuery: `insert into users (email) values ('${PASSWORD}')`,
      where: `PL/pgSQL function line 1 at SQL statement '${PASSWORD}'`,
    });

    const described = describeError(new Error('Could not save', { cause: pgError }));

    expect(described).toContain('duplicate key value violates unique constraint');
    // SQLSTATE is the diagnostic the R3 note asked to keep.
    expect(described).toContain('23505');
    expect(described).not.toContain(PASSWORD);
  });

  it('keeps the status of a DiscogsError-shaped cause', () => {
    const upstream = Object.assign(new Error('Discogs request failed with status 401'), {
      name: 'DiscogsError',
      status: 401,
    });

    const described = describeError(new Error('Lookup failed', { cause: upstream }));

    expect(described).toContain('401');
    expect(described).toContain('Discogs request failed');
  });

  /**
   * The projection must not become a way to smuggle the old behaviour back: an
   * object with no recognised field contributes a TYPE, never its contents.
   */
  it('names an unrecognised object cause by shape rather than by content', () => {
    const error = new Error('wrapper', { cause: { secretField: PASSWORD, another: BLOB_TOKEN } });

    const described = describeError(error);

    expect(described).not.toContain(PASSWORD);
    expect(described).not.toContain(BLOB_TOKEN);
    // Still says SOMETHING was there — silence would send an operator hunting
    // for a cause the code deliberately dropped.
    expect(described).toMatch(/object/i);
  });

  it('does not leak a secret in an array cause', () => {
    const error = new Error('wrapper', { cause: [PASSWORD, BLOB_TOKEN] });

    expect(describeError(error)).not.toContain(PASSWORD);
  });

  /**
   * A string cause is kept — an existing test pins that — and this fixes its
   * boundary rather than widening it: a bare string is something a developer
   * wrote, not a serialised object, so it stays readable.
   */
  it('still reads a bare string cause', () => {
    expect(describeError(new Error('wrapper', { cause: 'a bare string reason' }))).toContain(
      'a bare string reason',
    );
  });
});
