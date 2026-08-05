import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { REFERRERS } from '@/lib/db/queries/referrers';

/**
 * SPEC.md §7.4 requires a delete to be refused when a reference row is in use,
 * with an accurate referenceCount. That count is only correct if it enumerates
 * EVERY foreign key pointing at the table.
 *
 * For tags there is exactly one (record_tags.tag_id). For artists there will be
 * five. A hand-maintained list silently under-reports the moment a new referrer
 * is added — the delete then fails on the foreign key instead, and the count in
 * the 409 is wrong.
 *
 * So the list is checked against pg_constraint itself: adding a referrer to the
 * schema without declaring it here fails this test, which makes the omission a
 * visible edit rather than a silent one. This is the generalization the
 * remaining five resources depend on.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

type ActualReferrer = {
  child_table: string;
  child_column: string;
  parent_table: string;
  on_delete: string;
};

/** Every FK in the schema that points at one of the declared parent tables. */
async function actualReferrers(parentTable: string): Promise<ActualReferrer[]> {
  const result = await db.execute<ActualReferrer>(sql`
    SELECT c.conrelid::regclass::text AS child_table,
           a.attname                  AS child_column,
           c.confrelid::regclass::text AS parent_table,
           CASE c.confdeltype
             WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
             WHEN 'c' THEN 'CASCADE'   WHEN 'n' THEN 'SET NULL'
             WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f'
       AND c.confrelid::regclass::text = ${parentTable}
     ORDER BY child_table, child_column
  `);
  return result.rows;
}

describe('declared referrers match the schema', () => {
  for (const [parentTable, declared] of Object.entries(REFERRERS)) {
    it(`${parentTable}: every blocking FK in the database is declared`, async () => {
      const actual = await actualReferrers(parentTable);

      // Only NO ACTION / RESTRICT foreign keys can block a delete. A CASCADE
      // referrer removes itself and must NOT be counted — counting it would
      // refuse a delete the database would happily perform.
      const blocking = actual
        .filter((r) => r.on_delete === 'NO ACTION' || r.on_delete === 'RESTRICT')
        .map((r) => `${r.child_table}.${r.child_column}`)
        .sort();

      const declaredKeys = declared.map((r) => `${r.table}.${r.column}`).sort();

      expect(declaredKeys).toEqual(blocking);
    });

    it(`${parentTable}: no declared referrer is actually a cascade`, async () => {
      const actual = await actualReferrers(parentTable);
      const cascading = new Set(
        actual
          .filter((r) => r.on_delete === 'CASCADE')
          .map((r) => `${r.child_table}.${r.child_column}`),
      );

      for (const referrer of declared) {
        expect(
          cascading.has(`${referrer.table}.${referrer.column}`),
          `${referrer.table}.${referrer.column} cascades; counting it would refuse a legal delete`,
        ).toBe(false);
      }
    });
  }

  it('covers tags, whose only blocking referrer is record_tags.tag_id', async () => {
    // Pins the present state so a schema change that adds a tag referrer is
    // caught by name, not merely by count.
    expect(REFERRERS.tags.map((r) => `${r.table}.${r.column}`)).toEqual(['record_tags.tag_id']);
  });
});
