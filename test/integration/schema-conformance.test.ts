import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, closeTestDb } from '../helpers/db';

/**
 * A standing diff of the live schema against SPEC.md §4.
 *
 * Step 2 built the schema; §4.1 and §4.2 were then amended several times, and
 * an entire unit of corrections went missing between the spec and the code —
 * discovered only when `labels.discogs_label_id` turned out to lack the partial
 * unique index §4.1 requires. A one-time audit would not have caught the next
 * such drift; this fails the suite instead.
 *
 * Read-only: it asserts, never repairs. When it fails, either the schema is
 * wrong (write a forward-only migration) or the spec changed (update the
 * expectations here IN THE SAME COMMIT as the migration, never alone).
 *
 * Deliberately NOT exhaustive over every column: it pins the properties §4
 * states explicitly and that carry a behavioral promise — nullability where the
 * spec says NOT NULL, cascade direction, uniqueness, and the presence of the
 * indexes §4.4 names. Column-by-column type checking would duplicate the
 * Drizzle snapshot without adding a guarantee.
 */

const db = getTestDb();

afterAll(async () => {
  await closeTestDb();
});

/** Thin wrapper so each call site reads as a list of rows. */
async function execute<T extends Record<string, unknown>>(statement: ReturnType<typeof sql>) {
  const result = await db.execute(statement);
  return result.rows as unknown as T[];
}

/** Every foreign key with its ON DELETE action, as `child.column -> parent: ACTION`. */
async function foreignKeys(): Promise<string[]> {
  const rows = await execute<{ entry: string }>(sql`
    SELECT c.conrelid::regclass::text || '.' || a.attname
             || ' -> ' || c.confrelid::regclass::text
             || ': ' || CASE c.confdeltype
                          WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
                          WHEN 'c' THEN 'CASCADE'   WHEN 'n' THEN 'SET NULL'
                          WHEN 'd' THEN 'SET DEFAULT' END AS entry
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f'
     ORDER BY entry
  `);
  return rows.map((r) => r.entry);
}

describe('§4 conformance — cascade directions', () => {
  /**
   * SPEC.md §4.3 as amended: junction FKs cascade toward the OWNING entity and
   * are NO ACTION toward the REFERENCE row, so §7.4's 409 stays enforceable.
   * §4.2 adds price_history's two parent FKs.
   *
   * Pinned as a full list rather than spot checks: a new FK added without a
   * decision about its delete behavior is exactly the drift this exists to
   * catch, and an exhaustive comparison is the only way to notice an ADDITION.
   */
  it('matches §4.2 and §4.3 exactly, including additions', async () => {
    expect(await foreignKeys()).toEqual([
      'artist_genres.artist_id -> artists: CASCADE',
      'artist_genres.genre_id -> genres: NO ACTION',
      'artist_influences.source_artist_id -> artists: CASCADE',
      'artist_influences.target_artist_id -> artists: CASCADE',
      // §4.3's `artist_match_candidates`, added at step 11 unit 5. Both FKs
      // point at `artists` and cascade: a candidate naming a deleted artist is
      // meaningless, and NO ACTION would block artist deletion entirely.
      'artist_match_candidates.artist_id -> artists: CASCADE',
      'artist_match_candidates.candidate_artist_id -> artists: CASCADE',
      // §4.3's `artist_memberships`, added at step 11. Both FKs point at
      // `artists` as owner and cascade for the same reason the influence edges
      // do: a membership edge to a deleted artist is meaningless, and NO ACTION
      // here would make DELETE /api/artists/:id fail on an FK violation.
      'artist_memberships.group_artist_id -> artists: CASCADE',
      'artist_memberships.person_artist_id -> artists: CASCADE',
      'genres.parent_genre_id -> genres: NO ACTION',
      'images.record_id -> records: CASCADE',
      'journal_entries.record_id -> records: CASCADE',
      'price_history.pressing_id -> pressings: NO ACTION',
      'price_history.record_id -> records: CASCADE',
      'price_history.want_list_id -> want_list: CASCADE',
      'record_genres.genre_id -> genres: NO ACTION',
      'record_genres.record_id -> records: CASCADE',
      'record_tags.record_id -> records: CASCADE',
      'record_tags.tag_id -> tags: NO ACTION',
      'records.artist_id -> artists: NO ACTION',
      'records.format_id -> formats: NO ACTION',
      'records.label_id -> labels: NO ACTION',
      'records.pressing_id -> pressings: NO ACTION',
      'records.store_id -> record_stores: NO ACTION',
      'want_list.acquired_record_id -> records: NO ACTION',
      'want_list.artist_id -> artists: NO ACTION',
      'want_list.label_id -> labels: NO ACTION',
      'want_list.target_pressing_id -> pressings: NO ACTION',
      'want_list_genres.genre_id -> genres: NO ACTION',
      'want_list_genres.want_list_id -> want_list: CASCADE',
    ]);
  });
});

describe('§4.4 conformance — every FK column is indexed', () => {
  it('leaves no foreign-key column unindexed', async () => {
    // "Index every FK column" (§4.4). An unindexed FK makes both the join and
    // the parent's delete-time reference check a sequential scan.
    const rows = await execute<{ entry: string }>(sql`
      WITH fk AS (
        SELECT c.conrelid AS relid, c.conrelid::regclass::text AS tbl, a.attname AS col
          FROM pg_constraint c
          JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
         WHERE c.contype = 'f'
      )
      SELECT fk.tbl || '.' || fk.col AS entry
        FROM fk
       WHERE NOT EXISTS (
         SELECT 1
           FROM pg_index i
           JOIN pg_attribute ia ON ia.attrelid = i.indrelid AND ia.attnum = i.indkey[0]
          WHERE i.indrelid = fk.relid AND ia.attname = fk.col
       )
       ORDER BY entry
    `);

    expect(rows.map((r) => r.entry)).toEqual([]);
  });

  it('has the additional indexes §4.4 names', async () => {
    const required = [
      ['records', 'artist_id'],
      ['records', 'store_id'],
      ['records', 'purchase_date'],
      ['price_history', 'recorded_at'],
      ['pressings', 'discogs_release_id'],
    ] as const;

    for (const [table, column] of required) {
      const rows = await execute<{ n: string }>(sql`
        SELECT count(*)::text AS n
          FROM pg_index i
          JOIN pg_attribute ia ON ia.attrelid = i.indrelid AND ia.attnum = i.indkey[0]
         WHERE i.indrelid = ${`public.${table}`}::regclass AND ia.attname = ${column}
      `);

      expect(Number(rows[0].n), `${table}(${column}) must be indexed`).toBeGreaterThan(0);
    }
  });

  it('has the partial want_list(priority) index', async () => {
    const rows = await execute<{ indexdef: string }>(sql`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'want_list_priority_idx'
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/WHERE.*is_acquired/i);
  });

  it('has trigram indexes on records(title) and artists(name)', async () => {
    const rows = await execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
       WHERE indexdef LIKE '%gin_trgm_ops%'
       ORDER BY indexname
    `);

    expect(rows.map((r) => r.indexname)).toEqual([
      'artists_name_trgm_idx',
      'records_title_trgm_idx',
    ]);
  });
});

describe('§4.1 conformance — the three discogs find-or-create keys', () => {
  it('gives all three a partial unique index, not a plain one', async () => {
    // §4.1: "All three are find-or-create keys for §5.7 import and must behave
    // identically." labels drifted from this and nothing noticed.
    for (const [table, column] of [
      ['artists', 'discogs_artist_id'],
      ['labels', 'discogs_label_id'],
      ['pressings', 'discogs_release_id'],
    ] as const) {
      const rows = await execute<{ indexdef: string }>(sql`
        SELECT indexdef FROM pg_indexes
         WHERE tablename = ${table}
           AND indexdef LIKE ${'%UNIQUE%(' + column + ')%'}
      `);

      expect(rows, `${table}.${column} needs a unique index`).toHaveLength(1);
      expect(
        rows[0].indexdef,
        `${table}.${column} must be unique only WHEN PRESENT`,
      ).toMatch(/WHERE .*IS NOT NULL/i);
    }
  });
});

describe('§4 conformance — NOT NULL where the spec requires it', () => {
  it('matches the spec on every column §4 marks NOT NULL', async () => {
    const required: Array<[string, string]> = [
      ['artists', 'name'],
      ['genres', 'name'],
      ['labels', 'name'],
      ['formats', 'name'],
      ['formats', 'is_seeded'],
      ['record_stores', 'name'],
      ['record_stores', 'is_favorite'],
      ['tags', 'name'],
      ['records', 'title'],
      ['records', 'artist_id'],
      ['want_list', 'title'],
      ['want_list', 'artist_id'],
      ['want_list', 'priority'],
      ['want_list', 'is_acquired'],
      ['price_history', 'price'],
      ['price_history', 'price_type'],
      ['price_history', 'recorded_at'],
      ['pressings', 'is_reissue'],
      ['images', 'url'],
      ['journal_entries', 'record_id'],
      ['journal_entries', 'note'],
      ['journal_entries', 'entry_date'],
      ['discogs_cache', 'discogs_release_id'],
      ['discogs_cache', 'payload'],
      ['discogs_cache', 'fetched_at'],
      ['artist_influences', 'strength'],
    ];

    const nullable: string[] = [];
    for (const [table, column] of required) {
      const rows = await execute<{ is_nullable: string }>(sql`
        SELECT is_nullable FROM information_schema.columns
         WHERE table_name = ${table} AND column_name = ${column}
      `);

      if (rows.length === 0) nullable.push(`${table}.${column} MISSING`);
      else if (rows[0].is_nullable === 'YES') nullable.push(`${table}.${column}`);
    }

    expect(nullable).toEqual([]);
  });

  it('keeps price_history exempt from the created_at/updated_at rule', async () => {
    // §4.2: "Neither column should exist."
    const rows = await execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'price_history' AND column_name IN ('created_at', 'updated_at')
    `);

    expect(rows.map((r) => r.column_name)).toEqual([]);
  });

  it('gives every other table both timestamp columns', async () => {
    // The schema-wide rule §4 states, with price_history and the junction
    // tables as the stated exceptions.
    const exempt = [
      'price_history',
      'discogs_cache',
      // §10a specifies three columns and no more. Like its sibling above, this
      // is a cache: `fetched_at` IS its timestamp, and a separate `updated_at`
      // would be a second answer to the same question.
      'market_cache',
      'record_genres',
      'want_list_genres',
      'artist_genres',
      'record_tags',
      '__drizzle_migrations',
    ];

    // Filtered in JS rather than passed as a SQL array: Drizzle expands an
    // array parameter into a tuple, which `= ANY(...)` rejects outright.
    const rows = await execute<{ tablename: string }>(sql`
      SELECT t.tablename
        FROM pg_tables t
       WHERE t.schemaname = 'public'
         AND NOT (
           EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_name = t.tablename AND c.column_name = 'created_at')
           AND
           EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_name = t.tablename AND c.column_name = 'updated_at')
         )
       ORDER BY t.tablename
    `);

    expect(rows.map((r) => r.tablename).filter((t) => !exempt.includes(t))).toEqual([]);
  });
});

describe('§4.3 conformance — junction tables are composite-PK', () => {
  it('gives each junction table a composite primary key and no id column', async () => {
    for (const table of ['record_genres', 'want_list_genres', 'artist_genres', 'record_tags']) {
      const pk = await execute<{ n: string }>(sql`
        SELECT count(*)::text AS n
          FROM pg_constraint c
          JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
         WHERE c.contype = 'p' AND c.conrelid = ${`public.${table}`}::regclass
      `);
      expect(Number(pk[0].n), `${table} needs a 2-column PK`).toBe(2);

      const id = await execute<{ n: string }>(sql`
        SELECT count(*)::text AS n FROM information_schema.columns
         WHERE table_name = ${table} AND column_name = 'id'
      `);
      expect(Number(id[0].n), `${table} must not have an id column`).toBe(0);
    }
  });

  it('gives artist_influences a composite PK and a no-self-edge CHECK', async () => {
    const rows = await execute<{ conname: string }>(sql`
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.artist_influences'::regclass AND contype = 'c'
    `);

    expect(rows.map((r) => r.conname)).toContain('artist_influences_no_self_edge');
  });
});

describe('§4.2 conformance — price_history one-parent CHECK', () => {
  it('has the XOR check on record_id / want_list_id', async () => {
    const rows = await execute<{ def: string }>(sql`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conname = 'price_history_one_parent'
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0].def).toMatch(/<>/);
  });
});
