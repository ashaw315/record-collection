/**
 * **The far answer's distance, reported for Adam (§P.2, "Under A- the meantime pair- Phase 0", 11 Nov; step 178).**
 * "Code reports the distance at which an answer is far." The figure is the collection's, so it is read from the
 * stored vectors on production after Adam's embedding run: for each record with a vector, the cosine of its nearest
 * other record, and the distribution of every pair, so Design can place "far" against what the collection actually
 * holds. With no vectors stored it says so and ranks nothing.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/report-ask-distances.mts
 *
 * Read-only; prints and writes nothing.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { cosine } from '@/lib/ask/rank';

const db = getDb();
type Row = { record_id: string; title: string; model: string; vector: number[] };
const rows = (await db.execute<Row>(sql`
  SELECT e.record_id, r.title, e.model, e.vector
  FROM record_embeddings e JOIN records r ON r.id = e.record_id
  ORDER BY r.title`)).rows;
const total = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM records`)).rows[0]?.n ?? 0;

process.stdout.write(`records ${total}; with a stored vector ${rows.length}${rows.length === 0 ? ' (no vectors stored yet: the embedding run, npm run abouts:embed, is Adam’s and has not happened on this database)' : ''}\n`);
if (rows.length >= 2) {
  const models = new Set(rows.map((r) => r.model));
  process.stdout.write(`models: ${[...models].join(', ')}\n`);
  const nearest: Array<{ title: string; nearest: string; cos: number }> = [];
  const pairs: number[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    let best = { title: '', cos: -Infinity };
    for (let j = 0; j < rows.length; j += 1) {
      if (i === j) continue;
      const c = cosine(rows[i].vector, rows[j].vector);
      if (j > i) pairs.push(c);
      if (c > best.cos) best = { title: rows[j].title, cos: c };
    }
    nearest.push({ title: rows[i].title, nearest: best.title, cos: best.cos });
  }
  const sorted = [...pairs].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  process.stdout.write(`every pair (${pairs.length}): min ${sorted[0].toFixed(3)}, 10% ${q(0.1).toFixed(3)}, median ${q(0.5).toFixed(3)}, 90% ${q(0.9).toFixed(3)}, max ${sorted[sorted.length - 1].toFixed(3)}\n`);
  const nn = nearest.map((n) => n.cos).sort((a, b) => a - b);
  process.stdout.write(`each record’s nearest other: min ${nn[0].toFixed(3)}, median ${nn[Math.floor(nn.length / 2)].toFixed(3)}, max ${nn[nn.length - 1].toFixed(3)}\n`);
  process.stdout.write('the five records whose nearest other is farthest:\n');
  for (const n of [...nearest].sort((a, b) => a.cos - b.cos).slice(0, 5)) process.stdout.write(`  ${n.title.padEnd(40)} nearest ${n.nearest.padEnd(40)} ${n.cos.toFixed(3)}\n`);
}
