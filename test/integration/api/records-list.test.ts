import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as listRecords } from '@/app/api/records/route';

/**
 * SPEC.md §5.2 `GET /api/records` — ten filters, `q` fuzzy across two tables,
 * and a sort on `artist` that needs a join.
 *
 * The defect this file is built to catch is filters that pass INDIVIDUALLY and
 * misbehave in COMBINATION: an OR/AND precedence error widens the result set
 * instead of narrowing it, and every single-filter test still passes. So the
 * combination cases are first-class here, including two filters selecting
 * disjoint sets — where the correct answer is an empty result, not an
 * unfiltered one.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

function request(url: string): Request {
  return new Request(`https://x.test${url}`);
}

async function names(url: string): Promise<string[]> {
  const response = await listRecords(request(url));
  const body = await response.json();
  return body.data.map((row: { title: string }) => row.title).sort();
}

type Seeded = {
  discharge: string;
  amebix: string;
  clay: string;
  spiderleg: string;
  lp: string;
  single: string;
  amoeba: string;
  rough: string;
  uk82: string;
  crust: string;
  signed: string;
  gift: string;
};

/**
 * Two artists, two labels, two formats, two stores, two genres, two tags — so
 * every filter has both a matching and a non-matching row, and any pair can be
 * combined to select a disjoint set.
 */
async function seed(): Promise<Seeded> {
  const id = async (statement: ReturnType<typeof sql>) =>
    (await db.execute<{ id: string }>(statement)).rows[0].id;

  const discharge = await id(sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`);
  const amebix = await id(sql`INSERT INTO artists (name) VALUES ('Amebix') RETURNING id`);
  const clay = await id(sql`INSERT INTO labels (name) VALUES ('Clay') RETURNING id`);
  const spiderleg = await id(sql`INSERT INTO labels (name) VALUES ('Spiderleg') RETURNING id`);
  const lp = await id(sql`SELECT id FROM formats WHERE name = 'LP'`);
  const single = await id(sql`SELECT id FROM formats WHERE name = '7"'`);
  const amoeba = await id(sql`INSERT INTO record_stores (name) VALUES ('Amoeba') RETURNING id`);
  const rough = await id(sql`INSERT INTO record_stores (name) VALUES ('Rough Trade') RETURNING id`);
  const uk82 = await id(sql`INSERT INTO genres (name) VALUES ('UK82') RETURNING id`);
  const crust = await id(sql`INSERT INTO genres (name) VALUES ('Crust') RETURNING id`);
  const signed = await id(sql`INSERT INTO tags (name) VALUES ('signed') RETURNING id`);
  const gift = await id(sql`INSERT INTO tags (name) VALUES ('gift') RETURNING id`);

  // Discharge / Clay / LP / Amoeba / UK82 / signed / 1982 / VG+ / £24.50
  const hearNothing = await id(
    sql`INSERT INTO records (artist_id, label_id, format_id, store_id, title, release_year,
                             condition_media, purchase_price, purchase_date)
        VALUES (${discharge}, ${clay}, ${lp}, ${amoeba}, 'Hear Nothing See Nothing Say Nothing',
                1982, 'VG+', 24.50, '2024-03-01') RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${hearNothing}, ${uk82})`,
  );
  await db.execute(
    sql`INSERT INTO record_tags (record_id, tag_id) VALUES (${hearNothing}, ${signed})`,
  );

  // Amebix / Spiderleg / 7" / Rough Trade / Crust / gift / 1985 / G / £8.00
  const arise = await id(
    sql`INSERT INTO records (artist_id, label_id, format_id, store_id, title, release_year,
                             condition_media, purchase_price, purchase_date)
        VALUES (${amebix}, ${spiderleg}, ${single}, ${rough}, 'Arise!',
                1985, 'G', 8.00, '2023-01-01') RETURNING id`,
  );
  await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${arise}, ${crust})`);
  await db.execute(sql`INSERT INTO record_tags (record_id, tag_id) VALUES (${arise}, ${gift})`);

  return {
    discharge, amebix, clay, spiderleg, lp, single,
    amoeba, rough, uk82, crust, signed, gift,
  };
}

describe('GET /api/records — envelope and paging', () => {
  it('returns the §5 list envelope', async () => {
    await seed();

    const response = await listRecords(request('/api/records'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta).toEqual({ total: 2, page: 1, pageSize: 50 });
    expect(body.data).toHaveLength(2);
  });

  it('rejects an out-of-range page with 400, never reaching SQL', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const response = await listRecords(request('/api/records?page=99999999999999999999'));

    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports the FILTERED total, not the table total', async () => {
    // A count that ignores the filters makes pagination lie: page 2 of a
    // one-result filter would appear to exist.
    await seed();

    const response = await listRecords(request('/api/records?condition=VG%2B'));
    const body = await response.json();

    expect(body.meta.total).toBe(1);
    expect(body.data).toHaveLength(1);
  });
});

describe('GET /api/records — individual filters', () => {
  it('filters by each structural field', async () => {
    const s = await seed();

    const cases: Array<[string, string[]]> = [
      [`artistId=${s.discharge}`, ['Hear Nothing See Nothing Say Nothing']],
      [`labelId=${s.spiderleg}`, ['Arise!']],
      [`formatId=${s.lp}`, ['Hear Nothing See Nothing Say Nothing']],
      [`storeId=${s.rough}`, ['Arise!']],
      [`genreId=${s.uk82}`, ['Hear Nothing See Nothing Say Nothing']],
      [`tagId=${s.gift}`, ['Arise!']],
      ['condition=VG%2B', ['Hear Nothing See Nothing Say Nothing']],
      ['yearFrom=1984', ['Arise!']],
      ['yearTo=1983', ['Hear Nothing See Nothing Say Nothing']],
    ];

    for (const [query, expected] of cases) {
      expect(await names(`/api/records?${query}`), query).toEqual(expected);
    }
  });

  it('treats yearFrom and yearTo as an inclusive range', async () => {
    await seed();

    expect(await names('/api/records?yearFrom=1982&yearTo=1982')).toEqual([
      'Hear Nothing See Nothing Say Nothing',
    ]);
    expect(await names('/api/records?yearFrom=1982&yearTo=1985')).toHaveLength(2);
  });

  it('rejects an unknown condition value rather than ignoring it', async () => {
    // Silently dropping an unrecognised filter returns MORE rows than asked
    // for, which reads as success.
    const response = await listRecords(request('/api/records?condition=MINT'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.condition).toBeDefined();
  });

  it('rejects a non-UUID filter id rather than attempting a lookup', async () => {
    for (const field of ['artistId', 'labelId', 'formatId', 'storeId', 'genreId', 'tagId']) {
      const response = await listRecords(request(`/api/records?${field}=not-a-uuid`));
      expect(response.status, field).toBe(400);
    }
  });

  it('returns an empty list for a filter that matches nothing', async () => {
    await seed();

    const body = await (
      await listRecords(request('/api/records?artistId=00000000-0000-4000-8000-000000000000'))
    ).json();

    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });
});

/**
 * The combination cases. Every filter above passes alone; these are what catch
 * an AND/OR precedence error, which WIDENS the result set rather than narrowing
 * it and therefore looks like "the filter did nothing" rather than an error.
 */
describe('GET /api/records — filters in combination', () => {
  it('narrows when two filters select the SAME row', async () => {
    const s = await seed();

    expect(await names(`/api/records?artistId=${s.discharge}&formatId=${s.lp}`)).toEqual([
      'Hear Nothing See Nothing Say Nothing',
    ]);
  });

  /**
   * Disjoint filters: Discharge owns the LP, Amebix owns the 7". Asking for
   * Discharge AND the 7" must return NOTHING.
   *
   * An OR would return both rows; a dropped filter would return one. Only AND
   * returns zero, so this single case distinguishes all three.
   */
  it('returns EMPTY when two filters select disjoint sets', async () => {
    const s = await seed();

    const body = await (
      await listRecords(request(`/api/records?artistId=${s.discharge}&formatId=${s.single}`))
    ).json();

    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('returns EMPTY for disjoint junction filters', async () => {
    // Genre and tag both go through junction tables, so a join written as OR
    // here is especially easy to get wrong.
    const s = await seed();

    const body = await (
      await listRecords(request(`/api/records?genreId=${s.uk82}&tagId=${s.gift}`))
    ).json();

    expect(body.data).toEqual([]);
  });

  it('combines a junction filter with a structural one', async () => {
    const s = await seed();

    expect(await names(`/api/records?genreId=${s.crust}&storeId=${s.rough}`)).toEqual(['Arise!']);
    expect(await names(`/api/records?genreId=${s.crust}&storeId=${s.amoeba}`)).toEqual([]);
  });

  it('combines three filters without widening', async () => {
    const s = await seed();

    expect(
      await names(`/api/records?artistId=${s.amebix}&genreId=${s.crust}&tagId=${s.gift}`),
    ).toEqual(['Arise!']);

    // One wrong member of the trio empties the result.
    expect(
      await names(`/api/records?artistId=${s.amebix}&genreId=${s.uk82}&tagId=${s.gift}`),
    ).toEqual([]);
  });

  it('applies a year range together with a structural filter', async () => {
    const s = await seed();

    expect(await names(`/api/records?artistId=${s.amebix}&yearFrom=1984`)).toEqual(['Arise!']);
    expect(await names(`/api/records?artistId=${s.amebix}&yearTo=1983`)).toEqual([]);
  });
});

/**
 * `q` is fuzzy across records.title AND artists.name (§5.2).
 *
 * Verified against the database before designing: trigram `%` alone is NOT
 * sufficient. `similarity('hear', 'Hear Nothing See Nothing Say Nothing')` is
 * 0.25, below the default 0.3 threshold, because a short query is diluted by a
 * long title — so a user typing a real prefix would get nothing. The
 * implementation therefore matches trigram OR substring.
 */
describe('GET /api/records — fuzzy q', () => {
  it('matches a title substring a trigram alone would miss', async () => {
    await seed();

    expect(await names('/api/records?q=hear')).toEqual([
      'Hear Nothing See Nothing Say Nothing',
    ]);
  });

  it('matches a misspelled title via trigram similarity', async () => {
    await seed();

    // 'Nothin' is not a substring of the title (no trailing g), so a substring
    // match alone would miss it.
    expect(await names('/api/records?q=Notthing')).toEqual([
      'Hear Nothing See Nothing Say Nothing',
    ]);
  });

  it('matches on the ARTIST name, not only the title', async () => {
    await seed();

    expect(await names('/api/records?q=Amebix')).toEqual(['Arise!']);
  });

  it('matches a misspelled artist name', async () => {
    await seed();

    expect(await names('/api/records?q=Dischrge')).toEqual([
      'Hear Nothing See Nothing Say Nothing',
    ]);
  });

  it('is case-insensitive', async () => {
    await seed();

    expect(await names('/api/records?q=DISCHARGE')).toEqual([
      'Hear Nothing See Nothing Say Nothing',
    ]);
  });

  it('returns an empty list when nothing matches', async () => {
    await seed();

    expect(await names('/api/records?q=zzzzzzzz')).toEqual([]);
  });

  /**
   * The precedence case, called out explicitly.
   *
   * `q` is internally an OR (title OR artist). Combined with a structural
   * filter it must AND with it — `(title ~ q OR artist ~ q) AND artistId = X`.
   * Written without the parentheses, the AND binds to the last OR branch only
   * and the result set WIDENS: rows matching the title but failing the
   * structural filter come back anyway.
   */
  it('ANDs q with a structural filter rather than widening', async () => {
    const s = await seed();

    // 'Nothing' matches only the Discharge title. Combined with the Amebix
    // artist filter the answer is empty — a precedence error returns the
    // Discharge row.
    const body = await (
      await listRecords(request(`/api/records?q=Nothing&artistId=${s.amebix}`))
    ).json();

    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('ANDs q with a junction filter rather than widening', async () => {
    const s = await seed();

    expect(await names(`/api/records?q=Nothing&genreId=${s.uk82}`)).toEqual([
      'Hear Nothing See Nothing Say Nothing',
    ]);
    expect(await names(`/api/records?q=Nothing&genreId=${s.crust}`)).toEqual([]);
  });

  it('ANDs an artist-matching q with a disjoint structural filter', async () => {
    // The mirror case: q matches via the ARTIST branch of the OR, so a
    // precedence error on that side is caught too.
    const s = await seed();

    expect(await names(`/api/records?q=Discharge&formatId=${s.single}`)).toEqual([]);
  });
});

/**
 * `sort=artist` has no column on `records` to map to — it resolves through a
 * join. The sortColumns record every other resource uses cannot express that,
 * so the allowlist mechanism is extended rather than bypassed.
 */
describe('GET /api/records — sorting', () => {
  /**
   * Artist order and title order must DISAGREE, or the test cannot tell a
   * joined sort from `sort by title`.
   *
   * The seed data alone does not discriminate: Amebix/'Arise!' and
   * Discharge/'Hear Nothing…' sort identically either way, and a mutation
   * replacing the artist expression with records.title passed all 29 tests.
   * These two extra rows invert the relationship — 'Zounds' owns 'Aaa' and
   * 'Aardvark' owns 'Zzz' — so title order is the reverse of artist order.
   */
  it('sorts by the joined artist name, not by title', async () => {
    await seed();

    const zounds = (
      await db.execute<{ id: string }>(
        sql`INSERT INTO artists (name) VALUES ('Zounds') RETURNING id`,
      )
    ).rows[0].id;
    const aardvark = (
      await db.execute<{ id: string }>(
        sql`INSERT INTO artists (name) VALUES ('Aardvark') RETURNING id`,
      )
    ).rows[0].id;

    await db.execute(sql`INSERT INTO records (artist_id, title) VALUES (${zounds}, 'Aaa')`);
    await db.execute(sql`INSERT INTO records (artist_id, title) VALUES (${aardvark}, 'Zzz')`);

    const asc = await (await listRecords(request('/api/records?sort=artist:asc'))).json();
    const titles = asc.data.map((r: { title: string }) => r.title);

    // By ARTIST ascending: Aardvark('Zzz'), Amebix('Arise!'), Discharge(…), Zounds('Aaa').
    // By TITLE ascending it would be: 'Aaa', 'Arise!', 'Hear Nothing…', 'Zzz'.
    expect(titles[0]).toBe('Zzz');
    expect(titles.at(-1)).toBe('Aaa');
  });

  it('reverses the joined artist sort on desc', async () => {
    await seed();

    const desc = await (await listRecords(request('/api/records?sort=artist:desc'))).json();
    expect(desc.data.map((r: { title: string }) => r.title)).toEqual([
      'Hear Nothing See Nothing Say Nothing',
      'Arise!',
    ]);
  });

  it('sorts by each allowlisted field', async () => {
    await seed();

    for (const field of ['title', 'purchaseDate', 'purchasePrice', 'releaseYear']) {
      const response = await listRecords(request(`/api/records?sort=${field}:asc`));
      expect(response.status, field).toBe(200);
    }
  });

  it('rejects a real but unenumerated sort column with 400', async () => {
    // `notes` is a real column and would sort fine; it is refused because it is
    // not enumerated — the allowlist survives the join extension.
    const response = await listRecords(request('/api/records?sort=notes:asc'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.sort).toBeDefined();
  });

  it('rejects a SQL injection payload in sort without executing it', async () => {
    await seed();

    const response = await listRecords(
      request(`/api/records?sort=${encodeURIComponent('title; DROP TABLE records--')}`),
    );

    expect(response.status).toBe(400);

    const still = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM records`);
    expect(still.rows[0].n).toBe(2);
  });

  it('puts null purchaseDate last in BOTH directions', async () => {
    const s = await seed();
    await db.execute(
      sql`INSERT INTO records (artist_id, title, purchase_date) VALUES (${s.amebix}, 'Undated', NULL)`,
    );

    const asc = await (await listRecords(request('/api/records?sort=purchaseDate:asc'))).json();
    expect(asc.data.at(-1).title).toBe('Undated');

    const desc = await (await listRecords(request('/api/records?sort=purchaseDate:desc'))).json();
    expect(desc.data.at(-1).title).toBe('Undated');
  });

  it('applies the sort together with a filter', async () => {
    // Sorting and filtering share one query builder; a sort applied to an
    // unfiltered subquery would return the wrong rows entirely.
    const s = await seed();
    await db.execute(
      sql`INSERT INTO records (artist_id, title, release_year) VALUES (${s.discharge}, 'Why', 1981)`,
    );

    const body = await (
      await listRecords(request(`/api/records?artistId=${s.discharge}&sort=releaseYear:asc`))
    ).json();

    expect(body.data.map((r: { title: string }) => r.title)).toEqual([
      'Why',
      'Hear Nothing See Nothing Say Nothing',
    ]);
  });
});

/**
 * SPEC.md §7.1: "a record tagged with a child genre is implicitly a member of
 * all ancestor genres for filtering and graph purposes. Compute this with a
 * recursive CTE; do not denormalize."
 *
 * THREE levels, with a record at each, because two cannot distinguish a
 * recursive CTE from a single join to `parent_genre_id` — the same fixture
 * problem as the artist sort, where a seed whose orders agreed let a mutation
 * pass. With Punk > UK82 > Oi!, a single join finds Oi! from UK82 but NOT from
 * Punk, so the grandparent case is what makes the recursion observable.
 *
 * The sibling subtree exists so a CTE that walks the whole table instead of the
 * requested subtree is caught: filtering by Punk must not return the Crust
 * record, and "returns everything" would otherwise look like success.
 */
type Hierarchy = {
  punk: string;
  uk82: string;
  oi: string;
  crust: string;
  punkRecord: string;
  uk82Record: string;
  oiRecord: string;
  crustRecord: string;
};

async function seedHierarchy(): Promise<Hierarchy> {
  const id = async (statement: ReturnType<typeof sql>) =>
    (await db.execute<{ id: string }>(statement)).rows[0].id;

  const artist = await id(sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`);

  const punk = await id(sql`INSERT INTO genres (name) VALUES ('Punk') RETURNING id`);
  const uk82 = await id(
    sql`INSERT INTO genres (name, parent_genre_id) VALUES ('UK82', ${punk}) RETURNING id`,
  );
  const oi = await id(
    sql`INSERT INTO genres (name, parent_genre_id) VALUES ('Oi!', ${uk82}) RETURNING id`,
  );
  // A second child of Punk, so "descendants of Punk" is a real subtree and not
  // simply "every genre".
  const crust = await id(
    sql`INSERT INTO genres (name, parent_genre_id) VALUES ('Crust', ${punk}) RETURNING id`,
  );

  const link = async (title: string, genreId: string) => {
    const recordId = await id(
      sql`INSERT INTO records (artist_id, title) VALUES (${artist}, ${title}) RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${recordId}, ${genreId})`,
    );
    return recordId;
  };

  return {
    punk,
    uk82,
    oi,
    crust,
    punkRecord: await link('Tagged Punk', punk),
    uk82Record: await link('Tagged UK82', uk82),
    oiRecord: await link('Tagged Oi', oi),
    crustRecord: await link('Tagged Crust', crust),
  };
}

describe('GET /api/records — genre hierarchy (§7.1)', () => {
  it('finds a GRANDCHILD-tagged record when filtering by the grandparent', async () => {
    // The case a single join to parent_genre_id cannot satisfy: Oi! is two
    // levels below Punk.
    const h = await seedHierarchy();

    expect(await names(`/api/records?genreId=${h.punk}`)).toEqual([
      'Tagged Crust',
      'Tagged Oi',
      'Tagged Punk',
      'Tagged UK82',
    ]);
  });

  it('finds a child-tagged record when filtering by the direct parent', async () => {
    const h = await seedHierarchy();

    expect(await names(`/api/records?genreId=${h.uk82}`)).toEqual(['Tagged Oi', 'Tagged UK82']);
  });

  it('does not walk UPWARDS — a child filter excludes the parent-tagged record', async () => {
    // Ancestry is directional. A CTE walking the wrong way would return the
    // Punk-tagged record here, which reads as "the filter is broader than
    // asked for" rather than as an error.
    const h = await seedHierarchy();

    expect(await names(`/api/records?genreId=${h.oi}`)).toEqual(['Tagged Oi']);
  });

  it('does not return a SIBLING subtree', async () => {
    // Crust and UK82 are both children of Punk; neither contains the other.
    const h = await seedHierarchy();

    expect(await names(`/api/records?genreId=${h.crust}`)).toEqual(['Tagged Crust']);
  });

  it('counts a hierarchy match once, not once per ancestor path', async () => {
    // A record tagged with BOTH a genre and its ancestor matches the subtree
    // twice. EXISTS collapses that; a join would return the row twice and
    // inflate meta.total.
    const h = await seedHierarchy();
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${h.oiRecord}, ${h.punk})`,
    );

    const body = await (await listRecords(request(`/api/records?genreId=${h.punk}`))).json();

    expect(body.data.filter((r: { title: string }) => r.title === 'Tagged Oi')).toHaveLength(1);
    expect(body.meta.total).toBe(4);
  });

  it('composes with another filter rather than widening it', async () => {
    // A hierarchy filter that is ORed into the clause list instead of ANDed
    // returns MORE rows, which reads as "the artist filter did nothing".
    const h = await seedHierarchy();
    const other = (
      await db.execute<{ id: string }>(
        sql`INSERT INTO artists (name) VALUES ('Amebix') RETURNING id`,
      )
    ).rows[0].id;
    const outsider = (
      await db.execute<{ id: string }>(
        sql`INSERT INTO records (artist_id, title) VALUES (${other}, 'Other Artist Oi') RETURNING id`,
      )
    ).rows[0].id;
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${outsider}, ${h.oi})`,
    );

    // Both records are in the Punk subtree; only one is by Amebix.
    expect(await names(`/api/records?genreId=${h.punk}&artistId=${other}`)).toEqual([
      'Other Artist Oi',
    ]);
  });
});

/**
 * Query-parameter validation at the boundary (SPEC.md §5: "All input validated
 * with Zod at the route boundary").
 *
 * Every case here was found by the post-unit-6 adversarial review and confirmed
 * by execution before being written down. They share one shape: a malformed
 * filter that is SILENTLY APPLIED rather than rejected, so the caller gets a
 * 200 with the wrong rows and reads it as success.
 */
/**
 * A minimal isolated fixture: one fresh artist with the given titles, so a
 * search test can assert on an exact result set without the main seed's rows
 * interfering. Returns the artist id, which the tests AND with `q` so only
 * these titles are in scope.
 */
async function seed2(...titles: string[]): Promise<string> {
  const artistId = (
    await db.execute<{ id: string }>(
      sql`INSERT INTO artists (name) VALUES ('Fixture Artist') RETURNING id`,
    )
  ).rows[0].id;

  for (const title of titles) {
    await db.execute(
      sql`INSERT INTO records (artist_id, title) VALUES (${artistId}, ${title})`,
    );
  }
  return artistId;
}

describe('GET /api/records — q is a literal, not a LIKE pattern', () => {
  /**
   * `q` was interpolated straight into `%${q}%`, so LIKE metacharacters acted
   * as wildcards. Verified against the database that this was the ILIKE branch
   * and not the trigram one: similarity('Why','%') and similarity('Why','_')
   * are both 0, well under the 0.3 threshold, so trigram contributes nothing
   * for these inputs and cannot be what matched.
   */
  it('treats % as a literal character rather than matching everything', async () => {
    await seed();

    // Two records exist; neither title nor artist contains a literal '%'.
    expect(await names('/api/records?q=%25')).toEqual([]);
  });

  it('treats _ as a literal character rather than matching any single one', async () => {
    await seed();

    expect(await names('/api/records?q=_')).toEqual([]);
  });

  /**
   * The clean proof, and the one that cannot be explained away as trigram
   * fuzziness: '_h' is not a substring of 'Why' or of any seeded title, so an
   * ESCAPED pattern returns nothing. Unescaped, '_' matches the 'W' and 'h'
   * follows, so 'Why' comes back.
   */
  it('does not let _h match Why', async () => {
    const s = await seed2('Why', 'Zzzz');

    expect(await names(`/api/records?q=_h&artistId=${s}`)).toEqual([]);
  });

  it('still finds a literal underscore when one is really in the title', async () => {
    /**
     * Escaping must not make a real metacharacter unfindable.
     *
     * This asserts CONTAINMENT, not equality, and deliberately so: 'Side B'
     * also comes back, because similarity('Side B','Side_A') is 0.56 — above
     * the 0.3 threshold — so the TRIGRAM half matches it legitimately. §5.2
     * calls `q` fuzzy, so that is correct behaviour, not leakage from the
     * escape. Verified against the database rather than assumed; an earlier
     * version of this test asserted equality and failed for that reason.
     *
     * The distinguishing fixture is the '_h' test above, where the trigram
     * contributes nothing (similarity is 0) and only the ILIKE branch could
     * have matched.
     */
    const s = await seed2('Side_A', 'No Underscore Here');

    expect(await names(`/api/records?q=Side_A&artistId=${s}`)).toContain('Side_A');
  });

  it('treats a backslash as a literal too', async () => {
    // The escape character itself needs escaping, or 'a\' becomes a dangling
    // escape and Postgres raises rather than returning rows.
    const s = await seed2('back\\slash', 'plain');

    expect(await names(`/api/records?q=back\\slash&artistId=${s}`)).toEqual(['back\\slash']);
  });

  it('still matches an ordinary substring', async () => {
    // The regression guard: escaping must not break normal search.
    await seed();

    expect(await names('/api/records?q=Hear')).toEqual([
      'Hear Nothing See Nothing Say Nothing',
    ]);
  });
});

describe('GET /api/records — year filter validation', () => {
  /**
   * `z.coerce.number()` turns '' into 0, so `yearFrom=` applied
   * `release_year >= 0` and silently dropped every record with a null release
   * year. `yearTo=` is worse: `release_year <= 0` matches nothing, so the whole
   * collection vanishes behind a 200.
   *
   * Every other empty filter already 400s (verified: q=, condition=, artistId=,
   * genreId=, tagId= all reject). These two were the outliers.
   */
  it('rejects an empty yearFrom rather than coercing it to 0', async () => {
    await seed();

    const response = await listRecords(request('/api/records?yearFrom='));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.yearFrom).toBeDefined();
  });

  it('rejects an empty yearTo rather than emptying the collection', async () => {
    await seed();

    const response = await listRecords(request('/api/records?yearTo='));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.yearTo).toBeDefined();
  });

  it('does not drop null-release-year records when no year filter is sent', async () => {
    // The observable harm the empty-string bug caused, asserted directly: an
    // undated record must survive an unfiltered list.
    const s = await seed();
    await db.execute(
      sql`INSERT INTO records (artist_id, title, release_year) VALUES (${s.discharge}, 'Undated', NULL)`,
    );

    expect(await names('/api/records')).toContain('Undated');
  });

  /**
   * An out-of-int4-range year reached Postgres and raised, surfacing as a 500 —
   * a client error reported as a server error. Bounded with the SAME check
   * POST already applies to releaseYear, so a filter cannot ask for a year the
   * column could never hold.
   */
  it('rejects a year above the int4 range with 400, not 500', async () => {
    const response = await listRecords(request('/api/records?yearFrom=99999999999'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.yearFrom).toBeDefined();
  });

  it('rejects a year below the int4 range with 400, not 500', async () => {
    const response = await listRecords(request('/api/records?yearTo=-99999999999'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.yearTo).toBeDefined();
  });

  it('still accepts a year inside the range', async () => {
    await seed();

    expect(await names('/api/records?yearFrom=1982&yearTo=1982')).toEqual([
      'Hear Nothing See Nothing Say Nothing',
    ]);
  });
});
