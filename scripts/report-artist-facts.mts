/*
  Q37's landing check (the coordinator, 21 Nov): after Adam ran the backfill and the resolver's --apply, how many artists
  with records hold an MBID, a formed year and an origin, read from the data rather than from a pasted terminal line.
  Read-only; prints the counts and the artists still missing each field.
*/
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
const db = getDb();
type Row = { name: string; mbid: string | null; formedYear: number | null; origin: string | null; records: number; members: number; walked: boolean; mbType: string | null; mbBegin: string | null };
const rows = (await db.execute<Row>(sql`
  SELECT a.name, a.musicbrainz_id AS mbid, a.formed_year AS "formedYear", a.origin_country AS origin, count(r.id)::int AS records,
         (SELECT count(*)::int FROM artist_memberships m WHERE m.group_artist_id = a.id) AS members,
         EXISTS (SELECT 1 FROM musicbrainz_cache c WHERE c.musicbrainz_id = a.musicbrainz_id) AS walked,
         (SELECT c.payload->>'type' FROM musicbrainz_cache c WHERE c.musicbrainz_id = a.musicbrainz_id) AS "mbType",
         (SELECT c.payload->'life-span'->>'begin' FROM musicbrainz_cache c WHERE c.musicbrainz_id = a.musicbrainz_id) AS "mbBegin"
  FROM artists a JOIN records r ON r.artist_id = a.id
  GROUP BY a.id ORDER BY a.name`)).rows;
const n = (pred: (r: Row) => boolean) => rows.filter(pred).length;
console.log(`${rows.length} artists with records`);
console.log(`  MBID held: ${n((r) => r.mbid !== null)}; missing: ${rows.filter((r) => r.mbid === null).map((r) => r.name).join('; ') || 'none'}`);
console.log(`  payload cached (walked): ${n((r) => r.walked)}`);
console.log(`  formed year held: ${n((r) => r.formedYear !== null)}; origin held: ${n((r) => r.origin !== null)}; both: ${n((r) => r.formedYear !== null && r.origin !== null)}`);
console.log(`  members recorded for: ${n((r) => r.members > 0)}`);
console.log(`  MBID held but no cached payload: ${rows.filter((r) => r.mbid !== null && !r.walked).map((r) => r.name).join('; ') || 'none'}`);
console.log(`  MBID held but formed year null (name: MusicBrainz type, life-span begin):`);
for (const r of rows.filter((r) => r.mbid !== null && r.formedYear === null)) console.log(`    ${r.name}: ${r.mbType ?? 'no payload'}, ${r.mbBegin ?? 'no begin'}`);
console.log(`  MBID held but origin null: ${rows.filter((r) => r.mbid !== null && r.origin === null).map((r) => r.name).join('; ') || 'none'}`);
process.exit(0);
