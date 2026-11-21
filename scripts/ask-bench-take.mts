/*
  The pick's first-press time asking for up to ten against up to five, on production's pool (Design's figure for the
  grid's queueing, the coordinator, 21 Nov: the single number Adam's decision rests on). The build asks for five in its
  system text and nowhere else, the schema caps nothing, so the ten variant rewrites that one phrase in the request body
  on its way out and changes nothing else: same model, effort, pool and key. Pairs alternate five then ten so the hour's
  latency falls on both. Spends two model calls per pair, more where a reason is asked again; writes nothing.

    node --env-file=.env.local --conditions=react-server --import tsx scripts/ask-bench-take.mts "something from the eighties" 3
*/
import { askPick } from '@/lib/ask/pick';
import { matchedTextsFor } from '@/lib/db/queries/ask';
import { collectionTitles } from '@/lib/db/queries/matched-text';
const [phrase, pairsArg] = process.argv.slice(2);
if (phrase === undefined) throw new Error('ask-bench-take: give the phrase and a pair count');
const pairs = Number(pairsArg ?? '3');
const records = await collectionTitles();
const described = await matchedTextsFor(records.map((r) => r.id));
const titles = new Map(records.map((r) => [r.id, `${r.artist} — ${r.title}`]));

async function once(count: 'five' | 'ten') {
  const calls: Array<{ ms: number; returned: number }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as { input: Array<{ role: string; content: string }> };
    if (count === 'ten') {
      const system = body.input.find((m) => m.role === 'system');
      if (system === undefined || !system.content.includes('Return up to five records')) throw new Error('the system text no longer says "Return up to five records"; the bench needs rewriting');
      system.content = system.content.replace('Return up to five records', 'Return up to ten records');
    }
    const started = performance.now();
    const response = await fetch(input, { ...init, body: JSON.stringify(body) });
    const ms = Math.round(performance.now() - started);
    const copy = response.clone();
    const answer = (await copy.json().catch(() => null)) as { output?: Array<{ content?: Array<{ text?: string }> }> } | null;
    const text = answer?.output?.flatMap((o) => o.content ?? []).find((c) => typeof c.text === 'string')?.text;
    let returned = -1;
    try { returned = (JSON.parse(text ?? '') as { picks: unknown[] }).picks.length; } catch { /* a cut or refused answer: -1 says so */ }
    calls.push({ ms, returned });
    return response;
  };
  const started = performance.now();
  const result = await askPick(phrase, described, [], { fetchImpl });
  const total = Math.round(performance.now() - started);
  const kept = result.ok ? result.picks.map((p) => titles.get(p.id) ?? p.id) : [];
  console.log(`  ${count.padEnd(4)}: total ${total}ms; model ${calls.map((c) => `${c.ms}ms returning ${c.returned}`).join(', then ')}; ${result.ok ? `${result.verdict}, kept ${kept.length}` : `failed: ${result.reason}`}${result.ok && result.dropped.length > 0 ? `; dropped ${result.dropped.map((d) => d.why).join('; ')}` : ''}`);
  if (result.ok) for (const k of kept) console.log(`        ${k}`);
  return calls[0]?.ms ?? total;
}

const five: number[] = [];
const ten: number[] = [];
for (let i = 1; i <= pairs; i += 1) {
  console.log(`pair ${i}`);
  five.push(await once('five'));
  ten.push(await once('ten'));
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
console.log(`first model call, five: ${five.join(', ')}ms (median ${median(five)}); ten: ${ten.join(', ')}ms (median ${median(ten)})`);
process.exit(0);
