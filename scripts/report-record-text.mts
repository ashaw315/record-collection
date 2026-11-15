/**
 * **What Discogs text each named record holds, read-only (the coordinator, 15 Nov: choosing matched-text samples).**
 * For each record whose title contains an argument: its id, whether a release is cached, and its track, credit and
 * company rows. Prints, writes nothing.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/report-record-text.mts "Hot Tuna" …
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

const needles = process.argv.slice(2);
const rows = (await getDb().execute<{ id: string; artist: string; title: string; cached: boolean; tracks: number; credits: number; companies: number }>(sql`
  SELECT r.id, a.name AS artist, r.title, (c.discogs_release_id IS NOT NULL) AS cached,
    count(t.*) FILTER (WHERE t.kind = 'track')::int AS tracks,
    count(t.*) FILTER (WHERE t.kind = 'credit')::int AS credits,
    count(t.*) FILTER (WHERE t.kind = 'company')::int AS companies
  FROM records r JOIN artists a ON a.id = r.artist_id
  LEFT JOIN pressings p ON p.id = r.pressing_id
  LEFT JOIN discogs_cache c ON c.discogs_release_id = p.discogs_release_id
  LEFT JOIN discogs_release_text t ON t.discogs_release_id = p.discogs_release_id
  GROUP BY r.id, a.name, r.title, c.discogs_release_id ORDER BY a.name, r.title`)).rows;
for (const n of needles) for (const r of rows.filter((x) => x.title.toLowerCase().includes(n.toLowerCase()))) {
  process.stdout.write(`${r.id}  ${r.artist} — ${r.title}: ${r.cached ? 'release cached' : 'NO RELEASE CACHED'}, ${r.tracks} tracks, ${r.credits} credits, ${r.companies} companies\n`);
}
process.exit(0);
