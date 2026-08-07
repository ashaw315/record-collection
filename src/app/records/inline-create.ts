import { parseApiError } from '@/lib/api/messages';

/**
 * Inline create for artist/label/store/tag (SPEC.md §10), and what happens when
 * the name is already taken.
 *
 * A bare "already exists" is a dead end: the user typed a name, was told it is
 * taken, and has no way forward except guessing which existing entry they
 * collided with — and after `cleanName` normalization they may not even find it
 * by eye. §5.4's required `existingId` is what turns that refusal into
 * "already exists — selected it".
 */

export type CreateOutcome =
  | { id: string; existed: boolean }
  | { error: string };

/**
 * Interprets a create response.
 *
 * A 409 DUPLICATE is treated as SUCCESS, because it is: the thing the user
 * asked to exist does exist, and `existingId` names it. The only difference
 * from a 201 is that nothing was written, which the caller surfaces as a
 * message rather than an error.
 */
export function resolveCreated(response: { status: number; body: unknown }): CreateOutcome {
  if (response.status === 201) {
    const created = response.body as { id?: unknown };
    if (typeof created.id === 'string') return { id: created.id, existed: false };
    return { error: FALLBACK };
  }

  const error = parseApiError(response.body);

  if (error?.code === 'DUPLICATE') {
    /**
     * §5.4 makes `existingId` required, but a response is untrusted input and
     * this is the boundary. A DUPLICATE without one cannot be resolved to a
     * selection, and quietly selecting nothing while reporting success is the
     * kind of half-failure that surfaces later as "the label I added vanished".
     */
    if (typeof error.existingId === 'string' && error.existingId !== '') {
      return { id: error.existingId, existed: true };
    }
    return { error: error.message ?? FALLBACK };
  }

  // Any other failure, including the OTHER 409 in this API — IN_USE (§5.4) —
  // which must not be mistaken for a duplicate on the strength of the status.
  const fieldError = error?.fieldErrors === undefined ? undefined : Object.values(error.fieldErrors)[0];
  return { error: fieldError ?? error?.message ?? FALLBACK };
}

const FALLBACK = 'Something went wrong. Nothing was saved.';

/** `artist` needs "An"; the rest take "A". */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? 'An' : 'A';
}

/**
 * The sentence the user reads on a collision.
 *
 * It has to say both what happened and that they are not stuck — "already
 * exists" alone reads as a refusal, when in fact the form has just done what
 * they wanted.
 *
 * The name is quoted as the USER TYPED IT, not as the server stored it. They
 * collided after normalization, so the stored spelling may differ from theirs
 * in ways they cannot see — echoing it back would read as the app inventing a
 * name.
 */
export function duplicateMessage(noun: string, name: string): string {
  return `${article(noun)} ${noun} called “${name}” already exists — selected it.`;
}
