import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { badRequest, conflictInUse, notFound, validationError } from './errors';

/**
 * SPEC.md §5: client errors return
 *   { error: { message, code, fieldErrors?: Record<string,string> } }
 * with no stack traces anywhere in the body. Every endpoint in steps 5–12
 * copies this, so the shape is pinned here rather than re-asserted per route.
 */

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('error responses match the §5 shape', () => {
  it('badRequest returns 400 with message and code, and no fieldErrors key', async () => {
    const response = badRequest('Request body must be valid JSON', 'INVALID_JSON');
    expect(response.status).toBe(400);

    const json = await body(response);
    expect(json).toEqual({
      error: { message: 'Request body must be valid JSON', code: 'INVALID_JSON' },
    });
    // Absent, not present-and-empty: §5 marks fieldErrors optional, and an
    // empty object invites clients to render a blank error list.
    expect(Object.keys(json.error as object)).not.toContain('fieldErrors');
  });

  it('notFound returns 404 with the same shape', async () => {
    const response = notFound('Tag not found');
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { message: 'Tag not found', code: 'NOT_FOUND' },
    });
  });

  it('conflictInUse returns 409 with code IN_USE and referenceCount', async () => {
    // SPEC.md §5.4 names all three explicitly. referenceCount is what lets the
    // UI say "used by 3 records" instead of a bare refusal.
    const response = conflictInUse('Tag is in use', 3);
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({
      error: { message: 'Tag is in use', code: 'IN_USE', referenceCount: 3 },
    });
  });

  it('conflictInUse preserves a count of zero rather than omitting it', async () => {
    // A zero count means "nothing references this" — if that ever reaches a 409
    // it is a bug in the caller, and dropping the field would hide it.
    const response = conflictInUse('Tag is in use', 0);
    const json = await body(response);
    expect((json.error as { referenceCount: number }).referenceCount).toBe(0);
  });
});

describe('validationError maps Zod issues to fieldErrors', () => {
  const schema = z.strictObject({
    name: z.string().min(1),
    count: z.number().int(),
  });

  it('returns 400 with code VALIDATION_ERROR', async () => {
    const parsed = schema.safeParse({ name: '', count: 1 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const response = validationError(parsed.error);
    expect(response.status).toBe(400);

    const json = await body(response);
    const error = json.error as { code: string; fieldErrors: Record<string, string> };
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fieldErrors.name).toBeDefined();
  });

  it('keys fieldErrors by dotted path for nested fields', async () => {
    const nested = z.strictObject({ inner: z.strictObject({ value: z.string() }) });
    const parsed = nested.safeParse({ inner: { value: 42 } });
    if (parsed.success) throw new Error('fixture should not parse');

    const response = validationError(parsed.error);
    const json = await body(response);
    const { fieldErrors } = json.error as { fieldErrors: Record<string, string> };
    expect(fieldErrors['inner.value']).toBeDefined();
  });

  it('reports an unknown key as a field error rather than ignoring it', async () => {
    // CLAUDE.md §6 requires unknown keys to be rejected. A strictObject surfaces
    // the offending key in the issue path; silently dropping it is the failure
    // mode this guards.
    const parsed = schema.safeParse({ name: 'ok', count: 1, sneaky: true });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const response = validationError(parsed.error);
    const json = await body(response);
    const { fieldErrors } = json.error as { fieldErrors: Record<string, string> };

    // Keyed by the offending key by name. Zod reports unrecognized_keys with an
    // empty path, so a naive path-only mapping rejects the request with an
    // empty fieldErrors map — correct status, useless body.
    expect(fieldErrors.sneaky).toBeDefined();
  });

  it('names every unrecognized key when several are sent', async () => {
    const parsed = schema.safeParse({ name: 'ok', count: 1, a: 1, b: 2 });
    if (parsed.success) throw new Error('fixture should not parse');

    const response = validationError(parsed.error);
    const json = await body(response);
    const { fieldErrors } = json.error as { fieldErrors: Record<string, string> };
    expect(fieldErrors.a).toBeDefined();
    expect(fieldErrors.b).toBeDefined();
  });

  it('never leaks a stack trace or internal detail into the body', async () => {
    const parsed = schema.safeParse({ name: '', count: 'x' });
    if (parsed.success) throw new Error('fixture should not parse');

    const serialized = JSON.stringify(await body(parsed.error ? validationError(parsed.error) : notFound('x')));
    expect(serialized).not.toMatch(/\bat\s+\w+.*:\d+:\d+/);
    expect(serialized).not.toContain('node_modules');
    expect(serialized).not.toContain('stack');
  });
});
