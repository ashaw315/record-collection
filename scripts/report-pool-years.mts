/*
  Whether every record the pick is given holds a year, read-only (the coordinator, 21 Nov, before Design rules on passing
  the year to the pick: a partial year column would leave the pick certain for some records and blind for others). The
  pool is every record with matched text; for each, the record's release year and its pressing's year.

    node --env-file=.env.local --conditions=react-server --import tsx scripts/report-pool-years.mts
*/
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
type Row = { title: string; artist: string; releaseYear: number | null; yearPressed: number | null };
const rows = (await getDb().execute<Row>(sql`
  SELECT r.title, a.name AS artist, r.release_year AS "releaseYear", p.year_pressed AS "yearPressed"
  FROM records r JOIN artists a ON a.id = r.artist_id JOIN pressings p ON p.id = r.pressing_id
  JOIN record_matched_text m ON m.record_id = r.id AND coalesce(m.edited, m.generated) IS NOT NULL
  ORDER BY a.name, r.title`)).rows;
const noRelease = rows.filter((r) => r.releaseYear === null);
const noPressed = rows.filter((r) => r.yearPressed === null);
const differ = rows.filter((r) => r.releaseYear !== null && r.yearPressed !== null && r.releaseYear !== r.yearPressed);
console.log(`${rows.length} records in the pool; release year null on ${noRelease.length}, pressing year null on ${noPressed.length}, the two differ on ${differ.length}`);
for (const r of noRelease) console.log(`  no release year: ${r.artist} — ${r.title} (pressed ${r.yearPressed ?? 'null'})`);
for (const r of noPressed) console.log(`  no pressing year: ${r.artist} — ${r.title} (released ${r.releaseYear ?? 'null'})`);
for (const r of differ) console.log(`  reissue: ${r.artist} — ${r.title}, released ${r.releaseYear}, this pressing ${r.yearPressed}`);
process.exit(0);
