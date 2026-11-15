/**
 * **The ask's diagnostic, picks before reasons (step 3, unit 5; the coordinator, 14 and 15 Nov).** Adam judges the
 * model pick on records he has described, outside the route, since the route ranks until every record with an ABOUT has
 * matched text. A persuasive reason talks a reader into a bad pick, so the first file shows only what was picked; the
 * reasons, the effort and the time come in the reveal, after his marks. The pool is stated every time, because ten
 * described records are not the collection. Each phrase runs at two efforts, shown as A and B until the reveal, so
 * neither mark leans on knowing which.
 */
export type DiagnosticRun = {
  phrase: string;
  label: 'A' | 'B';
  effort: string;
  ms: number;
  verdict: 'answer' | 'nothing-fits' | 'requirement-unmet' | 'run-exhausted' | null;
  failure?: string;
  picks: Array<{ id: string; artist: string; title: string; reason: string }>;
};
export type Pool = { described: number; collection: number };
export type Marks = Map<string, 'y' | 'n'>;

const poolLine = (pool: Pool) => `among the ${pool.described} described records, not the collection’s ${pool.collection}`;
/*
  What a partial pool can and cannot answer (the coordinator, 15 Nov): with few records and several phrases the same
  records recur across phrases by arithmetic, and read without this they look like the bunching the pick replaces.
*/
const limits = (pool: Pool) =>
  pool.described >= pool.collection
    ? ''
    : `A pool of ${pool.described} can test whether the pick works: whether it declines when nothing fits, never pads, grounds each reason in a stored sentence, and answers a requirement unmet differently. It cannot test whether the descriptions tell phrases apart: the same records will recur across phrases by arithmetic, not by bunching, until every record is described.`;
const verdictWords = (r: DiagnosticRun) => (r.failure !== undefined ? 'no answer (failed)' : r.verdict === 'nothing-fits' ? 'nothing fits' : r.verdict === 'requirement-unmet' ? 'a requirement unmet' : 'nothing picked');
const phrases = (runs: readonly DiagnosticRun[]) => [...new Set(runs.map((r) => r.phrase))];

export function renderPicks(runs: readonly DiagnosticRun[], pool: Pool): string {
  const lines = [
    '# The ask’s picks, to mark before the reasons',
    '',
    `Picks ${poolLine(pool)}. Each phrase was asked twice, A and B, and a record either picked appears once under the phrase. Mark each y if it fits the phrase and n if it does not, inside its box, then run the reveal. No reason is shown yet, on purpose.`,
    '',
  ];
  if (limits(pool) !== '') lines.push(limits(pool), '');
  for (const phrase of phrases(runs)) {
    lines.push(`## "${phrase}", ${poolLine(pool)}`, '');
    const own = runs.filter((x) => x.phrase === phrase);
    /* One box per record, whichever ask picked it: Adam judges records, not runs; the reveal maps the mark back to each. */
    const seen = new Set<string>();
    for (const p of own.flatMap((r) => r.picks)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      lines.push(`- [ ] ${p.artist} — ${p.title}  <!-- ${phrase}|${p.id} -->`);
    }
    for (const r of own.filter((x) => x.picks.length === 0)) lines.push(`${r.label}: ${verdictWords(r)}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

/** The boxes read back: y or n per record, keyed phrase|id; a box left empty is not a mark. */
export function parseMarks(text: string): Marks {
  const marks: Marks = new Map();
  for (const m of text.matchAll(/^- \[([yYnN ]?)\] .*<!-- (.+?) -->\s*$/gm)) {
    const v = m[1].trim().toLowerCase();
    if (v === 'y' || v === 'n') marks.set(m[2], v);
  }
  return marks;
}

export function renderReveal(runs: readonly DiagnosticRun[], marks: Marks, pool: Pool): string {
  const lines = ['# The ask’s picks, revealed', '', `Picks ${poolLine(pool)}.`, ''];
  if (limits(pool) !== '') lines.push(limits(pool), '');
  for (const phrase of phrases(runs)) {
    lines.push(`## "${phrase}"`, '');
    for (const r of runs.filter((x) => x.phrase === phrase)) {
      lines.push(`${r.label}, at ${r.effort}, ${r.ms}ms${r.picks.length === 0 ? `: ${verdictWords(r)}${r.failure === undefined ? '' : `, ${r.failure}`}` : ''}`);
      for (const p of r.picks) lines.push(`- [${marks.get(`${phrase}|${p.id}`) ?? ' '}] ${p.artist} — ${p.title}: ${p.reason}`);
      lines.push('');
    }
  }
  lines.push('## By effort', '');
  for (const effort of [...new Set(runs.map((r) => r.effort))]) {
    const own = runs.filter((r) => r.effort === effort);
    const marked = own.flatMap((r) => r.picks.map((p) => marks.get(`${r.phrase}|${p.id}`))).filter((v) => v !== undefined);
    const times = own.map((r) => r.ms).sort((a, b) => a - b);
    lines.push(`- ${effort}: ${marked.filter((v) => v === 'y').length} of ${marked.length} marked picks fit; times ${times.join(', ')}ms`);
  }
  return `${lines.join('\n')}\n`;
}
