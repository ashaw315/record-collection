/**
 * **The ask's diagnostic, picks before reasons (step 3, unit 5; the coordinator, 14 and 15 Nov).** The model pick asked
 * directly, over the records that have matched text as an explicit pool, outside the route: the route ranks until every
 * record with an ABOUT has matched text (§4.8's latch), so a ten-record run cannot go through it. Each phrase is asked
 * at two efforts, low and the next step up, shown as A and B in a shuffled order until the reveal.
 *
 *   npm run ask:diagnostic -- "something calm" "sunday morning" …   # asks, writes the picks file to mark
 *   npm run ask:diagnostic -- --reveal <the marked picks file>      # the reasons, each run's effort and time
 *
 * Reads production and spends one model call per phrase per effort, so it is Adam's to run. Nothing is written to the
 * database. The runs are kept in `.matched/diagnostic.json` between the two passes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { parseMarks, renderPicks, renderReveal, type DiagnosticRun, type Pool } from '@/lib/ask/diagnostic';
import { askPick } from '@/lib/ask/pick';
import { matchedTextsFor } from '@/lib/db/queries/ask';

const args = process.argv.slice(2);
const WORK = join(process.cwd(), '.matched');
const OUT = join(homedir(), 'Downloads');
const SAVED = join(WORK, 'diagnostic.json');
const date = new Date().toISOString().slice(0, 10);
mkdirSync(WORK, { recursive: true });

if (args.includes('--reveal')) {
  const file = args[args.indexOf('--reveal') + 1];
  if (file === undefined) throw new Error('ask-diagnostic: --reveal wants the marked picks file');
  const saved = JSON.parse(readFileSync(SAVED, 'utf8')) as { runs: DiagnosticRun[]; pool: Pool };
  const out = join(OUT, `Ask picks revealed, ${date}.md`);
  writeFileSync(out, renderReveal(saved.runs, parseMarks(readFileSync(file, 'utf8')), saved.pool));
  console.log(`ask-diagnostic: the reveal is ${out}`);
  process.exit(0);
}

const phrases = args.filter((a) => !a.startsWith('--'));
if (phrases.length === 0) throw new Error('ask-diagnostic: give the phrases to ask, or --reveal <marked file>');
const records = (await getDb().execute<{ id: string; title: string; artist: string }>(sql`
  SELECT r.id, r.title, a.name AS artist FROM records r JOIN artists a ON a.id = r.artist_id`)).rows;
const described = await matchedTextsFor(records.map((r) => r.id));
if (described.length === 0) throw new Error('ask-diagnostic: no record has matched text yet; store the drafts first (npm run matched:draft -- --store)');
const pool: Pool = { described: described.length, collection: records.length };
const byId = new Map(records.map((r) => [r.id, r]));
const runs: DiagnosticRun[] = [];

for (const phrase of phrases) {
  /* Which effort is A is drawn per phrase, so a mark cannot lean on a fixed order. */
  const efforts = Math.random() < 0.5 ? ['low', 'medium'] : ['medium', 'low'];
  for (const [i, effort] of efforts.entries()) {
    const started = performance.now();
    const result = await askPick(phrase, described, [], { effort });
    const ms = Math.round(performance.now() - started);
    const label = i === 0 ? 'A' : 'B';
    runs.push(result.ok
      ? { phrase, label, effort, ms, verdict: result.verdict, picks: result.picks.map((p) => ({ id: p.id, artist: byId.get(p.id)?.artist ?? '?', title: byId.get(p.id)?.title ?? p.id, reason: p.reason })) }
      : { phrase, label, effort, ms, verdict: null, failure: result.reason, picks: [] });
    console.log(`"${phrase}" ${label}: ${ms}ms`);
  }
}
writeFileSync(SAVED, JSON.stringify({ runs, pool }, null, 2));
const out = join(OUT, `Ask picks to mark, ${date}.md`);
writeFileSync(out, renderPicks(runs, pool));
console.log(`ask-diagnostic: ${runs.length} runs among the ${pool.described} described records, not the collection's ${pool.collection}; mark ${out}, then run --reveal on it`);
process.exit(0);
