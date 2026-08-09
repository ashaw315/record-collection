import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validationError } from './errors';

/**
 * `validationError` DROPPED the message from any object-level `.refine`.
 *
 * A refine on the whole object produces an issue whose `path` is EMPTY, and the
 * helper kept only issues that named a field — so the explanation was replaced
 * by the generic "Invalid request" and `fieldErrors` came back `{}`. The
 * response was a well-formed 400 that told the caller nothing.
 *
 * Eight PATCH endpoints carry the same `At least one field must be supplied`
 * refine. Every one of them answered "Invalid request" to an empty body, and
 * every one of their tests passed, because they assert the STATUS and not the
 * message. That is what hid it: a status-only assertion cannot tell a
 * considered rejection from a silent one.
 *
 * Found in step 7 unit 4, where the search endpoint needed to say WHICH search
 * term to supply.
 */

const emptyBodySchema = z
  .strictObject({ name: z.string().optional(), priority: z.number().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

describe('object-level refine messages', () => {
  it('surfaces the refine message rather than the generic one', async () => {
    const parsed = emptyBodySchema.safeParse({});
    expect(parsed.success).toBe(false);

    const body = await validationError(parsed.error!).json();

    expect(body.error.message).toBe('At least one field must be supplied');
  });

  it('still answers 400', async () => {
    const parsed = emptyBodySchema.safeParse({});

    expect(validationError(parsed.error!).status).toBe(400);
  });

  it('keeps the VALIDATION_ERROR code, so clients keying on it still work', async () => {
    // The code is the contract; the message is for a human. Changing the code
    // would break any client branching on it, and §5's error shape is fixed.
    const parsed = emptyBodySchema.safeParse({});

    const body = await validationError(parsed.error!).json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('reports the first object-level message when there are several', async () => {
    const schema = z
      .strictObject({ a: z.string().optional() })
      .refine(() => false, { message: 'First problem' })
      .refine(() => false, { message: 'Second problem' });

    const body = await validationError(schema.safeParse({}).error!).json();

    // One message, not a concatenation — the client renders it as a sentence.
    expect(body.error.message).toBe('First problem');
  });
});

describe('field-level errors are unchanged', () => {
  /**
   * The regression risk in this fix: every other endpoint's error shape must
   * stay exactly as it was. These assertions are the reason the change is safe
   * to make in one place.
   */
  it('still reports the generic message when the issues name fields', async () => {
    const schema = z.strictObject({ name: z.string().min(1) });

    const body = await validationError(schema.safeParse({ name: '' }).error!).json();

    expect(body.error.message).toBe('Invalid request');
    expect(body.error.fieldErrors.name).toBeTruthy();
  });

  it('still reports unknown keys against their names', async () => {
    const schema = z.strictObject({ name: z.string().optional() });

    const body = await validationError(schema.safeParse({ colour: 'red' }).error!).json();

    expect(body.error.fieldErrors.colour).toBe('Unrecognized key');
    expect(body.error.message).toBe('Invalid request');
  });

  it('prefers the FIELD errors when both kinds are present', async () => {
    /**
     * A body can fail a field check and an object-level refine at once. The
     * field errors are the more actionable — they point at what to fix — so
     * the generic message stands and `fieldErrors` carries the detail, exactly
     * as before this change.
     */
    /**
     * The fixture has to make BOTH issues fire at once, which the first
     * version of this test did not: with `name: ''` present, the
     * "at least one key" refine PASSES, so only the field issue existed and
     * the assertion held under either precedence rule. Mutation caught it —
     * reversing the precedence failed nothing.
     *
     * A refine that always fails is what produces the genuine two-issue case.
     */
    const schema = z
      .strictObject({ name: z.string().min(1).optional() })
      .refine(() => false, { message: 'The whole body is wrong' });

    const parsed = schema.safeParse({ name: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join('.'));
      expect(paths, 'the fixture produces a field issue AND an object issue').toEqual(
        expect.arrayContaining(['name', '']),
      );
    }

    const body = await validationError(parsed.error!).json();

    expect(body.error.message).toBe('Invalid request');
    expect(body.error.fieldErrors.name).toBeTruthy();
  });
});
