import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { POST as createRecord } from '@/app/api/records/route';
import { PATCH as patchRecord, DELETE as deleteRecord } from '@/app/api/records/[id]/route';
import { recordPatchSchema } from '@/app/api/records/[id]/schema';

/**
 * SPEC.md §5.2 `PATCH` and `DELETE /api/records/:id`.
 *
 * PATCH is the no-precedent item (NOTES.md criterion 10). Every resource so far
 * uses a strictObject where absence means "leave alone" — a shape that cannot
 * express nested arrays, because for genreIds absent must mean LEAVE ALONE
 * while [] must mean REMOVE ALL, and they are different intents with different
 * outcomes.
 *
 * Verified before designing: Zod's `.optional()` preserves that distinction but
 * `.default([])` DESTROYS it — absent silently becomes [], turning "leave
 * alone" into "remove all". That is data loss hidden in a schema modifier, so
 * there is a test pinning the schema itself, not only the endpoint.
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

type Fixture = {
  recordId: string;
  artistId: string;
  otherArtistId: string;
  genreId: string;
  otherGenreId: string;
  tagId: string;
  otherTagId: string;
};

async function seed(): Promise<Fixture> {
  const id = async (statement: ReturnType<typeof sql>) =>
    (await db.execute<{ id: string }>(statement)).rows[0].id;

  const artistId = await id(sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`);
  const otherArtistId = await id(sql`INSERT INTO artists (name) VALUES ('Amebix') RETURNING id`);
  const genreId = await id(sql`INSERT INTO genres (name) VALUES ('UK82') RETURNING id`);
  const otherGenreId = await id(sql`INSERT INTO genres (name) VALUES ('Crust') RETURNING id`);
  const tagId = await id(sql`INSERT INTO tags (name) VALUES ('signed') RETURNING id`);
  const otherTagId = await id(sql`INSERT INTO tags (name) VALUES ('gift') RETURNING id`);

  const created = await (
    await createRecord(
      jsonRequest('/api/records', 'POST', {
        artistId,
        title: 'Hear Nothing',
        releaseYear: 1982,
        notes: 'original',
        genreIds: [genreId],
        tagIds: [tagId],
      }),
    )
  ).json();

  return { recordId: created.id, artistId, otherArtistId, genreId, otherGenreId, tagId, otherTagId };
}

async function genreIdsFor(recordId: string): Promise<string[]> {
  const rows = await db.execute<{ genre_id: string }>(
    sql`SELECT genre_id FROM record_genres WHERE record_id = ${recordId} ORDER BY genre_id`,
  );
  return rows.rows.map((r) => r.genre_id);
}

async function tagIdsFor(recordId: string): Promise<string[]> {
  const rows = await db.execute<{ tag_id: string }>(
    sql`SELECT tag_id FROM record_tags WHERE record_id = ${recordId} ORDER BY tag_id`,
  );
  return rows.rows.map((r) => r.tag_id);
}

/**
 * The schema itself, not the endpoint.
 *
 * A future `.default([])` — a plausible "tidy-up" — would make absent and []
 * identical before the handler ever runs, and every endpoint test asserting
 * "leave alone" would then be testing nothing. This fails loudly instead.
 */
describe('recordPatchSchema preserves absent vs empty array', () => {
  it('parses an absent nested array as undefined, not []', () => {
    const parsed = recordPatchSchema.parse({ title: 'x' });

    expect(parsed.genreIds).toBeUndefined();
    expect(parsed.tagIds).toBeUndefined();
  });

  it('parses an explicit [] as [], not undefined', () => {
    const parsed = recordPatchSchema.parse({ genreIds: [], tagIds: [] });

    expect(parsed.genreIds).toEqual([]);
    expect(parsed.tagIds).toEqual([]);
  });

  it('keeps the two distinguishable — the property .default([]) would destroy', () => {
    const absent = recordPatchSchema.parse({ title: 'x' });
    const empty = recordPatchSchema.parse({ genreIds: [] });

    expect(absent.genreIds === undefined).toBe(true);
    expect(empty.genreIds === undefined).toBe(false);
  });

  it('distinguishes them per FIELD, not per request', () => {
    // genreIds absent while tagIds is [] must not collapse into one decision.
    const parsed = recordPatchSchema.parse({ tagIds: [] });

    expect(parsed.genreIds).toBeUndefined();
    expect(parsed.tagIds).toEqual([]);
  });
});

describe('PATCH /api/records/:id — scalar fields', () => {
  it('updates only the fields supplied', async () => {
    const f = await seed();

    const response = await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { notes: 'updated' }),
      params(f.recordId),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      title: 'Hear Nothing',
      releaseYear: 1982,
      notes: 'updated',
    });
  });

  it('clears a nullable scalar when explicitly sent null', async () => {
    const f = await seed();

    const response = await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { releaseYear: null }),
      params(f.recordId),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).releaseYear).toBeNull();
  });

  it('moves the record to another artist', async () => {
    const f = await seed();

    const response = await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { artistId: f.otherArtistId }),
      params(f.recordId),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).artistId).toBe(f.otherArtistId);
  });

  it('rejects an artistId that does not exist with 400, naming the field', async () => {
    const f = await seed();

    const response = await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { artistId: UNUSED_UUID }),
      params(f.recordId),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.artistId).toBeDefined();
  });

  it('rejects an empty body', async () => {
    const f = await seed();

    const response = await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', {}),
      params(f.recordId),
    );

    expect(response.status).toBe(400);
  });

  it('rejects unknown keys', async () => {
    const f = await seed();

    const response = await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { notes: 'x', createdAt: '2020-01-01' }),
      params(f.recordId),
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await patchRecord(
      jsonRequest(`/api/records/${UNUSED_UUID}`, 'PATCH', { notes: 'x' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await patchRecord(
      jsonRequest('/api/records/nope', 'PATCH', { notes: 'x' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });
});

/**
 * The four combinations, tested across genreIds and tagIds INDEPENDENTLY.
 *
 * A handler that reads the two together — "if either is present, replace both"
 * — passes any test that varies them in lockstep and silently wipes the other
 * set in production.
 */
describe('PATCH /api/records/:id — absent vs [] across both arrays', () => {
  it('absent / absent: leaves BOTH sets alone', async () => {
    const f = await seed();

    await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { notes: 'untouched' }),
      params(f.recordId),
    );

    expect(await genreIdsFor(f.recordId)).toEqual([f.genreId]);
    expect(await tagIdsFor(f.recordId)).toEqual([f.tagId]);
  });

  it('[] / absent: clears genres, leaves tags alone', async () => {
    const f = await seed();

    await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { genreIds: [] }),
      params(f.recordId),
    );

    expect(await genreIdsFor(f.recordId)).toEqual([]);
    expect(await tagIdsFor(f.recordId)).toEqual([f.tagId]);
  });

  it('absent / []: clears tags, leaves genres alone', async () => {
    const f = await seed();

    await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { tagIds: [] }),
      params(f.recordId),
    );

    expect(await genreIdsFor(f.recordId)).toEqual([f.genreId]);
    expect(await tagIdsFor(f.recordId)).toEqual([]);
  });

  it('[] / []: clears both', async () => {
    const f = await seed();

    await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { genreIds: [], tagIds: [] }),
      params(f.recordId),
    );

    expect(await genreIdsFor(f.recordId)).toEqual([]);
    expect(await tagIdsFor(f.recordId)).toEqual([]);
  });

  it('replaces rather than appends when given a new set', async () => {
    const f = await seed();

    await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { genreIds: [f.otherGenreId] }),
      params(f.recordId),
    );

    expect(await genreIdsFor(f.recordId)).toEqual([f.otherGenreId]);
  });

  it('replaces one set without disturbing the other', async () => {
    const f = await seed();

    await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', { genreIds: [f.otherGenreId] }),
      params(f.recordId),
    );

    expect(await tagIdsFor(f.recordId)).toEqual([f.tagId]);
  });

  it('rejects an unknown genre id and changes NOTHING', async () => {
    const f = await seed();

    const response = await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', {
        notes: 'should not apply',
        genreIds: [UNUSED_UUID],
      }),
      params(f.recordId),
    );

    expect(response.status).toBe(400);

    // Neither the scalar nor the links moved.
    const row = await db.execute<{ notes: string }>(
      sql`SELECT notes FROM records WHERE id = ${f.recordId}`,
    );
    expect(row.rows[0].notes).toBe('original');
    expect(await genreIdsFor(f.recordId)).toEqual([f.genreId]);
  });
});

describe('DELETE /api/records/:id', () => {
  it('deletes the record', async () => {
    const f = await seed();

    const response = await deleteRecord(
      request(`/api/records/${f.recordId}`, { method: 'DELETE' }),
      params(f.recordId),
    );

    expect(response.status).toBe(200);

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE id = ${f.recordId}`,
    );
    expect(rows.rows[0].n).toBe(0);
  });

  /**
   * §5.2: "Cascades images + journal entries." Verified against pg_constraint:
   * records has FIVE cascading referrers — images, journal_entries,
   * price_history, record_genres and record_tags.
   */
  it('cascades every dependent row', async () => {
    const f = await seed();

    await db.execute(
      sql`INSERT INTO images (record_id, url) VALUES (${f.recordId}, 'https://x/1.jpg')`,
    );
    await db.execute(
      sql`INSERT INTO journal_entries (record_id, note) VALUES (${f.recordId}, 'note')`,
    );
    await db.execute(
      sql`INSERT INTO price_history (record_id, price, price_type) VALUES (${f.recordId}, 10.00, 'used')`,
    );

    await deleteRecord(request(`/api/records/${f.recordId}`, { method: 'DELETE' }), params(f.recordId));

    for (const table of [
      'images',
      'journal_entries',
      'price_history',
      'record_genres',
      'record_tags',
    ]) {
      const rows = await db.execute<{ n: number }>(
        sql.raw(`SELECT count(*)::int AS n FROM ${table}`),
      );
      expect(rows.rows[0].n, table).toBe(0);
    }
  });

  it('leaves the referenced genres, tags and artist in place', async () => {
    // Cascade removes the LINKS, not the reference rows themselves (§4.3).
    const f = await seed();

    await deleteRecord(request(`/api/records/${f.recordId}`, { method: 'DELETE' }), params(f.recordId));

    for (const table of ['genres', 'tags', 'artists']) {
      const rows = await db.execute<{ n: number }>(
        sql.raw(`SELECT count(*)::int AS n FROM ${table}`),
      );
      expect(rows.rows[0].n, table).toBeGreaterThan(0);
    }
  });

  /**
   * The one referrer that BLOCKS. want_list.acquired_record_id is NO ACTION
   * (verified from pg_constraint), because §7.3 makes the want list double as
   * acquisition history — deleting the record it points at would destroy that.
   */
  it('refuses with 409 when a want-list entry links to the record', async () => {
    const f = await seed();

    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, is_acquired, acquired_record_id)
          VALUES (${f.artistId}, 'Hear Nothing', true, ${f.recordId})`,
    );

    const response = await deleteRecord(
      request(`/api/records/${f.recordId}`, { method: 'DELETE' }),
      params(f.recordId),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('IN_USE');
    expect(body.error.referenceCount).toBe(1);

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE id = ${f.recordId}`,
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await deleteRecord(
      request(`/api/records/${UNUSED_UUID}`, { method: 'DELETE' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await deleteRecord(
      request('/api/records/nope', { method: 'DELETE' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  it('returns 409, not 500, when a reference appears after the count', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/records');
    const f = await seed();

    const hook = vi.spyOn(queries, 'countRecordReferences').mockImplementation(async () => {
      await db.execute(
        sql`INSERT INTO want_list (artist_id, title, is_acquired, acquired_record_id)
            VALUES (${f.artistId}, 'Raced', true, ${f.recordId})`,
      );
      return 0;
    });

    try {
      const response = await deleteRecord(
        request(`/api/records/${f.recordId}`, { method: 'DELETE' }),
        params(f.recordId),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).error.referenceCount).toBe(1);
    } finally {
      hook.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});

/**
 * PATCH writes three things — the scalars, the genre links and the tag links.
 * They must land together or not at all.
 *
 * Until this was fixed, they were three INDEPENDENT transactions, so a failure
 * in the third committed the first two behind a 500. That is worse than a wipe:
 * the record ends up with a new title AND a fully replaced genre set that the
 * caller was told never happened, so the client's model of the row is wrong in
 * a way nothing surfaces.
 *
 * The failure is forced at the LAST write, because that is the ordering where
 * the most state has already been written — a test that fails the first write
 * proves nothing, since there is nothing before it to roll back.
 */
describe('PATCH /api/records/:id — atomicity across the three writes', () => {
  it('rolls back the scalar update and the genre replacement when the tag write fails', async () => {
    const f = await seed();
    const nested = await import('@/lib/db/queries/nested');

    const spy = vi
      .spyOn(nested, 'replaceRecordTagsTx')
      .mockRejectedValue(new Error('forced failure at the third write'));
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    try {
      const response = await patchRecord(
        jsonRequest(`/api/records/${f.recordId}`, 'PATCH', {
          title: 'NEW TITLE',
          genreIds: [f.otherGenreId],
          tagIds: [f.otherTagId],
        }),
        params(f.recordId),
      );

      expect(response.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    const [row] = (
      await db.execute<{ title: string }>(
        sql`SELECT title FROM records WHERE id = ${f.recordId}`,
      )
    ).rows;
    expect(row.title).toBe('Hear Nothing');

    const genreRows = (
      await db.execute<{ genre_id: string }>(
        sql`SELECT genre_id FROM record_genres WHERE record_id = ${f.recordId}`,
      )
    ).rows;
    expect(genreRows.map((r) => r.genre_id)).toEqual([f.genreId]);

    const tagRows = (
      await db.execute<{ tag_id: string }>(
        sql`SELECT tag_id FROM record_tags WHERE record_id = ${f.recordId}`,
      )
    ).rows;
    expect(tagRows.map((r) => r.tag_id)).toEqual([f.tagId]);
  });

  it('rolls back the scalar update when the genre write fails', async () => {
    const f = await seed();
    const nested = await import('@/lib/db/queries/nested');

    const spy = vi
      .spyOn(nested, 'replaceRecordGenresTx')
      .mockRejectedValue(new Error('forced failure at the second write'));
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    try {
      const response = await patchRecord(
        jsonRequest(`/api/records/${f.recordId}`, 'PATCH', {
          title: 'NEW TITLE',
          genreIds: [f.otherGenreId],
        }),
        params(f.recordId),
      );

      expect(response.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    const [row] = (
      await db.execute<{ title: string; notes: string }>(
        sql`SELECT title, notes FROM records WHERE id = ${f.recordId}`,
      )
    ).rows;
    expect(row.title).toBe('Hear Nothing');
    expect(row.notes).toBe('original');
  });

  it('commits all three together on success', async () => {
    const f = await seed();

    const response = await patchRecord(
      jsonRequest(`/api/records/${f.recordId}`, 'PATCH', {
        title: 'NEW TITLE',
        genreIds: [f.otherGenreId],
        tagIds: [f.otherTagId],
      }),
      params(f.recordId),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.title).toBe('NEW TITLE');
    expect(body.genres.map((g: { id: string }) => g.id)).toEqual([f.otherGenreId]);
    expect(body.tags.map((t: { id: string }) => t.id)).toEqual([f.otherTagId]);
  });
});
