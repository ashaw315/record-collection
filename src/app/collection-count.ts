/**
 * The heading's record count, filter-aware.
 *
 * With the four-row wall minimum removed (A24d amended), the "most of the
 * collection is hidden" signal moved out of empty shelf and into this line:
 * "34 of 312 records" when a filter is active, the plain "312 records" when it
 * is not. The noun agrees with the COLLECTION total, not the match, because the
 * phrase is about the collection — so "1 of 312 records", never "1 of 312
 * record".
 */
export function collectionCountLabel({
  matched,
  total,
  filtered,
}: {
  matched: number;
  total: number;
  filtered: boolean;
}): string {
  if (!filtered) return matched === 1 ? '1 record' : `${matched} records`;
  return `${matched} of ${total} ${total === 1 ? 'record' : 'records'}`;
}
