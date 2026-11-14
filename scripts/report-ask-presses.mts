/**
 * **Five presses of one phrase, replayed against the real collection (the coordinator, 13 Nov).** Adam's production
 * asks returned two distinct records across five presses on each of six phrases. This prints, for each phrase, the
 * collection's top ten by nearness, then the five answers the shelf gets: the route's own `rankByNearness` at the
 * shelf's take of one, each press excluding the last answer as `PickControl` sends it (`exclude: lastAnswer`). The
 * pool is every record with a stored vector, as on the shelf with no filter.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/report-ask-presses.mts "a phrase" …
 *
 * Read-only on the database. One embedding call for all the phrases together, with OPENAI_API_KEY from the shell's
 * environment, never asked for.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { embedTexts } from '@/lib/openai/embeddings';
import { cosine, rankByNearness, type Candidate } from '@/lib/ask/rank';

/*
  `--centred` (the coordinator, 13 Nov): the same rankings with the mean ABOUT vector subtracted from every ABOUT and
  from the phrase, to read whether a direction all the ABOUTs share is what crowds the top ten together.
*/
const centred = process.argv.includes('--centred');
/* `--hub` (the coordinator, 13 Nov): each record discounted by how close it is to everything, the score the phrase's cosine less the record's mean cosine to every other ABOUT. The presses line still replays the route as built. */
const hub = process.argv.includes('--hub');
const phrases = process.argv.slice(2).filter((a) => a !== '--centred' && a !== '--hub');
if (phrases.length === 0) throw new Error('report-ask-presses: give one or more phrases');

const rows = (await getDb().execute<{ record_id: string; title: string; artist: string; vector: number[] }>(sql`
  SELECT e.record_id, r.title, a.name AS artist, e.vector
  FROM record_embeddings e JOIN records r ON r.id = e.record_id JOIN artists a ON a.id = r.artist_id`)).rows;
const dims = rows[0]?.vector.length ?? 0;
const mean = Array.from({ length: dims }, (_, d) => rows.reduce((s, r) => s + r.vector[d], 0) / rows.length);
const shift = (v: number[]) => (centred ? v.map((x, d) => x - mean[d]) : v);
const pool: Candidate[] = rows.map((r) => ({ recordId: r.record_id, vector: shift(r.vector) }));
const name = new Map(rows.map((r) => [r.record_id, `${r.artist} — ${r.title}`]));
const vectors = await embedTexts(phrases);
const crowding = new Map(pool.map((c) => [c.recordId, pool.reduce((s, o) => (o === c ? s : s + cosine(c.vector, o.vector)), 0) / (pool.length - 1)]));
if (hub) process.stdout.write(`hub-discounted: each record's mean cosine to the other ${pool.length - 1} ABOUTs subtracted (from ${Math.min(...crowding.values()).toFixed(3)} to ${Math.max(...crowding.values()).toFixed(3)})\n`);
if (centred) process.stdout.write(`mean-centred: the mean of ${rows.length} ABOUT vectors subtracted from each and from every phrase (the mean's length ${Math.hypot(...mean).toFixed(3)})\n`);

for (const [i, phrase] of phrases.entries()) {
  const query = shift(vectors[i]);
  const ranked = pool.map((c) => ({ id: c.recordId, cos: cosine(query, c.vector) - (hub ? (crowding.get(c.recordId) ?? 0) : 0) }))
    .sort((a, b) => b.cos - a.cos);
  const rank = new Map(ranked.map((r, n) => [r.id, n + 1]));
  process.stdout.write(`\n"${phrase}" (pool ${pool.length})\n  top ten:\n`);
  for (const [n, r] of ranked.slice(0, 10).entries()) process.stdout.write(`    ${String(n + 1).padStart(2)}. ${r.cos.toFixed(3)}  ${name.get(r.id)}${hub ? `  (its mean to the others ${crowding.get(r.id)?.toFixed(3)})` : ''}\n`);
  process.stdout.write(`  spread: rank 1 ${ranked[0].cos.toFixed(3)}, rank 10 ${ranked[9]?.cos.toFixed(3)}, rank ${ranked.length} ${ranked[ranked.length - 1].cos.toFixed(3)}\n  five presses:`);
  let last: string[] = [];
  const seen: number[] = [];
  for (let press = 0; press < 5; press += 1) {
    const [answer] = rankByNearness(query, pool, { take: 1, exclude: last });
    last = [answer.recordId];
    seen.push(rank.get(answer.recordId) ?? -1);
  }
  process.stdout.write(` ranks ${seen.join(' ')}\n`);
}
process.exit(0);
