/*
  Q37's second half (the coordinator, 20 and 21 Nov): the artists with records and no MBID, resolved by the exact path
  first (the Discogs artist id as a MusicBrainz URL relationship) and the name rule as the fallback, never a guess.
  The deliverable is the SPLIT: how many resolve, by which path, and how many are refused, the refused named.

      node --env-file=.env.local --conditions=react-server --import tsx scripts/resolve-artist-facts.mts            # report: a dry run per artist, nothing written
      node --env-file=.env.local --conditions=react-server --import tsx scripts/resolve-artist-facts.mts --apply    # the resolved get their MBID and their walk

  Both modes run the one resolver (resolve-by-name.ts); the report is its dry run, so what it says would happen is what
  --apply does. The refused store nothing in either mode.
*/
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { resolveArtistByName } from '@/lib/musicbrainz/resolve-by-name';

const apply = process.argv.includes('--apply');
const db = getDb();
const rows = (await db.execute<{ id: string; name: string }>(sql`
  SELECT a.id, a.name FROM artists a WHERE a.musicbrainz_id IS NULL AND EXISTS (SELECT 1 FROM records r WHERE r.artist_id = a.id)
  ORDER BY a.name`)).rows;
const byPath = { link: 0, name: 0 };
const refused: string[] = [];
for (const r of rows) {
  const outcome = await resolveArtistByName(r.id, { dryRun: !apply });
  if (outcome?.outcome === 'resolved' || outcome?.outcome === 'would-resolve') {
    byPath[outcome.path] += 1;
    console.log(`${r.name}: ${outcome.outcome === 'resolved' ? 'resolved' : 'would resolve'} by ${outcome.path} to ${outcome.mbid}${outcome.outcome === 'would-resolve' ? ` ${outcome.name}` : `; ${outcome.walk.text}`}`);
  } else {
    refused.push(r.name);
    console.log(`${r.name}: REFUSED ${JSON.stringify(outcome)}`);
  }
}
const total = byPath.link + byPath.name;
console.log(`\n${rows.length} artist(s) with records and no MBID: ${total} ${apply ? 'resolved' : 'would resolve'} (${byPath.link} by link, ${byPath.name} by name), ${refused.length} refused${refused.length > 0 ? `: ${refused.join('; ')}` : ''}`);
process.exit(0);
