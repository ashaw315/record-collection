import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import {
  MAX_NESTED_IDS,
  replaceRecordGenres,
  replaceRecordTags,
  writeRecordWithNested,
} from '@/lib/db/queries/nested';

/**
 * The transactional nested-write primitive (SPEC.md §5.2, NOTES.md criterion 9).
 *
 * Nothing built before this writes two tables in one request. The parent row and
 * its junction rows must both land or neither — a record created with its genres
 * silently dropped is worse than a rejected create, because it looks successful
 * and the missing genres only surface later as absent graph edges (§8) and wrong
 * filter results.
 *
 * Deliberately isolated from the records endpoints: this is the project's first
 * transactional code, and it gets its own red-green cycle before anything
 * depends on it. The same behaviour is exercised against the REAL Neon driver in
 * neon-transactions.test.ts — local pg passing does not imply Neon passes.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

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

describe('writeRecordWithNested — the parent and its links land together', () => {
  it('creates the record and both link sets in one call', async () => {
    const artistId = await insertArtist('Discharge');
    const genreId = await insertGenre('UK82');
    const tagId = await insertTag('signed');

    const created = await writeRecordWithNested({
      values: { artistId, title: 'Hear Nothing' },
      genreIds: [genreId],
      tagIds: [tagId],
    });

    expect(created.title).toBe('Hear Nothing');
    expect(await genreIdsFor(created.id)).toEqual([genreId]);
    expect(await tagIdsFor(created.id)).toEqual([tagId]);
  });

  it('creates a record with no links at all', async () => {
    const artistId = await insertArtist('Amebix');

    const created = await writeRecordWithNested({
      values: { artistId, title: 'Arise!' },
      genreIds: [],
      tagIds: [],
    });

    expect(await genreIdsFor(created.id)).toEqual([]);
    expect(await tagIdsFor(created.id)).toEqual([]);
  });

  /**
   * The case the whole primitive exists for. A bad genre id fails the foreign
   * key AFTER the record row is inserted, and the record must not survive.
   *
   * Without the transaction this leaves a record that looks created and has
   * silently lost its genres — worse than a rejected create, because nothing
   * signals the loss.
   */
  it('ROLLS BACK the record when a genre link fails', async () => {
    const artistId = await insertArtist('Antisect');
    const missingGenre = '00000000-0000-4000-8000-000000000000';

    await expect(
      writeRecordWithNested({
        values: { artistId, title: 'In Darkness' },
        genreIds: [missingGenre],
        tagIds: [],
      }),
    ).rejects.toThrow();

    expect(await recordCount()).toBe(0);
  });

  it('ROLLS BACK the record AND its genres when a tag link fails', async () => {
    // Genres succeed, tags fail: the rollback must reach back past a
    // successful junction write, not only the failing statement.
    const artistId = await insertArtist('Rudimentary Peni');
    const genreId = await insertGenre('Anarcho');
    const missingTag = '00000000-0000-4000-8000-000000000000';

    await expect(
      writeRecordWithNested({
        values: { artistId, title: 'Death Church' },
        genreIds: [genreId],
        tagIds: [missingTag],
      }),
    ).rejects.toThrow();

    expect(await recordCount()).toBe(0);

    const links = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM record_genres`,
    );
    expect(links.rows[0].n).toBe(0);
  });

  it('rolls back when the parent itself is invalid', async () => {
    const genreId = await insertGenre('Crust');
    const missingArtist = '00000000-0000-4000-8000-000000000000';

    await expect(
      writeRecordWithNested({
        values: { artistId: missingArtist, title: 'Orphan' },
        genreIds: [genreId],
        tagIds: [],
      }),
    ).rejects.toThrow();

    expect(await recordCount()).toBe(0);
  });

  /**
   * Duplicate ids in one array. Verified against the database: the composite
   * primary key rejects a repeated (record_id, genre_id) pair, so passing the
   * same id twice would 500 unless the primitive dedupes.
   *
   * Dedupe rather than reject: a UI multi-select can plausibly submit the same
   * id twice, and the user's intent is unambiguous.
   */
  it('deduplicates repeated ids rather than failing on the composite key', async () => {
    const artistId = await insertArtist('Doom');
    const genreId = await insertGenre('Crust');

    const created = await writeRecordWithNested({
      values: { artistId, title: 'Police Bastard' },
      genreIds: [genreId, genreId, genreId],
      tagIds: [],
    });

    expect(await genreIdsFor(created.id)).toEqual([genreId]);
  });

  it('rejects more ids than MAX_NESTED_IDS before touching the database', async () => {
    // An unbounded array is an unbounded INSERT. The parent is not written
    // either, which is what distinguishes a rejected create from a partial one.
    const artistId = await insertArtist('Extreme Noise Terror');
    const tooMany = Array.from({ length: MAX_NESTED_IDS + 1 }, () => crypto.randomUUID());

    await expect(
      writeRecordWithNested({
        values: { artistId, title: 'Holocaust' },
        genreIds: tooMany,
        tagIds: [],
      }),
    ).rejects.toThrow(/at most/i);

    expect(await recordCount()).toBe(0);
  });
});

describe('replaceRecordGenres / replaceRecordTags — the PATCH primitive', () => {
  it('replaces the whole set rather than appending', async () => {
    const artistId = await insertArtist('Discharge');
    const [a, b, c] = [await insertGenre('A'), await insertGenre('B'), await insertGenre('C')];

    const created = await writeRecordWithNested({
      values: { artistId, title: 'Why' },
      genreIds: [a, b],
      tagIds: [],
    });

    await replaceRecordGenres(created.id, [c]);

    // Replace, not merge: the caller sent the complete desired set.
    expect(await genreIdsFor(created.id)).toEqual([c]);
  });

  it('removes every link when given an empty array', async () => {
    // [] means "remove all", which is the half of PATCH semantics the existing
    // strictObject shape cannot express. Unit 5 wires this to the endpoint;
    // the primitive has to support it first.
    const artistId = await insertArtist('Amebix');
    const genreId = await insertGenre('Crust');

    const created = await writeRecordWithNested({
      values: { artistId, title: 'Arise!' },
      genreIds: [genreId],
      tagIds: [],
    });

    await replaceRecordGenres(created.id, []);

    expect(await genreIdsFor(created.id)).toEqual([]);
  });

  it('leaves the OTHER link set untouched', async () => {
    // Replacing genres must not disturb tags — they are independent sets on the
    // same parent, and a shared "clear the junctions" helper would get this
    // wrong.
    const artistId = await insertArtist('Antisect');
    const genreId = await insertGenre('Crust');
    const tagId = await insertTag('signed');

    const created = await writeRecordWithNested({
      values: { artistId, title: 'In Darkness' },
      genreIds: [genreId],
      tagIds: [tagId],
    });

    await replaceRecordGenres(created.id, []);

    expect(await tagIdsFor(created.id)).toEqual([tagId]);
  });

  it('rolls back the replacement when one id is invalid', async () => {
    // A failed replace must leave the ORIGINAL set intact — a half-applied
    // replace is the same silent-corruption shape as a half-applied create.
    const artistId = await insertArtist('Sacrilege');
    const good = await insertGenre('Crust');
    const missing = '00000000-0000-4000-8000-000000000000';

    const created = await writeRecordWithNested({
      values: { artistId, title: 'Behind the Realms' },
      genreIds: [good],
      tagIds: [],
    });

    await expect(replaceRecordGenres(created.id, [good, missing])).rejects.toThrow();

    expect(await genreIdsFor(created.id)).toEqual([good]);
  });

  it('deduplicates on replace too', async () => {
    const artistId = await insertArtist('Hellbastard');
    const genreId = await insertGenre('Crust');

    const created = await writeRecordWithNested({
      values: { artistId, title: 'Ripper Crust' },
      genreIds: [],
      tagIds: [],
    });

    await replaceRecordTags(created.id, []);
    await replaceRecordGenres(created.id, [genreId, genreId]);

    expect(await genreIdsFor(created.id)).toEqual([genreId]);
  });
});
