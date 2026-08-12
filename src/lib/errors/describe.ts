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
 */

/** Enough to diagnose, short enough that a log line stays readable. */
const MAX_LINKS = 5;
const MAX_LENGTH = 600;

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
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
