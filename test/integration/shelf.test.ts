import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, genres, labels, pressings, records, recordGenres } from '@/db/schema';
import { shelfRecords } from '@/lib/db/queries/shelf';

/**
 * SPEC.md §10b's shelf ordering.
 *
 * "Records stand as spines, ordered by genre so the shelf reads as sections:
 * all the punk together, all the rock together. **That ordering is the shelf's
 * own, not a proposal for the physical one.**"
 *
 * **Sections are TOP-LEVEL genres, not the genres a record carries.** UK82 and
 * US Hardcore are different scenes (§8, and this project will not flatten them)
 * — they stay distinct on the record and in every filter, and they stand
 * together on the shelf because both are Punk. Sectioning by the tagged genre
 * instead would put two shelves of punk at opposite ends of the wall, which is
 * the opposite of what §10b asks for.
 *
 * This is the same rule §8.1's graph used to colour an artist, and deliberately
 * so: two screens grouping the same collection by different genre logic would
 * disagree about what belongs together.
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
  extra: { genreIds?: string[]; releaseYear?: number; spineColour?: string; labelId?: string; pressingId?: string } = {},
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

const titles = (sections: Awaited<ReturnType<typeof shelfRecords>>) =>
  sections.flatMap((section) => section.records.map((r) => r.title));

describe('shelfRecords — sections', () => {
  it('groups records under their TOP-LEVEL genre, not the one they carry', async () => {
    /**
     * The load-bearing case. A record tagged UK82 and one tagged US Hardcore are
     * different scenes and must stay so in the data — but on a shelf they stand
     * together, because both are punk.
     */
    const punk = await genre('Punk');
    const uk82 = await genre('UK82', punk);
    const hardcore = await genre('US Hardcore', punk);

    const discharge = await artist('Discharge');
    const blackFlag = await artist('Black Flag');
    await record('Hear Nothing', discharge, { genreIds: [uk82] });
    await record('Damaged', blackFlag, { genreIds: [hardcore] });

    const sections = await shelfRecords();

    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('Punk');
    expect(sections[0].records).toHaveLength(2);
  });

  it('keeps unrelated top-level genres in separate sections', async () => {
    const punk = await genre('Punk');
    const rock = await genre('Rock');

    await record('Hear Nothing', await artist('Discharge'), { genreIds: [punk] });
    await record('Brothers in Arms', await artist('Dire Straits'), { genreIds: [rock] });

    const sections = await shelfRecords();

    expect(sections.map((s) => s.label)).toEqual(['Punk', 'Rock']);
  });

  it('orders sections by name, so the wall is the same on every load', async () => {
    /**
     * §8.2's determinism rule, which outlived the feature it was written for:
     * "the same collection must always produce the same order". A shelf that
     * reshuffles between page loads is useless for finding a record by eye,
     * which is the entire point of §10b.
     *
     * Inserted in reverse so insertion order cannot be what passes this.
     */
    const rock = await genre('Rock');
    const jazz = await genre('Jazz');
    const punk = await genre('Punk');

    await record('C', await artist('C'), { genreIds: [rock] });
    await record('A', await artist('A'), { genreIds: [jazz] });
    await record('B', await artist('B'), { genreIds: [punk] });

    expect((await shelfRecords()).map((s) => s.label)).toEqual(['Jazz', 'Punk', 'Rock']);
  });

  it('puts records with no genre in their own section, last and named', async () => {
    /**
     * §10b's "sparse is fine" and §8.1's honest-absence rule. A record with no
     * genre is not hidden and not silently filed under something — it stands in
     * a section that says what it is.
     *
     * Last, because it is the leftovers, and a section called "No genre" sorted
     * alphabetically into the middle of the wall would read as a genre.
     */
    const punk = await genre('Punk');
    await record('Hear Nothing', await artist('Discharge'), { genreIds: [punk] });
    await record('Uncategorised', await artist('Nobody'));

    const sections = await shelfRecords();

    expect(sections.map((s) => s.label)).toEqual(['Punk', 'No genre']);
    expect(sections[1].genreId, 'the bucket is not a real genre').toBeNull();
  });

  it('does not emit an empty leftovers section when every record has a genre', async () => {
    // An empty heading asserts something is missing. Nothing is the honest
    // rendering of nothing — the same rule the gallery follows.
    const punk = await genre('Punk');
    await record('Hear Nothing', await artist('Discharge'), { genreIds: [punk] });

    expect((await shelfRecords()).map((s) => s.label)).toEqual(['Punk']);
  });

  it('files a record under ONE section even when it carries several genres', async () => {
    /**
     * A spine occupies one position on a shelf. A record tagged both Punk and
     * Rock cannot stand in two places, so the query picks one — and must not
     * emit the record twice, which is what a naive join produces.
     */
    const punk = await genre('Punk');
    const rock = await genre('Rock');
    await record('Crossover', await artist('Both'), { genreIds: [punk, rock] });

    const sections = await shelfRecords();

    expect(titles(sections)).toEqual(['Crossover']);
  });

  it('breaks a multi-genre tie on the ancestor name, deterministically', async () => {
    /**
     * Which section wins is arbitrary; that it is STABLE is not. The rule is
     * the alphabetically-first top-level ancestor, matching §8.1's colour
     * tie-break — two screens grouping the same collection by different logic
     * would disagree about what belongs together.
     */
    const punk = await genre('Punk');
    const rock = await genre('Rock');
    await record('Crossover', await artist('Both'), { genreIds: [rock, punk] });

    expect((await shelfRecords())[0].label).toBe('Punk');
  });

  it('survives a cycle in parent_genre_id rather than looping forever', async () => {
    /**
     * `genres.parent_genre_id` has no cycle constraint — the guard is at the
     * application layer (§4.1), so a→b→a is storable and a walk without a
     * termination guard hangs the request rather than returning a wrong answer.
     */
    const a = await genre('Alpha');
    const b = await genre('Beta', a);
    await db.execute(sql`UPDATE genres SET parent_genre_id = ${b} WHERE id = ${a}`);

    await record('Looped', await artist('Loop'), { genreIds: [b] });

    const sections = await shelfRecords();
    expect(titles(sections)).toEqual(['Looped']);
  });
});

describe('shelfRecords — order within a section', () => {
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

    expect(titles(await shelfRecords())).toEqual([
      'Why',
      'Aardvark',
      'Hear Nothing',
      'Bloodsuckers',
    ]);
  });

  it('places a record with no year after that artist’s dated ones', async () => {
    /**
     * Absent, not zero. Sorting NULL as 0 would file every undated record at
     * the head of its artist, in front of records genuinely older — asserting a
     * date nobody entered. NULLS LAST says "we do not know" instead.
     */
    const punk = await genre('Punk');
    const discharge = await artist('Discharge');

    await record('Undated', discharge, { genreIds: [punk] });
    await record('Why', discharge, { genreIds: [punk], releaseYear: 1981 });

    expect(titles(await shelfRecords())).toEqual(['Why', 'Undated']);
  });
});

describe('shelfRecords — what a spine needs', () => {
  it('carries artist, title, catalogue number, year, label and colour', async () => {
    /**
     * §10b: spine text is "artist, title and catalogue number"; hover names
     * "artist, title, year, label". Everything a spine and its label need
     * arrives in ONE query — a shelf that fetched a label per spine would issue
     * a request per record on a screen whose whole point is showing many at
     * once.
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

    const [row] = (await shelfRecords())[0].records;

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
    // genuinely dark sleeve.
    const punk = await genre('Punk');
    await record('No cover', await artist('Discharge'), { genreIds: [punk] });

    expect((await shelfRecords())[0].records[0].spineColour).toBeNull();
  });

  it('reports a missing catalogue number and label as null, not empty strings', async () => {
    // The quick in-store entry (§10) leaves both blank, and it is the common
    // case rather than an edge. An empty string would render as a gap the
    // reader has to interpret.
    const punk = await genre('Punk');
    await record('Bare', await artist('Discharge'), { genreIds: [punk] });

    const [row] = (await shelfRecords())[0].records;
    expect(row.catalogNumber).toBeNull();
    expect(row.labelName).toBeNull();
  });
});

describe('shelfRecords — scope', () => {
  it('returns an empty array for an empty collection', async () => {
    // §10b: "sparse is fine … the view does not pad, fake, or hide itself."
    // Zero records is zero sections, not a placeholder wall.
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

    expect(titles(await shelfRecords())).toEqual(['Hear Nothing']);
  });
});
