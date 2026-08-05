import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists } from '@/db/schema';
import { orderFor } from '@/lib/db/order';

/**
 * SPEC.md §5 sort behavior, tested against a genuinely nullable column.
 *
 * `tags` cannot cover this: every one of its columns is NOT NULL, so a
 * NULLS LAST clause there is unreachable and a test asserting it would pass
 * whatever the implementation did. `artists.formed_year` is nullable and is
 * exactly the shape the remaining reference resources will sort by — as are
 * record_stores.city and artists.origin_country.
 *
 * Postgres defaults to NULLS LAST for ASC but NULLS FIRST for DESC. Sorting a
 * nullable column descending therefore leads with every row whose value is
 * unknown, which is never what "newest first" or "highest first" means to a
 * user.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seed(): Promise<void> {
  // Deliberately interleaved so a null cannot be last by insertion accident.
  for (const [name, year] of [
    ['Discharge', 1977],
    ['Unknown Act A', null],
    ['Amebix', 1978],
    ['Unknown Act B', null],
    ['Antisect', 1982],
  ] as const) {
    await db.execute(
      sql`INSERT INTO artists (name, formed_year) VALUES (${name}, ${year})`,
    );
  }
}

async function namesOrderedBy(direction: 'asc' | 'desc'): Promise<string[]> {
  const rows = await db
    .select({ name: artists.name })
    .from(artists)
    .orderBy(...orderFor(artists.formedYear, direction, artists.id));

  return rows.map((r) => r.name);
}

describe('orderFor — NULLS LAST on a nullable column', () => {
  it('puts nulls last when sorting ascending', async () => {
    await seed();
    const names = await namesOrderedBy('asc');

    expect(names.slice(0, 3)).toEqual(['Discharge', 'Amebix', 'Antisect']);
    expect(names.slice(3).sort()).toEqual(['Unknown Act A', 'Unknown Act B']);
  });

  it('puts nulls last when sorting descending, against the Postgres default', async () => {
    // This is the assertion that matters: the default here is NULLS FIRST, so
    // without the explicit clause the two unknown artists lead the list.
    await seed();
    const names = await namesOrderedBy('desc');

    expect(names.slice(0, 3)).toEqual(['Antisect', 'Amebix', 'Discharge']);
    expect(names.slice(3).sort()).toEqual(['Unknown Act A', 'Unknown Act B']);
  });

  it('orders the non-null rows correctly in both directions', async () => {
    await seed();

    const ascending = (await namesOrderedBy('asc')).slice(0, 3);
    const descending = (await namesOrderedBy('desc')).slice(0, 3);

    expect(descending).toEqual([...ascending].reverse());
  });
});

describe('orderFor — tiebreaker', () => {
  it('returns a stable order for rows tied on the sort column', async () => {
    // Every row shares a formed_year, so the sort column decides nothing and
    // the tiebreaker decides everything.
    for (let i = 0; i < 40; i += 1) {
      await db.execute(
        sql`INSERT INTO artists (name, formed_year) VALUES (${`act-${String(i).padStart(3, '0')}`}, 1977)`,
      );
    }

    const first = await namesOrderedBy('asc');
    await db.execute(sql`UPDATE artists SET updated_at = now() WHERE name = 'act-005'`);
    const second = await namesOrderedBy('asc');

    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(40);
  });

  it('applies the tiebreaker in both directions', async () => {
    for (let i = 0; i < 40; i += 1) {
      await db.execute(
        sql`INSERT INTO artists (name, formed_year) VALUES (${`act-${String(i).padStart(3, '0')}`}, 1977)`,
      );
    }

    const first = await namesOrderedBy('desc');
    await db.execute(sql`UPDATE artists SET updated_at = now() WHERE name = 'act-005'`);

    expect(await namesOrderedBy('desc')).toEqual(first);
  });
});
