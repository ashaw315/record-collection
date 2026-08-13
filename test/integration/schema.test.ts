import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';

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

async function insertRecord(artistId: string, title: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO records (artist_id, title) VALUES (${artistId}, ${title}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function insertWantList(artistId: string, title: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO want_list (artist_id, title) VALUES (${artistId}, ${title}) RETURNING id`,
  );
  return rows.rows[0].id;
}

describe('price_history parent CHECK constraint', () => {
  it('accepts a row parented to a record only', async () => {
    const artistId = await insertArtist('Discharge');
    const recordId = await insertRecord(artistId, 'Hear Nothing See Nothing Say Nothing');

    await expect(
      db.execute(
        sql`INSERT INTO price_history (record_id, price, price_type) VALUES (${recordId}, 42.00, 'used')`,
      ),
    ).resolves.toBeDefined();
  });

  it('accepts a row parented to a want-list item only', async () => {
    const artistId = await insertArtist('Rudimentary Peni');
    const wantId = await insertWantList(artistId, 'Death Church');

    await expect(
      db.execute(
        sql`INSERT INTO price_history (want_list_id, price, price_type) VALUES (${wantId}, 55.00, 'asking')`,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a row with BOTH record_id and want_list_id set', async () => {
    const artistId = await insertArtist('Amebix');
    const recordId = await insertRecord(artistId, 'Arise!');
    const wantId = await insertWantList(artistId, 'Arise!');

    await expect(
      db.execute(
        sql`INSERT INTO price_history (record_id, want_list_id, price, price_type)
            VALUES (${recordId}, ${wantId}, 30.00, 'used')`,
      ),
    ).rejects.toThrow();
  });

  it('rejects a row with NEITHER record_id nor want_list_id set', async () => {
    await expect(
      db.execute(sql`INSERT INTO price_history (price, price_type) VALUES (30.00, 'used')`),
    ).rejects.toThrow();
  });
});

describe('price_history is append-only (SPEC.md §7.5)', () => {
  it('rejects an UPDATE against a price_history row', async () => {
    const artistId = await insertArtist('Sacrilege');
    const recordId = await insertRecord(artistId, 'Behind the Realms of Madness');
    const inserted = await db.execute<{ id: string }>(
      sql`INSERT INTO price_history (record_id, price, price_type)
          VALUES (${recordId}, 60.00, 'used') RETURNING id`,
    );
    const priceId = inserted.rows[0].id;

    await expect(
      db.execute(sql`UPDATE price_history SET price = 10.00 WHERE id = ${priceId}`),
    ).rejects.toThrow();
  });

  it('leaves the original value intact after a rejected UPDATE', async () => {
    const artistId = await insertArtist('Antisect');
    const recordId = await insertRecord(artistId, 'In Darkness There Is No Choice');
    const inserted = await db.execute<{ id: string }>(
      sql`INSERT INTO price_history (record_id, price, price_type)
          VALUES (${recordId}, 75.00, 'used') RETURNING id`,
    );
    const priceId = inserted.rows[0].id;

    await expect(
      db.execute(sql`UPDATE price_history SET source = 'tampered' WHERE id = ${priceId}`),
    ).rejects.toThrow();

    const after = await db.execute<{ price: string; source: string | null }>(
      sql`SELECT price, source FROM price_history WHERE id = ${priceId}`,
    );
    expect(Number(after.rows[0].price)).toBe(75);
    expect(after.rows[0].source).toBeNull();
  });

  it('still allows INSERT of a newer price for the same record', async () => {
    // Append-only means corrections arrive as new rows, never as edits.
    const artistId = await insertArtist('Axegrinder');
    const recordId = await insertRecord(artistId, 'Rise of the Serpent Men');
    await db.execute(
      sql`INSERT INTO price_history (record_id, price, price_type) VALUES (${recordId}, 40.00, 'used')`,
    );
    await db.execute(
      sql`INSERT INTO price_history (record_id, price, price_type) VALUES (${recordId}, 45.00, 'used')`,
    );

    const rows = await db.execute(
      sql`SELECT id FROM price_history WHERE record_id = ${recordId}`,
    );
    expect(rows.rows).toHaveLength(2);
  });

  it('still allows DELETE, which is not what append-only restricts', async () => {
    const artistId = await insertArtist('Deviated Instinct');
    const recordId = await insertRecord(artistId, 'Rock n Roll Conformity');
    const inserted = await db.execute<{ id: string }>(
      sql`INSERT INTO price_history (record_id, price, price_type)
          VALUES (${recordId}, 50.00, 'used') RETURNING id`,
    );

    await expect(
      db.execute(sql`DELETE FROM price_history WHERE id = ${inserted.rows[0].id}`),
    ).resolves.toBeDefined();
  });

  it('has no set_updated_at trigger, which would contradict append-only', async () => {
    const rows = await db.execute<{ tgname: string }>(
      sql`SELECT tgname FROM pg_trigger
          WHERE tgrelid = 'price_history'::regclass
            AND NOT tgisinternal
            AND tgname LIKE '%set_updated_at%'`,
    );
    expect(rows.rows).toHaveLength(0);
  });
});

describe('artist_influences constraints', () => {
  it('accepts a directed edge between two distinct artists', async () => {
    const source = await insertArtist('The Damned');
    const target = await insertArtist('The Misfits');

    await expect(
      db.execute(
        sql`INSERT INTO artist_influences (source_artist_id, target_artist_id, strength)
            VALUES (${source}, ${target}, 4)`,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a self-edge', async () => {
    const artistId = await insertArtist('Blitz');

    await expect(
      db.execute(
        sql`INSERT INTO artist_influences (source_artist_id, target_artist_id)
            VALUES (${artistId}, ${artistId})`,
      ),
    ).rejects.toThrow();
  });

  it('treats the pair as the primary key, rejecting a duplicate edge', async () => {
    const source = await insertArtist('Discharge');
    const target = await insertArtist('Doom');
    await db.execute(
      sql`INSERT INTO artist_influences (source_artist_id, target_artist_id) VALUES (${source}, ${target})`,
    );

    await expect(
      db.execute(
        sql`INSERT INTO artist_influences (source_artist_id, target_artist_id) VALUES (${source}, ${target})`,
      ),
    ).rejects.toThrow();
  });

  it('allows the reverse edge, because influence is directed', async () => {
    const a = await insertArtist('Motorhead');
    const b = await insertArtist('Venom');
    await db.execute(
      sql`INSERT INTO artist_influences (source_artist_id, target_artist_id) VALUES (${a}, ${b})`,
    );

    await expect(
      db.execute(
        sql`INSERT INTO artist_influences (source_artist_id, target_artist_id) VALUES (${b}, ${a})`,
      ),
    ).resolves.toBeDefined();
  });
});

describe('cascade behavior', () => {
  it('deleting a record cascades its images and journal entries', async () => {
    const artistId = await insertArtist('Poison Idea');
    const recordId = await insertRecord(artistId, 'Feel the Darkness');
    await db.execute(
      sql`INSERT INTO images (record_id, url, image_type) VALUES (${recordId}, 'https://example.test/a.jpg', 'cover')`,
    );
    await db.execute(
      sql`INSERT INTO journal_entries (record_id, note) VALUES (${recordId}, 'Found at Green Noise.')`,
    );

    await db.execute(sql`DELETE FROM records WHERE id = ${recordId}`);

    const images = await db.execute(sql`SELECT id FROM images WHERE record_id = ${recordId}`);
    const journal = await db.execute(
      sql`SELECT id FROM journal_entries WHERE record_id = ${recordId}`,
    );
    expect(images.rows).toHaveLength(0);
    expect(journal.rows).toHaveLength(0);
  });

  // SPEC.md §7.4 — reference rows in use are rejected, never cascaded. The DB
  // must refuse the delete so step 4 can surface it as a 409.
  it('refuses to delete an artist that a record references, rather than cascading', async () => {
    const artistId = await insertArtist('Rites of Spring');
    await insertRecord(artistId, 'End on End');

    await expect(db.execute(sql`DELETE FROM artists WHERE id = ${artistId}`)).rejects.toThrow();

    const remaining = await db.execute(sql`SELECT id FROM artists WHERE id = ${artistId}`);
    expect(remaining.rows).toHaveLength(1);
  });

  // SPEC.md §4.3 cascade rule. This is the boundary that regresses silently:
  // the link row must go, the referenced entity must survive.
  it('deleting a record removes its junction rows but not the genres or tags themselves', async () => {
    const artistId = await insertArtist('The Exploited');
    const recordId = await insertRecord(artistId, 'Punks Not Dead');
    const genre = await db.execute<{ id: string }>(
      sql`INSERT INTO genres (name) VALUES ('UK82') RETURNING id`,
    );
    const tag = await db.execute<{ id: string }>(
      sql`INSERT INTO tags (name) VALUES ('signed') RETURNING id`,
    );
    const genreId = genre.rows[0].id;
    const tagId = tag.rows[0].id;
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${recordId}, ${genreId})`,
    );
    await db.execute(sql`INSERT INTO record_tags (record_id, tag_id) VALUES (${recordId}, ${tagId})`);

    await db.execute(sql`DELETE FROM records WHERE id = ${recordId}`);

    const links = await db.execute(
      sql`SELECT record_id FROM record_genres WHERE record_id = ${recordId}`,
    );
    const tagLinks = await db.execute(
      sql`SELECT record_id FROM record_tags WHERE record_id = ${recordId}`,
    );
    expect(links.rows).toHaveLength(0);
    expect(tagLinks.rows).toHaveLength(0);

    // The entities themselves are untouched — a genre is not owned by a record.
    const survivingGenre = await db.execute(sql`SELECT id FROM genres WHERE id = ${genreId}`);
    const survivingTag = await db.execute(sql`SELECT id FROM tags WHERE id = ${tagId}`);
    expect(survivingGenre.rows).toHaveLength(1);
    expect(survivingTag.rows).toHaveLength(1);
  });

  it('deleting an artist with no records removes their influence edges', async () => {
    const orphan = await insertArtist('Chron Gen');
    const other = await insertArtist('Anti-Nowhere League');
    await db.execute(
      sql`INSERT INTO artist_influences (source_artist_id, target_artist_id) VALUES (${orphan}, ${other})`,
    );
    await db.execute(
      sql`INSERT INTO artist_influences (source_artist_id, target_artist_id) VALUES (${other}, ${orphan})`,
    );

    await db.execute(sql`DELETE FROM artists WHERE id = ${orphan}`);

    const edges = await db.execute(
      sql`SELECT source_artist_id FROM artist_influences
          WHERE source_artist_id = ${orphan} OR target_artist_id = ${orphan}`,
    );
    expect(edges.rows).toHaveLength(0);

    // The other artist is unaffected by the cascade.
    const survivor = await db.execute(sql`SELECT id FROM artists WHERE id = ${other}`);
    expect(survivor.rows).toHaveLength(1);
  });

  it('still refuses to delete an artist WITH records, despite the influence cascade', async () => {
    // §4.3's cascade must not open a hole in §7.4: the NO ACTION FK on
    // records.artist_id is what keeps an in-use artist a 409.
    const artistId = await insertArtist('Cock Sparrer');
    const other = await insertArtist('Cocksparrer Influence');
    await db.execute(
      sql`INSERT INTO artist_influences (source_artist_id, target_artist_id) VALUES (${artistId}, ${other})`,
    );
    await insertRecord(artistId, 'Shock Troops');

    await expect(db.execute(sql`DELETE FROM artists WHERE id = ${artistId}`)).rejects.toThrow();

    const stillThere = await db.execute(sql`SELECT id FROM artists WHERE id = ${artistId}`);
    expect(stillThere.rows).toHaveLength(1);
    // The edge survives too, because the delete was rejected wholesale.
    const edges = await db.execute(
      sql`SELECT source_artist_id FROM artist_influences WHERE source_artist_id = ${artistId}`,
    );
    expect(edges.rows).toHaveLength(1);
  });

  it('refuses to delete a pressing that a record references', async () => {
    const artistId = await insertArtist('Gorilla Biscuits');
    const pressing = await db.execute<{ id: string }>(
      sql`INSERT INTO pressings (catalog_number, country_pressed, year_pressed)
          VALUES ('REV 12', 'US', 1989) RETURNING id`,
    );
    const pressingId = pressing.rows[0].id;
    await db.execute(
      sql`INSERT INTO records (artist_id, title, pressing_id) VALUES (${artistId}, 'Start Today', ${pressingId})`,
    );

    await expect(db.execute(sql`DELETE FROM pressings WHERE id = ${pressingId}`)).rejects.toThrow();
  });
});

describe('duplicate records are legal (SPEC.md §4 schema-wide rule)', () => {
  it('allows the same (artist_id, title) to be inserted twice', async () => {
    const artistId = await insertArtist('Black Flag');

    const first = await insertRecord(artistId, 'Damaged');
    const second = await insertRecord(artistId, 'Damaged');

    expect(first).not.toBe(second);

    const rows = await db.execute(
      sql`SELECT id FROM records WHERE artist_id = ${artistId} AND title = 'Damaged'`,
    );
    expect(rows.rows).toHaveLength(2);
  });

  it('allows two copies of the same album in different pressings', async () => {
    // The case CLAUDE.md §8 calls out: a pressing is not an album.
    const artistId = await insertArtist('Bad Brains');
    const uk = await db.execute<{ id: string }>(
      sql`INSERT INTO pressings (catalog_number, country_pressed, year_pressed)
          VALUES ('ROIR A-106', 'US', 1982) RETURNING id`,
    );
    const reissue = await db.execute<{ id: string }>(
      sql`INSERT INTO pressings (catalog_number, country_pressed, year_pressed, is_reissue)
          VALUES ('ROIR RE-106', 'US', 2019, true) RETURNING id`,
    );

    await db.execute(
      sql`INSERT INTO records (artist_id, title, pressing_id) VALUES (${artistId}, 'Bad Brains', ${uk.rows[0].id})`,
    );
    await db.execute(
      sql`INSERT INTO records (artist_id, title, pressing_id) VALUES (${artistId}, 'Bad Brains', ${reissue.rows[0].id})`,
    );

    const rows = await db.execute(sql`SELECT id FROM records WHERE artist_id = ${artistId}`);
    expect(rows.rows).toHaveLength(2);
  });
});

describe('updated_at trigger', () => {
  it('changes updated_at on UPDATE', async () => {
    const artistId = await insertArtist('Wipers');
    const before = await db.execute<{ updated_at: Date }>(
      sql`SELECT updated_at FROM artists WHERE id = ${artistId}`,
    );

    await db.execute(sql`UPDATE artists SET notes = 'Greg Sage' WHERE id = ${artistId}`);

    const after = await db.execute<{ updated_at: Date }>(
      sql`SELECT updated_at FROM artists WHERE id = ${artistId}`,
    );
    expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(
      new Date(before.rows[0].updated_at).getTime(),
    );
  });

  it('does not change updated_at on SELECT', async () => {
    const artistId = await insertArtist('Void');
    const first = await db.execute<{ updated_at: Date }>(
      sql`SELECT updated_at FROM artists WHERE id = ${artistId}`,
    );

    const second = await db.execute<{ updated_at: Date }>(
      sql`SELECT updated_at FROM artists WHERE id = ${artistId}`,
    );

    expect(new Date(second.rows[0].updated_at).getTime()).toBe(
      new Date(first.rows[0].updated_at).getTime(),
    );
  });

  it('applies to every table, not just artists', async () => {
    const artistId = await insertArtist('Minor Threat');
    const recordId = await insertRecord(artistId, 'Out of Step');
    const before = await db.execute<{ updated_at: Date }>(
      sql`SELECT updated_at FROM records WHERE id = ${recordId}`,
    );

    await db.execute(sql`UPDATE records SET notes = 'red vinyl' WHERE id = ${recordId}`);

    const after = await db.execute<{ updated_at: Date }>(
      sql`SELECT updated_at FROM records WHERE id = ${recordId}`,
    );
    expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(
      new Date(before.rows[0].updated_at).getTime(),
    );
  });
});

describe('genre hierarchy', () => {
  it('allows a genre to reference a parent genre', async () => {
    const parent = await db.execute<{ id: string }>(
      sql`INSERT INTO genres (name) VALUES ('Punk') RETURNING id`,
    );
    const parentId = parent.rows[0].id;

    const child = await db.execute<{ id: string }>(
      sql`INSERT INTO genres (name, parent_genre_id) VALUES ('UK82', ${parentId}) RETURNING id`,
    );

    const rows = await db.execute<{ parent_genre_id: string }>(
      sql`SELECT parent_genre_id FROM genres WHERE id = ${child.rows[0].id}`,
    );
    expect(rows.rows[0].parent_genre_id).toBe(parentId);
  });

  it('rejects a parent_genre_id that does not exist', async () => {
    await expect(
      db.execute(
        sql`INSERT INTO genres (name, parent_genre_id)
            VALUES ('Orphan', '00000000-0000-0000-0000-000000000000')`,
      ),
    ).rejects.toThrow();
  });

  it('refuses to delete a genre that is still a parent', async () => {
    const parent = await db.execute<{ id: string }>(
      sql`INSERT INTO genres (name) VALUES ('Metal') RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO genres (name, parent_genre_id) VALUES ('Doom', ${parent.rows[0].id})`,
    );

    await expect(
      db.execute(sql`DELETE FROM genres WHERE id = ${parent.rows[0].id}`),
    ).rejects.toThrow();
  });
});

describe('schema-level guarantees', () => {
  it('has pg_trgm enabled', async () => {
    const rows = await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`);
    expect(rows.rows).toHaveLength(1);
  });

  it('has NO unique constraint on records (artist_id, title)', async () => {
    // The rule this protects is SPEC.md §4: duplicate records are legal. A
    // unique index here would be silently catastrophic, so assert its absence
    // structurally rather than relying only on the insert-twice test.
    const rows = await db.execute<{ indexdef: string }>(
      sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'records'`,
    );
    const offending = rows.rows.filter(
      (r) =>
        r.indexdef.includes('UNIQUE') &&
        r.indexdef.includes('artist_id') &&
        r.indexdef.includes('title'),
    );
    expect(offending).toHaveLength(0);
  });

  it('indexes want_list(priority) PARTIALLY, on unacquired rows only', async () => {
    const rows = await db.execute<{ indexdef: string }>(
      sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'want_list' AND indexdef LIKE '%priority%'`,
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows.some((r) => r.indexdef.toLowerCase().includes('where'))).toBe(true);
  });

  it('seeds exactly the seven formats from SPEC.md §4.1', async () => {
    const rows = await db.execute<{ name: string }>(sql`SELECT name FROM formats ORDER BY name`);
    const names = rows.rows.map((r) => r.name).sort();
    expect(names).toEqual(
      ['LP', '2xLP', '7"', '10"', '12" Single', 'Box Set', 'Picture Disc'].sort(),
    );
  });

  it('defines the three enums with exactly the specified values', async () => {
    const check = async (typeName: string) => {
      const rows = await db.execute<{ enumlabel: string }>(
        sql`SELECT enumlabel FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = ${typeName}
            ORDER BY e.enumsortorder`,
      );
      return rows.rows.map((r) => r.enumlabel);
    };

    expect(await check('condition_grade')).toEqual(['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P']);
    /**
     * §4.2 as amended. `best_dig` was migrated out in 0005 — it names a
     * PRESSING, and modelling it as a price is CLAUDE.md §8's conflation
     * written into the schema. `asking` replaced it: a price somebody wants
     * that nobody has paid.
     *
     * This assertion is the reason the change could not be made quietly, which
     * is what it is for.
     */
    expect(await check('price_type')).toEqual(['new', 'used', 'asking']);
    expect(await check('image_type')).toEqual(['cover', 'back', 'label', 'matrix', 'other']);
  });
});
