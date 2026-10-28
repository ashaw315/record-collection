import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapCollectionItem, parseWeightGrams, pickFormatName } from './collection-map';
import type { CollectionItem } from './collection';

/**
 * Step 18 unit B (SPEC §12 step 18, §6): a Discogs release and its collection
 * item, mapped into what the importer takes, under Adam's rules of 27 Oct:
 * Discogs' genres and not its styles; weight from the format text (a number
 * with g, gram or gm) and colour never; the seven formats and no more; what
 * cannot be mapped left blank and listed; the matrix carried for the importer
 * to seed only where empty. Pure: no database, no network.
 *
 * The nine fixtures are AdamPseudo's collection as captured by a person on
 * 27 Oct (`scripts/capture-discogs-fixtures.mjs collection`), and the table
 * they are checked against is the one reported before the rules were set.
 */
const fixture = (name: string): unknown => JSON.parse(readFileSync(`test/fixtures/discogs/${name}.json`, 'utf8'));
const page = fixture('collection-page-1') as { releases: Array<{ id: number }> };
const IDS = page.releases.map((r) => r.id);

const item = (releaseId: number, over: Partial<CollectionItem> = {}): CollectionItem => ({ releaseId, instanceId: 1, dateAdded: '2026-10-27T14:03:57-07:00', conditionMedia: 'M', conditionSleeve: 'M', title: null, artist: null, ...over });

/** A release payload with only what the rule under test reads, on top of a real one so normalization has its shape. */
const release = (over: Record<string, unknown>) => ({ ...(fixture('collection-release-29613763') as Record<string, unknown>), ...over });

describe('parseWeightGrams', () => {
  it('reads a number with g, gram or gm, and nothing else', () => {
    expect(parseWeightGrams(['180g'])).toBe(180);
    expect(parseWeightGrams(['Gatefold, 180 gram'])).toBe(180);
    expect(parseWeightGrams(['Gatefold, 180gm'])).toBe(180);
    expect(parseWeightGrams(['Hot Pink [Opaque]'])).toBeNull();
    expect(parseWeightGrams(['RGB Edition', '45 RPM'])).toBeNull();
    expect(parseWeightGrams([])).toBeNull();
  });
});

describe('pickFormatName', () => {
  it('maps one vinyl format to one of the seven by its descriptions and quantity, and nothing outside them', () => {
    expect(pickFormatName([{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album'] }])).toBe('LP');
    expect(pickFormatName([{ name: 'Vinyl', qty: '2', descriptions: ['LP', 'Album', 'Reissue'] }])).toBe('2xLP');
    expect(pickFormatName([{ name: 'Vinyl', qty: '1', descriptions: ['7"', '45 RPM'] }])).toBe('7"');
    expect(pickFormatName([{ name: 'Vinyl', qty: '1', descriptions: ['10"', 'EP'] }])).toBe('10"');
    expect(pickFormatName([{ name: 'Vinyl', qty: '1', descriptions: ['12"', 'Single'] }])).toBe('12" Single');
    expect(pickFormatName([{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Picture Disc'] }])).toBe('Picture Disc');
    expect(pickFormatName([{ name: 'Box Set', qty: '1', descriptions: ['Compilation'] }, { name: 'Vinyl', qty: '4', descriptions: ['LP'] }])).toBe('Box Set');
  });
  it('leaves three discs, several formats, or no vinyl blank rather than growing the list', () => {
    expect(pickFormatName([{ name: 'Vinyl', qty: '3', descriptions: ['LP', 'Album'] }])).toBeNull();
    expect(pickFormatName([{ name: 'Vinyl', qty: '1', descriptions: ['LP'] }, { name: 'Vinyl', qty: '1', descriptions: ['7"'] }])).toBeNull();
    expect(pickFormatName([{ name: 'CD', qty: '1', descriptions: ['Album'] }])).toBeNull();
    expect(pickFormatName([])).toBeNull();
  });
});

describe('mapCollectionItem, the rules', () => {
  it('takes Discogs’ genres and drops its styles, listing them', () => {
    const m = mapCollectionItem(release({ genres: ['Jazz', 'Funk / Soul'], styles: ['Free Jazz', 'Spiritual Jazz'] }), item(29613763));
    expect(m.genres).toEqual(['Jazz', 'Funk / Soul']);
    expect(m.release.styles, 'the importer reads the release’s styles into genres, so the release it sees has none').toEqual([]);
    expect(m.dropped).toContainEqual({ field: 'styles', value: 'Free Jazz, Spiritual Jazz', reason: 'styles are not taken' });
  });

  /*
    Adam's call of 28 Oct, replacing the rule this test held until then (every format text listed
    under colour): the colour entry lists only text carrying a colour descriptor; the weight stays
    where it goes; what remains with no column is listed as dropped text, not as colour. Fails
    against the old rule on the second and third cases.
  */
  it('never parses a colour; lists a text with a colour descriptor under colour, and the rest of a text with no column as dropped', () => {
    const colour = mapCollectionItem(release({ formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album'], text: 'Hot Pink [Opaque]' }] }), item(29613763));
    expect(colour.release.colorVariant, 'the importer must not see a colour either').toBeNull();
    expect(colour.blank).toContainEqual({ field: 'color_variant', value: 'Hot Pink [Opaque]', reason: 'colour is never parsed' });
    expect(colour.dropped.some((d) => d.field === 'format_text')).toBe(false);

    const weightAndSleeve = mapCollectionItem(release({ formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album'], text: 'Gatefold, 180gm' }] }), item(29613763));
    expect(weightAndSleeve.release.vinylWeightGrams).toBe(180);
    expect(weightAndSleeve.blank.some((b) => b.field === 'color_variant'), 'a weight is not a colour').toBe(false);
    expect(weightAndSleeve.dropped).toContainEqual({ field: 'format_text', value: 'Gatefold', reason: 'no column takes it' });

    const weightOnly = mapCollectionItem(release({ formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album'], text: '180g' }] }), item(29613763));
    expect(weightOnly.blank.some((b) => b.field === 'color_variant')).toBe(false);
    expect(weightOnly.dropped.some((d) => d.field === 'format_text'), 'a text the weight used up lists nothing').toBe(false);

    const twice = mapCollectionItem(release({ formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP'], text: 'Silver' }, { name: 'Vinyl', qty: '1', descriptions: ['7"'], text: 'Silver' }] }), item(29613763));
    expect(twice.blank.find((b) => b.field === 'color_variant')?.value, 'one text, listed once').toBe('Silver');
  });

  it('takes the weight from the format text, in g, gram or gm, and nothing from Discogs’ estimated_weight', () => {
    expect(mapCollectionItem(release({ formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP'], text: 'Gatefold, 180gm' }], estimated_weight: 230 }), item(29613763)).release.vinylWeightGrams).toBe(180);
    expect(mapCollectionItem(release({ formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP'] }], estimated_weight: 230 }), item(29613763)).release.vinylWeightGrams).toBeNull();
  });

  it('leaves a year of 0 blank and lists it', () => {
    const m = mapCollectionItem(release({ year: 0 }), item(29613763));
    expect(m.release.year).toBeNull();
    expect(m.blank).toContainEqual({ field: 'year_pressed', value: '0', reason: 'Discogs has no year' });
  });

  it('carries the conditions from the collection item, and the matrix from Discogs for the importer to seed only where empty', () => {
    const m = mapCollectionItem(fixture('collection-release-11029111'), item(11029111, { conditionMedia: 'M', conditionSleeve: 'VG+' }));
    expect(m.overrides).toMatchObject({ conditionMedia: 'M', conditionSleeve: 'VG+' });
    expect(m.matrixRunout).toMatch(/WYR\?0514-A/);
    expect(m.matrixRunout).toMatch(/WYR\?0514-B/);
  });

  it('refuses an item whose release is not the release given', () => {
    expect(() => mapCollectionItem(fixture('collection-release-11029111'), item(29613763))).toThrow(/release/);
  });
});

describe('mapCollectionItem, the nine as captured', () => {
  const rows = IDS.map((id) => ({ id, m: mapCollectionItem(fixture(`collection-release-${id}`), item(id)) }));
  const by = (id: number) => rows.find((r) => r.id === id)?.m;
  if (by(11029111) === undefined) throw new Error('the captured page does not hold the nine this table was written from');

  it('maps the formats to LP ×6, 2xLP ×1, and leaves two blank: three discs, and an LP with a 7"', () => {
    expect(rows.map((r) => r.m.formatName)).toEqual(expect.arrayContaining(['LP', '2xLP', null]));
    expect(rows.filter((r) => r.m.formatName === 'LP').length).toBe(6);
    expect(by(15661267)?.formatName, 'ATLiens, two discs').toBe('2xLP');
    expect(by(33132765)?.formatName, 'Diamond Jubilee, three discs').toBeNull();
    expect(by(33132765)?.blank.map((b) => b.field)).toContain('format');
    expect(by(32524380)?.formatName, 'The Collective, an LP and a 7"').toBeNull();
  });

  it('takes 180 for the three that say so, in three spellings, and nothing for the rest', () => {
    expect(by(29613763)?.release.vinylWeightGrams, 'Great Doubt, "180g"').toBe(180);
    expect(by(31126154)?.release.vinylWeightGrams, 'Jewels Of Thought, "180 gram"').toBe(180);
    expect(by(11029111)?.release.vinylWeightGrams, 'Sunbathing Animal, "180gm"').toBe(180);
    expect(rows.filter((r) => r.m.release.vinylWeightGrams !== null).length).toBe(3);
  });

  /* Adam's call of 28 Oct: three of the nine carry a colour descriptor; three carry text no column takes; the rest list nothing. Fails against the rule that listed all eight texts under colour. */
  it('parses no colour anywhere; lists Green, Silver and Hot Pink under colour, Gatefold twice and RGB Edition as dropped text, and nothing for a text that was its weight', () => {
    expect(rows.every((r) => r.m.release.colorVariant === null)).toBe(true);
    const colourOf = (id: number) => by(id)?.blank.find((b) => b.field === 'color_variant')?.value ?? null;
    const textOf = (id: number) => by(id)?.dropped.find((d) => d.field === 'format_text')?.value ?? null;
    expect(IDS.map((id) => [id, colourOf(id), textOf(id)])).toEqual([
      [29613763, null, null],
      [31126154, null, 'Gatefold'],
      [15661267, null, null],
      [32524380, 'Silver', null],
      [29900731, 'Hot Pink [Opaque]', null],
      [27263532, 'Green', null],
      [36516553, null, 'RGB Edition'],
      [33132765, null, null],
      [11029111, null, 'Gatefold'],
    ]);
  });

  it('leaves ATLiens’ year blank and listed, and takes the other eight', () => {
    expect(by(15661267)?.release.year).toBeNull();
    expect(by(15661267)?.blank.map((b) => b.field)).toContain('year_pressed');
    expect(rows.filter((r) => r.m.release.year !== null).length).toBe(8);
  });

  it('drops every release’s styles and keeps its genres', () => {
    expect(rows.every((r) => r.m.dropped.some((d) => d.field === 'styles'))).toBe(true);
    expect(by(31126154)?.genres).toEqual(['Jazz']);
    expect(by(15661267)?.genres).toEqual(['Hip Hop']);
  });

  it('names what the importer will create: seven artists and seven labels the app does not hold are not its business here, but the names it needs are present', () => {
    for (const r of rows) {
      expect(r.m.release.artist, String(r.id)).toBeTruthy();
      expect(r.m.release.label, String(r.id)).toBeTruthy();
      expect(r.m.release.catalogNumber, String(r.id)).toBeTruthy();
    }
  });
});
