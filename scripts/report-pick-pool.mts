/*
  What the pick is given for a record, read-only (the coordinator, 21 Nov, on "not evidence of a recent recording"): the
  pool text the model sees (edited over generated matched text, nothing else: no title, artist or year), beside the
  record's release year and the pressing's, and any year the text itself names. For each record whose title contains an
  argument.

    node --env-file=.env.local --conditions=react-server --import tsx scripts/report-pick-pool.mts "Glenn Miller Plays"
*/
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
type Row = { title: string; artist: string; releaseYear: number | null; yearPressed: number | null; text: string | null };
const db = getDb();
for (const needle of process.argv.slice(2)) {
  const rows = (await db.execute<Row>(sql`
    SELECT r.title, a.name AS artist, r.release_year AS "releaseYear", p.year_pressed AS "yearPressed",
           coalesce(m.edited, m.generated) AS text
    FROM records r JOIN artists a ON a.id = r.artist_id JOIN pressings p ON p.id = r.pressing_id
    LEFT JOIN record_matched_text m ON m.record_id = r.id
    WHERE r.title ILIKE ${'%' + needle + '%'} ORDER BY a.name, r.title`)).rows;
  for (const r of rows) {
    const years = r.text?.match(/\b(1[89]|20)\d\d\b/g) ?? [];
    console.log(`${r.artist} — ${r.title}: release year ${r.releaseYear ?? 'null'}, pressed ${r.yearPressed ?? 'null'}; years named in the pool text: ${years.length === 0 ? 'none' : years.join(', ')}`);
    console.log(r.text === null ? '  (no matched text, so not in the pool)' : `  ${r.text}`);
  }
}
process.exit(0);
