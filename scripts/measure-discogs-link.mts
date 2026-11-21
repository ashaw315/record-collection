/*
  Coverage of the exact path (the coordinator, 21 Nov): for each artist with records, the Discogs artist id the import
  holds, looked up as a MusicBrainz URL relationship (/url?resource=https://www.discogs.com/artist/{id}&inc=artist-rels),
  which names one artist or none, never a judgement between namesakes. Read-only: one MusicBrainz request per artist with
  a Discogs id, nothing written. Also the display check for the Discogs suffix: which stored names would collide stripped.

      node --env-file=.env.local --conditions=react-server --import tsx scripts/measure-discogs-link.mts
*/
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { getMusicBrainzClient } from '@/lib/musicbrainz/client';

const db = getDb();
type Row = { id: string; name: string; discogsId: number | null; mbid: string | null };
const rows = (await db.execute<Row>(sql`
  SELECT a.id, a.name, a.discogs_artist_id AS "discogsId", a.musicbrainz_id AS mbid
  FROM artists a WHERE EXISTS (SELECT 1 FROM records r WHERE r.artist_id = a.id) ORDER BY a.name`)).rows;
const client = getMusicBrainzClient();
type UrlLookup = { relations?: Array<{ type?: string; direction?: string; 'target-type'?: string; artist?: { id?: string; name?: string; disambiguation?: string; type?: string; country?: string } }> };
let linked = 0, none = 0, noId = 0, agree = 0, disagree = 0;
for (const r of rows) {
  if (r.discogsId === null) { noId += 1; console.log(`${r.name}: no Discogs artist id`); continue; }
  const resource = `https://www.discogs.com/artist/${r.discogsId}`;
  let found: { id?: string; name?: string; disambiguation?: string; type?: string; country?: string } | null = null;
  let note = '';
  try {
    const payload = await client.get<UrlLookup>(`/url?resource=${encodeURIComponent(resource)}&inc=artist-rels`);
    const artistRels = (payload.relations ?? []).filter((rel) => rel['target-type'] === 'artist' && rel.artist?.id !== undefined);
    if (artistRels.length === 1) found = artistRels[0].artist ?? null;
    else if (artistRels.length > 1) note = `${artistRels.length} artists linked to one Discogs page: ${artistRels.map((x) => x.artist?.name).join('; ')}`;
  } catch (error) {
    note = error instanceof Error ? error.message : String(error);
  }
  if (found === null) { none += 1; console.log(`${r.name} (discogs ${r.discogsId}): NO LINK${note ? ` (${note})` : ''}`); continue; }
  linked += 1;
  let same = '';
  if (r.mbid !== null) { if (r.mbid === found.id) { agree += 1; same = ' = held MBID'; } else { disagree += 1; same = ` DIFFERS from held ${r.mbid}`; } }
  console.log(`${r.name} (discogs ${r.discogsId}): ${found.id} ${found.name} [${found.disambiguation ?? ''}] ${found.type ?? ''} ${found.country ?? ''}${same}`);
}
console.log(`\n${rows.length} artists with records: ${linked} linked through the Discogs page, ${none} with a Discogs id and no link, ${noId} with no Discogs id; of the linked with a held MBID, ${agree} agree and ${disagree} differ`);

const clashes = (await db.execute<{ stripped: string; names: string; n: number }>(sql`
  SELECT regexp_replace(name, '\\s\\(\\d{1,3}\\)$', '') AS stripped, string_agg(name, ' | ' ORDER BY name) AS names, count(*)::int AS n
  FROM artists GROUP BY 1 HAVING count(*) > 1 ORDER BY 1`)).rows;
const suffixed = (await db.execute<{ name: string; records: number }>(sql`
  SELECT a.name, (SELECT count(*)::int FROM records r WHERE r.artist_id = a.id) AS records FROM artists a WHERE a.name ~ '\\s\\(\\d{1,3}\\)$' ORDER BY a.name`)).rows;
console.log(`\nsuffixed names among all ${(await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM artists`)).rows[0].n} artists: ${suffixed.map((s) => `${s.name} (${s.records} rec)`).join('; ') || 'none'}`);
console.log(`names that would collide once the suffix is stripped: ${clashes.length === 0 ? 'none' : clashes.map((c) => `${JSON.stringify(c.stripped)} <- ${c.names}`).join('; ')}`);
process.exit(0);
