/**
 * **Where the top-N misses fall, and whether they are the widest texts (the coordinator and Design, 24 Nov).** Reads a
 * measure-top-n run's file and reports how its picks ranked beyond N spread across records; then tests the hypothesis
 * that the deep-ranked picks are the records whose matched texts are longest or most varied. An embedding averages a
 * whole text, so a record describing several moods sits near nothing in particular, while the model can find the one
 * sentence that answers and pick it.
 *
 *     node --env-file=.env.local --conditions=react-server --import tsx scripts/report-top-n-spread.mts <run.jsonl> [N]
 *
 * Variety is the mean cosine between a record's own sentences, each embedded on its own (every sentence of the 55 in one
 * call, nothing stored): lower is a text that ranges further. Length is characters. Each record's deep rate is the share of
 * its picks ranked beyond N. Read-only.
 */
import { readFileSync } from 'node:fs';
import { cosine } from '@/lib/ask/rank';
import { permutationP, spearman } from '@/lib/ask/top-n';
import { matchedTextsFor } from '@/lib/db/queries/ask';
import { collectionTitles } from '@/lib/db/queries/matched-text';
import { embedTexts } from '@/lib/openai/embeddings';
import { sentencesOf } from '@/lib/text/sentences';

const file = process.argv[2];
const N = Number(process.argv[3] ?? 30);
/* The coordinator, 24 Nov: the hypothesis came from Hot Tuna, so the correlation is reported with every record and again without the one(s) named here. */
const excluded = (process.argv.find((a) => a.startsWith('--exclude='))?.slice('--exclude='.length) ?? '').split(',').filter((x) => x !== '');
if (file === undefined) throw new Error('report-top-n-spread: name a measure-top-n run file');
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { ok?: boolean; group?: string; source?: string; ranks?: Array<{ recordId: string; rank: number; name: string }> });
/* The coordinator, 24 Nov: the deciding figure is taken on the blocks that did not inform the hypothesis, so the report can be confined to named groups (a run file before 23 Nov's --corpus names its group as source). */
const groups = (process.argv.find((a) => a.startsWith('--groups='))?.slice('--groups='.length) ?? '').split(',').filter((x) => x !== '');
const answered = rows.filter((r) => r.ok === true && (groups.length === 0 || groups.includes(r.group ?? r.source ?? '')));
if (groups.length > 0 && answered.length === 0) throw new Error(`report-top-n-spread: no answers in groups ${groups.join(', ')}`);
const picks = answered.flatMap((r) => r.ranks ?? []);

const titles = await collectionTitles();
const pool = await matchedTextsFor(titles.map((t) => t.id));
const name = (id: string) => { const t = titles.find((x) => x.id === id); return t === undefined ? id.slice(0, 8) : `${t.artist}, ${t.title}`; };

/* Every sentence of every text in one call, then each record's mean pairwise cosine among its own sentences. */
const split = pool.map((r) => ({ id: r.id, length: r.text.length, sentences: sentencesOf(r.text) }));
const vectors = await embedTexts(split.flatMap((r) => r.sentences));
let at = 0;
const variety = new Map<string, number>();
for (const r of split) {
  const own = vectors.slice(at, at + r.sentences.length);
  at += r.sentences.length;
  const pairs: number[] = [];
  for (let i = 0; i < own.length; i += 1) for (let j = i + 1; j < own.length; j += 1) pairs.push(cosine(own[i], own[j]));
  variety.set(r.id, pairs.length === 0 ? 1 : pairs.reduce((a, b) => a + b, 0) / pairs.length);
}
const lengthOf = new Map(split.map((r) => [r.id, r.length]));

const deep = picks.filter((p) => p.rank > N);
const log = (line: string) => process.stdout.write(`${line}\n`);
log(`report-top-n-spread: ${file}${groups.length === 0 ? ', every group' : `, groups ${groups.join(', ')} only`}, ${answered.length} answers, ${picks.length} picks, ${deep.length} ranked beyond ${N}`);
const byRecord = new Map<string, number>();
for (const p of deep) byRecord.set(p.recordId, (byRecord.get(p.recordId) ?? 0) + 1);
log(`  the ${deep.length} spread across ${byRecord.size} records:`);
for (const [id, n] of [...byRecord].sort((a, b) => b[1] - a[1])) {
  const all = picks.filter((p) => p.recordId === id).length;
  log(`    ${name(id)}: ${n} of its ${all} picks beyond ${N}; text ${lengthOf.get(id)} characters, variety ${variety.get(id)?.toFixed(3)}`);
}

/* The hypothesis, across every record picked at least once: does a record's deep rate rise with length, or with variety (lower mean cosine)? Spearman's rank correlation, since neither is linear by any rule. */
const picked = [...new Set(picks.map((p) => p.recordId))];
const deepRate = (id: string) => picks.filter((p) => p.recordId === id && p.rank > N).length / picks.filter((p) => p.recordId === id).length;
/* Spearman with ties at their average rank, from the tested library (24 Nov: the first form ranked ties by list order). */
const correlate = (ids: string[], label: string) => {
  const rates = ids.map(deepRate);
  const sims = ids.map((id) => variety.get(id) ?? 1);
  const lens = ids.map((id) => lengthOf.get(id) ?? 0);
  log(`  ${label}: across the ${ids.length} records picked at least once (${rates.filter((r) => r === 0).length} of them never beyond ${N}, tied at zero), the deep rate's rank correlation, ties at their average rank, with length ${spearman(rates, lens).toFixed(2)} (two-sided permutation p ${permutationP(rates, lens, 10000, 24).toFixed(3)}), with self-similarity (a record's mean cosine among its own sentences; higher is a narrower text) ${spearman(rates, sims).toFixed(2)} (two-sided permutation p ${permutationP(rates, sims, 10000, 24).toFixed(3)})`);
};
correlate(picked, 'all records');
if (excluded.length > 0) correlate(picked.filter((id) => !excluded.some((x) => id.startsWith(x))), `without ${excluded.map(name).join('; ')}`);
const deepIds = [...byRecord.keys()];
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
log(`  median length: the deep-ranked records ${median(deepIds.map((id) => lengthOf.get(id) ?? 0))}, all 55 ${median(split.map((r) => r.length))}; median self-similarity: the deep-ranked ${median(deepIds.map((id) => variety.get(id) ?? 1)).toFixed(3)}, all 55 ${median(split.map((r) => variety.get(r.id) ?? 1)).toFixed(3)}`);
process.exit(0);
