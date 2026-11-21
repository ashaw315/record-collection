/*
  Q37's check before the walk writes artist facts (the coordinator, 20 Nov): for every artist with a record, the MBID
  held, whether MusicBrainz's payload for it is cached, and what that payload says the artist is, so a wrong attachment
  shows beside the collection's own name and titles. Read-only; prints one JSON line per artist.
*/
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
const db = getDb();
type Row = { name: string; mbid: string | null; discogsId: number | null; records: number; titles: string; members: number; cached: unknown };
const rows = (await db.execute<Row>(sql`
  SELECT a.name, a.musicbrainz_id AS mbid, a.discogs_artist_id AS "discogsId", count(r.id)::int AS records,
         string_agg(r.title, ' | ' ORDER BY r.title) AS titles,
         (SELECT count(*)::int FROM artist_memberships m WHERE m.group_artist_id = a.id) AS members,
         (SELECT c.payload FROM musicbrainz_cache c WHERE c.musicbrainz_id = a.musicbrainz_id) AS cached
  FROM artists a JOIN records r ON r.artist_id = a.id
  GROUP BY a.id ORDER BY a.name`)).rows;
type Payload = { name?: string; disambiguation?: string; type?: string; country?: string; area?: { name?: string } | null; 'begin-area'?: { name?: string } | null; 'life-span'?: { begin?: string | null } | null };
for (const r of rows) {
  const p = (r.cached ?? null) as Payload | null;
  console.log(JSON.stringify({
    name: r.name, records: r.records, titles: r.titles.slice(0, 80), discogsId: r.discogsId, mbid: r.mbid, members: r.members,
    mb: p === null ? null : { name: p.name, disambiguation: p.disambiguation ?? '', type: p.type, country: p.country, area: p.area?.name, beginArea: p['begin-area']?.name, begin: p['life-span']?.begin },
  }));
}
process.exit(0);
