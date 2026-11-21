/*
  One phrase asked of the pick N times at the configured effort, outside the route, the reasons printed with the
  material check's verdict and whether a re-ask happened (the coordinator, 21 Nov: see whether the prompt rule alone
  fixes "not evidence of a recent recording" before adding anything for it). Spends one model call per run, two where a
  reason is asked again; writes nothing.

    node --env-file=.env.local --conditions=react-server --import tsx scripts/ask-bench.mts "big band but recorded recently" 3
*/
import { askPick, mentionsMaterial } from '@/lib/ask/pick';
import { matchedTextsFor } from '@/lib/db/queries/ask';
import { collectionTitles } from '@/lib/db/queries/matched-text';
const [phrase, countArg] = process.argv.slice(2);
if (phrase === undefined) throw new Error('ask-bench: give the phrase and a count');
const runs = Number(countArg ?? '3');
const records = await collectionTitles();
const described = await matchedTextsFor(records.map((r) => r.id));
const titles = new Map(records.map((r) => [r.id, `${r.artist} — ${r.title}`]));
for (let i = 1; i <= runs; i += 1) {
  let calls = 0;
  const fetchImpl: typeof fetch = async (input, init) => { calls += 1; return fetch(input, init); };
  const started = performance.now();
  const result = await askPick(phrase, described, [], { fetchImpl });
  const ms = Math.round(performance.now() - started);
  if (!result.ok) { console.log(`run ${i}: failed after ${ms}ms: ${result.reason}`); continue; }
  console.log(`run ${i}: ${result.verdict}, ${ms}ms, ${calls} request(s)${result.dropped.length > 0 ? `, dropped: ${result.dropped.map((d) => `${titles.get(d.id) ?? d.id} (${d.why})`).join('; ')}` : ''}`);
  for (const p of result.picks) console.log(`  ${titles.get(p.id) ?? p.id} [${[...p.reason].length} chars, material check: ${mentionsMaterial(p.reason) ?? 'clean'}]\n    ${p.reason}`);
}
process.exit(0);
