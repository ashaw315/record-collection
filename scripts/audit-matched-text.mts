/**
 * **The adversarial pass over the matched-text drafts (the coordinator, 17 and 18 Nov).** A second model, on OpenAI's
 * Responses endpoint with its own model variable (`MATCHED_AUDIT_MODEL`, `MATCHED_AUDIT_EFFORT`), reads each draft's
 * sentences beside the record's material alone, never the ABOUT, and reports only disagreement in two kinds kept apart:
 * contradicted by the material, and contradicted by the auditor's own knowledge. Agreement is not evidence.
 *
 *   npm run matched:audit -- 7d953882               # these drafts, by id prefix
 *   npm run matched:audit -- --all                  # every draft in .matched/drafts.json (reads it, never writes it)
 *   npm run matched:audit -- 7d953882 --prompt      # the request printed, no call, nothing written
 *   npm run matched:audit -- --planted [--effort medium|high] [--prompt]
 *       # the catch-rate measurement (the coordinator, 18 Nov): six kinds of error the stored material disproves,
 *       # each planted in a copy of a different draft, the pass run over the copies; --prompt plants and prints, no call
 *
 * Reads `.matched/drafts.json` and the records' cached releases from the database (a read); writes `.matched/audit.json`
 * and the report to `.matched/audit.md` and ~/Downloads. Writes nothing to production and nothing to drafts.json.
 *
 * The positive control: Carpenters' sentence placing the medley right after "Druscilla Penny", with "One Love" (B3)
 * between them in the stored tracklist. It must come back under the material kind; if it does not, the pass does not
 * work and nothing proceeds on its output.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { recordsToDraft } from '@/lib/db/queries/matched-text';
import { groundingFromPayload } from '@/lib/llm/about-grounding';
import { auditConfig, auditDraft, auditRequest } from '@/lib/llm/matched-text-audit';
import { findControl, renderAudit, type AuditedDraft } from '@/lib/matched-text/audit-report';
import { plantAcross, renderPlanted, scorePlanted, type PlantedRow } from '@/lib/matched-text/plant';
import type { ReviewDraft } from '@/lib/matched-text/review';

const CONTROL = { prefix: '7d953882', pattern: /Druscilla Penny/ };
const args = process.argv.slice(2);
const WORK = join(process.cwd(), '.matched');
mkdirSync(WORK, { recursive: true });
type Draft = ReviewDraft & { text: string | null };

/* --effort names the effort for this run over the setting, so two runs at two efforts are each attributable. */
const effortArg = args.includes('--effort') ? args[args.indexOf('--effort') + 1] : undefined;
const config = auditConfig(effortArg === undefined ? {} : { effort: effortArg });
const planted = args.includes('--planted');

const drafts: Draft[] = JSON.parse(readFileSync(join(WORK, 'drafts.json'), 'utf8'));
const prefixes = args.filter((a) => /^[0-9a-f]{8}/.test(a)).map((a) => a.slice(0, 8));
if (!planted && !args.includes('--all') && prefixes.length === 0) throw new Error('audit-matched-text: give record id prefixes, --all, or --planted');
const chosen = drafts.filter((d) => d.text !== null && d.sentences.length > 0 && (planted || args.includes('--all') || prefixes.some((p) => d.id.startsWith(p))));
if (chosen.length === 0) throw new Error('audit-matched-text: no finished draft matches');

/* The material comes from the database by prefix, as drafting reads it, so the auditor sees what the drafter saw. */
const rows = await recordsToDraft({ prefixes: chosen.map((d) => d.id.slice(0, 8)) });
const factsOf = (id: string) => {
  const row = rows.find((r) => r.id === id);
  return row === undefined || row.payload === null ? null : groundingFromPayload(row.payload);
};
const subjectOf = (d: Draft) => ({ artist: d.artist, title: d.title, year: d.year, about: d.about });
const sentencesOf = (d: Draft) => d.sentences.map((s) => s.text);

/*
  The planted run (the coordinator, 18 Nov): copies, in memory, of the first drafts whose material can carry each kind,
  one planted sentence each in place of the draft's last; the pass over the copies; the catch rate reported with the
  model and effort named. Nothing is written to drafts.json or the database.
*/
if (planted) {
  const copies = plantAcross(chosen.map((d) => ({ id: d.id, artist: d.artist, title: d.title, sentences: sentencesOf(d) })), factsOf);
  if (args.includes('--prompt')) {
    for (const p of copies) process.stdout.write(`${p.kind}  ${p.id.slice(0, 8)} ${p.artist} — ${p.title}\n  planted as sentence ${p.index}: ${p.text}\n  in place of: ${p.original}\n`);
    process.stdout.write(`${copies.length} planted, model ${config.model}, effort ${config.effort}; no call made\n`);
    process.exit(0);
  }
  const rows: PlantedRow[] = [];
  for (const p of copies) {
    const d = chosen.find((x) => x.id === p.id);
    if (d === undefined) continue;
    const result = await auditDraft(subjectOf(d), p.sentences, factsOf(p.id), { effort: config.effort });
    rows.push({ ...p, result });
    console.log(`${p.kind}  ${p.id.slice(0, 8)} ${p.artist} — ${p.title}: ${result.ok ? `material ${result.material.map((m) => m.sentence).join(',') || 'none'}, knowledge ${result.knowledge.map((k) => k.sentence).join(',') || 'none'}; planted is ${p.index}; ${result.tokens.input ?? '?'} in, ${result.tokens.output ?? '?'} out` : `NOT AUDITED, ${result.reason}`}`);
  }
  const date = new Date().toISOString().slice(0, 10);
  const title = `Planted errors, ${date}, ${config.model} at ${config.effort}`;
  const file = join(WORK, `audit-planted-${config.effort}.md`);
  writeFileSync(file, renderPlanted(rows, config, title));
  writeFileSync(join(WORK, `audit-planted-${config.effort}.json`), JSON.stringify(rows, null, 2));
  const out = join(homedir(), 'Downloads', `${title}.md`);
  copyFileSync(file, out);
  const score = scorePlanted(rows);
  console.log(`audit-matched-text --planted: ${score.caught} of ${score.planted} caught under the material kind, ${score.misfiled} misfiled under knowledge, ${score.missed} missed, ${score.notAudited} not audited; other flags beside them: ${score.otherMaterial} material, ${score.otherKnowledge} knowledge; model ${config.model}, effort ${config.effort}; report ${out}`);
  process.exit(0);
}

if (args.includes('--prompt')) {
  for (const d of chosen) {
    const request = auditRequest(subjectOf(d), sentencesOf(d), factsOf(d.id), config);
    process.stdout.write(`\n===== ${d.id.slice(0, 8)} ${d.artist} — ${d.title}  model ${request.model}, effort ${request.reasoning.effort}\n`);
    for (const m of request.input) process.stdout.write(`--- ${m.role}\n${m.content}\n`);
  }
  process.exit(0);
}

const audited: AuditedDraft[] = [];
let tokensIn = 0;
let tokensOut = 0;
for (const d of chosen) {
  const result = await auditDraft(subjectOf(d), sentencesOf(d), factsOf(d.id), { effort: config.effort });
  audited.push({ id: d.id, artist: d.artist, title: d.title, sentences: sentencesOf(d), result });
  if (result.ok) {
    tokensIn += result.tokens.input ?? 0;
    tokensOut += result.tokens.output ?? 0;
    console.log(`${d.id.slice(0, 8)}  ${d.artist} — ${d.title}: material ${result.material.length}, knowledge ${result.knowledge.length}${result.dropped.length === 0 ? '' : `, dropped ${result.dropped.length}`}; ${result.tokens.input ?? '?'} in, ${result.tokens.output ?? '?'} out`);
  } else {
    console.log(`${d.id.slice(0, 8)}  ${d.artist} — ${d.title}: NOT AUDITED, ${result.reason}`);
  }
}

const date = new Date().toISOString().slice(0, 10);
const title = `Matched text audit, ${date}, ${config.model} at ${config.effort}`;
writeFileSync(join(WORK, 'audit.json'), JSON.stringify({ config, audited }, null, 2));
const report = join(WORK, 'audit.md');
writeFileSync(report, renderAudit(audited, title, config));
const out = join(homedir(), 'Downloads', `${title}.md`);
copyFileSync(report, out);

const material = audited.reduce((s, a) => s + (a.result.ok ? a.result.material.length : 0), 0);
const knowledge = audited.reduce((s, a) => s + (a.result.ok ? a.result.knowledge.length : 0), 0);
const failed = audited.filter((a) => !a.result.ok).length;
console.log(`audit-matched-text: ${audited.length} audited, ${material} contradicted by the material, ${knowledge} contradicted by the auditor's own knowledge, ${failed} not audited; ${tokensIn} tokens in, ${tokensOut} out; model ${config.model}, effort ${config.effort}; report ${out}`);
if (audited.some((a) => a.id.startsWith(CONTROL.prefix))) {
  const control = findControl(audited, CONTROL.prefix, CONTROL.pattern);
  console.log(control.held
    ? `CONTROL HELD: Carpenters' medley sentence (${control.sentence}) came back contradicted by the material`
    : `CONTROL MISSED: Carpenters' medley sentence ${control.kind === 'knowledge' ? `came back under the auditor's own knowledge (sentence ${control.sentence}), not the material` : 'was not reported'}; the pass has not shown it reads the material, and nothing proceeds on its output`);
}
process.exit(0);
