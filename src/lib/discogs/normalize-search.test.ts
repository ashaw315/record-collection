import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeSearchResult, normalizeSearchResponse } from './normalize-search';

/**
 * SPEC.md §5.7's normalized search result shape, built from REAL captured
 * payloads (test/fixtures/discogs/, see its README).
 *
 * The fixtures are captured rather than written because a hand-written one
 * encodes what we expect the API to return. Two things in this file would have
 * been wrong had I invented them: search results use SINGULAR `genre`/`style`
 * where release detail uses plural, and `title` arrives as a combined
 * "Artist - Title" string rather than as separate fields.
 */

const fixture = (name: string): { results: unknown[]; pagination: unknown } =>
  JSON.parse(readFileSync(`test/fixtures/discogs/${name}.json`, 'utf8'));

const byCatno = fixture('search-by-catno');
const byArtist = fixture('search-by-artist-only');

/** The UK 1982 Clay first pressing — the "best dig" for this record. */
const firstPressing = (byCatno.results as Array<{ id: number }>).find(
  (result) => result.id === 381756,
);

/** A 1989 reissue of the same album, for the contrast that matters. */
const reissue = (byCatno.results as Array<{ id: number }>).find((result) => result.id === 6779382);

describe('genres and styles (CLAUDE.md §8)', () => {
  /**
   * THE test this unit exists for.
   *
   * Discogs catalogues this record as `genre: ["Rock"]` with
   * `style: ["Hardcore", "Punk"]`. CLAUDE.md §8: "Genres are a hierarchy, not a
   * flat list, and the distinctions are real… Do not flatten them to 'punk'
   * anywhere." Reading `genre` and dropping `style` renders a UK82 hardcore
   * record as **Rock** — the app then confidently misdescribes the collection
   * it is built around.
   *
   * §6 is explicit about the direction: "`genres` + `styles`→`genres`
   * (find-or-create; **prefer `styles` since it's more specific**)."
   */
  it('keeps the specific styles, which are the whole point', () => {
    const normalized = normalizeSearchResult(firstPressing);

    // The SPECIFIC values, named. Asserting merely that the array is non-empty,
    // or that it contains "Rock", would pass an implementation that kept
    // `genre` and dropped `style` — which is exactly the failure mode.
    expect(normalized.styles).toContain('Hardcore');
    expect(normalized.styles).toContain('Punk');
  });

  it('does not lose the broad genre either', () => {
    // Both are kept and kept SEPARATE. §6 maps both into our genres, and §7.1's
    // hierarchy is where the relationship between them belongs — not in a
    // normalizer that silently picks one.
    expect(normalizeSearchResult(firstPressing).genres).toEqual(['Rock']);
  });

  it('never merges the two into one flat list', () => {
    /**
     * A single `genres: ["Rock", "Hardcore", "Punk"]` array would lose which
     * term is the broad one and which is the scene, and §7.1's hierarchy
     * cannot be rebuilt from a flattened list. The distinction has to survive
     * transport for the importer to place them correctly.
     */
    const normalized = normalizeSearchResult(firstPressing);

    expect(normalized.genres).not.toContain('Hardcore');
    expect(normalized.styles).not.toContain('Rock');
  });

  it('is empty rather than absent when Discogs has no styles', () => {
    // Callers iterate these; `undefined` would need a guard at every use site
    // and the one that gets forgotten is a crash.
    const normalized = normalizeSearchResult({ id: 1, title: 'A - B', type: 'release' });

    expect(normalized.genres).toEqual([]);
    expect(normalized.styles).toEqual([]);
  });
});

describe('the §5.7 result shape', () => {
  it('splits the combined "Artist - Title" into separate fields', () => {
    /**
     * Discogs sends `title: "Discharge - Hear Nothing See Nothing Say Nothing"`.
     * §5.7 requires `artist` and `title` separately — a result card showing the
     * artist twice is the giveaway that this was skipped.
     */
    const normalized = normalizeSearchResult(firstPressing);

    expect(normalized.artist).toBe('Discharge');
    expect(normalized.title).toBe('Hear Nothing See Nothing Say Nothing');
  });

  it('keeps a hyphen that belongs to the title', () => {
    // Splitting on every "-" would mangle "Discharge - Why - Reissue". Only the
    // FIRST separator divides artist from title.
    const normalized = normalizeSearchResult({
      id: 1,
      type: 'release',
      title: 'Discharge - Why - The Singles',
    });

    expect(normalized.artist).toBe('Discharge');
    expect(normalized.title).toBe('Why - The Singles');
  });

  it('survives a title with no separator at all', () => {
    const normalized = normalizeSearchResult({ id: 1, type: 'release', title: 'Untitled' });

    expect(normalized.title).toBe('Untitled');
    expect(normalized.artist).toBeNull();
  });

  it('carries the identifying fields a collector matches against in a shop', () => {
    const normalized = normalizeSearchResult(firstPressing);

    expect(normalized.discogsId).toBe(381756);
    expect(normalized.masterId).toBe(50683);
    expect(normalized.year).toBe(1982);
    expect(normalized.country).toBe('UK');
    expect(normalized.label).toBe('Clay Records');
    expect(normalized.catalogNumber).toBe('CLAY LP 3');
  });

  it('reports the year as a number, since Discogs sends a string', () => {
    // `year: "1982"` in the payload. A string here would sort lexically in any
    // UI that ordered by it, putting "1979" after "198".
    expect(typeof normalizeSearchResult(firstPressing).year).toBe('number');
  });

  it('carries both image sizes, because a list row and a detail view differ', () => {
    const normalized = normalizeSearchResult(firstPressing);

    expect(normalized.thumbUrl).toMatch(/^https:\/\//);
    expect(normalized.coverUrl).toMatch(/^https:\/\//);
  });

  it('carries community counts, which say how findable a pressing is', () => {
    // §5.7: "communityHave / communityWant — how many collectors own it". On
    // the first pressing these are large; a rare pressing shows the opposite,
    // and that is decision-relevant in a shop.
    const normalized = normalizeSearchResult(firstPressing);

    expect(normalized.communityHave).toBe(3739);
    expect(normalized.communityWant).toBe(2165);
  });

  it('keeps the format descriptors as a list', () => {
    expect(normalizeSearchResult(firstPressing).formats).toEqual(['Vinyl', 'LP', 'Album']);
  });
});

describe('absent data', () => {
  /**
   * Discogs encodes absence as PROSE — `country: "Unknown"`, `catno: "none"`,
   * `label: ["Not On Label"]` — and every one of these is a real value in the
   * captured artist search. Passed through untouched they become a record
   * pressed in a country called "Unknown" with catalog number "none".
   *
   * I would not have invented these. They are the strongest argument for
   * captured fixtures over written ones.
   */
  it('treats "Unknown" country as absent', () => {
    const normalized = normalizeSearchResult({
      id: 1,
      type: 'release',
      title: 'A - B',
      country: 'Unknown',
    });

    expect(normalized.country).toBeNull();
  });

  it('treats a catalog number of "none" as absent', () => {
    const normalized = normalizeSearchResult({
      id: 1,
      type: 'release',
      title: 'A - B',
      catno: 'none',
    });

    expect(normalized.catalogNumber).toBeNull();
  });

  it('treats "Not On Label" as absent rather than as a label name', () => {
    const normalized = normalizeSearchResult({
      id: 1,
      type: 'release',
      title: 'A - B',
      label: ['Not On Label'],
    });

    expect(normalized.label).toBeNull();
  });

  it('returns null rather than NaN for a missing year', () => {
    const normalized = normalizeSearchResult({ id: 1, type: 'release', title: 'A - B' });

    expect(normalized.year).toBeNull();
  });

  it('returns null for an unparseable year rather than NaN', () => {
    // Number('') is 0 and Number('n/a') is NaN; both would reach the column.
    const normalized = normalizeSearchResult({
      id: 1,
      type: 'release',
      title: 'A - B',
      year: 'n/a',
    });

    expect(normalized.year).toBeNull();
  });
});

describe('isReissue', () => {
  /**
   * §5.7: "isReissue — inferred from format descriptors". This is the
   * distinction the whole app is about (CLAUDE.md §8: a pressing is not an
   * album), and the fixtures make it testable: release 381756 is the UK 1982
   * original, 6779382 is a 1989 reissue of the same record with the same
   * catalog number.
   */
  it('is false for the original pressing', () => {
    expect(normalizeSearchResult(firstPressing).isReissue).toBe(false);
  });

  it('is true for a reissue of the same album', () => {
    expect(normalizeSearchResult(reissue).isReissue).toBe(true);
  });

  it('is true for a repress, which is also not an original', () => {
    const normalized = normalizeSearchResult({
      id: 1,
      type: 'release',
      title: 'A - B',
      format: ['Vinyl', 'LP', 'Album', 'Repress'],
    });

    expect(normalized.isReissue).toBe(true);
  });

  it('does not read a reissue out of a descriptor that merely starts alike', () => {
    /**
     * Substring matching is the obvious shortcut, and these are the real
     * descriptors that defeat it. "Remastered" is a genuine reissue marker;
     * "Remix", "Reprise" and "Record Store Day" are not, and all four share a
     * prefix with one.
     *
     * The first version of this test used "Misprint", which collides with
     * nothing — mutation showed a substring implementation passed it, so the
     * test guarded the property in its name and not in its assertion.
     */
    const notReissues = ['Remix', 'Reprise', 'Record Store Day', 'Repackaged'];

    for (const descriptor of notReissues) {
      const normalized = normalizeSearchResult({
        id: 1,
        type: 'release',
        title: 'A - B',
        format: ['Vinyl', 'LP', descriptor],
      });

      expect(normalized.isReissue, `"${descriptor}" is not a reissue`).toBe(false);
    }
  });
});

describe('normalizeSearchResponse', () => {
  it('normalizes every result and reports the real total', () => {
    /**
     * The cardinality this step was scoped around: a bare artist query returns
     * 920 results here (5,315 against the live API for a broader query). §5.7's
     * structured params exist because that is unusable, and `meta.total` is
     * what tells the user they need to narrow rather than scroll.
     */
    const normalized = normalizeSearchResponse(byArtist);

    expect(normalized.data).toHaveLength((byArtist.results as unknown[]).length);
    expect(normalized.meta.total).toBe(920);
    expect(normalized.meta.page).toBe(1);
  });

  it('normalizes each result rather than passing raw payloads through', () => {
    // The tell would be a raw `catno` or a combined title surviving into the
    // response.
    const normalized = normalizeSearchResponse(byCatno);

    for (const result of normalized.data) {
      expect(result).not.toHaveProperty('catno');
      expect(result.title).not.toMatch(/^Discharge - /);
    }
  });

  it('is empty rather than throwing when Discogs returns no results', () => {
    const normalized = normalizeSearchResponse({
      results: [],
      pagination: { items: 0, page: 1, per_page: 50 },
    });

    expect(normalized.data).toEqual([]);
    expect(normalized.meta.total).toBe(0);
  });
});

describe('untrusted input from Discogs', () => {
  /**
   * Discogs data is contributor-submitted (§5.7), which makes every field an
   * untrusted input rather than merely an unreliable one. Found by the security
   * review; each case verified before fixing.
   */
  describe('image URLs', () => {
    it('refuses a javascript: URL', () => {
      /**
       * `javascript:alert(1)` reached `thumbUrl` and would be rendered into an
       * `<img src>`. React will not execute it there, so this is not live XSS
       * — but the value is contributor-controlled and one framework change,
       * one `<a href>`, or one copy of the URL elsewhere makes it live. The
       * scheme is checkable and the check costs nothing.
       */
      const normalized = normalizeSearchResult({
        id: 1,
        type: 'release',
        title: 'A - B',
        thumb: 'javascript:alert(1)',
      });

      expect(normalized.thumbUrl).toBeNull();
    });

    it('refuses a plain http URL', () => {
      /**
       * Not a scheme attack, a PRIVACY one: an http image is an unencrypted
       * outbound request from the user's browser, to a host any Discogs
       * contributor chose, carrying their IP. Discogs serves images over
       * https, so an http URL is already anomalous.
       */
      const normalized = normalizeSearchResult({
        id: 1,
        type: 'release',
        title: 'A - B',
        cover_image: 'http://evil.test/tracking-pixel.gif',
      });

      expect(normalized.coverUrl).toBeNull();
    });

    it.each([
      ['data:', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
      ['file:', 'file:///etc/passwd'],
      ['no scheme', '//evil.test/pixel.gif'],
      ['not a URL at all', 'nonsense'],
    ])('refuses %s', (_label, url) => {
      const normalized = normalizeSearchResult({ id: 1, type: 'release', title: 'A - B', thumb: url });

      expect(normalized.thumbUrl).toBeNull();
    });

    it('keeps a normal https image', () => {
      // The allow-list must not cost the working case.
      const normalized = normalizeSearchResult({
        id: 1,
        type: 'release',
        title: 'A - B',
        thumb: 'https://i.discogs.com/abc/R-381756.jpeg',
      });

      expect(normalized.thumbUrl).toBe('https://i.discogs.com/abc/R-381756.jpeg');
    });
  });

  describe('a malformed row', () => {
    it('drops the bad row and keeps the good ones', () => {
      /**
       * One row with a non-numeric id threw a ZodError out of the normalizer,
       * which `withErrorHandling` turned into a 500 — our bug, reported for
       * their malformation, with one hostile row poisoning the whole page.
       *
       * §5.7 says Discogs merges, splits and gets things wrong. A page that
       * loses one row is degraded; a page that fails entirely is broken.
       */
      const normalized = normalizeSearchResponse({
        pagination: { items: 2, page: 1, per_page: 50 },
        results: [
          { id: 1, type: 'release', title: 'Good - Row' },
          { id: 'not-a-number' },
        ],
      });

      expect(normalized.data).toHaveLength(1);
      expect(normalized.data[0].title).toBe('Row');
    });

    it('reports how many rows it dropped', () => {
      /**
       * A search silently returning 47 of 50 is a quieter version of the same
       * problem: on the lookup screen a missing result reads as "Discogs does
       * not have it" rather than "we could not parse it", and the user stops
       * looking for a record that exists.
       */
      const normalized = normalizeSearchResponse({
        pagination: { items: 3, page: 1, per_page: 50 },
        results: [
          { id: 1, type: 'release', title: 'Good - One' },
          { id: 'bad' },
          { id: {} },
        ],
      });

      expect(normalized.meta.dropped, 'the count travels with the results').toBe(2);
    });

    it('reports zero dropped when every row parsed', () => {
      const normalized = normalizeSearchResponse({
        pagination: { items: 1, page: 1, per_page: 50 },
        results: [{ id: 1, type: 'release', title: 'Good - Row' }],
      });

      expect(normalized.meta.dropped).toBe(0);
    });
  });

  describe('length bounds', () => {
    it('truncates text before it reaches the database', () => {
      /**
       * 50,000 characters reached `title` unbounded. The columns are `text`
       * with no limit, so nothing downstream refuses it — a hostile or broken
       * contributor entry becomes a row nobody can render and a payload every
       * future reader carries.
       */
      const normalized = normalizeSearchResult({
        id: 1,
        type: 'release',
        title: `Artist - ${'x'.repeat(50_000)}`,
      });

      expect(normalized.title.length).toBeLessThanOrEqual(500);
    });

    it('leaves ordinary values untouched', () => {
      // The bound must be invisible to real data.
      const normalized = normalizeSearchResult({
        id: 1,
        type: 'release',
        title: 'Discharge - Hear Nothing See Nothing Say Nothing',
      });

      expect(normalized.title).toBe('Hear Nothing See Nothing Say Nothing');
    });
  });
});
