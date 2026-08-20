import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import {
  artists,
  genres,
  journalEntries,
  labels,
  pressings,
  recordGenres,
  records,
  recordStores,
  wantList,
} from '@/db/schema';
import { buildCollectionSummary } from '@/lib/llm/collection-summary';

/**
 * SPEC.md §9.2: "Build a compact summary of the collection… Do not dump raw
 * rows." R5's first attack line is **field by field, not "a summary"**, and this
 * file is where that is answered.
 *
 * **The exclusion is asserted against the serialised payload, not field by
 * field.** A field-by-field check tests the fields the author remembered; a
 * sentinel search tests every field there is. Same shape as the deferred
 * `cause`-chain fix, which plants a secret in a nested cause and asserts it does
 * not reach the log.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

/**
 * Every excluded field carries a unique marker. If any reaches the payload, the
 * test names which one — a bare "a sentinel leaked" would send the reader
 * looking through the whole builder.
 */
const SENTINELS = {
  purchasePrice: '1234.56',
  purchaseDate: '1999-09-09',
  storeName: 'SENTINEL-STORE-Rough-Trade',
  journalNote: 'SENTINEL-JOURNAL-listened-on-a-wet-tuesday',
  recordNotes: 'SENTINEL-NOTES-sleeve-has-a-ring-wear',
  matrixRunout: 'SENTINEL-MATRIX-A1-B2-PORKY',
  bestDigNotes: 'SENTINEL-BESTDIG-first-press-with-the-poster',
  maxPrice: '99.99',
  catalogNumber: 'SENTINEL-CAT-CLAY-4',
} as const;

async function seedACollection() {
  const [artist] = await db.insert(artists).values({ name: 'Discharge' }).returning();
  const [label] = await db.insert(labels).values({ name: 'Clay Records' }).returning();
  const [genre] = await db.insert(genres).values({ name: 'UK82' }).returning();
  const [store] = await db
    .insert(recordStores)
    .values({ name: SENTINELS.storeName })
    .returning();

  const [pressing] = await db
    .insert(pressings)
    .values({
      catalogNumber: SENTINELS.catalogNumber,
      matrixRunout: SENTINELS.matrixRunout,
    })
    .returning();

  const [record] = await db
    .insert(records)
    .values({
      title: 'Hear Nothing See Nothing Say Nothing',
      artistId: artist.id,
      labelId: label.id,
      storeId: store.id,
      pressingId: pressing.id,
      purchasePrice: SENTINELS.purchasePrice,
      purchaseDate: SENTINELS.purchaseDate,
      notes: SENTINELS.recordNotes,
    })
    .returning();

  await db.insert(recordGenres).values({ recordId: record.id, genreId: genre.id });

  await db.insert(journalEntries).values({
    recordId: record.id,
    note: SENTINELS.journalNote,
  });

  const [wantArtist] = await db.insert(artists).values({ name: 'Anti-Cimex' }).returning();
  await db.insert(wantList).values({
    title: 'Raped Ass',
    artistId: wantArtist.id,
    priority: 1,
    bestDigNotes: SENTINELS.bestDigNotes,
    maxPrice: SENTINELS.maxPrice,
  });

  return { artist, label, genre, record };
}

describe('what leaves the machine', () => {
  /**
   * Fails against: any field reaching the payload that should not.
   *
   * **The test that matters for R5.** Asserted against the whole serialised
   * payload rather than per field, so a field added to the builder later is
   * covered without anyone remembering to extend this list.
   *
   * Adam's own standard, from the scoping: would he paste this into a public
   * forum? A purchase price, a store name with a date, a journal entry and his
   * own notes about a sleeve all fail that, so none of them go.
   */
  it('no excluded field appears anywhere in the payload', async () => {
    await seedACollection();

    const summary = await buildCollectionSummary();
    const serialised = JSON.stringify(summary);

    const leaked = Object.entries(SENTINELS)
      .filter(([, marker]) => serialised.includes(marker))
      .map(([field]) => field);

    expect(leaked).toEqual([]);
  });

  /**
   * Fails against: an empty payload, which would satisfy the exclusion test
   * vacuously.
   *
   * The inverse is not optional. "Nothing leaked" is trivially true of a builder
   * that returns `{}`, and the exclusion test alone cannot tell a careful
   * payload from an absent one.
   */
  it('the payload carries what §9.2 says it should', async () => {
    await seedACollection();

    const summary = await buildCollectionSummary();
    const serialised = JSON.stringify(summary);

    expect(serialised).toContain('Discharge');
    expect(serialised).toContain('UK82');
    expect(serialised).toContain('Clay Records');
    // The want list, with its priority — §9.2 names it explicitly.
    expect(serialised).toContain('Raped Ass');
    expect(serialised).toContain('Anti-Cimex');
  });

  /**
   * Fails against: a builder that sends uuids.
   *
   * An id is not sensitive on its own, but it is useless to the model and it is
   * the thread by which a payload stops being a summary and becomes a dump of
   * rows. §9.2: "do not dump raw rows."
   */
  it('sends no identifiers', async () => {
    const { artist, record } = await seedACollection();

    const serialised = JSON.stringify(await buildCollectionSummary());

    expect(serialised).not.toContain(artist.id);
    expect(serialised).not.toContain(record.id);
  });

  /**
   * Fails against: a builder that omits the genre hierarchy.
   *
   * §9.2 (A29d) constrains the model's `genre` field to the user's own genre
   * names, and that is only enforceable if the prompt tells it what they are.
   * The hierarchy is what makes the response checkable rather than plausible.
   */
  it('sends the genre hierarchy the response is validated against', async () => {
    const [parent] = await db.insert(genres).values({ name: 'Punk' }).returning();
    await db.insert(genres).values({ name: 'UK82', parentGenreId: parent.id });

    const summary = await buildCollectionSummary();

    expect(summary.genreVocabulary).toContain('Punk');
    expect(summary.genreVocabulary).toContain('UK82');
  });

  /**
   * Fails against: a builder that counts a record once per genre.
   *
   * A record tagged with two genres is one record. This is the double-count
   * `genreRollup` documents two dedup layers for, arriving in a new consumer —
   * and a model told an artist has four records when they have two will reason
   * about a collection that does not exist.
   */
  it('counts a record once however many genres it carries', async () => {
    const [artist] = await db.insert(artists).values({ name: 'Discharge' }).returning();
    const [a] = await db.insert(genres).values({ name: 'UK82' }).returning();
    const [b] = await db.insert(genres).values({ name: 'D-beat' }).returning();
    const [record] = await db
      .insert(records)
      .values({ title: 'Why', artistId: artist.id })
      .returning();
    await db.insert(recordGenres).values([
      { recordId: record.id, genreId: a.id },
      { recordId: record.id, genreId: b.id },
    ]);

    const summary = await buildCollectionSummary();
    const discharge = summary.artists.find((entry) => entry.name === 'Discharge');

    expect(discharge?.recordCount).toBe(1);
  });
});
