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
  wantListGenres,
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

    /*
     * **Owned record titles, PERMITTED as of A41 (2026-08-26).** Previously
     * absent by omission and asserted neither way — which made the exclusion an
     * accident rather than a decision, and this file exists so that every field
     * leaving the machine is a decision.
     *
     * A29g withheld them to keep §9.2's disclosure narrow, and the trade was
     * reopened on its own trigger after a second already-owned suggestion:
     * "Miles Davis — Bitches Brew" twice in two runs, 1 of 6 each time.
     *
     * **The design asked the model to reason about ownership while withholding
     * the data that makes that reasoning checkable.** A rule the payload cannot
     * support is either enforced by data or dropped from the prompt, and
     * dropping it means giving up same-artist suggestions — the case A29g
     * deliberately wanted.
     */
    expect(serialised, 'A41: owned titles are sent, so the model can avoid them').toContain(
      'Hear Nothing See Nothing Say Nothing',
    );
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

describe('the genre hierarchy, not a flat list (R5 F2)', () => {
  /**
   * Fails against: `genreVocabulary` as the only genre field.
   *
   * A29d says "the prompt supplies the collection's genre HIERARCHY and
   * constrains the field to it". It did not: `collection-summary.ts` ran
   * `SELECT name FROM genres` and never read `parent_genre_id`, so the model was
   * told not to flatten a scene into a parent term without being told which
   * terms were parents.
   */
  it('reports each genre parent', async () => {
    const [parent] = await db.insert(genres).values({ name: 'Punk' }).returning();
    await db.insert(genres).values({ name: 'UK82', parentGenreId: parent.id });
    await db.insert(genres).values({ name: 'US Hardcore', parentGenreId: parent.id });

    const summary = await buildCollectionSummary();

    expect(summary.genres).toEqual(
      expect.arrayContaining([
        { name: 'Punk', parent: null },
        { name: 'UK82', parent: 'Punk' },
        { name: 'US Hardcore', parent: 'Punk' },
      ]),
    );
  });

  /**
   * Fails against: dropping `genreVocabulary` when adding the structure.
   *
   * A29d validates `genre` against the user's own NAMES, and every name stays
   * valid — including a parent. The vocabulary is the validation's input and
   * must keep containing every genre the user has.
   */
  it('still lists every genre name, parents included', async () => {
    const [parent] = await db.insert(genres).values({ name: 'Punk' }).returning();
    await db.insert(genres).values({ name: 'UK82', parentGenreId: parent.id });

    const summary = await buildCollectionSummary();

    expect(summary.genreVocabulary).toContain('Punk');
    expect(summary.genreVocabulary).toContain('UK82');
  });

  /**
   * Fails against: a builder that only handles two levels.
   *
   * §4.1 makes the hierarchy arbitrarily deep. A grandchild must name its own
   * parent rather than the root, or the prompt would describe a tree the user
   * does not have.
   */
  it('handles a hierarchy deeper than two levels', async () => {
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [hc] = await db
      .insert(genres)
      .values({ name: 'Hardcore', parentGenreId: punk.id })
      .returning();
    await db.insert(genres).values({ name: 'Powerviolence', parentGenreId: hc.id });

    const summary = await buildCollectionSummary();

    expect(summary.genres).toEqual(
      expect.arrayContaining([{ name: 'Powerviolence', parent: 'Hardcore' }]),
    );
  });
});

/**
 * SPEC.md §12d (A45) — the payload for a genre-scoped gap analysis.
 *
 * **The scope must walk the same subtree the staleness does.** `Punk` has no
 * records of its own and gains through `UK82`, so a direct-only summary would
 * send an empty collection for exactly the genre the drill-down exists to
 * answer — and the answer would then disagree with its own scope.
 */
describe('a genre-scoped summary', () => {
  async function seedScoped() {
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();
    const [jazz] = await db.insert(genres).values({ name: 'Jazz' }).returning();

    const [discharge] = await db.insert(artists).values({ name: 'Discharge' }).returning();
    const [miles] = await db.insert(artists).values({ name: 'Miles Davis' }).returning();

    const [punkRecord] = await db
      .insert(records)
      .values({ title: 'Hear Nothing', artistId: discharge.id })
      .returning();
    const [jazzRecord] = await db
      .insert(records)
      .values({ title: 'Bitches Brew', artistId: miles.id })
      .returning();

    await db.insert(recordGenres).values([
      { recordId: punkRecord.id, genreId: uk82.id },
      { recordId: jazzRecord.id, genreId: jazz.id },
    ]);

    return { punk, uk82, jazz };
  }

  /**
   * **The case the drill-down exists for.** Asking about Punk must reach the
   * UK82 record beneath it — a direct-only summary would send nothing, because
   * Punk carries no records itself.
   */
  it('includes records tagged with a DESCENDANT of the scoped genre', async () => {
    const { punk } = await seedScoped();

    const summary = await buildCollectionSummary({ genreId: punk.id });

    expect(summary.artists.map((a) => a.name)).toEqual(['Discharge']);
  });

  it('excludes records outside the scoped genre', async () => {
    const { punk } = await seedScoped();

    const summary = await buildCollectionSummary({ genreId: punk.id });

    expect(summary.artists.map((a) => a.name)).not.toContain('Miles Davis');
  });

  it('sends the whole collection when no scope is given', async () => {
    await seedScoped();

    const summary = await buildCollectionSummary();

    expect(summary.artists.map((a) => a.name).sort()).toEqual(['Discharge', 'Miles Davis']);
  });

  /**
   * **The want list is scoped too.** A29g's record-level prohibition is only
   * useful if it names records in the scope — sending the whole want list to a
   * UK82 question spends tokens on rows the answer cannot be about.
   */
  it('scopes the want list to the same subtree', async () => {
    const { punk, uk82, jazz } = await seedScoped();
    const [crass] = await db.insert(artists).values({ name: 'Crass' }).returning();
    const [coltrane] = await db.insert(artists).values({ name: 'Coltrane' }).returning();

    const [wanted] = await db
      .insert(wantList)
      .values({ title: 'Feeding', artistId: crass.id, priority: 1 })
      .returning();
    const [unwanted] = await db
      .insert(wantList)
      .values({ title: 'A Love Supreme', artistId: coltrane.id, priority: 1 })
      .returning();

    await db.insert(wantListGenres).values([
      { wantListId: wanted.id, genreId: uk82.id },
      { wantListId: unwanted.id, genreId: jazz.id },
    ]);

    const summary = await buildCollectionSummary({ genreId: punk.id });

    expect(summary.wantList.map((w) => w.title)).toEqual(['Feeding']);
  });
});
