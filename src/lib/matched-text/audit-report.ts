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

/**
 * The ruled-false register (the coordinator, 19 Nov): material flags already adjudicated false, by record and the claim's
 * pattern, as the controls are kept. A repeat flag is marked as previously ruled and counted apart, so the same item is
 * not re-adjudicated every run. The same limit as every pattern here: a restated claim will not match, and a run with
 * no match is not a run with no repeat.
 */
export const RULED_FALSE: ReadonlyArray<{ prefix: string; pattern: RegExp; ruled: string; why: string }> = [
  { prefix: '7cfdc4cb', pattern: /Clearmountain/, ruled: 'the coordinator, 18 Nov', why: 'a mix credit characterises the sound; one track of nine mixed by Larry Alexander does not contradict it' },
  { prefix: 'e315c6a7', pattern: /bracketed by two long pieces/, ruled: 'the coordinator, 18 Nov', why: 'the sentence’s second clause says the ends of both sides, which A6 and B5 support' },
  { prefix: 'e80a0cf3', pattern: /a couple of elements each/, ruled: 'Code, accepted by the coordinator, 18 Nov', why: 'a reading stricter than the sentence makes: tracks of three elements are still “a couple” in its sense' },
];

export function findRuling(prefix: string, quote: string): { ruled: string; why: string } | null {
  const hit = RULED_FALSE.find((r) => prefix.startsWith(r.prefix) && r.pattern.test(quote));
  return hit === undefined ? null : { ruled: hit.ruled, why: hit.why };
}

/** Each run's files named by the run's time, model and effort, so no run overwrites another (the coordinator, 19 Nov). */
export function auditFileStem(config: { model: string; effort: string }, at: Date): string {
  return `audit-${at.toISOString().slice(0, 19).replace(/:/g, '-')}Z-${config.model}-${config.effort}`;
}

export function renderAudit(drafts: readonly AuditedDraft[], title: string, config: { model: string; effort: string }): string {
  const audited = drafts.filter((d) => d.result.ok);
  const material = audited.reduce((sum, d) => sum + (d.result.ok ? d.result.material.length : 0), 0);
  const ruled = audited.reduce((sum, d) => sum + (d.result.ok ? d.result.material.filter((m) => findRuling(d.id, m.quote) !== null).length : 0), 0);
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
    `${n(material, 'sentence')} contradicted by the material${ruled > 0 ? `, ${ruled} of them previously ruled false and marked so below` : ''}. ${n(knowledge, 'sentence')} contradicted by the auditor’s own knowledge. ${n(quiet, 'record')} with no disagreement reported. ${n(failed, 'record')} not audited. ${n(drafts.length, 'record')} in all, ${tokensIn.toLocaleString('en-US')} tokens in and ${tokensOut.toLocaleString('en-US')} tokens out across the audited.`,
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
      for (const m of result.material) {
        const ruling = findRuling(d.id, m.quote);
        lines.push(`- ${m.sentence}. ${m.quote}`, ...(ruling === null ? [] : [`  Previously ruled false (${ruling.ruled}): ${ruling.why}.`]), `  Contradiction: ${m.contradiction}`, `  Evidence: ${m.evidence}`, '');
      }
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
export function findControl(drafts: readonly AuditedDraft[], prefix: string, pattern: RegExp): { held: boolean; kind: 'material' | 'knowledge' | 'absent' | null; sentence: number | null } {
  const d = drafts.find((x) => x.id.startsWith(prefix));
  if (d === undefined || !d.result.ok) return { held: false, kind: null, sentence: null };
  /* A control whose sentence the draft no longer holds (a redraft, 18 Nov) proves nothing either way: absent, not missed. */
  if (!d.sentences.some((s) => pattern.test(s))) return { held: false, kind: 'absent', sentence: null };
  const material = d.result.material.find((m) => pattern.test(m.quote));
  if (material !== undefined) return { held: true, kind: 'material', sentence: material.sentence };
  const knowledge = d.result.knowledge.find((k) => pattern.test(k.quote));
  if (knowledge !== undefined) return { held: false, kind: 'knowledge', sentence: knowledge.sentence };
  return { held: false, kind: null, sentence: null };
}
