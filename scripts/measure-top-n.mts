/**
 * **Design's top-N measurement (23 Nov): if the pick's pool were bounded to the ranking's nearest N records before the
 * model picks, how often would a record the model picks today fall outside them?** For N = 10, 20 and 30.
 *
 *     node --env-file=.env.local --conditions=react-server --import tsx scripts/measure-top-n.mts
 *
 * **The corpus is generated, because none is stored** (and since 23 Nov it can come from a file, below). Pick history is not persisted (21 Nov), the route's production
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
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { askPick } from '@/lib/ask/pick';
import { outsideTopN, ranksOfPicks } from '@/lib/ask/top-n';
import { matchedTextsFor } from '@/lib/db/queries/ask';
import { collectionTitles } from '@/lib/db/queries/matched-text';
import { embedTexts } from '@/lib/openai/embeddings';

/*
  The corpus (the coordinator and Design, 23 Nov): from a file when one is named, one phrase a line as "group<TAB>phrase",
  each phrase asked RUNS times (three, Design's method), reported per phrase before any rate, and the rates per group, so a
  rate low overall and high on one kind of ask is seen as such. The groups name provenance: "adam-logged" (verbatim from a
  record), "adam-reported" (Adam's own words in conversation describing what he typed), "adam-confirmed" (his answer to
  being asked), "ours-kinds" (written to cover shapes his do not: a title ask, a requirement, a single-word mood),
  "ours-bench" (written on 19 Nov to resemble his). With no file, the first run's 24 phrases, once each.
*/
const corpusFile = process.argv.find((a) => a.startsWith('--corpus='))?.slice('--corpus='.length);
const RUNS = Number(process.argv.find((a) => a.startsWith('--runs='))?.slice('--runs='.length) ?? (corpusFile === undefined ? 1 : 3));
const FIRST_RUN: Array<{ phrase: string; group: string }> = [
  ...['something calm', 'cooking dinner, people over'].map((phrase) => ({ phrase, group: 'adam-logged' })),
  ...['something for a rainy afternoon', 'something from the eighties'].map((phrase) => ({ phrase, group: 'on-his-behalf' })),
  ...[
    'something slow for tonight', 'loud guitars for cleaning the flat', 'quiet music with no vocals for reading',
    'a record for a dinner with friends that nobody has to talk over', 'bright and fast for a sunny morning', 'something sad to sit with',
    'jazz for late at night', 'a long instrumental stretch I can get lost in', 'warm and crackly, something old',
    'dense and strange, for paying attention', 'something to dance to in the kitchen', 'soft voices and acoustic guitars',
    'big orchestral sweep', 'a record that gets heavier as it goes', 'music for a grey afternoon', 'funky and tight, nothing abrasive',
    'a side I can put on and not touch', 'rough, live-sounding rock', 'gentle enough for a child falling asleep', 'something that starts quiet and ends loud',
  ].map((phrase) => ({ phrase, group: 'ours-bench' })),
];
const phrases = corpusFile === undefined
  ? FIRST_RUN
  : readFileSync(corpusFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#')).map((l) => { const [group, ...rest] = l.split('\t'); return { group, phrase: rest.join('\t') }; });
const NS = [10, 20, 30];

const log = (line: string) => process.stdout.write(`${line}\n`);
const titles = await collectionTitles();
const pool = await matchedTextsFor(titles.map((t) => t.id));
log(`measure-top-n: ${phrases.length} phrases, ${RUNS} run(s) each, groups ${[...new Set(phrases.map((p) => p.group))].join(', ')}; a pool of ${pool.length} records with matched text${corpusFile === undefined ? '' : `; corpus ${corpusFile}`}`);

const textVectors = await embedTexts(pool.map((r) => r.text));
const phraseVectors = await embedTexts(phrases.map((p) => p.phrase));
const ranked = pool.map((r, i) => ({ recordId: r.id, vector: textVectors[i] }));
const name = (id: string) => { const t = titles.find((x) => x.id === id); return t === undefined ? id.slice(0, 8) : `${t.artist}, ${t.title}`; };

const outDir = join('docs', 'measurements', 'top-n');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
const answers: Array<{ phrase: string; group: string; ranks: Array<{ recordId: string; rank: number }> }> = [];

for (const [i, p] of phrases.entries()) {
  for (let run = 1; run <= RUNS; run += 1) {
    const result = await askPick(p.phrase, pool, []);
    if (!result.ok) {
      log(`  "${p.phrase}" (${p.group}) run ${run}: the pick failed (${result.reason}); left out of the figure`);
      appendFileSync(out, `${JSON.stringify({ ...p, run, ok: false, reason: result.reason })}\n`);
      continue;
    }
    const ranks = ranksOfPicks(phraseVectors[i], ranked, result.picks.map((x) => x.id));
    answers.push({ phrase: p.phrase, group: p.group, ranks });
    appendFileSync(out, `${JSON.stringify({ ...p, run, ok: true, verdict: result.verdict, ranks: ranks.map((r) => ({ ...r, name: name(r.recordId) })) })}\n`);
  }
}

const rates = (set: typeof answers) => NS.map((n) => { const o = outsideTopN(set.map((a) => a.ranks), n); return `${n}: ${o.outside} of ${o.picks}`; }).join('; ');
log('measure-top-n: per phrase first, picks ranked beyond N by nearness of matched text to the phrase, across its runs');
for (const p of phrases) {
  const mine = answers.filter((a) => a.phrase === p.phrase);
  const deep = mine.flatMap((a) => a.ranks).filter((r) => r.rank > 10).map((r) => `${name(r.recordId)} at ${r.rank}`);
  log(`  "${p.phrase}" (${p.group}), ${mine.length} answers: beyond ${rates(mine)}${deep.length === 0 ? '' : `; beyond 10: ${deep.join('; ')}`}`);
}
log('measure-top-n: then the corpus, and the rates per group');
log(`  all, ${answers.length} answers: beyond ${rates(answers)}`);
for (const g of [...new Set(phrases.map((p) => p.group))]) log(`  ${g}, ${answers.filter((a) => a.group === g).length} answers: beyond ${rates(answers.filter((a) => a.group === g))}`);
appendFileSync(out, `${JSON.stringify({ summary: { runs: RUNS, groups: [...new Set(phrases.map((p) => p.group))].map((g) => ({ group: g, rates: NS.map((n) => ({ n, ...outsideTopN(answers.filter((a) => a.group === g).map((a) => a.ranks), n) })) })) } })}\n`);
log(`measure-top-n: written to ${out}`);
process.exit(0);
