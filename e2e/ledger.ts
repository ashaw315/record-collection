import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { getTestDb } from '../test/helpers/db';

/**
 * **What the test database holds, read at the start of a run and again at
 * its end.**
 *
 * A suite whose result depends on what earlier tests left in the database
 * has its own history as a hidden condition: 204 genres left by a full run
 * made one test fail on every gate (6 Oct), in a spec no commit had
 * touched. Whether specs clean up cannot be inferred from their passing, so
 * the run reads it: the setup records the state after seeding, and the
 * teardown compares.
 *
 * Genres are the rule, because they are what broke a gate: any genre the
 * run leaves that it did not start with fails the run, by name. Every other
 * table's difference is printed and not yet a failure; those are measured
 * and recorded, and each becomes a rule when its cleanup exists.
 */
export type Ledger = { tables: Record<string, number>; genres: string[] };

type Db = ReturnType<typeof getTestDb>;

export async function readLedger(db: Db): Promise<Ledger> {
  const names = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`);
  const tables: Record<string, number> = {};
  for (const row of names.rows as Array<{ tablename: string }>) {
    const count = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${row.tablename}"`));
    tables[row.tablename] = (count.rows[0] as { n: number }).n;
  }
  const genres = await db.execute(sql`SELECT name FROM genres ORDER BY name`);
  return { tables, genres: (genres.rows as Array<{ name: string }>).map((g) => g.name) };
}

/** What the end holds that the start did not: the genres by name, and every table whose count moved. */
export function compareLedgers(start: Ledger, end: Ledger): { genresLeft: string[]; moved: Array<{ table: string; start: number; end: number }> } {
  const had = new Set(start.genres);
  const genresLeft = end.genres.filter((name) => !had.has(name));
  const moved = Object.keys(end.tables)
    .filter((table) => (start.tables[table] ?? 0) !== end.tables[table])
    .map((table) => ({ table, start: start.tables[table] ?? 0, end: end.tables[table] }));
  return { genresLeft, moved };
}

/** The setup and the teardown run in one process; the environment carries the start between them. */
const KEY = 'E2E_LEDGER_START';
export const saveStart = (ledger: Ledger): void => { process.env[KEY] = JSON.stringify(ledger); };
export const loadStart = (): Ledger | null => {
  const raw = process.env[KEY];
  return raw === undefined || raw === '' ? null : (JSON.parse(raw) as Ledger);
};

/**
 * Every genre and style a Discogs fixture names. The app finds or creates
 * these by their plain names when a test saves a record prefilled from a
 * fixture, so two workers share them and neither test owns one to delete.
 * They are bounded by the fixtures. Read from the files, so a new fixture's
 * names are covered and no list here can go stale.
 */
export function fixtureVocabulary(dir: string = join('test', 'fixtures', 'discogs')): Set<string> {
  const names = new Set<string>();
  const walk = (value: unknown, key: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && /^(genres?|styles?)$/.test(key)) names.add(item);
        else walk(item, key);
      }
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.json')) walk(JSON.parse(readFileSync(join(dir, file), 'utf8')), '');
  }
  return names;
}

/** The genres left behind, split: the fixtures' own names, which stand, and everything else, which is a leak. */
export function judgeGenres(left: string[], vocabulary: Set<string>): { fromFixtures: string[]; leaked: string[] } {
  return { fromFixtures: left.filter((name) => vocabulary.has(name)), leaked: left.filter((name) => !vocabulary.has(name)) };
}
