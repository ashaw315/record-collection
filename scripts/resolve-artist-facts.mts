/*
  Q37's second half, part two (the coordinator, 20 Nov): the artists with records and no MBID, tried under the rule.
  The deliverable is the SPLIT, not the fills: how many resolve and how many the rule refuses, the refused named.

      node --env-file=.env.local --conditions=react-server --import tsx scripts/resolve-artist-facts.mts            # report: one search per artist, nothing written
      node --env-file=.env.local --conditions=react-server --import tsx scripts/resolve-artist-facts.mts --apply    # the resolved ones get their MBID and their walk

  The report searches MusicBrainz once per artist (one request a second) and writes nothing; --apply runs the resolver,
  which stores the MBID and walks the lineup for the accepted, and still stores nothing for the refused.
*/
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { resolveArtistByName } from '@/lib/musicbrainz/resolve-by-name';
import { pickExactName, searchArtistsByName, stripDiscogsSuffix } from '@/lib/musicbrainz/search-artist';

const apply = process.argv.includes('--apply');
const db = getDb();
const rows = (await db.execute<{ id: string; name: string }>(sql`
  SELECT a.id, a.name FROM artists a WHERE a.musicbrainz_id IS NULL AND EXISTS (SELECT 1 FROM records r WHERE r.artist_id = a.id)
  ORDER BY a.name`)).rows;
let resolved = 0;
const refused: string[] = [];
for (const r of rows) {
  if (apply) {
    const outcome = await resolveArtistByName(r.id);
    if (outcome?.outcome === 'resolved') { resolved += 1; console.log(`${r.name}: resolved ${outcome.mbid}; ${outcome.walk.text}`); }
    else { refused.push(r.name); console.log(`${r.name}: refused ${JSON.stringify(outcome)}`); }
    continue;
  }
  const name = stripDiscogsSuffix(r.name);
  const hits = await searchArtistsByName(name);
  const chosen = pickExactName(hits, name);
  const sameName = hits.filter((h) => h.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (chosen === null) {
    refused.push(r.name);
    console.log(`${r.name}: REFUSED (${sameName.length} of ${hits.length} hits named ${JSON.stringify(name)}${sameName.length > 1 ? ': ' + sameName.map((h) => `${h.name} [${h.disambiguation ?? ''}] ${h.country ?? ''}`).join('; ') : ''})`);
  } else {
    resolved += 1;
    console.log(`${r.name}: would resolve to ${chosen.mbid} ${chosen.name} [${chosen.disambiguation ?? ''}] ${chosen.type ?? ''} ${chosen.country ?? ''} score ${chosen.score} (${hits.length} hits)`);
  }
}
console.log(`\n${rows.length} artist(s) with records and no MBID: ${resolved} ${apply ? 'resolved' : 'would resolve'}, ${refused.length} refused${refused.length > 0 ? `: ${refused.join('; ')}` : ''}`);
process.exit(0);
