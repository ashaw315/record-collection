import { describe, expect, it } from 'vitest';
import {
  parseCollectionParams,
  toQueryString,
  VIEW_MODES,
  withFacet,
} from './collection-params';

/**
 * URL state for the collection screen (SPEC.md §10).
 *
 * The filters live in the URL rather than React state, so a filtered view is
 * linkable and survives a refresh — and so the SERVER component re-runs with
 * new params instead of the client refetching.
 *
 * This parser is deliberately NOT the API's. `/api/records` must reject a
 * malformed filter with a 400 (§5), because a caller sending nonsense needs to
 * know. A PAGE cannot 400: a stale bookmark or a hand-edited URL has to render
 * something. So this one falls back to the default and drops what it cannot
 * read, and the difference is intentional rather than an oversight.
 */

const UUID = '11111111-2222-4333-8444-555555555555';
const OTHER_UUID = '99999999-8888-4777-8666-555555555555';

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('parseCollectionParams', () => {
  it('defaults to a table view with no filters', () => {
    const result = parseCollectionParams(params(''));

    expect(result.view).toBe('table');
    expect(result.filters).toEqual({});
    expect(result.sort).toBeUndefined();
  });

  it('reads the search term', () => {
    expect(parseCollectionParams(params('q=discharge')).filters.q).toBe('discharge');
  });

  it('drops a blank search term rather than filtering on empty', () => {
    // `q=` reaching the query layer would be an ILIKE on '%%' — every row, at
    // the cost of a scan. Absent and blank mean the same thing to a person.
    expect(parseCollectionParams(params('q=')).filters.q).toBeUndefined();
    expect(parseCollectionParams(params('q=%20%20')).filters.q).toBeUndefined();
  });

  it('reads each id filter', () => {
    const result = parseCollectionParams(
      params(`genreId=${UUID}&labelId=${OTHER_UUID}&storeId=${UUID}&tagId=${OTHER_UUID}`),
    );

    expect(result.filters).toMatchObject({
      genreId: UUID,
      labelId: OTHER_UUID,
      storeId: UUID,
      tagId: OTHER_UUID,
    });
  });

  it('drops an id that is not a UUID instead of passing it to the query layer', () => {
    // A hand-edited URL must not reach SQL as a cast error. The API would 400;
    // the page renders unfiltered.
    expect(parseCollectionParams(params('genreId=not-a-uuid')).filters.genreId).toBeUndefined();
  });

  it('reads a year range', () => {
    const result = parseCollectionParams(params('yearFrom=1980&yearTo=1990'));

    expect(result.filters.yearFrom).toBe(1980);
    expect(result.filters.yearTo).toBe(1990);
  });

  it('drops a blank or non-numeric year rather than coercing it to zero', () => {
    /**
     * The Zod coercion trap from NOTES, in a second parser: Number('') is 0,
     * which would apply `release_year >= 0` and silently drop every undated
     * record. Asserted here because this parser does NOT go through the API
     * schema that was fixed in unit 3.
     */
    expect(parseCollectionParams(params('yearFrom=')).filters.yearFrom).toBeUndefined();
    expect(parseCollectionParams(params('yearTo=')).filters.yearTo).toBeUndefined();
    expect(parseCollectionParams(params('yearFrom=abc')).filters.yearFrom).toBeUndefined();
    expect(parseCollectionParams(params('yearFrom=1980.5')).filters.yearFrom).toBeUndefined();
  });

  it('drops a year outside the storable range', () => {
    // Same bound the API applies. An out-of-int4 year reaching Postgres is a
    // 500 on the page, which is a blank screen rather than a 400 body.
    expect(parseCollectionParams(params('yearFrom=99999999999')).filters.yearFrom).toBeUndefined();
  });

  it('includes undated records by default', () => {
    // §5.2's default, restated here so the page and the API agree without the
    // page having to send the parameter.
    expect(parseCollectionParams(params('yearFrom=1980')).filters.includeUndated).toBe(true);
  });

  it('excludes them only on an explicit false', () => {
    expect(
      parseCollectionParams(params('yearFrom=1980&includeUndated=false')).filters.includeUndated,
    ).toBe(false);
    // Anything else means the default. 'FALSE' and '0' are not the contract —
    // this is our own URL, and being lenient here means two spellings that
    // behave differently.
    expect(
      parseCollectionParams(params('yearFrom=1980&includeUndated=0')).filters.includeUndated,
    ).toBe(true);
  });

  it('reads an allowlisted sort field and direction', () => {
    const result = parseCollectionParams(params('sort=artist:desc'));

    expect(result.sort).toEqual({ field: 'artist', direction: 'desc' });
  });

  it('drops a sort field that is not allowlisted', () => {
    // `notes` is a real column. The allowlist is what keeps untrusted input out
    // of the query builder, and it must survive being reached from a URL.
    expect(parseCollectionParams(params('sort=notes:asc')).sort).toBeUndefined();
  });

  it('drops a malformed sort rather than guessing a direction', () => {
    expect(parseCollectionParams(params('sort=title')).sort).toBeUndefined();
    expect(parseCollectionParams(params('sort=title:sideways')).sort).toBeUndefined();
  });

  it('reads the view mode', () => {
    expect(parseCollectionParams(params('view=grid')).view).toBe('grid');
    expect(VIEW_MODES).toContain('grid');
  });

  it('falls back to table for an unknown view mode', () => {
    expect(parseCollectionParams(params('view=carousel')).view).toBe('table');
  });

  it('reads the page number', () => {
    expect(parseCollectionParams(params('page=3')).page).toBe(3);
  });

  it('falls back to page 1 for a page that is not a positive integer', () => {
    for (const value of ['0', '-2', 'abc', '1.5', '', '99999999999999999999']) {
      expect(parseCollectionParams(params(`page=${value}`)).page, value).toBe(1);
    }
  });
});

/**
 * The inverse. Every control builds its href by taking the current params and
 * changing one thing, so this must round-trip — a serialiser that drops a
 * filter makes clicking "sort by year" silently clear the search.
 */
describe('toQueryString', () => {
  it('round-trips a fully populated state', () => {
    const source = params(
      `q=discharge&genreId=${UUID}&labelId=${OTHER_UUID}&yearFrom=1980&yearTo=1990&sort=artist:desc&view=grid&page=2`,
    );
    const parsed = parseCollectionParams(source);

    const reparsed = parseCollectionParams(params(toQueryString(parsed)));

    expect(reparsed).toEqual(parsed);
  });

  it('omits defaults so a plain view has a clean URL', () => {
    // `?view=table&page=1&includeUndated=true` is noise on the common case.
    const parsed = parseCollectionParams(params(''));

    expect(toQueryString(parsed)).toBe('');
  });

  it('keeps includeUndated=false because it is not the default', () => {
    const parsed = parseCollectionParams(params('yearFrom=1980&includeUndated=false'));

    expect(toQueryString(parsed)).toContain('includeUndated=false');
  });

  it('serialises an explicit page', () => {
    const parsed = parseCollectionParams(params('page=4&q=discharge'));

    expect(toQueryString(parsed)).toContain('page=4');
  });

  /**
   * Changing a facet must return to page 1. Staying on page 4 while narrowing
   * the results is how a filter appears to return nothing — the rows exist,
   * just not that far in.
   *
   * The reset belongs to the CALLER building the href, not to the serialiser,
   * which cannot see what changed. `withFacet` is that caller's helper, so the
   * rule is in one place rather than repeated at every control.
   */
  it('resets the page when a facet changes', () => {
    const parsed = parseCollectionParams(params('page=4&q=discharge'));

    const next = toQueryString(withFacet(parsed, { filters: { q: 'amebix' } }));

    expect(next).not.toContain('page=');
    expect(next).toContain('q=amebix');
  });

  it('keeps other filters when one facet changes', () => {
    // The defect this guards: clicking a sort chip silently clearing the
    // search, because the href was built from scratch instead of from the
    // current state.
    const parsed = parseCollectionParams(params(`q=discharge&genreId=${UUID}`));

    const next = toQueryString(withFacet(parsed, { sort: { field: 'artist', direction: 'asc' } }));

    expect(next).toContain('q=discharge');
    expect(next).toContain(`genreId=${UUID}`);
    expect(next).toContain('sort=artist%3Aasc');
  });

  it('clears a filter when the facet is set to undefined', () => {
    // Removing a chip. `undefined` must mean REMOVE, not "leave alone" — the
    // absent-vs-empty distinction from NOTES, in a third place.
    const parsed = parseCollectionParams(params(`q=discharge&genreId=${UUID}`));

    const next = toQueryString(withFacet(parsed, { filters: { genreId: undefined } }));

    expect(next).toContain('q=discharge');
    expect(next).not.toContain('genreId');
  });

  /**
   * toSTRICTEqual, not toEqual.
   *
   * Verified rather than assumed: `toEqual` treats `{ q: 'x' }` and
   * `{ q: 'x', genreId: undefined }` as EQUAL, so it cannot tell a deleted key
   * from one assigned undefined — and `toQueryString` skips undefined either
   * way, so the URL is identical too. Without the strict matcher this
   * behaviour is unconstrained, which a mutation confirmed: replacing the
   * delete with an assignment failed nothing.
   */
  it('removes the key rather than leaving it present and undefined', () => {
    const parsed = parseCollectionParams(params(`q=discharge&genreId=${UUID}`));

    const next = withFacet(parsed, { filters: { genreId: undefined } });

    expect(next.filters).toStrictEqual({ q: 'discharge' });
    expect(Object.keys(next.filters)).not.toContain('genreId');
  });
});
