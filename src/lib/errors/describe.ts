/**
 * An error and everything that caused it, as one line for a SERVER-SIDE log.
 *
 * Written after a real cover failure logged "The image could not be stored." —
 * our own wrapper's sentence, naming no cause and giving the operator nothing
 * to check. The SDK's error was attached as `cause` and nothing ever read it,
 * so the chain stopped one frame short of the only place it mattered.
 *
 * **Logs only.** SPEC.md §5's error shape is what reaches a client, and a cause
 * chain there would leak deployment detail — the same reason the 503 for an
 * unconfigured Blob store never names the environment variable.
 *
 * **And a redacted projection even there.** "Logs only" was the whole argument
 * for printing freely, and it stopped being sufficient the moment logs left
 * this laptop: on Vercel they are retained and readable by anyone with
 * dashboard access. So each link contributes its message plus an allow-list of
 * fields that cannot carry a credential (see SAFE_FIELDS) — never a
 * serialisation of whatever the object happened to hold.
 */

/** Enough to diagnose, short enough that a log line stays readable. */
const MAX_LINKS = 5;
const MAX_LENGTH = 600;

/**
 * The only fields an error may contribute beyond its message.
 *
 * A REDACTED PROJECTION rather than a serialisation, which is the whole point:
 * the previous version fell through to `JSON.stringify(value)` for anything
 * that was not an Error or a string, so a plain object attached as `cause` went
 * into the log entire. R6 reproduced it — a Blob bearer token and a connection
 * string password both reached a log line — and the step 7 security review
 * predicted it before that.
 *
 * An allow-list, never a deny-list. A deny-list of key names (`password`,
 * `authorization`, …) has to be right about every SDK's field naming forever,
 * and is wrong the first time one of them picks a name nobody listed. This is
 * wrong only in the safe direction: an unrecognised field is dropped.
 *
 * `status` and `code` are here because they are what an operator actually acts
 * on — an upstream 401 versus a 503, a SQLSTATE `23505` versus `42P01` — and
 * neither can carry a credential. A pg error's `internalQuery` and `where` are
 * deliberately ABSENT: they embed literal values from the failing statement.
 */
const SAFE_FIELDS = ['status', 'code'] as const;

function detailsOf(value: object): string {
  const parts: string[] = [];

  for (const field of SAFE_FIELDS) {
    const found: unknown = (value as Record<string, unknown>)[field];
    // Numbers and short strings only: a SQLSTATE is 5 characters and an HTTP
    // status is 3, so anything longer is not one of these and is not worth the
    // risk of finding out what it is.
    if (typeof found === 'number') parts.push(`${field}=${found}`);
    else if (typeof found === 'string' && found !== '' && found.length <= 16) {
      parts.push(`${field}=${found}`);
    }
  }

  return parts.length === 0 ? '' : ` (${parts.join(' ')})`;
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return `${value.message}${detailsOf(value)}`;
  // A string cause is something a developer wrote, not a payload something
  // else serialised, so it stays readable.
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  /**
   * Everything else contributes its SHAPE and nothing of its contents.
   *
   * Not silence: an operator who sees nothing goes hunting for a cause the
   * code deliberately dropped, which is the same failure as the wrapper
   * sentence that named no cause. Naming the type says a link was here and
   * that it held nothing this function is willing to print.
   */
  if (typeof value === 'object') {
    const shape = Array.isArray(value) ? 'array' : (value.constructor?.name ?? 'object');
    return `[${shape} cause omitted]${detailsOf(value)}`;
  }

  return `[${typeof value} cause omitted]`;
}

function causeOf(value: unknown): unknown {
  return value instanceof Error ? (value as Error & { cause?: unknown }).cause : undefined;
}

export function describeError(error: unknown): string {
  const parts: string[] = [];
  // A self-referencing cause is legal to construct, and following it would hang
  // the logger — taking down a request that was already failing.
  const seen = new Set<unknown>();

  let current: unknown = error;
  while (current !== undefined && current !== null && parts.length < MAX_LINKS) {
    if (seen.has(current)) break;
    seen.add(current);

    const message = messageOf(current);
    // Some SDKs wrap an error in another carrying the same text; printing it
    // twice suggests two failures where there is one.
    if (message !== '' && message !== parts[parts.length - 1]) {
      parts.push(message);
    }

    current = causeOf(current);
  }

  const described = parts.length === 0 ? messageOf(error) : parts.join(' ← caused by: ');
  return described.length <= MAX_LENGTH ? described : `${described.slice(0, MAX_LENGTH)}…`;
}
