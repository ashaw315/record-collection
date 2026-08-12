import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { POST as importRoute } from '@/app/api/discogs/import/route';
import * as clientModule from '@/lib/discogs/client';
import { formats, genres, images, pressings, recordGenres, records, recordStores } from '@/db/schema';
import * as storage from '@/lib/storage/blob';

/**
 * SPEC.md §5.7 `POST /api/discogs/import`, at the endpoint.
 *
 * The transactional behaviour is covered against the query-layer primitive in
 * test/integration/discogs-import.test.ts. This file covers what only the
 * endpoint decides: validation, where the payload comes from, and the §7.8
 * guarantee surviving the wiring.
 */

const db = getTestDb();

const DETAILED = JSON.parse(
  readFileSync('test/fixtures/discogs/release-detailed.json', 'utf8'),
) as { id: number };

function mockDiscogs(response: unknown = DETAILED) {
  const get = vi.fn(async () => response);

  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: get as unknown as clientModule.DiscogsClient['get'],
    // Unused here; the type requires it since the cover fetch was added.
    fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
  });

  return get;
}

const post = (body: unknown) =>
  new Request('https://x.test/api/discogs/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

describe('importing', () => {
  it('creates a record and returns 201', async () => {
    mockDiscogs();

    const response = await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.title).toBe('Hear Nothing See Nothing Say Nothing');
  });

  it('creates a want-list item when asked for one', async () => {
    mockDiscogs();

    const response = await importRoute(post({ discogsReleaseId: 381756, target: 'want_list' }));

    expect(response.status).toBe(201);

    const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM want_list`);
    expect(rows.rows[0].n).toBe(1);
  });

  it('applies the user overrides over the Discogs values', async () => {
    // §5.7: the user has verified against the physical record, so their
    // corrections win. This is the whole reason import is two-stage.
    mockDiscogs();

    const created = await (
      await importRoute(
        post({
          discogsReleaseId: 381756,
          target: 'record',
          overrides: { title: 'My copy', conditionMedia: 'VG+' },
        }),
      )
    ).json();

    expect(created.title).toBe('My copy');
    expect(created.conditionMedia).toBe('VG+');
  });

  it('keeps a user-entered matrix through the endpoint on re-import', async () => {
    /**
     * §7.8 asserted at the layer a user reaches, not only at the primitive.
     * The wiring lesson from unit 4: a route that bypassed the find-or-create
     * would leave every query-layer test passing while destroying hand-typed
     * data.
     */
    mockDiscogs();

    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));
    await db.execute(sql`UPDATE pressings SET matrix_runout = 'HAND READ FROM THE WAX'`);
    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    const rows = await db.execute<{ matrix_runout: string }>(
      sql`SELECT matrix_runout FROM pressings`,
    );
    expect(rows.rows[0].matrix_runout).toBe('HAND READ FROM THE WAX');
  });
});

describe('where the payload comes from', () => {
  it('re-fetches the release rather than trusting a client payload', async () => {
    /**
     * §5.7 gives the body as `{ discogsReleaseId, target, overrides }` — no
     * release payload. A client-supplied one could assert anything about a
     * pressing, and pressing identity is what §7.7's ownership distinction
     * rests on. Corrections arrive as `overrides`, which are explicit and
     * bounded.
     */
    const get = mockDiscogs();

    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    expect(get).toHaveBeenCalledTimes(1);
    const [path] = get.mock.calls[0] as unknown as [string];
    expect(path).toBe('/releases/381756');
  });

  it('rejects a release payload sent by the client', async () => {
    const response = await importRoute(
      post({ discogsReleaseId: 381756, target: 'record', release: { title: 'Anything' } }),
    );

    expect(response.status).toBe(400);
  });

  it('uses the cache rather than spending a second rate-limited call', async () => {
    // The user has just viewed this release in the form; re-fetching it burns
    // one of 60 calls a minute for a payload we already hold.
    const get = mockDiscogs();

    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));
    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('validation', () => {
  it.each([
    ['a missing target', { discogsReleaseId: 381756 }],
    ['an unknown target', { discogsReleaseId: 381756, target: 'shelf' }],
    ['a missing release id', { target: 'record' }],
    ['a string release id', { discogsReleaseId: '381756', target: 'record' }],
    ['a hex-shaped release id', { discogsReleaseId: '0x50', target: 'record' }],
    ['a negative release id', { discogsReleaseId: -1, target: 'record' }],
    ['a fractional release id', { discogsReleaseId: 381756.5, target: 'record' }],
    ['an unknown override key', { discogsReleaseId: 381756, target: 'record', overrides: { colour: 'red' } }],
  ])('rejects %s', async (_label, body) => {
    const get = mockDiscogs();

    const response = await importRoute(post(body));

    expect(response.status).toBe(400);
    expect(get, 'nothing is fetched for a request that cannot be served').not.toHaveBeenCalled();
  });

  it('writes nothing when validation fails', async () => {
    await importRoute(post({ discogsReleaseId: 381756, target: 'shelf' }));

    const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM records`);
    expect(rows.rows[0].n).toBe(0);
  });

  it('rejects malformed JSON', async () => {
    const response = await importRoute(
      new Request('https://x.test/api/discogs/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe('failures', () => {
  it('reports an unknown release as 404 and writes nothing', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs request failed with status 404', {
          status: 404,
        });
      }) as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    const response = await importRoute(post({ discogsReleaseId: 99999999, target: 'record' }));

    expect(response.status).toBe(404);

    const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM records`);
    expect(rows.rows[0].n).toBe(0);
  });

  it('surfaces a rate limit as 429', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs rate limit reached.', { status: 429 });
      }) as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    const response = await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    expect(response.status).toBe(429);
  });
});

describe('overrides the form must be able to express', () => {
  /**
   * §5.7: the user's corrections "take precedence over the Discogs values for
   * **every field they cover**". The form is about to post here instead of to
   * `/api/records`, so any field it can set and this endpoint cannot accept is
   * a field the user edits and loses.
   *
   * **This is the tagIds defect from step 6 exactly**: validated, discarded,
   * 201 returned, and the user believes it landed. The endpoint would still
   * succeed — that is what makes it invisible, and why these are written first.
   */
  // Drizzle's typed insert, not `db.execute` — the latter returns a driver
  // result object rather than an array, and destructuring it throws.
  async function seedFormat(name: string): Promise<string> {
    const [row] = await db.insert(formats).values({ name }).returning({ id: formats.id });
    return row.id;
  }

  async function newestRecord() {
    const [row] = await db
      .select({ id: records.id, formatId: records.formatId, storeId: records.storeId })
      .from(records)
      .orderBy(sql`${records.createdAt} DESC`)
      .limit(1);
    return row;
  }

  it('accepts formatId and writes it — the form always sets one', async () => {
    mockDiscogs();
    const formatId = await seedFormat(`LP-${Date.now()}`);

    const response = await importRoute(
      post({ discogsReleaseId: 381756, target: 'record', overrides: { formatId } }),
    );

    expect(response.status, 'a rejected formatId is better than a silent drop').toBe(201);

    expect((await newestRecord()).formatId, 'the format the user chose on the form').toBe(
      formatId,
    );
  });

  it('accepts genreIds, so an edited genre selection is not ignored', async () => {
    // The user may add or remove genres on the form. Without this the endpoint
    // writes only what Discogs said and the edit vanishes.
    mockDiscogs();
    const [genre] = await db
      .insert(genres)
      .values({ name: `Doom-${Date.now()}` })
      .returning({ id: genres.id });

    const response = await importRoute(
      post({ discogsReleaseId: 381756, target: 'record', overrides: { genreIds: [genre.id] } }),
    );

    expect(response.status).toBe(201);

    const record = await newestRecord();
    const linked = await db
      .select({ genreId: recordGenres.genreId })
      .from(recordGenres)
      .where(eq(recordGenres.recordId, record.id));

    expect(
      linked.map((row) => row.genreId),
      'the user’s selection REPLACES Discogs’, per §5.7 precedence',
    ).toEqual([genre.id]);
  });

  it('accepts storeId and labelId, which the form also sets', async () => {
    mockDiscogs();
    const [store] = await db
      .insert(recordStores)
      .values({ name: `Shop-${Date.now()}` })
      .returning({ id: recordStores.id });

    const response = await importRoute(
      post({ discogsReleaseId: 381756, target: 'record', overrides: { storeId: store.id } }),
    );

    expect(response.status).toBe(201);

    expect((await newestRecord()).storeId).toBe(store.id);
  });

  it('rejects an unknown key rather than accepting and discarding it', async () => {
    // `.strictObject` already does this; asserted because it is the property
    // that turns a future silent drop into a 400.
    mockDiscogs();

    const response = await importRoute(
      post({ discogsReleaseId: 381756, target: 'record', overrides: { nonsense: 'x' } }),
    );

    expect(response.status).toBe(400);
  });
});

describe('§10: a corrected pressing is a DIFFERENT pressing', () => {
  /**
   * Found while wiring the form to this endpoint.
   *
   * `importRelease` sent `discogsReleaseId: release.discogsId` unconditionally,
   * even when the user's overrides contradicted the identifying fields. The
   * form path had `discogsIdToSubmit` for exactly this and the import path had
   * nothing — the two halves of §10 implemented in one place and not the other.
   *
   * Why it matters (§7.6): `discogs_release_id` is unique and pressings are
   * SHARED. Keeping the id on a corrected pressing either finds the existing
   * shared row and discards the correction, or writes the correction onto every
   * record matching that release. The second is the worse one and it is silent.
   */
  it('drops the release id when the user corrects an identifying field', async () => {
    mockDiscogs();

    await importRoute(
      post({
        discogsReleaseId: 381756,
        target: 'record',
        // Discogs says CLAY LP 3; this copy says otherwise.
        overrides: { catalogNumber: 'CLAY LP 3 (misprint)' },
      }),
    );

    const [pressing] = await db
      .select({
        catalogNumber: pressings.catalogNumber,
        discogsReleaseId: pressings.discogsReleaseId,
      })
      .from(pressings)
      .orderBy(sql`${pressings.createdAt} DESC`)
      .limit(1);

    expect(pressing.catalogNumber, 'the user’s correction is kept').toBe('CLAY LP 3 (misprint)');
    expect(
      pressing.discogsReleaseId,
      'and it is NOT claimed to be Discogs’ release 381756',
    ).toBeNull();
  });

  it('keeps the release id when the user changes nothing identifying', async () => {
    // The other half. Dropping the id on every import would cost §7.7 tier 1
    // for every record — the ownership check's strongest signal.
    mockDiscogs();

    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    const [pressing] = await db
      .select({ discogsReleaseId: pressings.discogsReleaseId })
      .from(pressings)
      .orderBy(sql`${pressings.createdAt} DESC`)
      .limit(1);

    expect(pressing.discogsReleaseId).toBe(381756);
  });

  it('keeps the release id when only a NON-identifying field is corrected', async () => {
    /**
     * §7.6 spells this out: editing the matrix does not drop the id, because
     * Discogs' runout list is incomplete by construction — a runout it does not
     * list is information Discogs lacks, not a contradiction of identity. The
     * identifying set is catalog number, country and year pressed.
     */
    mockDiscogs();

    await importRoute(
      post({
        discogsReleaseId: 381756,
        target: 'record',
        overrides: { matrixRunout: 'MY OWN READING FROM THE WAX' },
      }),
    );

    const [pressing] = await db
      .select({
        matrixRunout: pressings.matrixRunout,
        discogsReleaseId: pressings.discogsReleaseId,
      })
      .from(pressings)
      .orderBy(sql`${pressings.createdAt} DESC`)
      .limit(1);

    expect(pressing.matrixRunout).toBe('MY OWN READING FROM THE WAX');
    expect(pressing.discogsReleaseId, 'the matrix does NOT contradict identity').toBe(381756);
  });
});

describe('the cover comes across on import', () => {
  /**
   * The QA finding closed in step 8 unit 4, which the rewiring would otherwise
   * have reopened silently: the cover fetch lived in `POST /api/records`, and
   * imports no longer go there.
   *
   * Preserved rather than rediscovered — this is exactly the "three things the
   * live path has that the dead one does not" that the consolidation plan
   * listed, and the only one with no other test watching it.
   */
  it('attaches the release cover to the imported record', async () => {
    mockDiscogs();
    const fetchImage = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
      contentType: 'image/jpeg',
    });
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => DETAILED) as unknown as clientModule.DiscogsClient['get'],
      fetchImage: fetchImage as unknown as clientModule.DiscogsClient['fetchImage'],
    });
    vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(true);
    vi.spyOn(storage, 'getBlobStorage').mockReturnValue({
      put: vi
        .fn()
        .mockResolvedValue({ url: 'https://blob.example/cover.jpg' }) as unknown as storage.BlobStorage['put'],
      delete: vi.fn() as unknown as storage.BlobStorage['delete'],
    });

    const response = await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));
    expect(response.status).toBe(201);

    const [record] = await db
      .select({ id: records.id })
      .from(records)
      .orderBy(sql`${records.createdAt} DESC`)
      .limit(1);
    const attached = await db
      .select({ url: images.url, imageType: images.imageType })
      .from(images)
      .where(eq(images.recordId, record.id));

    expect(attached).toHaveLength(1);
    expect(attached[0].imageType).toBe('cover');
  });

  it('still creates the record when the cover cannot be fetched', async () => {
    // The rule from unit 4, which must survive the move: a record lost to a
    // failed image fetch is the worst trade available.
    mockDiscogs();
    vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(false);

    const response = await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    expect(response.status, 'the import is not failed by a missing cover').toBe(201);
    const rows = await db.select({ id: records.id }).from(records);
    expect(rows).toHaveLength(1);
  });
});
