/**
 * Turns an API error body into something a person can act on.
 *
 * "IN_USE" is not a message. "3 records use this label" is. Every 409 the API
 * returns carries the information needed to say what is actually blocking, and
 * this is where that gets said.
 *
 * Shared by every /manage resource so the phrasing cannot drift per screen.
 */

export type ApiError = {
  message?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
  referenceCount?: number;
  /** §5.4: the row a DUPLICATE collided with, so a client can select it. */
  existingId?: string;
};

export function parseApiError(body: unknown): ApiError | undefined {
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined;
  const { error } = body as { error?: unknown };
  if (typeof error !== 'object' || error === null) return undefined;
  return error as ApiError;
}

function plural(count: number, singular: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${singular}s`;
}

/**
 * How a resource's references should be described.
 *
 * `referrerNoun` is used only where the API's count comes from ONE referrer, so
 * naming it is honest. Where a resource has several — genres counts records,
 * want-list entries, artists and child genres in a single total — there is no
 * truthful singular noun, and `places` is used instead. Do not "improve" this
 * into specificity the count cannot support.
 */
const REFERRER_NOUN: Record<string, string | undefined> = {
  tags: 'record',
  formats: 'record',
  stores: 'record',
  // labels: records + want-list entries. artists: records + want-list entries.
  // genres: records + want-list entries + artists + child genres.
  // pressings: records + want-list targets + price history.
  labels: undefined,
  artists: undefined,
  genres: undefined,
  pressings: undefined,
};

export function inUseMessage(resource: string, count: number): string {
  const noun = REFERRER_NOUN[resource];

  if (noun !== undefined) {
    return `Can't delete — ${plural(count, noun)} ${count === 1 ? 'uses' : 'use'} this.`;
  }

  // Honest fallback: the count is a sum across referrers, so it cannot name one.
  return count === 1
    ? "Can't delete — it's used in 1 place."
    : `Can't delete — it's used in ${count} places.`;
}

/**
 * The message for a rejected genre reparent.
 *
 * Names BOTH genres and the direction of the relationship that blocks it —
 * "UK82 is already inside Punk" is what makes this actionable rather than
 * merely correct. A bare "would create a cycle" leaves the user to work out
 * which of the two is the ancestor.
 */
export function cycleMessage(moving: string, target: string): string {
  return `${moving} can't move under ${target} — ${target} is already inside ${moving}.`;
}

export function seededMessage(name: string): string {
  return `${name} is a built-in format and can't be deleted.`;
}

/** Fallback for anything without a specific translation. */
export function fallbackMessage(error: ApiError | undefined): string {
  if (error?.message !== undefined && error.message !== '') return error.message;
  return 'Something went wrong. Try again.';
}
