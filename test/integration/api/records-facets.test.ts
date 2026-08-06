import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as getFacets } from '@/app/api/records/facets/route';
import { GET as getStats } from '@/app/api/records/stats/route';
import { GET as listRecords } from '@/app/api/records/route';

/**
 * SPEC.md §5.2 `GET /api/records/facets` — the values worth filtering by.
 *
 * The rule this file exists to protect: **a count must match what clicking the
 * chip returns.** A `Punk (12)` chip that yields 8 rows is the
 * confidently-misleading class CLAUDE.md §8 is about, and it is invisible to
 * any test that checks the count and the filter separately.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const request = (url: string) => new Request(`https://x.test${url}`);

type Facet = { id: string; name: string; count: number };
type Facets = { genres: Facet[]; labels: Facet[]; stores: Facet[]; tags: Facet[] };

async function facets(): Promise<Facets> {
  const response = await getFacets(request('/api/records/facets'));
  expect(response.status).toBe(200);
  return response.json();
}

const id = async (statement: ReturnType<typeof sql>) =>
  (await db.execute<{ id: string }>(statement)).rows[0].id;

const byName = (list: Facet[]) => Object.fromEntries(list.map((f) => [f.name, f.count]));

/**
 * Punk > UK82 > Oi!, plus Crust as a sibling of UK82 — three levels, because
 * two cannot distinguish a recursive rollup from a single join (NOTES.md's
 * fixture rule). Records sit at every level, and one genre is deliberately
 * UNUSED so the "only what is present" rule has something to exclude.
 */
type Hierarchy = {
  punk: string;
  uk82: string;
  oi: string;
  crust: string;
  unused: string;
  clay: string;
  amoeba: string;
  signed: string;
};

async function seed(): Promise<Hierarchy> {
  const artist = await id(sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`);

  const punk = await id(sql`INSERT INTO genres (name) VALUES ('Punk') RETURNING id`);
  const uk82 = await id(
    sql`INSERT INTO genres (name, parent_genre_id) VALUES ('UK82', ${punk}) RETURNING id`,
  );
  const oi = await id(
    sql`INSERT INTO genres (name, parent_genre_id) VALUES ('Oi', ${uk82}) RETURNING id`,
  );
  const crust = await id(
    sql`INSERT INTO genres (name, parent_genre_id) VALUES ('Crust', ${punk}) RETURNING id`,
  );
  const unused = await id(sql`INSERT INTO genres (name) VALUES ('Unused') RETURNING id`);

  const clay = await id(sql`INSERT INTO labels (name) VALUES ('Clay') RETURNING id`);
  await id(sql`INSERT INTO labels (name) VALUES ('Unused Label') RETURNING id`);
  const amoeba = await id(sql`INSERT INTO record_stores (name) VALUES ('Amoeba') RETURNING id`);
  const signed = await id(sql`INSERT INTO tags (name) VALUES ('signed') RETURNING id`);
  await id(sql`INSERT INTO tags (name) VALUES ('unused tag') RETURNING id`);

  const record = async (title: string, genreId: string, labelId?: string) => {
    const rid = await id(
      sql`INSERT INTO records (artist_id, title, label_id, store_id)
          VALUES (${artist}, ${title}, ${labelId ?? null}, ${amoeba}) RETURNING id`,
    );
    await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${rid}, ${genreId})`);
    return rid;
  };

  const deep = await record('Tagged Oi', oi, clay);
  await db.execute(sql`INSERT INTO record_tags (record_id, tag_id) VALUES (${deep}, ${signed})`);
  await record('Tagged UK82', uk82, clay);
  await record('Tagged Crust', crust);

  return { punk, uk82, oi, crust, unused, clay, amoeba, signed };
}

describe('GET /api/records/facets — what is present', () => {
  it('returns only genres appearing on at least one record', async () => {
    const h = await seed();

    const names = (await facets()).genres.map((g) => g.name);

    expect(names).not.toContain('Unused');
    expect(names).toEqual(expect.arrayContaining(['Punk', 'UK82', 'Oi', 'Crust']));
    expect(h.unused).toBeDefined();
  });

  it('excludes unused labels and tags too', async () => {
    await seed();
    const result = await facets();

    expect(result.labels.map((l) => l.name)).toEqual(['Clay']);
    expect(result.tags.map((t) => t.name)).toEqual(['signed']);
  });

  it('returns empty arrays for an empty collection rather than nulls', async () => {
    const result = await facets();

    expect(result).toEqual({ genres: [], labels: [], stores: [], tags: [] });
  });

  it('counts labels and stores by the records that use them', async () => {
    await seed();
    const result = await facets();

    // Two records carry Clay; all three carry Amoeba.
    expect(byName(result.labels)).toEqual({ Clay: 2 });
    expect(byName(result.stores)).toEqual({ Amoeba: 3 });
  });
});

describe('GET /api/records/facets — §7.1 genre rollup', () => {
  it('rolls a descendant-tagged record up into every ancestor', async () => {
    await seed();

    // Punk gets all three; UK82 gets the two in its subtree; Oi and Crust one
    // each. A single join would give Punk 2 and miss the Oi record entirely.
    expect(byName((await facets()).genres)).toEqual({ Punk: 3, UK82: 2, Oi: 1, Crust: 1 });
  });

  it('includes an ancestor no record is tagged with directly', async () => {
    // §5.2: "a genre appears if any descendant is used". Nothing is tagged
    // Punk here, yet Punk (3) is exactly what a user wants to click.
    await seed();

    const punk = (await facets()).genres.find((g) => g.name === 'Punk');

    expect(punk?.count).toBe(3);
  });

  it('counts a record once per genre even when tagged with two in one subtree', async () => {
    const h = await seed();
    const deep = await id(sql`SELECT id FROM records WHERE title = 'Tagged Oi'`);
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${deep}, ${h.punk})`,
    );

    // Still 3 for Punk: the record reaches it directly AND via Oi -> UK82, and
    // it is one record either way.
    expect(byName((await facets()).genres).Punk).toBe(3);
  });
});

/**
 * THE AGREEMENT TEST.
 *
 * `facets.genres` and `stats.byGenre` both roll records up through §7.1. They
 * must agree for every genre, or one screen contradicts another about how many
 * punk records exist. Sharing the rollup makes them agree by construction; this
 * test is what fails if either implementation drifts from the other.
 *
 * NOTE the deliberate asymmetry: stats.byGenre only lists genres a record rolls
 * up into, so it and facets should carry the SAME genre set. That is asserted
 * too — a facets entry missing from stats is a disagreement even if every
 * shared count matches.
 */
describe('facets.genres agrees with stats.byGenre', () => {
  async function statsByGenre(): Promise<Record<string, number>> {
    const response = await getStats(request('/api/records/stats'));
    const body = await response.json();
    return Object.fromEntries(
      (body.byGenre as Array<{ name: string; count: number }>).map((row) => [row.name, row.count]),
    );
  }

  it('produces identical counts for every genre', async () => {
    await seed();

    expect(byName((await facets()).genres)).toEqual(await statsByGenre());
  });

  it('still agrees when a record is tagged at several levels at once', async () => {
    const h = await seed();
    const deep = await id(sql`SELECT id FROM records WHERE title = 'Tagged Oi'`);
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${deep}, ${h.punk})`,
    );
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${deep}, ${h.crust})`,
    );

    expect(byName((await facets()).genres)).toEqual(await statsByGenre());
  });

  it('still agrees when a genre has no records at all', async () => {
    // Both must OMIT it rather than one listing it at zero.
    await seed();

    expect(byName((await facets()).genres)).toEqual(await statsByGenre());
  });
});

/**
 * The rule the whole endpoint exists for: the number on a chip must equal the
 * number of rows clicking it returns. Asserted against the LIST endpoint, so a
 * drift between the facet rollup and the filter's subtree walk fails here even
 * though each is individually self-consistent.
 */
describe('every facet count matches what filtering by it returns', () => {
  it('holds for each genre, including ancestors', async () => {
    await seed();
    const result = await facets();

    for (const genre of result.genres) {
      const response = await listRecords(request(`/api/records?genreId=${genre.id}&pageSize=200`));
      const body = await response.json();

      expect(body.meta.total, `genre ${genre.name}`).toBe(genre.count);
    }
  });

  it('holds for labels, stores and tags', async () => {
    await seed();
    const result = await facets();

    const cases: Array<[string, Facet[]]> = [
      ['labelId', result.labels],
      ['storeId', result.stores],
      ['tagId', result.tags],
    ];

    for (const [param, list] of cases) {
      for (const facet of list) {
        const response = await listRecords(request(`/api/records?${param}=${facet.id}&pageSize=200`));
        const body = await response.json();

        expect(body.meta.total, `${param} ${facet.name}`).toBe(facet.count);
      }
    }
  });
});

describe('GET /api/records/facets — ordering', () => {
  it('sorts by count descending, then name ascending', async () => {
    await seed();
    const genres = (await facets()).genres;

    expect(genres.map((g) => [g.name, g.count])).toEqual([
      ['Punk', 3],
      ['UK82', 2],
      // Equal counts, so alphabetical: Crust before Oi.
      ['Crust', 1],
      ['Oi', 1],
    ]);
  });
});
