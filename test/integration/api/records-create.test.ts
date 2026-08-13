import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { POST as createRecord } from '@/app/api/records/route';
import { GET as getRecord } from '@/app/api/records/[id]/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §5.2: `POST /api/records` and `GET /api/records/:id`.
 *
 * Write and read of the same shape tested together, because the pair is what a
 * client actually uses — a create that succeeds but reads back missing its
 * genres is the silent failure unit 2's primitive exists to prevent, and only
 * the round trip shows it.
 *
 * `records` is where the reference template stops applying:
 *   - nested genreIds/tagIds go through the transactional primitive;
 *   - there is NO unique constraint on (artist_id, title) — duplicates are
 *     legal and expected (§4), so there is no duplicate pre-check and no 409;
 *   - the hydrated read joins six tables plus two junctions.
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

const UNUSED_UUID = '00000000-0000-4000-8000-000000000000';

function request(url: string, init?: RequestInit): Request {
  return new Request(`https://x.test${url}`, init);
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function insertArtist(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function insertGenre(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO genres (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function insertTag(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO tags (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function recordCount(): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM records`);
  return rows.rows[0].n;
}

describe('unauthenticated access', () => {
  it('routes both paths through middleware as session-protected', () => {
    expect(middlewareRuns('/api/records')).toBe(true);
    expect(middlewareRuns(`/api/records/${UNUSED_UUID}`)).toBe(true);
    expect(routeAuthMode('/api/records')).toBe('session');
    expect(routeAuthMode(`/api/records/${UNUSED_UUID}`)).toBe('session');
  });
});

describe('unanticipated server errors', () => {
  it('returns the §5 500 shape and leaks nothing when the query fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const artistId = await insertArtist('Discharge');

    await db.execute(sql`ALTER TABLE records RENAME TO records_hidden`);
    let status = 0;
    let serialized = '';
    try {
      const response = await createRecord(
        jsonRequest('/api/records', 'POST', { artistId, title: 'Hear Nothing' }),
      );
      status = response.status;
      serialized = JSON.stringify(await response.json());
    } finally {
      await db.execute(sql`ALTER TABLE records_hidden RENAME TO records`);
    }

    expect(status).toBe(500);
    expect(serialized).not.toContain('insert');
    expect(serialized).not.toContain('records_hidden');
  });
});

// --- POST /api/records -------------------------------------------------------

describe('POST /api/records', () => {
  it('creates a record with only the required fields', async () => {
    const artistId = await insertArtist('Discharge');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', { artistId, title: 'Hear Nothing' }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ title: 'Hear Nothing', artistId });
  });

  it('creates a record with every optional field', async () => {
    const artistId = await insertArtist('Discharge');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', {
        artistId,
        title: 'Hear Nothing',
        releaseYear: 1982,
        conditionMedia: 'VG+',
        conditionSleeve: 'VG',
        purchasePrice: '24.50',
        purchaseDate: '2024-03-01',
        notes: 'Stoke pressing',
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      releaseYear: 1982,
      conditionMedia: 'VG+',
      conditionSleeve: 'VG',
      notes: 'Stoke pressing',
    });
  });

  /**
   * §4 schema-wide rule: duplicate records are legal and expected — a collector
   * may own two copies of the same album in different pressings or conditions.
   * There is no unique constraint and there must be no duplicate pre-check.
   *
   * This is where copying the reference template would have been wrong.
   */
  it('ALLOWS two records with the same artist and title', async () => {
    const artistId = await insertArtist('Discharge');

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await createRecord(
        jsonRequest('/api/records', 'POST', { artistId, title: 'Hear Nothing' }),
      );
      expect(response.status, `attempt ${attempt + 1}`).toBe(201);
    }

    expect(await recordCount()).toBe(2);
  });

  it('attaches nested genres and tags', async () => {
    const artistId = await insertArtist('Discharge');
    const genreId = await insertGenre('UK82');
    const tagId = await insertTag('signed');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', {
        artistId,
        title: 'Hear Nothing',
        genreIds: [genreId],
        tagIds: [tagId],
      }),
    );

    expect(response.status).toBe(201);
    const created = await response.json();

    const genres = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM record_genres WHERE record_id = ${created.id}`,
    );
    const tags = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM record_tags WHERE record_id = ${created.id}`,
    );
    expect({ genres: genres.rows[0].n, tags: tags.rows[0].n }).toEqual({ genres: 1, tags: 1 });
  });

  /**
   * The rollback, through the endpoint rather than the primitive. Unit 2 proved
   * the primitive; this proves the handler does not swallow the failure and
   * report success.
   */
  it('creates NOTHING when a genre id does not exist', async () => {
    const artistId = await insertArtist('Discharge');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', {
        artistId,
        title: 'Hear Nothing',
        genreIds: [UNUSED_UUID],
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.genreIds).toBeDefined();
    expect(await recordCount()).toBe(0);
  });

  it('creates NOTHING when a tag id does not exist, after genres succeeded', async () => {
    // The case that distinguishes a transaction from statement-level rollback.
    const artistId = await insertArtist('Discharge');
    const genreId = await insertGenre('UK82');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', {
        artistId,
        title: 'Hear Nothing',
        genreIds: [genreId],
        tagIds: [UNUSED_UUID],
      }),
    );

    expect(response.status).toBe(400);
    expect(await recordCount()).toBe(0);

    const links = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM record_genres`,
    );
    expect(links.rows[0].n).toBe(0);
  });

  it('rejects an artistId that does not exist with 400, not 500', async () => {
    const response = await createRecord(
      jsonRequest('/api/records', 'POST', { artistId: UNUSED_UUID, title: 'Orphan' }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.artistId).toBeDefined();
  });

  it('rejects a missing title and a missing artistId by name', async () => {
    const response = await createRecord(jsonRequest('/api/records', 'POST', {}));

    expect(response.status).toBe(400);
    const { fieldErrors } = (await response.json()).error;
    expect(fieldErrors.title).toBeDefined();
    expect(fieldErrors.artistId).toBeDefined();
  });

  it('rejects an invalid condition grade', async () => {
    const artistId = await insertArtist('Discharge');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', {
        artistId,
        title: 'Hear Nothing',
        conditionMedia: 'MINT',
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.conditionMedia).toBeDefined();
  });

  it('accepts every Goldmine grade the enum defines', async () => {
    const artistId = await insertArtist('Discharge');

    for (const grade of ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P']) {
      const response = await createRecord(
        jsonRequest('/api/records', 'POST', {
          artistId,
          title: `Graded ${grade}`,
          conditionMedia: grade,
        }),
      );
      expect(response.status, grade).toBe(201);
    }
  });

  it('accepts a record with no condition at all', async () => {
    // Confirmed intended (NOTES.md): a record can be logged before it is
    // graded, and requiring a grade would block quick in-store entry.
    const artistId = await insertArtist('Discharge');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', { artistId, title: 'Ungraded' }),
    );

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.conditionMedia).toBeNull();
    expect(created.conditionSleeve).toBeNull();
  });

  it('rejects an out-of-range releaseYear', async () => {
    const artistId = await insertArtist('Discharge');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', { artistId, title: 'X', releaseYear: 999999 }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.releaseYear).toBeDefined();
  });

  it('rejects unknown keys', async () => {
    const artistId = await insertArtist('Discharge');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', { artistId, title: 'X', id: UNUSED_UUID }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a malformed JSON body with 400, not 500', async () => {
    const response = await createRecord(
      request('/api/records', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('rejects a non-UUID in a nested id array', async () => {
    const artistId = await insertArtist('Discharge');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', {
        artistId,
        title: 'X',
        genreIds: ['not-a-uuid'],
      }),
    );

    expect(response.status).toBe(400);
  });
});

// --- GET /api/records/:id ----------------------------------------------------

describe('GET /api/records/:id — the hydrated read', () => {
  async function seedFullRecord(): Promise<{ id: string; ids: Record<string, string> }> {
    const artistId = await insertArtist('Discharge');
    const genreId = await insertGenre('UK82');
    const tagId = await insertTag('signed');

    const label = await db.execute<{ id: string }>(
      sql`INSERT INTO labels (name) VALUES ('Clay') RETURNING id`,
    );
    const format = await db.execute<{ id: string }>(
      sql`SELECT id FROM formats WHERE name = 'LP'`,
    );
    const store = await db.execute<{ id: string }>(
      sql`INSERT INTO record_stores (name) VALUES ('Amoeba') RETURNING id`,
    );
    const pressing = await db.execute<{ id: string }>(
      sql`INSERT INTO pressings (catalog_number, country_pressed) VALUES ('CLAYLP3', 'UK') RETURNING id`,
    );

    const created = await createRecord(
      jsonRequest('/api/records', 'POST', {
        artistId,
        title: 'Hear Nothing',
        labelId: label.rows[0].id,
        formatId: format.rows[0].id,
        storeId: store.rows[0].id,
        pressingId: pressing.rows[0].id,
        releaseYear: 1982,
        purchasePrice: '24.50',
        genreIds: [genreId],
        tagIds: [tagId],
      }),
    );
    const body = await created.json();

    return {
      id: body.id,
      ids: {
        artistId,
        genreId,
        tagId,
        labelId: label.rows[0].id,
        formatId: format.rows[0].id,
        storeId: store.rows[0].id,
        pressingId: pressing.rows[0].id,
      },
    };
  }

  it('hydrates artist, label, format, store and pressing as objects', async () => {
    const { id, ids } = await seedFullRecord();

    const response = await getRecord(request(`/api/records/${id}`), params(id));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.artist).toMatchObject({ id: ids.artistId, name: 'Discharge' });
    expect(body.label).toMatchObject({ id: ids.labelId, name: 'Clay' });
    expect(body.format).toMatchObject({ id: ids.formatId, name: 'LP' });
    expect(body.store).toMatchObject({ id: ids.storeId, name: 'Amoeba' });
    expect(body.pressing).toMatchObject({ id: ids.pressingId, catalogNumber: 'CLAYLP3' });
  });

  it('hydrates genres and tags as arrays', async () => {
    const { id, ids } = await seedFullRecord();

    const body = await (await getRecord(request(`/api/records/${id}`), params(id))).json();

    expect(body.genres).toEqual([{ id: ids.genreId, name: 'UK82' }]);
    expect(body.tags).toEqual([{ id: ids.tagId, name: 'signed' }]);
  });

  it('returns null for absent optional relations rather than omitting them', async () => {
    // A client rendering the detail screen should not have to distinguish
    // "no label" from "the field is missing".
    const artistId = await insertArtist('Amebix');
    const created = await (
      await createRecord(jsonRequest('/api/records', 'POST', { artistId, title: 'Arise!' }))
    ).json();

    const body = await (
      await getRecord(request(`/api/records/${created.id}`), params(created.id))
    ).json();

    expect(body.label).toBeNull();
    expect(body.format).toBeNull();
    expect(body.store).toBeNull();
    expect(body.pressing).toBeNull();
    expect(body.genres).toEqual([]);
    expect(body.tags).toEqual([]);
  });

  it('includes images and journal entries', async () => {
    const { id } = await seedFullRecord();

    await db.execute(
      sql`INSERT INTO images (record_id, url, image_type) VALUES (${id}, 'https://x/1.jpg', 'cover')`,
    );
    await db.execute(
      sql`INSERT INTO journal_entries (record_id, note) VALUES (${id}, 'Found in Stoke')`,
    );

    const body = await (await getRecord(request(`/api/records/${id}`), params(id))).json();

    expect(body.images).toHaveLength(1);
    expect(body.images[0]).toMatchObject({ url: 'https://x/1.jpg', imageType: 'cover' });
    expect(body.journalEntries).toHaveLength(1);
    expect(body.journalEntries[0]).toMatchObject({ note: 'Found in Stoke' });
  });

  /**
   * §5.2 says "latest price" — the most recent price_history row. That is NOT
   * §7.6's used→new→purchase_price fallback chain, which is defined for the
   * ESTIMATED COLLECTION VALUE aggregate and belongs to the stats endpoint.
   * Conflating them would make the detail screen show a different number from
   * the one the user just recorded.
   */
  it('returns the most recent price, regardless of type', async () => {
    const { id } = await seedFullRecord();

    /**
     * Chosen so recency and type-ordering genuinely disagree.
     *
     * `price_type` is a Postgres ENUM, so it sorts by DECLARATION order
     * (new < used < asking), not alphabetically — verified with enum_range().
     * Two earlier fixtures failed to discriminate because the newest row also
     * happened to sort first under the type ordering.
     *
     * Here the newest row is 'asking', which sorts LAST by type. Any
     * implementation ordering by type returns the older 'new' row instead.
     *
     * Was `best_dig` until migration 0005. The value changed; the PROPERTY the
     * fixture needs did not — `asking` is also declared last, so recency and
     * type-ordering still disagree and the test still discriminates.
     */
    await db.execute(
      sql`INSERT INTO price_history (record_id, price, price_type, recorded_at)
          VALUES (${id}, 99.00, 'new', '2024-01-01T00:00:00Z')`,
    );
    await db.execute(
      sql`INSERT INTO price_history (record_id, price, price_type, recorded_at)
          VALUES (${id}, 45.00, 'asking', '2024-06-01T00:00:00Z')`,
    );

    const body = await (await getRecord(request(`/api/records/${id}`), params(id))).json();

    // Latest by recorded_at. A type-ordered query would return 99.00 / 'new'.
    expect(body.latestPrice).toMatchObject({ price: '45.00', priceType: 'asking' });
  });

  it('returns a null latestPrice when there is no price history', async () => {
    const { id } = await seedFullRecord();

    const body = await (await getRecord(request(`/api/records/${id}`), params(id))).json();

    expect(body.latestPrice).toBeNull();
  });

  it('does not leak another record’s genres, tags or price', async () => {
    // The join fan-out mistake: a hydrated read that groups incorrectly shows
    // one record's relations on another.
    const first = await seedFullRecord();

    const otherArtist = await insertArtist('Amebix');
    const otherGenre = await insertGenre('Crust');
    const second = await (
      await createRecord(
        jsonRequest('/api/records', 'POST', {
          artistId: otherArtist,
          title: 'Arise!',
          genreIds: [otherGenre],
        }),
      )
    ).json();

    await db.execute(
      sql`INSERT INTO price_history (record_id, price, price_type) VALUES (${second.id}, 99.00, 'used')`,
    );

    const body = await (
      await getRecord(request(`/api/records/${first.id}`), params(first.id))
    ).json();

    expect(body.genres.map((g: { name: string }) => g.name)).toEqual(['UK82']);
    expect(body.latestPrice).toBeNull();
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const response = await getRecord(request(`/api/records/${UNUSED_UUID}`), params(UNUSED_UUID));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for a non-UUID id rather than attempting a lookup', async () => {
    const response = await getRecord(request('/api/records/not-a-uuid'), params('not-a-uuid'));

    expect(response.status).toBe(400);
  });
});

describe('purchase date is bounded, not merely well-formed', () => {
  /**
   * `2026-13-45` was already rejected — it is not a day. `1823-04-11` IS a day,
   * and as a purchase date it is a typo. §4.1 bounds the year fields at 1877
   * (sound recording began) for this reason; the same argument applies to a
   * date, with the upper bound at TODAY rather than next year — you cannot have
   * bought a record tomorrow.
   *
   * Added when the bound was applied: the field had no boundary test, so the
   * change would otherwise have been unconstrained here.
   */
  it('rejects a purchase date in the wrong century', async () => {
    const artistId = await insertArtist('Bounded');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', {
        artistId,
        title: 'Typo',
        purchaseDate: '1823-04-11',
      }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a purchase date in the future', async () => {
    const artistId = await insertArtist('Not Yet');

    const response = await createRecord(
      jsonRequest('/api/records', 'POST', {
        artistId,
        title: 'Not yet',
        purchaseDate: '2087-01-01',
      }),
    );

    expect(response.status).toBe(400);
  });
});
