/**
 * **The real records, captured from the database rather than typed.**
 *
 * `docs/captures/real-records.json` is what every E2E spec seeds and what
 * `src/app/records/[id]/real-records.ts` is generated from. Until 29 Sep the
 * TypeScript list was hand-maintained under a header that said "every real
 * record id in the collection" and held four real ids, eight the database
 * never had and five synthetic ones; the unit floor tests measured thirteen
 * drawings the collection does not contain. A capture cannot drift from the
 * database in that way, and the diff it prints says when the collection moved.
 *
 *     node scripts/real-records-capture.mjs            # prints the diff
 *     node scripts/real-records-capture.mjs --write    # rewrites the file
 *
 * Reads DATABASE_URL from the environment, else from .env.local. Read-only:
 * two SELECTs. Held by test/integration/real-records-capture.test.ts against
 * the local test database.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const CAPTURE_PATH = 'docs/captures/real-records.json';

/** Rows in creation order; an About that is null or blank is null; entries by date, then creation. */
export async function captureRealRecords(connectionString) {
  if (!connectionString) throw new Error('captureRealRecords: no connection string');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const records = await client.query(
      'SELECT id, title, snippet FROM records ORDER BY created_at, id',
    );
    const entries = await client.query(
      'SELECT record_id, entry_date::text AS entry_date, note FROM journal_entries ORDER BY entry_date, created_at, id',
    );
    const byRecord = new Map();
    for (const e of entries.rows) {
      if (!byRecord.has(e.record_id)) byRecord.set(e.record_id, []);
      byRecord.get(e.record_id).push({ entryDate: e.entry_date, note: e.note });
    }
    return records.rows.map((r) => ({
      id: r.id,
      title: r.title,
      about: r.snippet !== null && r.snippet.trim() !== '' ? r.snippet : null,
      entries: byRecord.get(r.id) ?? [],
    }));
  } finally {
    await client.end();
  }
}

/** What a re-capture changes, by title, so the run says what moved before anything is written. */
export function diffRows(before, after) {
  const b = new Map(before.map((r) => [r.id, r]));
  const a = new Map(after.map((r) => [r.id, r]));
  const added = after.filter((r) => !b.has(r.id)).map((r) => r.title);
  const removed = before.filter((r) => !a.has(r.id)).map((r) => r.title);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const changed = after.filter((r) => b.has(r.id) && !same(b.get(r.id), r)).map((r) => r.title);
  const unchanged = after.filter((r) => b.has(r.id) && same(b.get(r.id), r)).length;
  return { added, removed, changed, unchanged };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { config } = await import('dotenv');
  if (!process.env.DATABASE_URL) config({ path: '.env.local', quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) { process.stderr.write('DATABASE_URL is not set, in the environment or in .env.local\n'); process.exit(2); }
  const rows = await captureRealRecords(url);
  const before = existsSync(CAPTURE_PATH) ? JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) : [];
  const d = diffRows(before, rows);
  process.stdout.write(`captured ${rows.length} records (file has ${before.length}): added ${d.added.length}${d.added.length ? ' [' + d.added.join(', ') + ']' : ''}, removed ${d.removed.length}${d.removed.length ? ' [' + d.removed.join(', ') + ']' : ''}, changed ${d.changed.length}${d.changed.length ? ' [' + d.changed.join(', ') + ']' : ''}, unchanged ${d.unchanged}\n`);
  if (process.argv.includes('--write')) {
    writeFileSync(CAPTURE_PATH, JSON.stringify(rows, null, 2) + '\n');
    process.stdout.write(`${CAPTURE_PATH}: written. Now run: node scripts/generate-real-records.mjs --write\n`);
  } else {
    process.stdout.write('dry run; pass --write to rewrite the capture\n');
  }
}
