/**
 * **The collection's captions, for the count column's stack (the coordinator, 12 Nov).** §P.4 caps no title's lines,
 * so five cells have no one height: the stack is a range, from five un-wrapped captions to the tallest five the real
 * collection produces. This reads the 55 records' titles and artists from production, read-only, and writes them as
 * JSON for a report-only test that renders each caption at §T.5's 160 in the app's own type and measures it; the
 * figures are computed from the collection, never guessed.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/export-captions.mts docs/measurements/ask-captions/records.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

const out = process.argv[2];
if (out === undefined) throw new Error('name the JSON file to write');
const rows = (await getDb().execute<{ title: string; artist: string }>(sql`SELECT r.title, a.name AS artist FROM records r JOIN artists a ON a.id = r.artist_id ORDER BY r.title`)).rows;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ readOn: new Date().toISOString().slice(0, 10), records: rows }, null, 2)}\n`);
process.stdout.write(`${rows.length} records written to ${out}\n`);
