import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';

/**
 * SPEC.md §4.1/§4.2 corrections applied by drizzle/0003_schema_corrections.sql,
 * specified after step 2 was built.
 *
 * Each test names the statement it would fail against, and each asserts
 * BEHAVIOR rather than catalogue contents where behavior is what the spec
 * promises — a cascade that exists in pg_constraint but does not fire is not
 * the guarantee §4.2 asks for.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedRecordWithPrice(): Promise<{ recordId: string }> {
  const artist = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`,
  );
  const record = await db.execute<{ id: string }>(
    sql`INSERT INTO records (artist_id, title) VALUES (${artist.rows[0].id}, 'Hear Nothing') RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO price_history (record_id, price, price_type) VALUES (${record.rows[0].id}, 42.00, 'used')`,
  );
  return { recordId: record.rows[0].id };
}

async function priceHistoryCount(): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM price_history`,
  );
  return rows.rows[0].n;
}

describe('price_history cascades from its parent (SPEC.md §4.2)', () => {
  it('lets a record with price history be deleted at all', async () => {
    // The urgent case. Without ON DELETE CASCADE this DELETE raises 23503 and
    // DELETE /api/records/:id (§5.2) is impossible for any record that has ever
    // been priced. Fails against the ADD CONSTRAINT ... ON DELETE cascade for
    // price_history_record_id_records_id_fk.
    const { recordId } = await seedRecordWithPrice();
    expect(await priceHistoryCount()).toBe(1);

    await expect(
      db.execute(sql`DELETE FROM records WHERE id = ${recordId}`),
    ).resolves.toBeDefined();

    expect(await priceHistoryCount()).toBe(0);
  });

  it('cascades from want_list too, not only from records', async () => {
    const artist = await db.execute<{ id: string }>(
      sql`INSERT INTO artists (name) VALUES ('Amebix') RETURNING id`,
    );
    const want = await db.execute<{ id: string }>(
      sql`INSERT INTO want_list (artist_id, title) VALUES (${artist.rows[0].id}, 'Arise!') RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO price_history (want_list_id, price, price_type) VALUES (${want.rows[0].id}, 55.00, 'asking')`,
    );

    await db.execute(sql`DELETE FROM want_list WHERE id = ${want.rows[0].id}`);

    expect(await priceHistoryCount()).toBe(0);
  });

  it('does NOT cascade from pressings, which are shared reference rows', async () => {
    // A pressing is not this row's parent (§4.2). Cascading there would delete
    // price history belonging to a record that still exists.
    const artist = await db.execute<{ id: string }>(
      sql`INSERT INTO artists (name) VALUES ('Antisect') RETURNING id`,
    );
    const pressing = await db.execute<{ id: string }>(
      sql`INSERT INTO pressings (catalog_number) VALUES ('ABC-1') RETURNING id`,
    );
    const record = await db.execute<{ id: string }>(
      sql`INSERT INTO records (artist_id, title) VALUES (${artist.rows[0].id}, 'In Darkness') RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO price_history (record_id, pressing_id, price, price_type)
          VALUES (${record.rows[0].id}, ${pressing.rows[0].id}, 30.00, 'used')`,
    );

    // Refused by the NO ACTION FK while the price-history row references it.
    await expect(
      db.execute(sql`DELETE FROM pressings WHERE id = ${pressing.rows[0].id}`),
    ).rejects.toThrow();

    expect(await priceHistoryCount()).toBe(1);
  });
});

describe('price_history.price_type is NOT NULL (SPEC.md §4.2)', () => {
  it('rejects an insert with no price_type', async () => {
    // §7.6's fallback chain has no defined behavior for an untyped price.
    // Fails against ALTER COLUMN "price_type" SET NOT NULL.
    const artist = await db.execute<{ id: string }>(
      sql`INSERT INTO artists (name) VALUES ('Rudimentary Peni') RETURNING id`,
    );
    const record = await db.execute<{ id: string }>(
      sql`INSERT INTO records (artist_id, title) VALUES (${artist.rows[0].id}, 'Death Church') RETURNING id`,
    );

    await expect(
      db.execute(
        sql`INSERT INTO price_history (record_id, price) VALUES (${record.rows[0].id}, 10.00)`,
      ),
    ).rejects.toThrow();
  });
});

describe('price_history has no created_at/updated_at (SPEC.md §4.2)', () => {
  it('exposes recorded_at as its only timestamp', async () => {
    // Fails against the two DROP COLUMN statements. created_at duplicated
    // recorded_at; updated_at is meaningless on an append-only table.
    const rows = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns
           WHERE table_name = 'price_history'
             AND data_type LIKE 'timestamp%'
           ORDER BY column_name`,
    );

    expect(rows.rows.map((r) => r.column_name)).toEqual(['recorded_at']);
  });
});

describe('discogs find-or-create keys behave identically (SPEC.md §4.1)', () => {
  it('rejects a duplicate discogs_label_id', async () => {
    // Fails against CREATE UNIQUE INDEX labels_discogs_label_id_key. Without
    // it, §5.7 import creates duplicate labels for one Discogs entity.
    await db.execute(sql`INSERT INTO labels (name, discogs_label_id) VALUES ('Dischord', 1234)`);

    await expect(
      db.execute(sql`INSERT INTO labels (name, discogs_label_id) VALUES ('Dischord Records', 1234)`),
    ).rejects.toThrow();
  });

  it('allows many labels with a null discogs_label_id', async () => {
    // "Unique WHEN PRESENT" — a plain unique index would reject the second row
    // and make the column unusable for hand-entered labels.
    await db.execute(sql`INSERT INTO labels (name) VALUES ('Crass Records')`);

    await expect(
      db.execute(sql`INSERT INTO labels (name) VALUES ('Spiderleg')`),
    ).resolves.toBeDefined();
  });

  it('applies the same rule to artists and pressings', async () => {
    // §4.1: all three "must behave identically". Asserting them together is
    // what would catch one drifting from the others again.
    await db.execute(sql`INSERT INTO artists (name, discogs_artist_id) VALUES ('Discharge', 99)`);
    await expect(
      db.execute(sql`INSERT INTO artists (name, discogs_artist_id) VALUES ('Discharge UK', 99)`),
    ).rejects.toThrow();

    await db.execute(sql`INSERT INTO pressings (discogs_release_id) VALUES (77)`);
    await expect(
      db.execute(sql`INSERT INTO pressings (discogs_release_id) VALUES (77)`),
    ).rejects.toThrow();
  });
});
