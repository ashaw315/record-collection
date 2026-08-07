import { describe, expect, it } from 'vitest';
import { duplicateMessage, resolveCreated } from './inline-create';

/**
 * Inline create for artist/label/store/tag (SPEC.md §10), and specifically what
 * happens when the name already exists.
 *
 * A bare "already exists" error is a dead end: the user typed a name, was told
 * it is taken, and is left with no way forward except guessing which existing
 * entry it collided with. §5.4's `existingId` is what turns that into "already
 * exists — selected it for you".
 */

const EXISTING = '11111111-2222-4333-8444-555555555555';
const CREATED = '99999999-8888-4777-8666-555555555555';

describe('resolveCreated', () => {
  it('returns the id of a newly created row', () => {
    expect(resolveCreated({ status: 201, body: { id: CREATED, name: 'Clay Records' } })).toEqual({
      id: CREATED,
      existed: false,
    });
  });

  /**
   * THE CASE THIS EXISTS FOR. A 409 is not a failure here — it means the thing
   * the user asked for is already there, which is the outcome they wanted.
   */
  it('treats a duplicate as a success, naming the existing row', () => {
    expect(
      resolveCreated({
        status: 409,
        body: { error: { code: 'DUPLICATE', message: 'exists', existingId: EXISTING } },
      }),
    ).toEqual({ id: EXISTING, existed: true });
  });

  /**
   * §5.4 makes `existingId` required, but this is a boundary: the response is
   * untrusted input. A DUPLICATE without one cannot be resolved, and silently
   * selecting nothing would be worse than saying so.
   */
  it('reports a duplicate that carries no id as an error rather than selecting nothing', () => {
    expect(
      resolveCreated({ status: 409, body: { error: { code: 'DUPLICATE', message: 'exists' } } }),
    ).toEqual({ error: 'exists' });
  });

  it('passes a validation message through', () => {
    expect(
      resolveCreated({
        status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', fieldErrors: { name: 'Name is required' } } },
      }),
    ).toEqual({ error: 'Name is required' });
  });

  it('falls back to a message when there are no field errors', () => {
    expect(
      resolveCreated({ status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } } }),
    ).toEqual({ error: 'Invalid request' });
  });

  it('reports an unreadable body rather than throwing', () => {
    // A 500 has no error shape to parse. The form must still say something.
    expect(resolveCreated({ status: 500, body: null })).toEqual({
      error: 'Something went wrong. Nothing was saved.',
    });
  });

  /**
   * IN_USE is the other 409 in this API (§5.4). Matching on the STATUS rather
   * than the code would select a row on the strength of a number.
   *
   * The body deliberately carries an `existingId`: without one, both
   * implementations reach the same error branch and the distinction is
   * untestable — which is how the first version of this test passed a mutation
   * that matched on `status === 409`.
   */
  it('does not treat a 409 that is not a DUPLICATE as a success', () => {
    expect(
      resolveCreated({
        status: 409,
        body: {
          error: { code: 'IN_USE', message: 'in use', referenceCount: 3, existingId: EXISTING },
        },
      }),
    ).toEqual({ error: 'in use' });
  });

  /**
   * An empty string is not an id. §5.4 makes `existingId` required so the API
   * cannot send one, but this is a boundary parsing an untrusted response, and
   * selecting '' would set the field to a value no row has — silently, and
   * reported as success.
   */
  it('rejects an empty existingId rather than selecting nothing', () => {
    expect(
      resolveCreated({
        status: 409,
        body: { error: { code: 'DUPLICATE', message: 'exists', existingId: '' } },
      }),
    ).toEqual({ error: 'exists' });
  });
});

describe('duplicateMessage', () => {
  /**
   * The sentence a user reads. It has to say what happened AND that they are
   * not stuck — "already exists" alone reads as a refusal.
   */
  it('names the resource and says the existing one was selected', () => {
    expect(duplicateMessage('label', 'Clay Records')).toBe(
      'A label called “Clay Records” already exists — selected it.',
    );
  });

  it('uses the right article for a resource beginning with a vowel', () => {
    // "A artist" is the kind of wrongness that makes a careful app look sloppy.
    expect(duplicateMessage('artist', 'Amebix')).toBe(
      'An artist called “Amebix” already exists — selected it.',
    );
  });

  it('quotes the name the user typed, not a normalized version', () => {
    /**
     * The user typed a name with a double space; the server matched it after
     * `cleanName`. Echoing the SERVER's spelling would be confusing — they
     * would not recognise what they wrote. The message quotes their input and
     * the selection resolves to the stored row.
     */
    expect(duplicateMessage('label', 'Clay  Records')).toContain('Clay  Records');
  });
});
