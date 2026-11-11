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
/**
 * `records` is each record as "title · id": a leaked record is named, and one sharing a title with the seventeen is told
 * apart (10 Nov). `releases` is each cached release's Discogs id (Q67, 10 Nov): a spec seeds a release under an id of the
 * run's own, and the id names what was left where a count could not.
 */
/**
 * `pressings` is each pressing as "catalogue number · id" (Q67's pressing half, 11 Nov): a pressing is found-or-created
 * with a record and not shared by name, so every one the end holds that the start did not is a leak, with nothing to
 * stand.
 */
/**
 * `labels` is each label by name (Q67's labels half, 11 Nov): shared by name, so a Discogs fixture's label stands as its
 * genre does, and a name a spec posted and did not register is a leak.
 */
export type Ledger = { tables: Record<string, number>; genres: string[]; records: string[]; releases: number[]; pressings: string[]; labels: string[] };

type Db = ReturnType<typeof getTestDb>;

export async function readLedger(db: Db): Promise<Ledger> {
  const names = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`);
  const tables: Record<string, number> = {};
  for (const row of names.rows as Array<{ tablename: string }>) {
    const count = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${row.tablename}"`));
    tables[row.tablename] = (count.rows[0] as { n: number }).n;
  }
  const genres = await db.execute(sql`SELECT name FROM genres ORDER BY name`);
  const records = await db.execute(sql`SELECT title, id FROM records ORDER BY title, id`);
  const releases = await db.execute(sql`SELECT discogs_release_id FROM discogs_cache ORDER BY 1`);
  const pressings = await db.execute(sql`SELECT coalesce(catalog_number, '') AS catalog, id FROM pressings ORDER BY 2`);
  const labels = await db.execute(sql`SELECT name FROM labels ORDER BY name`);
  return {
    tables,
    genres: (genres.rows as Array<{ name: string }>).map((g) => g.name),
    records: (records.rows as Array<{ title: string; id: string }>).map((r) => `${r.title} · ${r.id}`),
    releases: (releases.rows as Array<{ discogs_release_id: number }>).map((r) => r.discogs_release_id),
    pressings: (pressings.rows as Array<{ catalog: string; id: string }>).map((p) => `${p.catalog} · ${p.id}`),
    labels: (labels.rows as Array<{ name: string }>).map((l) => l.name),
  };
}

/** What the end holds that the start did not: the genres by name, the records by title and id, the releases by id, and every table whose count moved. */
export function compareLedgers(start: Ledger, end: Ledger): { genresLeft: string[]; recordsLeft: string[]; releasesLeft: number[]; pressingsLeft: string[]; labelsLeft: string[]; moved: Array<{ table: string; start: number; end: number }> } {
  const had = new Set(start.genres);
  const genresLeft = end.genres.filter((name) => !had.has(name));
  const hadRecords = new Set(start.records);
  const recordsLeft = end.records.filter((r) => !hadRecords.has(r));
  const hadReleases = new Set(start.releases);
  const releasesLeft = end.releases.filter((id) => !hadReleases.has(id));
  const hadPressings = new Set(start.pressings);
  const pressingsLeft = end.pressings.filter((p) => !hadPressings.has(p));
  const hadLabels = new Set(start.labels);
  const labelsLeft = end.labels.filter((name) => !hadLabels.has(name));
  const moved = Object.keys(end.tables)
    .filter((table) => (start.tables[table] ?? 0) !== end.tables[table])
    .map((table) => ({ table, start: start.tables[table] ?? 0, end: end.tables[table] }));
  return { genresLeft, recordsLeft, releasesLeft, pressingsLeft, labelsLeft, moved };
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

/**
 * Every release id a Discogs fixture carries as its own (Q67, 10 Nov). `seedDiscogsCache` caches a fixture under that
 * id, an upsert two workers share: `lookup-flows` seeds 381756 in a beforeAll because an afterAll that removed it took
 * the row from under a sibling worker's test. So a fixture's own id stands, as a fixture's genre does, bounded by the
 * fixtures; a release under an id of the run's own (900,000,000 upward, `seedRelease`, `seedDiscogsCacheAs`) is a leak.
 * Read from the files, so a new fixture's id is covered.
 */
export function fixtureReleaseIds(dir: string = join('test', 'fixtures', 'discogs')): Set<number> {
  const ids = new Set<number>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const { id } = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { id?: unknown };
    if (typeof id === 'number') ids.add(id);
  }
  return ids;
}

/** The releases left behind, split: the fixtures' own ids, which stand, and everything else, which is a leak. */
export function judgeReleases(left: number[], fixtures: Set<number>): { fromFixtures: number[]; leaked: number[] } {
  return { fromFixtures: left.filter((id) => fixtures.has(id)), leaked: left.filter((id) => !fixtures.has(id)) };
}

/**
 * Every label name a Discogs fixture carries (Q67's labels half, 11 Nov). The app finds or creates a label by its plain
 * name when a test saves a record prefilled from a fixture, so two workers share it and neither owns it: it stands, as
 * a fixture's genre does, bounded by the fixtures. Read from the files' `labels[].name`, wherever it sits.
 */
export function fixtureLabelNames(dir: string = join('test', 'fixtures', 'discogs')): Set<string> {
  const names = new Set<string>();
  const walk = (value: unknown, key: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
    } else if (value !== null && typeof value === 'object') {
      const name = (value as { name?: unknown }).name;
      if (key === 'labels' && typeof name === 'string') names.add(name);
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.json')) walk(JSON.parse(readFileSync(join(dir, file), 'utf8')), '');
  }
  return names;
}

/** The labels left behind, split: the fixtures' own names, which stand, and everything else, which is a leak. */
export function judgeLabels(left: string[], fixtures: Set<string>): { fromFixtures: string[]; leaked: string[] } {
  return { fromFixtures: left.filter((name) => fixtures.has(name)), leaked: left.filter((name) => !fixtures.has(name)) };
}
