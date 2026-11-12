/**
 * **The two runs confirmed end to end, not by reading the scripts (the coordinator, 12 Nov).** Both of Adam's runs
 * reported nothing to change on their first real pass (`abouts:embed`: 53 current; `discogs:backfill-text`: 3996 rows
 * stand), the instrument-not-checked-against-a-known-case shape. So this reads production: how many stored vectors
 * there are and whether a title ask over them ranks sensible neighbours (a title asks from its own vector, so no key is
 * needed here); and whether a barcode search finds a record through its current pressing, for a release cached before
 * today, typed with and without its spaces. Read-only; prints and writes nothing.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/confirm-ask-and-barcode.mts
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { rankByNearness } from '@/lib/ask/rank';
import { listRecords } from '@/lib/db/queries/records';
import { barcodeDigits } from '@/lib/discogs/release-fields';
import type { Offset } from '@/lib/api/query-params';

const db = getDb();
const out = (line: string) => process.stdout.write(`${line}\n`);

/* 1. The vectors, and a title ask over them. */
type Vec = { record_id: string; title: string; artist: string; model: string; vector: number[] };
const vectors = (await db.execute<Vec>(sql`
  SELECT e.record_id, r.title, a.name AS artist, e.model, e.vector
  FROM record_embeddings e JOIN records r ON r.id = e.record_id JOIN artists a ON a.id = r.artist_id ORDER BY r.title`)).rows;
const withAbout = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM records WHERE nullif(snippet, '') IS NOT NULL`)).rows[0]?.n ?? 0;
out(`record_embeddings: ${vectors.length} rows (${new Set(vectors.map((v) => v.model)).size} model(s): ${[...new Set(vectors.map((v) => v.model))].join(', ')}); records with an ABOUT: ${withAbout}`);
if (vectors.length > 0) {
  const pool = vectors.map((v) => ({ recordId: v.record_id, vector: v.vector }));
  const name = (id: string) => { const v = vectors.find((x) => x.record_id === id); return v === undefined ? id : `${v.artist} · ${v.title}`; };
  for (const from of vectors.slice(0, 55).filter((_, i) => i % 13 === 0)) {
    const answers = rankByNearness(from.vector, pool, { take: 3, askedFrom: from.record_id });
    out(`  asked from ${name(from.record_id)}: ${answers.map((a) => `${name(a.recordId)} (${a.nearness.toFixed(3)})`).join('; ')}`);
  }
}

/* 2. A barcode, cached before today, through the record's current pressing. */
type Bar = { discogs_release_id: number; text: string; detail: string; title: string; fetched_at: string };
const bars = (await db.execute<Bar>(sql`
  SELECT t.discogs_release_id, t.text, t.detail, r.title, c.fetched_at::text
  FROM discogs_release_text t
  JOIN pressings p ON p.discogs_release_id = t.discogs_release_id
  JOIN records r ON r.pressing_id = p.id
  JOIN discogs_cache c ON c.discogs_release_id = t.discogs_release_id
  WHERE t.kind = 'barcode' AND c.fetched_at < date_trunc('day', now())
  ORDER BY c.fetched_at LIMIT 3`)).rows;
const barcodeRows = (await db.execute<{ n: number; releases: number }>(sql`SELECT count(*)::int AS n, count(DISTINCT discogs_release_id)::int AS releases FROM discogs_release_text WHERE kind = 'barcode'`)).rows[0];
out(`barcode rows: ${barcodeRows?.n ?? 0} over ${barcodeRows?.releases ?? 0} releases`);
for (const bar of bars) {
  const spaced = bar.detail;
  const digits = barcodeDigits(bar.detail);
  const hits = async (q: string) => (await listRecords({ limit: 20, offset: 0 as Offset, filters: { q } })).rows.map((row) => row.title);
  out(`  release ${bar.discogs_release_id} (cached ${bar.fetched_at.slice(0, 10)}), record "${bar.title}", barcode as given "${spaced}": typed as given finds [${(await hits(spaced)).join(', ')}]; typed as digits "${digits}" finds [${(await hits(digits)).join(', ')}]; expected the record's own title among them`);
}
if (bars.length === 0) out('  no barcode row on a release cached before today: the backfill wrote none, or no cached release carries a barcode');
