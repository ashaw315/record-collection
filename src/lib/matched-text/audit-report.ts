import type { AuditResult } from '@/lib/llm/matched-text-audit';

/**
 * **The adversarial pass's report (the coordinator, 18 Nov).** Disagreement only, in two kinds under separate headings,
 * never merged or added together: contradicted by the material, which Code verifies against the tracklist and credits
 * and brings with a verdict on each, and contradicted by the auditor's own knowledge, which goes to the coordinator with
 * its caveat. Neither goes to Adam as a worklist. A record with nothing reported is written as "no disagreement
 * reported", which is not confirmation: the auditor was asked only for what it disagreed with.
 */
export type AuditedDraft = { id: string; artist: string; title: string; sentences: string[]; result: AuditResult };

const n = (count: number, noun: string) => `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;

export function renderAudit(drafts: readonly AuditedDraft[], title: string, config: { model: string; effort: string }): string {
  const audited = drafts.filter((d) => d.result.ok);
  const material = audited.reduce((sum, d) => sum + (d.result.ok ? d.result.material.length : 0), 0);
  const knowledge = audited.reduce((sum, d) => sum + (d.result.ok ? d.result.knowledge.length : 0), 0);
  const quiet = audited.filter((d) => d.result.ok && d.result.material.length === 0 && d.result.knowledge.length === 0).length;
  const failed = drafts.length - audited.length;
  const tokensIn = audited.reduce((sum, d) => sum + (d.result.ok ? d.result.tokens.input ?? 0 : 0), 0);
  const tokensOut = audited.reduce((sum, d) => sum + (d.result.ok ? d.result.tokens.output ?? 0 : 0), 0);
  const lines = [
    `# ${title}`,
    '',
    `Run at model ${config.model}, effort ${config.effort}: an audit is attributable to both, or it cannot be compared with the next.`,
    '',
    '**Disagreement only. Agreement is not evidence.** A second model read each draft beside its tracklist, credits and format, never the ABOUT, and was asked only for what it disagreed with. A sentence not listed here is not thereby confirmed, and a record with nothing listed is not confirmed either: it is a record about which the auditor reported no disagreement.',
    '',
    'Two kinds, kept apart and never added together. **Contradicted by the material**: the tracklist, credits or format say otherwise, with the lines that prove it copied beside each; Code verifies each against the material and brings the list with a verdict on every item. **Contradicted by the auditor’s own knowledge**: the material neither confirms nor denies, and the auditor says it knows otherwise; these carry that caveat and go to the coordinator to decide which are worth a redraft. Not a worklist for Adam: neither kind goes to him, since he is not the verifier.',
    '',
    `${n(material, 'sentence')} contradicted by the material. ${n(knowledge, 'sentence')} contradicted by the auditor’s own knowledge. ${n(quiet, 'record')} with no disagreement reported. ${n(failed, 'record')} not audited. ${n(drafts.length, 'record')} in all, ${tokensIn.toLocaleString('en-US')} tokens in and ${tokensOut.toLocaleString('en-US')} tokens out across the audited.`,
    '',
  ];
  for (const d of drafts) {
    lines.push(`## ${d.id.slice(0, 8)}  ${d.artist} — ${d.title}`, '');
    if (!d.result.ok) {
      lines.push(`Not audited: ${d.result.reason}.`, '');
      continue;
    }
    const { result } = d;
    if (result.material.length === 0 && result.knowledge.length === 0) {
      lines.push('No disagreement reported. This is not confirmation: the auditor was asked only for what it disagreed with.', '');
    }
    if (result.material.length > 0) {
      lines.push(`### Contradicted by the material (${result.material.length})`, '');
      for (const m of result.material) lines.push(`- ${m.sentence}. ${m.quote}`, `  Contradiction: ${m.contradiction}`, `  Evidence: ${m.evidence}`, '');
    }
    if (result.knowledge.length > 0) {
      lines.push(`### Contradicted by the auditor’s own knowledge (${result.knowledge.length})`, '');
      for (const k of result.knowledge) lines.push(`- ${k.sentence}. ${k.quote}`, `  Contradiction: ${k.contradiction} (the auditor’s knowledge, unverified; read with that caveat)`, '');
    }
    if (result.dropped.length > 0) lines.push(`Dropped by the reader: ${result.dropped.map((x) => `${x.sentence}: ${x.why}`).join('; ')}.`, '');
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The positive control: a known-wrong sentence that the stored tracklist proves wrong, so it must come back under the
 * material kind. Under the knowledge kind it is the right sentence in the wrong place, and the pass has not shown it
 * reads the material; absent, the pass does not work.
 */
export function findControl(drafts: readonly AuditedDraft[], prefix: string, pattern: RegExp): { held: boolean; kind: 'material' | 'knowledge' | null; sentence: number | null } {
  const d = drafts.find((x) => x.id.startsWith(prefix));
  if (d === undefined || !d.result.ok) return { held: false, kind: null, sentence: null };
  const material = d.result.material.find((m) => pattern.test(m.quote));
  if (material !== undefined) return { held: true, kind: 'material', sentence: material.sentence };
  const knowledge = d.result.knowledge.find((k) => pattern.test(k.quote));
  if (knowledge !== undefined) return { held: false, kind: 'knowledge', sentence: knowledge.sentence };
  return { held: false, kind: null, sentence: null };
}
