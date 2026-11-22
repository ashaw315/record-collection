/**
 * **The adversarial pass pointed at the stored ABOUTs (the coordinator, 21 Nov).** The same auditor as the matched text's
 * (matched-text-audit.ts), under the ABOUT's own prompt, reads each stored ABOUT's sentences beside the record's material
 * alone and reports only disagreement in the two kinds kept apart. Beside the two counts, the denominator: how many of
 * the ABOUT's sentences the material could in principle bear on (audit-bearing.ts). And the free check: the
 * self-consistency detectors (matched-text/consistency.ts) run over the same sentences, no model.
 *
 *   npm run abouts:audit -- --planted [--effort medium|high] [--prompt]   # this prompt's own catch rate: six kinds planted in ABOUT copies, then audited
 *   npm run abouts:audit -- --all [--effort medium|high]                  # every stored ABOUT
 *   npm run abouts:audit -- 7d953882 [--prompt]                           # these records; --prompt prints the request and makes no call
 *
 * Reads the records and their cached releases (a read); writes each run's own files under .abouts/ and a copy of the
 * report in ~/Downloads. Writes nothing to production. Silence is worth nothing: the matched-text pass missed both of its
 * positive controls at both efforts, so a count here is a lower bound on errors, never a clean bill, and the report says
 * so in its own head. The ABOUT prompt's catch rate is its planted run's and is never read as the matched text's.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { sentencesOf } from '@/lib/text/sentences';
import { groundingFromPayload, type ReleaseFacts } from '@/lib/llm/about-grounding';
import { bearingCount } from '@/lib/llm/audit-bearing';
import { auditConfig, auditDraft, auditRequest } from '@/lib/llm/matched-text-audit';
import { auditFileStem, renderAudit, type AuditedDraft } from '@/lib/matched-text/audit-report';
import { disagreements } from '@/lib/matched-text/consistency';
import { plantAcross, renderPlanted, scorePlanted, type PlantedRow } from '@/lib/matched-text/plant';

const args = process.argv.slice(2);
const WORK = join(process.cwd(), '.abouts');
mkdirSync(WORK, { recursive: true });
const effortArg = args.includes('--effort') ? args[args.indexOf('--effort') + 1] : undefined;
const config = auditConfig(effortArg === undefined ? {} : { effort: effortArg });
const planted = args.includes('--planted');
const prefixes = args.filter((a) => /^[0-9a-f]{8}/.test(a)).map((a) => a.slice(0, 8));
if (!planted && !args.includes('--all') && prefixes.length === 0) throw new Error('audit-abouts: give record id prefixes, --all, or --planted');

type Row = { id: string; artist: string; title: string; year: number | null; snippet: string; payload: unknown };
const db = getDb();
const where = prefixes.length === 0 ? sql`TRUE` : sql`(${sql.join(prefixes.map((p) => sql`r.id::text LIKE ${p + '%'}`), sql` OR `)})`;
const rows = (await db.execute<Row>(sql`
  SELECT r.id, a.name AS artist, r.title, r.release_year AS year, r.snippet, c.payload
  FROM records r JOIN artists a ON a.id = r.artist_id
  LEFT JOIN pressings p ON p.id = r.pressing_id
  LEFT JOIN discogs_cache c ON c.discogs_release_id = p.discogs_release_id
  WHERE r.snippet IS NOT NULL AND length(trim(r.snippet)) > 0 AND ${where}
  ORDER BY a.name, r.title`)).rows;
if (rows.length === 0) throw new Error('audit-abouts: no stored ABOUT matches');
const factsOf = (id: string): ReleaseFacts | null => { const r = rows.find((x) => x.id === id); return r === undefined || r.payload === null ? null : groundingFromPayload(r.payload); };
const subjectOf = (r: Row) => ({ artist: r.artist, title: r.title, year: r.year, about: null });
const sentences = (r: Row) => sentencesOf(r.snippet);
const stamp = (at: Date) => at.toISOString().slice(0, 16);

if (planted) {
  const copies = plantAcross(rows.map((r) => ({ id: r.id, artist: r.artist, title: r.title, sentences: sentences(r) })), factsOf);
  if (args.includes('--prompt')) {
    for (const p of copies) process.stdout.write(`${p.kind}  ${p.id.slice(0, 8)} ${p.artist} — ${p.title}\n  planted as sentence ${p.index}: ${p.text}\n  in place of: ${p.original}\n`);
    process.stdout.write(`${copies.length} planted, model ${config.model}, effort ${config.effort}, prompt about; no call made\n`);
    process.exit(0);
  }
  const planted: PlantedRow[] = [];
  for (const p of copies) {
    const r = rows.find((x) => x.id === p.id);
    if (r === undefined) continue;
    const result = await auditDraft(subjectOf(r), p.sentences, factsOf(p.id), { effort: config.effort, kind: 'about' });
    planted.push({ ...p, result });
    console.log(`${p.kind}  ${p.id.slice(0, 8)} ${p.artist} — ${p.title}: ${result.ok ? `material ${result.material.map((m) => m.sentence).join(',') || 'none'}, knowledge ${result.knowledge.map((k) => k.sentence).join(',') || 'none'}` : `NOT AUDITED, ${result.reason}`} (planted at ${p.index})`);
  }
  const at = new Date();
  const stem = `about-planted-${auditFileStem(config, at)}`;
  const title = `Planted errors in ABOUT copies, ${stamp(at)}Z, ${config.model} at ${config.effort}, the ABOUT prompt`;
  writeFileSync(join(WORK, `${stem}.md`), renderPlanted(planted, config, title));
  writeFileSync(join(WORK, `${stem}.json`), JSON.stringify(planted, null, 2));
  copyFileSync(join(WORK, `${stem}.md`), join(homedir(), 'Downloads', `${title}.md`));
  const score = scorePlanted(planted);
  console.log(`audit-abouts --planted: ${score.caught} of ${score.planted} caught under the material kind, ${score.misfiled} misfiled under knowledge, ${score.missed} missed, ${score.notAudited} not audited; other flags beside them: ${score.otherMaterial} material, ${score.otherKnowledge} knowledge; model ${config.model}, effort ${config.effort}, the ABOUT prompt; report ${join(WORK, `${stem}.md`)}`);
  process.exit(0);
}

if (args.includes('--prompt')) {
  for (const r of rows) {
    const request = auditRequest(subjectOf(r), sentences(r), factsOf(r.id), config, 'about');
    process.stdout.write(`\n===== ${r.id.slice(0, 8)} ${r.artist} — ${r.title}  model ${request.model}, effort ${request.reasoning.effort}\n`);
    for (const m of request.input) process.stdout.write(`--- ${m.role}\n${m.content}\n`);
  }
  process.exit(0);
}

type Extra = { bearing: { bearing: number; of: number }; consistency: ReturnType<typeof disagreements> };
const audited: AuditedDraft[] = [];
const extras = new Map<string, Extra>();
let tokensIn = 0;
let tokensOut = 0;
for (const r of rows) {
  const s = sentences(r);
  const facts = factsOf(r.id);
  const result = await auditDraft(subjectOf(r), s, facts, { effort: config.effort, kind: 'about' });
  audited.push({ id: r.id, artist: r.artist, title: r.title, sentences: s, result });
  const extra: Extra = { bearing: bearingCount(s, facts), consistency: disagreements(s) };
  extras.set(r.id, extra);
  if (result.ok) {
    tokensIn += result.tokens.input ?? 0;
    tokensOut += result.tokens.output ?? 0;
    console.log(`${r.id.slice(0, 8)}  ${r.artist} — ${r.title}: material ${result.material.length}, knowledge ${result.knowledge.length}, bearing ${extra.bearing.bearing} of ${extra.bearing.of}, self-consistency ${extra.consistency.length}${result.dropped.length === 0 ? '' : `, dropped ${result.dropped.length}`}`);
  } else {
    console.log(`${r.id.slice(0, 8)}  ${r.artist} — ${r.title}: NOT AUDITED, ${result.reason}; bearing ${extra.bearing.bearing} of ${extra.bearing.of}, self-consistency ${extra.consistency.length}`);
  }
}

const at = new Date();
const stem = `about-${auditFileStem(config, at)}`;
const title = `ABOUT audit, ${stamp(at)}Z, ${config.model} at ${config.effort}, the ABOUT prompt`;
const material = audited.reduce((n, a) => n + (a.result.ok ? a.result.material.length : 0), 0);
const knowledge = audited.reduce((n, a) => n + (a.result.ok ? a.result.knowledge.length : 0), 0);
const failed = audited.filter((a) => !a.result.ok).length;
const bearingAll = [...extras.values()].reduce((acc, e) => ({ bearing: acc.bearing + e.bearing.bearing, of: acc.of + e.bearing.of }), { bearing: 0, of: 0 });
const consistencyAll = [...extras.values()].reduce((n, e) => n + e.consistency.length, 0);
const head = [
  `# ${title}`,
  '',
  '**Silence is worth nothing.** The matched-text pass missed both of its positive controls at both efforts, so these counts are a lower bound on errors, never a clean bill. **This prompt is not that prompt:** its catch rate is its own planted run\'s (`audit-abouts --planted`) and is never read as the matched text\'s.',
  '',
  `**The pass is structurally weaker on an ABOUT.** Of ${bearingAll.of} sentences in ${audited.length} ABOUTs, the material could in principle bear on ${bearingAll.bearing}; the material kind cannot fire on the rest, so the knowledge kind, the advisory one, carries more of the result than it does for a matched text.`,
  '',
  `| | count |\n|---|---|\n| ABOUTs audited | ${audited.length - failed} of ${audited.length} |\n| sentences | ${bearingAll.of} |\n| sentences the material could bear on | ${bearingAll.bearing} |\n| contradicted by the material | ${material} |\n| contradicted by the auditor's own knowledge | ${knowledge} |\n| self-consistency disagreements (no model) | ${consistencyAll} |`,
  '',
  '## Per record: bearing and self-consistency',
  '',
  '| record | sentences | bearing | material | knowledge | self-consistency |',
  '|---|---|---|---|---|---|',
  ...audited.map((a) => { const e = extras.get(a.id); return `| ${a.artist} — ${a.title} | ${e?.bearing.of ?? 0} | ${e?.bearing.bearing ?? 0} | ${a.result.ok ? a.result.material.length : '—'} | ${a.result.ok ? a.result.knowledge.length : '—'} | ${e?.consistency.length ?? 0}${(e?.consistency.length ?? 0) > 0 ? `: ${e?.consistency.map((d) => `${d.a}/${d.b} ${d.why}`).join('; ')}` : ''} |`; }),
  '',
].join('\n');
writeFileSync(join(WORK, `${stem}.json`), JSON.stringify({ config, kind: 'about', at: at.toISOString(), args, audited, extras: Object.fromEntries(extras) }, null, 2));
const report = join(WORK, `${stem}.md`);
writeFileSync(report, `${head}\n${renderAudit(audited, title, config)}`);
copyFileSync(report, join(homedir(), 'Downloads', `${title}.md`));
console.log(`audit-abouts: ${audited.length} audited, ${material} contradicted by the material, ${knowledge} contradicted by the auditor's own knowledge, ${failed} not audited; ${bearingAll.bearing} of ${bearingAll.of} sentences bearable; ${consistencyAll} self-consistency disagreements; ${tokensIn} tokens in, ${tokensOut} out; model ${config.model}, effort ${config.effort}, the ABOUT prompt; report ${report}`);
process.exit(0);
