/**
 * **Design's top-N measurement (23 Nov): if the pick's pool were bounded to the ranking's nearest N records before the
 * model picks, how often would a record the model picks today fall outside them?** For N = 10, 20 and 30.
 *
 *     node --env-file=.env.local --conditions=react-server --import tsx scripts/measure-top-n.mts
 *
 * **The corpus is generated, because none is stored.** Pick history is not persisted (21 Nov), the route's production
 * log carries counts only, and the press measurements in the repo hold 30 presses of one phrase with no record ids. So
 * each phrase below is asked of `askPick`, the pick's own function, over the whole pool as production builds it (every
 * record with matched text, 55), with no run history: one model call each. The phrases, and where each came from:
 * - two are Adam's own, verbatim from the 13 Nov replay of his production presses ("something calm", "cooking dinner,
 *   people over"); the other four of his six were not recorded verbatim;
 * - two were asked of production on his behalf in the measurements ("something for a rainy afternoon", "something from
 *   the eighties");
 * - twenty were written on 19 Nov for the reason-length bench to resemble what he asks (scripts/measure-reason-lengths
 *   .mts), not asked by him.
 * The figure's worth rests on how far those twenty resemble his asks; it is reported for his two and for the rest apart.
 *
 * **The ranking is by the matched texts, the text the pick reads, embedded fresh** (55 texts, one call, nothing stored),
 * never by the stored ABOUT vectors, which are of a different text (the coordinator, 23 Nov: a figure from the wrong
 * text is worse than none). The phrases are embedded in one call with the same model. Read-only.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { askPick } from '@/lib/ask/pick';
import { outsideTopN, ranksOfPicks } from '@/lib/ask/top-n';
import { matchedTextsFor } from '@/lib/db/queries/ask';
import { collectionTitles } from '@/lib/db/queries/matched-text';
import { embedTexts } from '@/lib/openai/embeddings';

const ADAMS = ['something calm', 'cooking dinner, people over'];
const ON_HIS_BEHALF = ['something for a rainy afternoon', 'something from the eighties'];
const BENCH = [
  'something slow for tonight',
  'loud guitars for cleaning the flat',
  'quiet music with no vocals for reading',
  'a record for a dinner with friends that nobody has to talk over',
  'bright and fast for a sunny morning',
  'something sad to sit with',
  'jazz for late at night',
  'a long instrumental stretch I can get lost in',
  'warm and crackly, something old',
  'dense and strange, for paying attention',
  'something to dance to in the kitchen',
  'soft voices and acoustic guitars',
  'big orchestral sweep',
  'a record that gets heavier as it goes',
  'music for a grey afternoon',
  'funky and tight, nothing abrasive',
  'a side I can put on and not touch',
  'rough, live-sounding rock',
  'gentle enough for a child falling asleep',
  'something that starts quiet and ends loud',
];
const NS = [10, 20, 30];
type Source = 'adam' | 'on-his-behalf' | 'bench';
const phrases: Array<{ phrase: string; source: Source }> = [
  ...ADAMS.map((phrase) => ({ phrase, source: 'adam' as const })),
  ...ON_HIS_BEHALF.map((phrase) => ({ phrase, source: 'on-his-behalf' as const })),
  ...BENCH.map((phrase) => ({ phrase, source: 'bench' as const })),
];

const log = (line: string) => process.stdout.write(`${line}\n`);
const titles = await collectionTitles();
const pool = await matchedTextsFor(titles.map((t) => t.id));
log(`measure-top-n: ${phrases.length} phrases (${ADAMS.length} Adam's, ${ON_HIS_BEHALF.length} asked on his behalf, ${BENCH.length} written to resemble his), a pool of ${pool.length} records with matched text`);

const textVectors = await embedTexts(pool.map((r) => r.text));
const phraseVectors = await embedTexts(phrases.map((p) => p.phrase));
const ranked = pool.map((r, i) => ({ recordId: r.id, vector: textVectors[i] }));
const name = (id: string) => { const t = titles.find((x) => x.id === id); return t === undefined ? id.slice(0, 8) : `${t.artist}, ${t.title}`; };

const outDir = join('docs', 'measurements', 'top-n');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
const answers: Array<{ source: Source; ranks: Array<{ recordId: string; rank: number }> }> = [];

for (const [i, p] of phrases.entries()) {
  const result = await askPick(p.phrase, pool, []);
  if (!result.ok) {
    log(`  "${p.phrase}": the pick failed (${result.reason}); left out of the figure`);
    appendFileSync(out, `${JSON.stringify({ ...p, ok: false, reason: result.reason })}\n`);
    continue;
  }
  const ranks = ranksOfPicks(phraseVectors[i], ranked, result.picks.map((x) => x.id));
  answers.push({ source: p.source, ranks });
  log(`  "${p.phrase}" (${p.source}): ${result.verdict}, ranks ${ranks.map((r) => r.rank).join(', ')}${ranks.some((r) => r.rank > 10) ? `; beyond 10: ${ranks.filter((r) => r.rank > 10).map((r) => `${name(r.recordId)} at ${r.rank}`).join('; ')}` : ''}`);
  appendFileSync(out, `${JSON.stringify({ ...p, ok: true, verdict: result.verdict, ranks: ranks.map((r) => ({ ...r, name: name(r.recordId) })) })}\n`);
}

const report = (label: string, set: typeof answers) => {
  const parts = NS.map((n) => { const o = outsideTopN(set.map((a) => a.ranks), n); return `outside ${n}: ${o.outside} of ${o.picks} (${(o.share * 100).toFixed(0)}%)`; });
  log(`  ${label}, ${set.length} answers: ${parts.join('; ')}`);
};
log('measure-top-n: the share of picked records ranked beyond N by nearness of matched text to the phrase');
report('all', answers);
report("Adam's two", answers.filter((a) => a.source === 'adam'));
report('the rest', answers.filter((a) => a.source !== 'adam'));
appendFileSync(out, `${JSON.stringify({ summary: NS.map((n) => ({ n, all: outsideTopN(answers.map((a) => a.ranks), n), adams: outsideTopN(answers.filter((a) => a.source === 'adam').map((a) => a.ranks), n) })) })}\n`);
log(`measure-top-n: written to ${out}`);
process.exit(0);
