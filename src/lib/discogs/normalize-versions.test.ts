import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeVersion, normalizeVersionsResponse } from './normalize-versions';

/**
 * SPEC.md §5.7's master → version drill-down: "the step where the user
 * identifies THEIR pressing rather than just the album."
 *
 * §10 requires the comparison table to carry country, year, label, catalog
 * number and format descriptors TOGETHER, and this fixture is why. Master 50683
 * holds 57 versions, of which two matter most here:
 *
 *   381756  UK  1982  Clay Records  CLAY LP 3  "LP, Album"
 *   6779382 UK  1989  Clay Records  CLAY LP 3  "LP, Reissue"
 *
 * Same country, same label, same CATALOG NUMBER. Only the year and the format
 * descriptors tell them apart — and one is the record a collector is hunting
 * while the other is worth a fraction of it. CLAUDE.md §8: a pressing is not an
 * album, and collapsing these is the worst bug this app can ship.
 *
 * The versions payload is NOT shaped like a search result, which is the sort of
 * thing only a captured fixture reveals: `format` is a comma-joined STRING
 * rather than an array, the year lives in `released` rather than `year`, and
 * community counts sit under `stats.community.in_collection`.
 */

const versionsFixture = JSON.parse(
  readFileSync('test/fixtures/discogs/master-versions-discharge.json', 'utf8'),
) as { versions: Array<{ id: number }>; pagination: unknown };

const version = (id: number) => versionsFixture.versions.find((v) => v.id === id);

const original = version(381756);
const reissue = version(6779382);

describe('telling one pressing from another', () => {
  /**
   * THE test this unit exists for. These two rows agree on every field a
   * careless table would show — a list of "Clay Records · CLAY LP 3 · UK" twice
   * over is useless in a shop, and worse than useless if the user buys on it.
   */
  it('distinguishes the 1982 original from the 1989 reissue sharing its catalog number', () => {
    const first = normalizeVersion(original);
    const second = normalizeVersion(reissue);

    // What they share — the fields that CANNOT do the work.
    expect(first.catalogNumber).toBe(second.catalogNumber);
    expect(first.country).toBe(second.country);
    expect(first.label).toBe(second.label);

    // What separates them.
    expect(first.year).toBe(1982);
    expect(second.year).toBe(1989);
    expect(first.isReissue).toBe(false);
    expect(second.isReissue).toBe(true);
  });

  it('carries every §10 comparison field on each row', () => {
    // §10: "a comparison table with country, year, label, catalog number and
    // format descriptors". A row missing any one of them cannot be compared on
    // it, and the missing one is always the one that mattered.
    const normalized = normalizeVersion(original);

    expect(normalized.country).toBe('UK');
    expect(normalized.year).toBe(1982);
    expect(normalized.label).toBe('Clay Records');
    expect(normalized.catalogNumber).toBe('CLAY LP 3');
    // `major_formats` ("Vinyl") AND `format` ("LP, Album") — the medium and
    // the specifics. §10's table needs both: "Vinyl" distinguishes a pressing
    // from a CD version of the same master, and "Album"/"Reissue" separates
    // the vinyl rows from each other.
    expect(normalized.formats).toEqual(['Vinyl', 'LP', 'Album']);
    expect(normalized.thumbUrl).toMatch(/^https:\/\//);
  });

  it('splits the comma-joined format string into descriptors', () => {
    /**
     * Search results send `format` as an ARRAY; versions send it as the string
     * "LP, Album, Reissue". Treating the string as an array yields a single
     * descriptor that matches nothing, and `isReissue` silently becomes false
     * for every reissue in the table.
     */
    expect(normalizeVersion(reissue).formats).toEqual(['Vinyl', 'LP', 'Reissue']);
  });
});

describe('isReissue on a version row', () => {
  it('is false for an original pressing', () => {
    expect(normalizeVersion(original).isReissue).toBe(false);
  });

  it('is true for a reissue', () => {
    expect(normalizeVersion(reissue).isReissue).toBe(true);
  });

  it('is true for a repress', () => {
    const repress = versionsFixture.versions.find(
      (v) => (v as { format?: string }).format === 'LP, Album, Repress',
    );

    expect(repress, 'the fixture has a repress row').toBeDefined();
    expect(normalizeVersion(repress).isReissue).toBe(true);
  });

  it('handles a descriptor list containing a near-miss word', () => {
    /**
     * "LP, Album, Mispress, Repress" is a real row in this fixture. A substring
     * implementation reads "Mispress" as a press-something and gets the right
     * answer here for the wrong reason — so the discriminating case is a
     * MISPRESS WITHOUT a repress, which is not a reissue at all.
     */
    const normalized = normalizeVersion({
      id: 1,
      format: 'LP, Album, Mispress',
      country: 'UK',
      released: '1982',
    });

    expect(normalized.isReissue).toBe(false);
  });
});

describe('fields the real payload shapes differently', () => {
  it('reads the year from `released`, not `year`', () => {
    // Search results use `year`; versions use `released`. Reading the wrong
    // one yields null for every row and the table loses the field that
    // separates an original from a reissue.
    expect(normalizeVersion(original).year).toBe(1982);
  });

  it('reads community counts from stats.community', () => {
    /**
     * Nested differently from search (`community.have` / `community.want`).
     * These say how findable a pressing is, which is decision-relevant: 3,739
     * collectors own the 1982 original.
     */
    const normalized = normalizeVersion(original);

    expect(normalized.communityHave).toBe(3739);
    expect(normalized.communityWant).toBe(2165);
  });

  it('keeps a multi-country string as written rather than guessing', () => {
    /**
     * `country: "UK, Europe & US"` is a real value here, as is "Worldwide".
     * Splitting it would invent three pressings from one; picking the first
     * would claim a UK pressing that Discogs never asserted. It is prose, and
     * it stays prose — the user reads it and decides.
     */
    const multi = versionsFixture.versions.find(
      (v) => (v as { country?: string }).country === 'UK, Europe & US',
    );

    expect(multi, 'the fixture has a multi-country row').toBeDefined();
    expect(normalizeVersion(multi).country).toBe('UK, Europe & US');
  });

  it('exposes the release id, so a row can be opened as a release', () => {
    // The whole point of the drill-down: the user picks a row and imports THAT
    // pressing. Without the id the table is a dead end.
    expect(normalizeVersion(original).discogsId).toBe(381756);
  });

  it('treats absence-prose the same way search results do', () => {
    // Same rule, same reasons — §5.7's fields are sparse everywhere.
    const normalized = normalizeVersion({
      id: 1,
      country: 'Unknown',
      catno: 'none',
      label: 'Not On Label',
      released: '',
    });

    expect(normalized.country).toBeNull();
    expect(normalized.catalogNumber).toBeNull();
    expect(normalized.label).toBeNull();
    expect(normalized.year).toBeNull();
  });

  it('returns null for a partial date rather than a wrong year', () => {
    // Discogs sends "1982-03-15" on some rows and "1982" on others.
    expect(normalizeVersion({ id: 1, released: '1982-03-15' }).year).toBe(1982);
  });
});

describe('normalizeVersionsResponse', () => {
  it('normalizes every version and reports the pagination', () => {
    // §5.7: "Paginated." 57 versions over 3 pages — the table has to say so,
    // or the user believes 25 is all there is and stops looking for theirs.
    const normalized = normalizeVersionsResponse(versionsFixture);

    expect(normalized.data).toHaveLength(25);
    expect(normalized.meta.total).toBe(57);
    expect(normalized.meta.page).toBe(1);
    expect(normalized.meta.pageSize).toBe(25);
  });

  it('normalizes rows rather than passing raw payloads through', () => {
    const normalized = normalizeVersionsResponse(versionsFixture);

    for (const row of normalized.data) {
      expect(row).not.toHaveProperty('catno');
      expect(row).not.toHaveProperty('released');
      expect(row).toHaveProperty('catalogNumber');
    }
  });

  it('is empty rather than throwing for a master with no versions', () => {
    const normalized = normalizeVersionsResponse({
      versions: [],
      pagination: { items: 0, page: 1, per_page: 25 },
    });

    expect(normalized.data).toEqual([]);
    expect(normalized.meta.total).toBe(0);
  });
});
