import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeRelease } from './normalize-release';

/**
 * SPEC.md §5.7's normalized release detail — the payload that prefills the
 * add/edit form.
 *
 * Two fixtures, chosen for what they disagree about:
 *   release-detailed  — 8 Matrix / Runout identifiers, a "Pressed By" company,
 *                       a gatefold text descriptor, 7 images
 *   release-no-matrix — NO identifiers at all, three colour variants
 *
 * §5.7 calls missing matrix data "frequently missing or partial", and the
 * second fixture is what makes that testable rather than assumed.
 */

const detailed = JSON.parse(
  readFileSync('test/fixtures/discogs/release-detailed.json', 'utf8'),
) as unknown;

const noMatrix = JSON.parse(
  readFileSync('test/fixtures/discogs/release-no-matrix.json', 'utf8'),
) as unknown;

describe('matrix / runout', () => {
  /**
   * CLAUDE.md §8 calls the matrix user-authoritative: it is the dead-wax
   * fingerprint, the thing that identifies a pressing when catalog numbers
   * agree. §5.7 types it as an ARRAY, and the real payload shows why — this
   * release carries EIGHT, being two sides across four documented variants.
   * Collapsing them to one would discard the variant the user is holding.
   */
  it('collects every Matrix / Runout identifier, not just the first', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.matrixRunout.length).toBe(8);
    expect(normalized.matrixRunout[0]).toContain('CLAY-LP-3-A2');
  });

  it('is empty rather than absent when Discogs has no runout data', () => {
    // The common real case per §5.7. An empty array lets the form show an
    // empty field the user fills from the dead wax; `undefined` would need a
    // guard at every use site.
    expect(normalizeRelease(noMatrix).matrixRunout).toEqual([]);
  });

  it('keeps non-matrix identifiers separately rather than discarding them', () => {
    // §5.7: `otherIdentifiers` with type, value and description. Barcodes and
    // rights-society codes identify a pressing too, and throwing them away
    // loses information the user cannot recover.
    const normalized = normalizeRelease({
      id: 1,
      identifiers: [
        { type: 'Matrix / Runout', value: 'A1' },
        { type: 'Barcode', value: '5013929100121', description: 'Text' },
      ],
    });

    expect(normalized.matrixRunout).toEqual(['A1']);
    expect(normalized.otherIdentifiers).toEqual([
      { type: 'Barcode', value: '5013929100121', description: 'Text' },
    ]);
  });

  it('matches the identifier type case-insensitively', () => {
    // Discogs' type strings are contributor-entered. "Matrix / Runout" is the
    // canonical form, and a case difference must not silently drop the field
    // this app cares most about.
    const normalized = normalizeRelease({
      id: 1,
      identifiers: [{ type: 'matrix / runout', value: 'A1' }],
    });

    expect(normalized.matrixRunout).toEqual(['A1']);
  });
});

describe('pressing plant', () => {
  it('reads the company whose role is pressing, not the first company', () => {
    /**
     * The discriminating fixture, and it is real: this release lists four
     * companies — Clay Records and Intersong ("Published By"), Damont
     * ("Pressed By") and Tape One ("Lacquer Cut At").
     *
     * Taking `companies[0]` yields Clay Records, which is the LABEL. Taking
     * anything matching "cut" yields the mastering studio. Only Damont pressed
     * the record, and §4.2's `pressing_plant` means exactly that.
     */
    expect(normalizeRelease(detailed).pressingPlant).toBe('Damont');
  });

  it('is null when no company pressed it', () => {
    const normalized = normalizeRelease({
      id: 1,
      companies: [{ name: 'Clay Records', entity_type_name: 'Published By' }],
    });

    expect(normalized.pressingPlant).toBeNull();
  });

  it('does not mistake "Lacquer Cut At" for a pressing plant', () => {
    // Both are manufacturing roles and both name a company, but only one pressed
    // the vinyl. A substring match on "Cut" or a role allowlist that included
    // mastering would put the wrong name in the field.
    const normalized = normalizeRelease({
      id: 1,
      companies: [{ name: 'Tape One', entity_type_name: 'Lacquer Cut At' }],
    });

    expect(normalized.pressingPlant).toBeNull();
  });
});

describe('format descriptors', () => {
  it('parses the colour variant from the format text', () => {
    // §5.7: "colorVariant — parsed from format descriptors". The no-matrix
    // fixture is a coloured-vinyl release: three entries with text
    // "Blue/Green", "Blue/Purple", "Yellow/Orange".
    expect(normalizeRelease(noMatrix).colorVariant).toBe('Blue/Green');
  });

  it('does not treat a non-colour text descriptor as a colour', () => {
    /**
     * This release's format text is "Gatefold" — a sleeve property, not a
     * vinyl colour. Writing it into `color_variant` would put "Gatefold" in a
     * colour field on every gatefold record, which is wrong in the confident
     * direction: it looks entered.
     */
    expect(normalizeRelease(detailed).colorVariant).toBeNull();
  });

  it('reads the weight Discogs estimates', () => {
    // §5.7: "vinylWeightGrams — parsed from format descriptors when present".
    // The real payload carries `estimated_weight: 230` at the top level, which
    // is where it actually lives.
    expect(normalizeRelease(detailed).vinylWeightGrams).toBe(230);
  });

  it('prefers an explicit gram descriptor over the estimate', () => {
    /**
     * "180 Gram" in the descriptors is a CLAIM ABOUT THE PRESSING; the
     * top-level estimate is Discogs' shipping-weight guess for the package.
     * When both exist the descriptor is the one that describes the record.
     */
    const normalized = normalizeRelease({
      id: 1,
      estimated_weight: 230,
      formats: [{ name: 'Vinyl', descriptions: ['LP', '180 Gram'] }],
    });

    expect(normalized.vinylWeightGrams).toBe(180);
  });

  it('keeps the descriptors themselves', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.formats).toContain('Vinyl');
    expect(normalized.formats).toContain('LP');
    expect(normalized.formats).toContain('Album');
  });
});

describe('the rest of the §5.7 detail shape', () => {
  it('carries images with their type', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.images.length).toBe(7);
    expect(normalized.images[0].type).toBe('primary');
    expect(normalized.images[0].url).toMatch(/^https:\/\//);
  });

  it('carries the tracklist with positions', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.tracklist[0].position).toBe('A1');
    expect(normalized.tracklist[0].title).toBe('Hear Nothing See Nothing Say Nothing');
  });

  it('reports an empty duration as absent rather than as an empty string', () => {
    // `duration: ""` is Discogs' absence again, in the tracklist.
    expect(normalizeRelease(detailed).tracklist[0].duration).toBeNull();
  });

  it('keeps genres and styles separate, as the search normalizer does', () => {
    // CLAUDE.md §8, at the endpoint that prefills the form — this is where a
    // flattened genre would be written into the database.
    const normalized = normalizeRelease(detailed);

    expect(normalized.genres).toEqual(['Rock']);
    expect(normalized.styles).toContain('Hardcore');
    expect(normalized.styles).toContain('Punk');
  });

  it('carries the marketplace figures as information only', () => {
    // §5.7 lists these; CLAUDE.md §8 forbids anything that sells. They are
    // displayed, never linked.
    const normalized = normalizeRelease(detailed);

    expect(normalized.numForSale).toBe(11);
    expect(normalized.lowestPrice).toBe(43.96);
  });

  it('carries the identifying fields for the form', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.discogsId).toBe(381756);
    expect(normalized.masterId).toBe(50683);
    expect(normalized.title).toBe('Hear Nothing See Nothing Say Nothing');
    expect(normalized.artist).toBe('Discharge');
    expect(normalized.label).toBe('Clay Records');
    expect(normalized.catalogNumber).toBe('CLAY LP 3');
    expect(normalized.country).toBe('UK');
    expect(normalized.year).toBe(1982);
  });

  it('reads the artist from artists[0], not from a combined title', () => {
    // Release detail sends `title` as the TITLE ALONE and the artist
    // separately — the opposite of search results, where they are combined.
    // Splitting on " - " here would truncate a title containing a hyphen.
    const normalized = normalizeRelease({
      id: 1,
      title: 'Why - The Singles',
      artists: [{ name: 'Discharge' }],
    });

    expect(normalized.artist).toBe('Discharge');
    expect(normalized.title).toBe('Why - The Singles');
  });

  it('keeps the notes, which carry pressing detail nothing else does', () => {
    // This release's notes say "Pay no more than £3.99" and "Gatefold sleeve
    // with lyrics" — sleeve facts a collector uses to identify a pressing.
    expect(normalizeRelease(detailed).notes).toMatch(/Gatefold sleeve/);
  });
});
