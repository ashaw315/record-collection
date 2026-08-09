import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { importRelease } from '@/lib/db/queries/discogs-import';
import { normalizeRelease } from '@/lib/discogs/normalize-release';

/**
 * SPEC.md §5.7 `POST /api/discogs/import`, at the QUERY LAYER.
 *
 * The failure tests run against the transactional primitive rather than the
 * endpoint, per NOTES' standing expectation: the handler pre-checks its inputs,
 * so a guard inside the transaction is unobservable from outside it. That
 * pattern has now cost three units and is not repeated here.
 *
 * §7.8 is the rule this file exists to protect: **never overwrite user-entered
 * data with external data, and `matrix_runout` in particular is
 * user-authoritative.** It is the one rule in this step where being wrong
 * destroys something the user typed by hand, off a physical record, that
 * Discogs does not have.
 */

const db = getTestDb();

const RELEASE = normalizeRelease(
  JSON.parse(readFileSync('test/fixtures/discogs/release-detailed.json', 'utf8')),
);

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const count = async (table: string): Promise<number> => {
  const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.raw(table)}`);
  return rows.rows[0].n;
};

describe('creating the record and its reference rows', () => {
  it('creates artist, label and pressing, then the record', async () => {
    const record = await importRelease({ release: RELEASE, target: 'record' });

    expect(record.title).toBe('Hear Nothing See Nothing Say Nothing');
    expect(await count('artists')).toBe(1);
    expect(await count('labels')).toBe(1);
    expect(await count('pressings')).toBe(1);
    expect(await count('records')).toBe(1);
  });

  it('maps §6 fields onto the pressing rather than the record', async () => {
    /**
     * §6: `labels[0].catno`→`pressings.catalog_number`, `year`→
     * `pressings.year_pressed`, `country`→`pressings.country_pressed`. These
     * describe the PRESSING, not the album — CLAUDE.md §8's central
     * distinction, and putting them on the record would collapse it.
     */
    await importRelease({ release: RELEASE, target: 'record' });

    const rows = await db.execute<{
      catalog_number: string;
      country_pressed: string;
      year_pressed: number;
      matrix_runout: string;
      pressing_plant: string;
      discogs_release_id: number;
    }>(sql`SELECT catalog_number, country_pressed, year_pressed, matrix_runout,
                  pressing_plant, discogs_release_id FROM pressings`);

    expect(rows.rows[0].catalog_number).toBe('CLAY LP 3');
    expect(rows.rows[0].country_pressed).toBe('UK');
    expect(rows.rows[0].year_pressed).toBe(1982);
    expect(rows.rows[0].pressing_plant).toBe('Damont');
    expect(rows.rows[0].discogs_release_id).toBe(381756);
    expect(rows.rows[0].matrix_runout).toContain('CLAY-LP-3-A2');
  });

  it('records the release year on the RECORD, which is the album year', async () => {
    // §4.2: release_year is the album's original year; year_pressed belongs to
    // the pressing. For a first pressing they coincide, which is exactly why
    // the two must not be conflated — a reissue would show the difference.
    await importRelease({ release: RELEASE, target: 'record' });

    const rows = await db.execute<{ release_year: number }>(
      sql`SELECT release_year FROM records`,
    );
    expect(rows.rows[0].release_year).toBe(1982);
  });

  it('prefers styles over genres, per §6', async () => {
    /**
     * §6: "genres + styles→genres (find-or-create; prefer styles since it's
     * more specific)." This release is genre ["Rock"], styles ["Hardcore",
     * "Punk"] — CLAUDE.md §8's flattening case, now writing to the database.
     */
    await importRelease({ release: RELEASE, target: 'record' });

    const rows = await db.execute<{ name: string }>(sql`SELECT name FROM genres ORDER BY name`);
    const names = rows.rows.map((row) => row.name);

    expect(names).toContain('Hardcore');
    expect(names).toContain('Punk');
    expect(names).toContain('Rock');
  });

  it('links the created genres to the record', async () => {
    await importRelease({ release: RELEASE, target: 'record' });

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM record_genres`,
    );
    expect(rows.rows[0].n).toBe(3);
  });
});

describe('find-or-create', () => {
  it('reuses an artist matched by discogs id rather than creating a duplicate', async () => {
    await db.execute(
      sql`INSERT INTO artists (name, discogs_artist_id) VALUES ('Discharge (UK)', 257137)`,
    );

    await importRelease({ release: { ...RELEASE, artistDiscogsId: 257137 }, target: 'record' });

    expect(await count('artists'), 'the existing artist was reused').toBe(1);

    // And the user's own name for them SURVIVES — §7.8: never overwrite
    // user-entered data with external data.
    const rows = await db.execute<{ name: string }>(sql`SELECT name FROM artists`);
    expect(rows.rows[0].name).toBe('Discharge (UK)');
  });

  it('reuses an artist matched by name when there is no discogs id', async () => {
    await db.execute(sql`INSERT INTO artists (name) VALUES ('Discharge')`);

    await importRelease({ release: RELEASE, target: 'record' });

    expect(await count('artists')).toBe(1);
  });

  it('reuses a pressing matched by discogs release id', async () => {
    // §4: pressings are SHARED and found-or-created. Two records of the same
    // pressing point at one row.
    await importRelease({ release: RELEASE, target: 'record' });
    await importRelease({ release: RELEASE, target: 'record' });

    expect(await count('pressings'), 'one pressing, shared').toBe(1);
    expect(await count('records'), 'duplicate records are legal (§4)').toBe(2);
  });
});

describe('§7.8 — never overwrite user-entered data', () => {
  /**
   * THE test this unit exists for.
   *
   * The matrix is read off the dead wax by someone holding the record.
   * CLAUDE.md §8 calls it user-authoritative; Discogs' own value is
   * contributor-submitted and frequently absent or partial. A re-import that
   * overwrote it would destroy the most reliable identification in the
   * database and replace it with a guess — silently, and with no way back.
   */
  it('leaves a user-entered matrix_runout untouched on re-import', async () => {
    await importRelease({ release: RELEASE, target: 'record' });

    // The user corrects it from the record in their hands.
    await db.execute(
      sql`UPDATE pressings SET matrix_runout = 'MY OWN READING A1/B1 VARIANT 3'`,
    );

    await importRelease({ release: RELEASE, target: 'record' });

    const rows = await db.execute<{ matrix_runout: string }>(
      sql`SELECT matrix_runout FROM pressings`,
    );
    expect(rows.rows[0].matrix_runout).toBe('MY OWN READING A1/B1 VARIANT 3');
  });

  it('leaves every other user-edited pressing field untouched too', async () => {
    // §7.8 is not matrix-only: "fields the user has edited are preserved".
    await importRelease({ release: RELEASE, target: 'record' });

    await db.execute(
      sql`UPDATE pressings SET pressing_plant = 'Porky Prime Cuts', country_pressed = 'UK/EU'`,
    );

    await importRelease({ release: RELEASE, target: 'record' });

    const rows = await db.execute<{ pressing_plant: string; country_pressed: string }>(
      sql`SELECT pressing_plant, country_pressed FROM pressings`,
    );
    expect(rows.rows[0].pressing_plant).toBe('Porky Prime Cuts');
    expect(rows.rows[0].country_pressed).toBe('UK/EU');
  });

  it('does not overwrite a user-entered matrix with an EMPTY Discogs value', async () => {
    /**
     * The nastier direction: Discogs frequently has no matrix at all (§5.7).
     * An import that wrote its value unconditionally would blank a field the
     * user filled in — destroying data and replacing it with nothing, which is
     * the worst available outcome.
     */
    await importRelease({ release: { ...RELEASE, matrixRunout: [] }, target: 'record' });

    await db.execute(sql`UPDATE pressings SET matrix_runout = 'HAND READ A1'`);

    await importRelease({ release: { ...RELEASE, matrixRunout: [] }, target: 'record' });

    const rows = await db.execute<{ matrix_runout: string }>(
      sql`SELECT matrix_runout FROM pressings`,
    );
    expect(rows.rows[0].matrix_runout).toBe('HAND READ A1');
  });
});

describe('overrides (§5.7)', () => {
  it('takes the user value over the Discogs one for every field it covers', async () => {
    // §5.7: overrides "take precedence over the Discogs values for every field
    // they cover". The user is holding the record; Discogs is not.
    const record = await importRelease({
      release: RELEASE,
      target: 'record',
      overrides: { title: 'Hear Nothing (my copy)', conditionMedia: 'VG+', purchasePrice: '24.50' },
    });

    expect(record.title).toBe('Hear Nothing (my copy)');
    expect(record.conditionMedia).toBe('VG+');
    expect(record.purchasePrice).toBe('24.50');
  });

  it('applies a pressing override to the pressing, not the record', async () => {
    await importRelease({
      release: RELEASE,
      target: 'record',
      overrides: { matrixRunout: 'CORRECTED FROM THE DEAD WAX' },
    });

    const rows = await db.execute<{ matrix_runout: string }>(
      sql`SELECT matrix_runout FROM pressings`,
    );
    expect(rows.rows[0].matrix_runout).toBe('CORRECTED FROM THE DEAD WAX');
  });

  it('does not let an absent override blank a Discogs value', async () => {
    // Absent means "no opinion", not "clear it" — the .default() trap from
    // NOTES, in override form.
    const record = await importRelease({
      release: RELEASE,
      target: 'record',
      overrides: { conditionMedia: 'VG+' },
    });

    expect(record.title, 'the untouched field keeps its Discogs value').toBe(
      'Hear Nothing See Nothing Say Nothing',
    );
  });
});

describe('target: want_list', () => {
  it('creates a want-list row rather than a record', async () => {
    await importRelease({ release: RELEASE, target: 'want_list' });

    expect(await count('want_list')).toBe(1);
    expect(await count('records'), 'no record is created').toBe(0);
  });

  it('sets the target pressing, which is the point of wanting a specific one', async () => {
    // §7.2: the target pressing IS the best dig. Importing a want-list item
    // from a specific release and losing which pressing it was would discard
    // the reason for importing that release rather than the master.
    await importRelease({ release: RELEASE, target: 'want_list' });

    const rows = await db.execute<{ target_pressing_id: string | null }>(
      sql`SELECT target_pressing_id FROM want_list`,
    );
    expect(rows.rows[0].target_pressing_id).not.toBeNull();
  });
});

describe('atomicity', () => {
  it('writes nothing when the record insert fails', async () => {
    /**
     * §5.7: "Transactional." An import creates up to five rows across four
     * tables, and a half-applied one leaves orphaned reference data with no
     * record — invisible until someone wonders why the artist list has names
     * nothing points at.
     *
     * The failure is forced with an OUT-OF-RANGE year, which the column
     * rejects after the artist, label and pressing have already been written.
     * Two invented conditions were tried first and neither failed: `title:
     * null` becomes '', and a 300-character genre is legal because `name` is
     * `text` with no length bound. Checked against the schema rather than
     * assumed a third time.
     */
    await expect(
      importRelease({
        release: { ...RELEASE, year: 2_147_483_648 },
        target: 'record',
      }),
    ).rejects.toThrow();

    expect(await count('records')).toBe(0);
    expect(await count('artists'), 'the artist rolled back with it').toBe(0);
    expect(await count('labels')).toBe(0);
    expect(await count('pressings')).toBe(0);
  });

  it('rolls the reference rows back too, not just the record', async () => {
    // The half-applied case that matters: artist and label are written FIRST,
    // so a naive implementation leaves them behind when the record fails.
    await expect(
      importRelease({ release: { ...RELEASE, year: 2_147_483_648 }, target: 'want_list' }),
    ).rejects.toThrow();

    expect(await count('want_list')).toBe(0);
    expect(await count('artists')).toBe(0);
    expect(await count('genres')).toBe(0);
  });
});
