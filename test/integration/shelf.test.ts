import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, genres, images, labels, pressings, records, recordGenres } from '@/db/schema';
import { shelfRecords } from '@/lib/db/queries/shelf';

/**
 * SPEC.md §10b's shelf ordering.
 *
 * "Records stand as spines on one continuous shelf, ordered by genre so related
 * records stand together — all the punk adjacent, all the rock adjacent."
 *
 * **These are ADJACENCY tests, not grouping tests, and the distinction is the
 * unit's history.** An earlier version returned genre sections with headings;
 * it was correct and looked broken — six flat genres for five records produced
 * five near-empty black bands stacked down the page. §10b was amended to one
 * continuous wall. The ORDERING survived intact, so what these assert is that
 * related records end up next to each other, which is what "all the punk
 * together" actually means.
 *
 * The ordering is by TOP-LEVEL genre. UK82 and US Hardcore are different scenes
 * (§8, and this project will not flatten them) — they stay distinct on the
 * record and in every filter, and they stand adjacent on the shelf because both
 * are Punk. Ordering by the tagged genre instead would put two runs of punk at
 * opposite ends of the wall.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function artist(name: string) {
  const [row] = await db.insert(artists).values({ name }).returning({ id: artists.id });
  return row.id;
}

async function genre(name: string, parentGenreId?: string) {
  const [row] = await db
    .insert(genres)
    .values({ name, parentGenreId: parentGenreId ?? null })
    .returning({ id: genres.id });
  return row.id;
}

async function record(
  title: string,
  artistId: string,
  extra: {
    genreIds?: string[];
    releaseYear?: number;
    spineColour?: string;
    labelId?: string;
    pressingId?: string;
  } = {},
) {
  const [row] = await db
    .insert(records)
    .values({
      title,
      artistId,
      releaseYear: extra.releaseYear ?? null,
      spineColour: extra.spineColour ?? null,
      labelId: extra.labelId ?? null,
      pressingId: extra.pressingId ?? null,
    })
    .returning({ id: records.id });

  for (const genreId of extra.genreIds ?? []) {
    await db.insert(recordGenres).values({ recordId: row.id, genreId });
  }
  return row.id;
}

const titles = async () => (await shelfRecords()).map((r) => r.title);

/** Whether two titles end up next to each other on the wall. */
function adjacent(order: string[], a: string, b: string): boolean {
  return Math.abs(order.indexOf(a) - order.indexOf(b)) === 1;
}

describe('shelfRecords — one continuous wall, ordered by genre', () => {
  it('stands records of the same TOP-LEVEL genre adjacent', async () => {
    /**
     * The load-bearing case. A UK82 record and a US Hardcore record are
     * different scenes and stay so in the data — but on the wall they stand
     * next to each other, because both are punk. A rock record separates them
     * only if the ordering is wrong.
     */
    const punk = await genre('Punk');
    const uk82 = await genre('UK82', punk);
    const hardcore = await genre('US Hardcore', punk);
    const rock = await genre('Rock');

    await record('Damaged', await artist('Black Flag'), { genreIds: [hardcore] });
    await record('Brothers in Arms', await artist('Dire Straits'), { genreIds: [rock] });
    await record('Hear Nothing', await artist('Discharge'), { genreIds: [uk82] });

    const order = await titles();

    expect(adjacent(order, 'Damaged', 'Hear Nothing'), order.join(' | ')).toBe(true);
  });

  it('keeps unrelated genres in separate runs', async () => {
    const punk = await genre('Punk');
    const rock = await genre('Rock');

    await record('Rock A', await artist('A Rock'), { genreIds: [rock] });
    await record('Punk A', await artist('A Punk'), { genreIds: [punk] });
    await record('Rock B', await artist('B Rock'), { genreIds: [rock] });

    // Punk sorts before Rock, so the two rock records are together after it —
    // not interleaved with the punk one.
    expect(await titles()).toEqual(['Punk A', 'Rock A', 'Rock B']);
  });

  it('returns a flat list, with no sections or headings', async () => {
    /**
     * §10b as amended: "no section headings, and no shelf band per genre."
     * Returning sections would invite a caller to render the headings that were
     * removed, so the shape itself rules it out.
     */
    const punk = await genre('Punk');
    await record('Hear Nothing', await artist('Discharge'), { genreIds: [punk] });

    const shelf = await shelfRecords();

    expect(Array.isArray(shelf)).toBe(true);
    expect(shelf[0]).not.toHaveProperty('records');
    expect(shelf[0]).not.toHaveProperty('label');
  });

  it('is byte-identical across calls, so the wall can be scanned by eye', async () => {
    /**
     * §8.2's determinism rule outlived the feature it was written for. A wall
     * that reshuffles between page loads has to be re-scanned every time, which
     * defeats §10b's entire purpose.
     *
     * Inserted in a deliberately unhelpful order so insertion order cannot be
     * what passes this.
     */
    const rock = await genre('Rock');
    const jazz = await genre('Jazz');

    await record('C', await artist('C'), { genreIds: [rock] });
    await record('A', await artist('A'), { genreIds: [jazz] });
    await record('B', await artist('B'), { genreIds: [rock] });

    expect(await titles()).toEqual(await titles());
    expect(await titles()).toEqual(['A', 'B', 'C']);
  });

  it('puts records with no genre at the END, not scattered through the wall', async () => {
    /**
     * They are the leftovers. Scattering them would break the adjacency the
     * ordering exists to create — a genreless record between two punk records
     * separates records that belong together.
     *
     * Not hidden either: §10b's "sparse is fine" and §8.1's honest-absence rule
     * both apply, and a record missing from the wall is worse than one at the
     * end of it.
     */
    const punk = await genre('Punk');
    await record('Uncategorised', await artist('Nobody'));
    await record('Hear Nothing', await artist('Discharge'), { genreIds: [punk] });

    expect(await titles()).toEqual(['Hear Nothing', 'Uncategorised']);
  });

  it('places a record ONCE even when it carries several genres', async () => {
    /**
     * A spine occupies one position on a shelf. The naive join emits the record
     * once per genre, which on a wall is the same record appearing twice.
     */
    const punk = await genre('Punk');
    const rock = await genre('Rock');
    await record('Crossover', await artist('Both'), { genreIds: [punk, rock] });

    expect(await titles()).toEqual(['Crossover']);
  });

  it('breaks a multi-genre tie on the ancestor name, deterministically', async () => {
    /**
     * Which run a crossover record joins is arbitrary; that it is STABLE is
     * not. The rule is the alphabetically-first top-level ancestor, matching
     * §8.1's colour tie-break — two screens ordering one collection by
     * different logic would disagree about what belongs beside what.
     *
     * Punk sorts before Rock, so the crossover stands with the punk record.
     */
    const punk = await genre('Punk');
    const rock = await genre('Rock');

    await record('Pure Rock', await artist('Z Rock'), { genreIds: [rock] });
    await record('Crossover', await artist('A Both'), { genreIds: [rock, punk] });
    await record('Pure Punk', await artist('A Punk'), { genreIds: [punk] });

    expect(await titles()).toEqual(['Crossover', 'Pure Punk', 'Pure Rock']);
  });

  it('survives a cycle in parent_genre_id rather than looping forever', async () => {
    /**
     * `genres.parent_genre_id` has no cycle constraint — the guard is at the
     * application layer (§4.1) — so a→b→a is storable, and an unbounded upward
     * walk hangs the request rather than returning a wrong answer.
     *
     * Mutation-verified: removing `WHERE c.depth < 16` makes this time out.
     */
    const a = await genre('Alpha');
    const b = await genre('Beta', a);
    await db.execute(sql`UPDATE genres SET parent_genre_id = ${b} WHERE id = ${a}`);

    await record('Looped', await artist('Loop'), { genreIds: [b] });

    expect(await titles()).toEqual(['Looped']);
  });
});

describe('shelfRecords — order within a genre run', () => {
  it('orders by artist, then year, then title', async () => {
    /**
     * How a shelf is actually filed: an artist's records together, oldest
     * first. Title breaks a tie so two records of the same year have a stable
     * order rather than the database's.
     */
    const punk = await genre('Punk');
    const discharge = await artist('Discharge');
    const varukers = await artist('The Varukers');

    await record('Bloodsuckers', varukers, { genreIds: [punk], releaseYear: 1986 });
    await record('Why', discharge, { genreIds: [punk], releaseYear: 1981 });
    await record('Hear Nothing', discharge, { genreIds: [punk], releaseYear: 1982 });
    await record('Aardvark', discharge, { genreIds: [punk], releaseYear: 1982 });

    expect(await titles()).toEqual(['Why', 'Aardvark', 'Hear Nothing', 'Bloodsuckers']);
  });

  it('places a record with no year after that artist’s dated ones', async () => {
    /**
     * Absent, not zero. Sorting NULL as 0 would file every undated record at
     * the head of its artist, in front of records genuinely older — asserting a
     * date nobody entered.
     */
    const punk = await genre('Punk');
    const discharge = await artist('Discharge');

    await record('Undated', discharge, { genreIds: [punk] });
    await record('Why', discharge, { genreIds: [punk], releaseYear: 1981 });

    expect(await titles()).toEqual(['Why', 'Undated']);
  });
});

describe('shelfRecords — what a spine needs', () => {
  it('carries artist, title, catalogue number, year, label and colour', async () => {
    /**
     * §10b: spine text is "artist, title and catalogue number"; hover names
     * "artist, title, year, label". Everything a spine and its label need
     * arrives in ONE query — a wall that fetched a label per spine would issue
     * a request per record on a screen whose whole point is showing many.
     */
    const punk = await genre('Punk');
    const [label] = await db
      .insert(labels)
      .values({ name: 'Clay Records' })
      .returning({ id: labels.id });
    const [pressing] = await db
      .insert(pressings)
      .values({ catalogNumber: 'CLAYLP 3' })
      .returning({ id: pressings.id });

    await record('Hear Nothing', await artist('Discharge'), {
      genreIds: [punk],
      releaseYear: 1982,
      spineColour: '#363129',
      labelId: label.id,
      pressingId: pressing.id,
    });

    const [row] = await shelfRecords();

    expect(row).toMatchObject({
      title: 'Hear Nothing',
      artistName: 'Discharge',
      releaseYear: 1982,
      labelName: 'Clay Records',
      catalogNumber: 'CLAYLP 3',
      spineColour: '#363129',
    });
    expect(row.id, 'clicking a spine needs the id').toEqual(expect.any(String));
  });

  it('reports a missing colour as null rather than a default', async () => {
    // §10b: "a record with no cover gets a plain spine — an honest absence, not
    // a gap in the wall." A default here would be indistinguishable from a
    // genuinely dark sleeve, and the DEFAULT belongs to the renderer.
    const punk = await genre('Punk');
    await record('No cover', await artist('Discharge'), { genreIds: [punk] });

    expect((await shelfRecords())[0].spineColour).toBeNull();
  });

  it('reports a missing catalogue number and label as null, not empty strings', async () => {
    // The quick in-store entry (§10) leaves both blank, and it is the common
    // case rather than an edge. An empty string would render as a gap the
    // reader has to interpret.
    const punk = await genre('Punk');
    await record('Bare', await artist('Discharge'), { genreIds: [punk] });

    const [row] = await shelfRecords();
    expect(row.catalogNumber).toBeNull();
    expect(row.labelName).toBeNull();
  });
});

describe('shelfRecords — scope', () => {
  it('returns an empty array for an empty collection', async () => {
    // §10b: "sparse is fine … the view does not pad, fake, or hide itself."
    // Zero records is an empty wall, not a placeholder.
    expect(await shelfRecords()).toEqual([]);
  });

  it('shows OWNED records only, never want-list items', async () => {
    /**
     * The shelf is what is on the shelf. §8.1 drew the same line for the graph
     * and the reasoning carries: a want-list item is a record you do not have,
     * and standing it among the ones you do would make the wall a claim about
     * something else.
     */
    const punk = await genre('Punk');
    const discharge = await artist('Discharge');
    await record('Hear Nothing', discharge, { genreIds: [punk] });

    await db.execute(
      sql`INSERT INTO want_list (title, artist_id) VALUES ('Never Again', ${discharge})`,
    );

    expect(await titles()).toEqual(['Hear Nothing']);
  });
});

describe('shelfRecords — what pulling a record needs (§10b)', () => {
  /**
   * §10b: clicking a spine pulls the record into view, front cover forward, and
   * turning it shows the back — "label, catalogue number, pressing details,
   * matrix runout, condition, what was paid and where".
   *
   * All of it arrives in the SAME query as the spines. The alternative is a
   * fetch per record when one is pulled, which on a wall of three hundred
   * spines is three hundred possible requests for a screen whose point is
   * immediacy.
   */
  it('carries the cover image for the front face', async () => {
    const punk = await genre('Punk');
    const id = await record('Hear Nothing', await artist('Discharge'), { genreIds: [punk] });

    await db.insert(images).values({
      recordId: id,
      url: 'https://blob.example/cover.jpg',
      imageType: 'cover',
    });

    expect((await shelfRecords())[0].coverUrl).toBe('https://blob.example/cover.jpg');
  });

  it('carries a photographed back when one exists', async () => {
    // §10b: "where a photographed back exists, it is used instead, with the
    // same details beside it."
    const punk = await genre('Punk');
    const id = await record('Hear Nothing', await artist('Discharge'), { genreIds: [punk] });

    await db.insert(images).values({
      recordId: id,
      url: 'https://blob.example/back.jpg',
      imageType: 'back',
    });

    expect((await shelfRecords())[0].backUrl).toBe('https://blob.example/back.jpg');
  });

  it('reports a missing back as null — the details render instead', async () => {
    /**
     * The common case by a wide margin: a Discogs import brings a front cover
     * and nothing else. §10b's whole point is that this record is still
     * two-sided, with the back composed from stored fields.
     */
    const punk = await genre('Punk');
    await record('Hear Nothing', await artist('Discharge'), { genreIds: [punk] });

    expect((await shelfRecords())[0].backUrl).toBeNull();
  });

  it('carries a gatefold ONLY when one has been photographed', async () => {
    /**
     * §10b: "the state exists only where an inner image has been photographed.
     * There is no generated stand-in: the point of a gatefold is the artwork
     * inside it, and a panel of pressing details folded open where a photograph
     * should be would be inventing the thing the user came to see."
     *
     * So this field IS the affordance — its presence is what makes the hinge
     * appear, and nothing else may.
     */
    const punk = await genre('Punk');
    const plain = await record('No gatefold', await artist('A'), { genreIds: [punk] });
    const folds = await record('Gatefold', await artist('B'), { genreIds: [punk] });

    await db.insert(images).values({
      recordId: folds,
      url: 'https://blob.example/inner.jpg',
      imageType: 'gatefold',
    });

    const shelf = await shelfRecords();
    const byId = new Map(shelf.map((row) => [row.id, row]));

    expect(byId.get(plain)?.gatefoldUrl, 'no inner image, no affordance').toBeNull();
    expect(byId.get(folds)?.gatefoldUrl).toBe('https://blob.example/inner.jpg');
  });

  it('carries the pressing and purchase fields the back face renders', async () => {
    const punk = await genre('Punk');
    const [label] = await db
      .insert(labels)
      .values({ name: 'Clay Records' })
      .returning({ id: labels.id });
    const [pressing] = await db
      .insert(pressings)
      .values({
        catalogNumber: 'CLAYLP 3',
        matrixRunout: 'CLAYLP3 A1',
        yearPressed: 1982,
        countryPressed: 'UK',
        isReissue: true,
      })
      .returning({ id: pressings.id });

    await record('Hear Nothing', await artist('Discharge'), {
      genreIds: [punk],
      labelId: label.id,
      pressingId: pressing.id,
    });

    expect((await shelfRecords())[0]).toMatchObject({
      matrixRunout: 'CLAYLP3 A1',
      yearPressed: 1982,
      countryPressed: 'UK',
      isReissue: true,
    });
  });

  it('takes the OLDEST image of each type, matching the gallery', async () => {
    /**
     * A record can have two covers. The gallery orders within a type oldest
     * first — "the first upload stays first" — and the shelf must agree, or the
     * front of a pulled record differs from the first image of its gallery.
     */
    const punk = await genre('Punk');
    const id = await record('Hear Nothing', await artist('Discharge'), { genreIds: [punk] });

    await db.insert(images).values({
      recordId: id,
      url: 'https://blob.example/first.jpg',
      imageType: 'cover',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await db.insert(images).values({
      recordId: id,
      url: 'https://blob.example/second.jpg',
      imageType: 'cover',
      createdAt: new Date('2026-06-01T00:00:00Z'),
    });

    expect((await shelfRecords())[0].coverUrl).toBe('https://blob.example/first.jpg');
  });

  it('does not multiply a record by its images', async () => {
    /**
     * The join hazard. Three images on one record must not put three spines on
     * the wall — the same failure the multi-genre join had, one table over.
     */
    const punk = await genre('Punk');
    const id = await record('Hear Nothing', await artist('Discharge'), { genreIds: [punk] });

    for (const type of ['cover', 'back', 'gatefold'] as const) {
      await db.insert(images).values({
        recordId: id,
        url: `https://blob.example/${type}.jpg`,
        imageType: type,
      });
    }

    expect(await titles()).toEqual(['Hear Nothing']);
  });
});
