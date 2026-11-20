/**
 * **What describing a new record costs end to end, timed (Q72, the coordinator, 19 Nov).** The add flow the row
 * proposes fetches the record's Discogs grounding, drafts its ABOUT, drafts its matched text from that ABOUT, and
 * stores both in one transaction after both have returned, inside the route's `after()` budget. Vercel's default is 300
 * seconds with none set in vercel.json; the route pins its own maxDuration from this measurement's p90 with room. So
 * each stage is timed here as the flow would run it: the release and the artist's releases fetched live from Discogs
 * (never from discogs_cache, which a new record has no row in), then the ABOUT, then the matched text, in sequence.
 *
 * Nothing is stored, no llm_runs row is written, and the drafts are not kept: this spends the model calls and the
 * Discogs calls and writes one measurement, `docs/measurements/describe-timing/<stamp>.json`, printing the summary.
 * Ten records, not fifty-five (the coordinator): twenty model calls set a pin against a 300-second ceiling well enough.
 *
 *   npm run describe:time                        # ten records, the most recently added that have a release id
 *   npm run describe:time -- --sample 4          # four
 *   npm run describe:time -- 1611cb00 de2ad140   # these records
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { artistGroundingFacts } from '@/lib/db/queries/artists';
import { getDiscogsClient } from '@/lib/discogs/client';
import { discographyOf, groundingFromPayload, type DiscographyEntry, type ReleaseFacts } from '@/lib/llm/about-grounding';
import { getMatchedTextClient } from '@/lib/llm/matched-text-client';
import { getSnippetClient } from '@/lib/llm/snippet-client';
import { summarize } from './measure-summary.mjs';

type Row = { id: string; artistRowId: string; artist: string; title: string; year: number | null; releaseId: number };
type Timing = {
  id: string; artist: string; title: string; releaseId: number;
  discogsMs: number; aboutMs: number; matchedMs: number; totalMs: number;
  grounded: boolean; aboutOk: boolean; matchedOk: boolean; failures: string[];
};

const args = process.argv.slice(2);
const prefixes = args.filter((a) => /^[0-9a-f]{6,}$/.test(a));
const sampleAt = args.indexOf('--sample');
const sample = sampleAt === -1 ? 10 : Number(args[sampleAt + 1]);
if (!Number.isInteger(sample) || sample < 1) throw new Error('time-describe: --sample wants a count of one or more');

const db = getDb();
const where = prefixes.length === 0 ? sql`TRUE` : sql`(${sql.join(prefixes.map((p) => sql`r.id::text LIKE ${p + '%'}`), sql` OR `)})`;
const rows = (
  await db.execute<Row>(sql`
    SELECT r.id, a.id AS "artistRowId", a.name AS artist, r.title, r.release_year AS year, p.discogs_release_id AS "releaseId"
    FROM records r JOIN artists a ON a.id = r.artist_id JOIN pressings p ON p.id = r.pressing_id
    WHERE p.discogs_release_id IS NOT NULL AND ${where}
    ORDER BY r.created_at DESC LIMIT ${prefixes.length === 0 ? sample : prefixes.length}`)
).rows;
if (rows.length === 0) { console.error('time-describe: no record with a release id matched'); process.exit(2); }

const discogs = getDiscogsClient();
const abouts = getSnippetClient();
const matched = getMatchedTextClient();
const timings: Timing[] = [];
const timed = async <T,>(work: () => Promise<T>): Promise<[T, number]> => { const t0 = Date.now(); const value = await work(); return [value, Date.now() - t0]; };

for (const r of rows) {
  const failures: string[] = [];
  let facts: ReleaseFacts | null = null;
  let discography: DiscographyEntry[] = [];
  /* The grounding as the add flow would fetch it: the release, then the artist's releases for the discography, both live. */
  const [, discogsMs] = await timed(async () => {
    try {
      const payload = await discogs.get(`/releases/${r.releaseId}`);
      facts = groundingFromPayload(payload);
      if (facts?.artistId !== undefined && facts.artistId !== null) {
        discography = discographyOf(await discogs.get(`/artists/${facts.artistId}/releases`, { sort: 'year', sort_order: 'asc', per_page: 100 }));
      }
    } catch (error) {
      failures.push(`discogs: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  let about: string | null = null;
  const [, aboutMs] = await timed(async () => {
    try {
      /* Q37 (20 Nov): the artist's own facts from the database, as the add flow would read them. */
      const artist = (await artistGroundingFacts(r.artistRowId)) ?? undefined;
      const result = await abouts.write({ artist: r.artist, title: r.title }, facts === null ? undefined : { facts, discography, constraints: [], artist });
      if (result.ok) about = result.snippet; else failures.push(`about: ${result.reason}`);
    } catch (error) {
      failures.push(`about: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  let matchedOk = false;
  const [, matchedMs] = await timed(async () => {
    try {
      const result = await matched.write({ artist: r.artist, title: r.title, year: r.year, about }, facts);
      if (result.ok) matchedOk = true; else failures.push(`matched: ${result.reason}`);
    } catch (error) {
      failures.push(`matched: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const timing: Timing = { id: r.id, artist: r.artist, title: r.title, releaseId: r.releaseId, discogsMs, aboutMs, matchedMs, totalMs: discogsMs + aboutMs + matchedMs, grounded: facts !== null, aboutOk: about !== null, matchedOk, failures };
  timings.push(timing);
  console.log(`${r.id.slice(0, 8)}  ${r.artist} — ${r.title}: discogs ${discogsMs}ms, about ${aboutMs}ms, matched ${matchedMs}ms, total ${timing.totalMs}ms${failures.length === 0 ? '' : `; ${failures.join('; ')}`}`);
}

const summary = {
  discogsMs: summarize(timings.map((t) => t.discogsMs)),
  aboutMs: summarize(timings.map((t) => t.aboutMs)),
  matchedMs: summarize(timings.map((t) => t.matchedMs)),
  totalMs: summarize(timings.map((t) => t.totalMs)),
  completed: timings.filter((t) => t.failures.length === 0).length,
};
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = join(process.cwd(), 'docs', 'measurements', 'describe-timing');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${stamp}.json`);
writeFileSync(file, JSON.stringify({ measured: new Date().toISOString(), sample: timings.length, summary, timings }, null, 2));
const line = (name: string, s: ReturnType<typeof summarize>) => `${name}: median ${s.median}ms, p90 ${s.p90}ms, max ${s.max}ms`;
console.log(`time-describe: ${timings.length} records, ${summary.completed} completed every stage; ${line('discogs', summary.discogsMs)}; ${line('about', summary.aboutMs)}; ${line('matched', summary.matchedMs)}; ${line('total', summary.totalMs)}; ${file}`);
process.exit(0);
