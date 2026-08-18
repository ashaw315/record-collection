import type { CollectionParams } from './collection-params';

/**
 * How many filters a user has applied — the number the shelf's closed control
 * announces (§10b A24a).
 *
 * **Counts what a user DID, not what the params object contains.** The two
 * differ in three places, and each is a way for the indicator to lie:
 *
 *   - `view`, `sort` and `page` are not filters. They reorder and window the
 *     collection; neither hides a record, and this count exists to explain
 *     records that are absent.
 *   - A year RANGE is one filter. `yearFrom` and `yearTo` are one chip and one
 *     decision, so reporting 2 sends someone hunting for a narrowing that was
 *     never applied.
 *   - `includeUndated` is set to `true` by `parseCollectionParams` whenever a
 *     year filter is present (§5.2's default), so its PRESENCE is not intent.
 *     Only `false` is — and that one genuinely hides rows, so it counts.
 *
 * A plain `Object.keys(filters).length` gets all three wrong.
 */
export function activeFilterCount(params: CollectionParams): number {
  const { filters } = params;
  let count = 0;

  for (const key of [
    'artistId',
    'genreId',
    'labelId',
    'storeId',
    'tagId',
    'formatId',
    'condition',
    'q',
  ] as const) {
    if (filters[key] !== undefined) count += 1;
  }

  // One decision, one chip, one count — however many bounds it has.
  if (filters.yearFrom !== undefined || filters.yearTo !== undefined) count += 1;

  // Presence is the default; only turning it OFF is a narrowing.
  if (filters.includeUndated === false) count += 1;

  return count;
}
