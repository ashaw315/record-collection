/*
  Q37's second half (20 Nov): the artists whose MusicBrainz payload is already cached get the formed year and origin the
  walk discarded, from the cache and with no call, into the columns that are null. The walk writes them for every band
  walked from here; this is the once-over for the eight walked before. Read-only against MusicBrainz; prints one line per
  artist with what was written.

      node --env-file=.env.local --conditions=react-server --import tsx scripts/backfill-artist-facts.mts
*/
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { fillArtistFactsWhereNull, findArtistById } from '@/lib/db/queries/artists';
import { artistFactsFromPayload } from '@/lib/musicbrainz/artist-facts';

const db = getDb();
type Row = { id: string; name: string; payload: unknown };
const rows = (await db.execute<Row>(sql`
  SELECT a.id, a.name, c.payload
  FROM artists a JOIN musicbrainz_cache c ON c.musicbrainz_id = a.musicbrainz_id
  WHERE a.formed_year IS NULL OR a.origin_country IS NULL
  ORDER BY a.name`)).rows;
for (const r of rows) {
  const facts = artistFactsFromPayload(r.payload);
  const before = await findArtistById(r.id);
  await fillArtistFactsWhereNull(r.id, facts);
  const after = await findArtistById(r.id);
  console.log(`${r.name}: read ${JSON.stringify(facts)}; formed_year ${before?.formedYear ?? 'null'} -> ${after?.formedYear ?? 'null'}, origin ${JSON.stringify(before?.originCountry ?? null)} -> ${JSON.stringify(after?.originCountry ?? null)}`);
}
console.log(`${rows.length} artist(s) with a cached payload and a null column`);
process.exit(0);
