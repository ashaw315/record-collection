import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

/**
 * The SPEC.md §5 error shape, in one place. Every endpoint in steps 5–12 uses
 * these rather than hand-building a body, so the contract cannot drift per
 * route — and so "no stack traces in responses" is structurally true rather
 * than a habit.
 */

export type ApiErrorBody = {
  error: {
    message: string;
    code: string;
    fieldErrors?: Record<string, string>;
    referenceCount?: number;
  };
};

export function badRequest(message: string, code: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { message, code } }, { status: 400 });
}

export function notFound(message: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { message, code: 'NOT_FOUND' } }, { status: 404 });
}

/** SPEC.md §5.4: the delete-behavior response, including the count that lets
 * the UI explain the refusal instead of merely stating it. */
export function conflictInUse(
  message: string,
  referenceCount: number,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { message, code: 'IN_USE', referenceCount } },
    { status: 409 },
  );
}

/**
 * Flattens Zod issues to `fieldErrors`, keyed by dotted path.
 *
 * Issues with an empty path (whole-body failures, e.g. a non-object) have no
 * field to key on and are dropped from the map; the top-level message carries
 * them. First issue per field wins — reporting one actionable error per field
 * is more useful to a form than the last one to be generated.
 *
 * `unrecognized_keys` is the exception that made this more than a one-liner: it
 * describes the object, not a field, so Zod gives it an empty path and it names
 * the offending keys in `issue.keys` instead. Dropping it as a pathless issue
 * rejected the request with an empty fieldErrors map, leaving the client no way
 * to know WHICH key was refused. It is keyed here by the key itself.
 */
export function validationError(error: ZodError): NextResponse<ApiErrorBody> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        const path = [...issue.path, key].join('.');
        if (!(path in fieldErrors)) fieldErrors[path] = 'Unrecognized key';
      }
      continue;
    }

    const field = issue.path.join('.');
    if (field !== '' && !(field in fieldErrors)) {
      fieldErrors[field] = issue.message;
    }
  }

  return NextResponse.json(
    { error: { message: 'Invalid request', code: 'VALIDATION_ERROR', fieldErrors } },
    { status: 400 },
  );
}

export function invalidJson(): NextResponse<ApiErrorBody> {
  return badRequest('Request body must be valid JSON', 'INVALID_JSON');
}

/**
 * SPEC.md §5's server-error case. The body is a fixed string with no detail
 * whatsoever: the caller must learn nothing about the failure. The real cause
 * is logged server-side by withErrorHandling.
 *
 * Deliberately takes no message parameter — an overload accepting one is how a
 * driver error's text ends up in a response, which is exactly the leak this
 * exists to close.
 */
export function internalError(): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
    { status: 500 },
  );
}

export function duplicate(message: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { message, code: 'DUPLICATE' } }, { status: 409 });
}

/**
 * SPEC.md §4.1: a seeded format cannot be deleted even when unreferenced,
 * because nothing re-seeds it and the delete is permanent.
 *
 * A distinct code from IN_USE on purpose — the two refusals have different
 * remedies. IN_USE clears once the referencing records are gone; SEEDED never
 * does, and a UI that told the user to "remove the records using this" would be
 * sending them on an impossible errand.
 */
export function conflictSeeded(message: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { message, code: 'SEEDED' } }, { status: 409 });
}

/**
 * Every dynamic segment must reject a malformed id with 400 rather than passing
 * it to a query — Postgres raises an error on a bad UUID cast, which would
 * surface as a 500 for what is plainly a client mistake (SPEC.md §5.2 states
 * this for records; it applies to every `:id`).
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Extracts a Postgres SQLSTATE from an error, following the `cause` chain.
 *
 * Drizzle wraps every driver error in a DrizzleQueryError whose own `code` is
 * undefined; the real pg error — carrying code, constraint and table — hangs
 * off `.cause`. Reading `.code` from the top level (as this module previously
 * did) therefore never matched a real query failure, making the
 * concurrent-insert fallbacks in POST and PATCH dead code. The sequential
 * pre-checks masked it: those paths return 409 before reaching the write, so
 * nothing failed.
 */
export function pgErrorCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current = error;

  // Bounded by `seen`: a cyclic cause chain must not hang the error path, which
  // is the one place a hang turns a handled failure into an unhandled one.
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);

    if ('code' in current) {
      const { code } = current as { code: unknown };
      if (typeof code === 'string') return code;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return undefined;
}

/** Postgres unique_violation. Raised when two concurrent requests insert the
 * same name — the check-then-insert race a pre-check alone cannot close. */
export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === '23505';
}

/**
 * Postgres foreign_key_violation. Raised when a delete is refused by a NO
 * ACTION foreign key — SPEC.md §7.4's in-use condition, arriving from the
 * database rather than from a pre-check.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return pgErrorCode(error) === '23503';
}
