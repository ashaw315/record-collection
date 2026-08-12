import { internalError } from './errors';
import { describeError } from '@/lib/errors/describe';
import { logger } from '@/lib/logger';

/**
 * Wraps a route handler so no throw escapes unshaped (SPEC.md §5: "Server
 * error: 500, same shape, no stack traces in the response body").
 *
 * Without this, an unanticipated driver error propagated to Next's default
 * error path and the response embedded the full SQL statement — observed with
 * `?page=99999999999999999999`, whose out-of-range offset produced
 * `Failed query: select "id", "name" ... limit $1 offset $2`. Handling each
 * anticipated error at its call site is not sufficient, because the errors that
 * leak are by definition the ones nobody anticipated.
 *
 * The real error is logged server-side; the client gets a fixed body with no
 * detail. Every route in SPEC.md §5 should be wrapped, not just the ones with a
 * known failure mode.
 */
/**
 * Next passes a context object to every route handler — `{ params }` with an
 * empty params object for a collection route, the dynamic segment for a `[id]`
 * route. The context parameter is optional here so a handler that ignores it
 * can be declared and called with the request alone (as the unit tests do),
 * while a `[id]` handler still receives a fully typed context.
 */
export function withErrorHandling<TContext = { params: Promise<Record<string, string>> }>(
  scope: string,
  handler: (request: Request, context: TContext) => Promise<Response>,
): (request: Request, context?: TContext) => Promise<Response> {
  return async (request: Request, context?: TContext): Promise<Response> => {
    try {
      return await handler(request, context as TContext);
    } catch (error) {
      // `throw 'string'` and `throw undefined` are legal, so this must not
      // assume an Error — reading `.message` off a non-object would throw again
      // inside the very code meant to stop errors escaping.
      const detail =
        error instanceof Error
          ? // `describeError` rather than `.message`: a wrapped error's cause
            // says WHY and the stack says WHERE, and a 500 log with only the
            // wrapper's own sentence is the least actionable thing there is.
            // Found when a cover failure logged "The image could not be
            // stored." and nothing else.
            `${describeError(error)}\n${error.stack ?? '(no stack)'}`
          : `Non-Error thrown: ${safeStringify(error)}`;

      logger.error(scope, detail);
      return internalError();
    }
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // A circular or otherwise unserialisable throw must not become a second
    // failure on the error path.
    return '[unserialisable]';
  }
}
