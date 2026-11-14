/**
 * **Stored ABOUTs, verbatim, by title (the coordinator, 13 Nov).** Prints the artist, title and stored ABOUT of every
 * record whose title contains one of the arguments, case-insensitive. Read-only.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/print-abouts.mts "Hot Tuna" "Jewels" …
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

const needles = process.argv.slice(2);
if (needles.length === 0) throw new Error('print-abouts: give one or more title fragments');
const rows = (await getDb().execute<{ artist: string; title: string; snippet: string | null }>(sql`
  SELECT a.name AS artist, r.title, r.snippet FROM records r JOIN artists a ON a.id = r.artist_id ORDER BY a.name, r.title`)).rows;
for (const needle of needles) {
  const hits = rows.filter((r) => r.title.toLowerCase().includes(needle.toLowerCase()));
  if (hits.length === 0) process.stdout.write(`\n[${needle}]: no record's title contains it\n`);
  for (const r of hits) process.stdout.write(`\n${r.artist} — ${r.title}\n${r.snippet ?? '(no ABOUT)'}\n`);
}
process.exit(0);
