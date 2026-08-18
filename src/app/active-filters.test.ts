import { describe, expect, it } from 'vitest';
import { activeFilterCount } from './active-filters';
import { parseCollectionParams } from './collection-params';

/**
 * What the shelf's closed control announces (§10b A24a).
 *
 * The gaps in the wall are the primary feedback for a filtered collection, but
 * a wall with fewer records and no reason given cannot be told from a
 * collection that is simply small — the absent-versus-unknown distinction. The
 * closed control is what closes that gap, and this is the number it says.
 */

/** Parses from a real query string, so the test exercises the URL the user has. */
function countFor(query: string): number {
  return activeFilterCount(parseCollectionParams(new URLSearchParams(query)));
}

const ARTIST = '11111111-1111-4111-8111-111111111111';
const GENRE = '22222222-2222-4222-8222-222222222222';

describe('activeFilterCount', () => {
  it('is zero for an unfiltered collection', () => {
    /**
     * Fails against `activeFilterCount` if it counts keys that are always
     * present. The whole default view of `/` hits this path, and a control
     * reading "1 filter" on an unfiltered wall is worse than no indicator —
     * it sends someone looking for a narrowing that was never applied.
     */
    expect(countFor('')).toBe(0);
  });

  it('does not count view, sort or page — they are not filters', () => {
    /**
     * Fails against the field list if it counts `CollectionParams` keys rather
     * than `filters` keys. Sorting and paging change the ORDER and the WINDOW;
     * neither hides a record, so neither belongs in a count whose job is to
     * explain absent records.
     */
    expect(countFor('view=grid&sort=releaseYear:desc&page=3')).toBe(0);
  });

  it('counts each applied facet once', () => {
    expect(countFor(`artistId=${ARTIST}`)).toBe(1);
    expect(countFor(`artistId=${ARTIST}&genreId=${GENRE}`)).toBe(2);
    expect(countFor(`artistId=${ARTIST}&genreId=${GENRE}&q=demos`)).toBe(3);
  });

  it('counts a year RANGE as one filter, not two', () => {
    /**
     * Fails against the implementation if it counts `yearFrom` and `yearTo`
     * separately. "1977 to 1979" is one thing a user did and reads as one
     * chip; reporting "2 filters" for it invites a hunt for a second narrowing
     * that does not exist.
     */
    expect(countFor('yearFrom=1977&yearTo=1979')).toBe(1);
    expect(countFor('yearFrom=1977')).toBe(1);
    expect(countFor('yearTo=1979')).toBe(1);
  });

  it('does NOT count includeUndated when it holds its default', () => {
    /**
     * **The specific defect this test exists for.** `parseCollectionParams`
     * sets `includeUndated` to `true` whenever a year filter is present (§5.2),
     * so a naive `Object.keys(filters).length` reports 2 for a single year
     * filter — a key the user never set, counted as something they did.
     *
     * Fails against any count that treats presence as intent.
     */
    expect(countFor('yearFrom=1977'), 'the default is not a filter').toBe(1);
    expect(countFor('yearFrom=1977&includeUndated=true')).toBe(1);
  });

  it('DOES count includeUndated when it is turned off', () => {
    /**
     * The other half, and the reason the field cannot simply be ignored.
     * Excluding undated records genuinely hides rows — §5.2's default is to
     * include them — so a wall missing its undated records must say why.
     *
     * Fails against an implementation that skips the key unconditionally,
     * which is the obvious over-correction from the test above.
     */
    expect(countFor('yearFrom=1977&includeUndated=false')).toBe(2);
  });

  it('ignores a blank search rather than counting an empty box', () => {
    expect(countFor('q=&artistId=' + ARTIST)).toBe(1);
    expect(countFor('q=%20%20')).toBe(0);
  });
});
