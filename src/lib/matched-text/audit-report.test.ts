import { describe, expect, it } from 'vitest';
import { auditFileStem, findControl, findRuling, renderAudit, type AuditedDraft } from './audit-report';

/**
 * **The adversarial pass's report (the coordinator, 18 Nov): the two kinds of disagreement under separate headings,
 * never merged, under a heading that agreement is not evidence.** Material contradictions go to Code to verify against
 * the tracklist and credits; knowledge contradictions go to the coordinator with their caveat; neither goes to Adam as a
 * worklist. A record with nothing reported says so as "no disagreement reported", never as confirmed.
 */
const one: AuditedDraft = {
  id: '7d953882-71a0-42fd-ba3c-2bd61561037a', artist: 'Carpenters', title: 'Carpenters',
  sentences: ['Side two begins with "Superstar".', 'The medley that follows "Druscilla Penny" is a stitched run.', 'The record ends with "Sometimes".'],
  result: {
    ok: true,
    material: [{ sentence: 2, quote: 'The medley that follows "Druscilla Penny" is a stitched run.', contradiction: 'B3 One Love sits between them.', evidence: 'B2 Druscilla Penny, B3 One Love, B4 Medley' }],
    knowledge: [{ sentence: 3, quote: 'The record ends with "Sometimes".', contradiction: 'Some pressings add a track after it.' }],
    dropped: [{ sentence: 7, why: 'no sentence 7' }],
    tokens: { input: 1800, output: 120 },
  },
};
const quiet: AuditedDraft = { id: '01ad99d8-5938-4a14-a1af-b0ed7bae4a3e', artist: 'Cindy Lee', title: 'Diamond Jubilee', sentences: ['Hiss and bare guitar.'], result: { ok: true, material: [], knowledge: [], dropped: [], tokens: { input: 900, output: 20 } } };
const failed: AuditedDraft = { id: 'ffffffff-0000-4000-8000-000000000000', artist: 'X', title: 'Y', sentences: ['Z.'], result: { ok: false, reason: 'the model refused: no' } };

describe('renderAudit', () => {
  const text = renderAudit([one, quiet, failed], 'Matched text audit, 2026-11-18', { model: 'audit-model', effort: 'high' });

  /* An audit result is attributable to a named model AND a named effort, or it cannot be compared with the next one (the coordinator, 18 Nov). */
  it('names the model and the effort the audit ran at, in the head', () => {
    const head = text.slice(0, text.indexOf('## '));
    expect(head).toMatch(/model audit-model/);
    expect(head).toMatch(/effort high/);
  });

  it('heads the file with the reading rule: disagreement only, agreement is not evidence, and who each kind goes to', () => {
    const head = text.slice(0, text.indexOf('## '));
    expect(head).toMatch(/agreement is not evidence/i);
    expect(head).toMatch(/not .*confirm/i);
    expect(head).toMatch(/contradicted by the material/i);
    expect(head).toMatch(/contradicted by the auditor’s own knowledge/i);
    expect(head).toMatch(/not .*Adam/i);
  });

  it('counts each kind separately across the file and never adds them together', () => {
    const head = text.slice(0, text.indexOf('## '));
    expect(head).toMatch(/1 sentence[^.\n]*contradicted by the material/i);
    expect(head).toMatch(/1 sentence[^.\n]*contradicted by the auditor’s own knowledge/i);
    expect(head).not.toMatch(/\b2 (sentences|contradictions|flags)\b/);
    expect(head).toMatch(/1 (record|draft)[^.\n]*no disagreement reported/i);
    expect(head).toMatch(/1 (record|draft)[^.\n]*not audited/i);
  });

  it('writes each record’s two kinds under their own headings, material first, each item with its number, its sentence and its evidence or caveat', () => {
    const record = text.slice(text.indexOf('## 7d953882'), text.indexOf('## 01ad99d8'));
    const material = record.indexOf('Contradicted by the material');
    const knowledge = record.indexOf('Contradicted by the auditor’s own knowledge');
    expect(material).toBeGreaterThan(-1);
    expect(knowledge).toBeGreaterThan(material);
    expect(record.slice(material, knowledge)).toContain('2. The medley that follows "Druscilla Penny" is a stitched run.');
    expect(record.slice(material, knowledge)).toContain('B3 One Love sits between them.');
    expect(record.slice(material, knowledge)).toContain('B2 Druscilla Penny, B3 One Love, B4 Medley');
    expect(record.slice(knowledge)).toContain('3. The record ends with "Sometimes".');
    expect(record.slice(knowledge)).toMatch(/caveat|the auditor’s knowledge, unverified/i);
    expect(record).toMatch(/dropped[^\n]*no sentence 7/i);
  });

  it('says of a record with nothing reported that no disagreement was reported, and not that it was confirmed', () => {
    const record = text.slice(text.indexOf('## 01ad99d8'), text.indexOf('## ffffffff'));
    expect(record).toMatch(/no disagreement reported/i);
    expect(record).toMatch(/not confirmation|is not confirmed/i);
    expect(record).not.toMatch(/\bconfirmed\.|\bverified\b|\bcorrect\b/i);
  });

  it('writes a failed audit as not audited, with its reason, never as clean', () => {
    const record = text.slice(text.indexOf('## ffffffff'));
    expect(record).toMatch(/not audited/i);
    expect(record).toContain('the model refused: no');
    expect(record).not.toMatch(/no disagreement reported/i);
  });

  it('states the tokens spent, in and out, across the audited records', () => {
    expect(text).toMatch(/2,700 (tokens )?in/);
    expect(text).toMatch(/140 (tokens )?out/);
  });
});

describe('findControl', () => {
  it('finds the positive control under the material kind by the record’s prefix and a pattern in the quoted sentence', () => {
    expect(findControl([one, quiet], '7d953882', /Druscilla Penny/)).toEqual({ held: true, kind: 'material', sentence: 2 });
  });

  it('reports the control missed, and says if it came back under knowledge instead, which is not the kind the material proves', () => {
    const underKnowledge: AuditedDraft = { ...one, result: { ...one.result, ok: true, material: [], knowledge: [...(one.result.ok ? one.result.knowledge : []), { sentence: 2, quote: one.sentences[1], contradiction: 'x' }] } } as AuditedDraft;
    expect(findControl([underKnowledge], '7d953882', /Druscilla Penny/)).toEqual({ held: false, kind: 'knowledge', sentence: 2 });
    expect(findControl([quiet], '7d953882', /Druscilla Penny/)).toEqual({ held: false, kind: null, sentence: null });
  });

  /*
    The ten redrafts (18 Nov) replaced both control drafts, and the run over them reported the controls "missed" while no
    sentence of either draft held the control's pattern: a control whose sentence is gone proves nothing either way and
    is not a miss. Fails against findControl reading the result's lists alone, never the draft's sentences.
  */
  it('says a control whose sentence is not in the draft is absent, which is not a miss', () => {
    const redrafted: AuditedDraft = { ...one, sentences: ['Side two begins with "Superstar".', 'The record ends with "Sometimes".'], result: { ok: true, material: [], knowledge: [], dropped: [], tokens: { input: 1, output: 1 } } };
    expect(findControl([redrafted], '7d953882', /Druscilla Penny/)).toEqual({ held: false, kind: 'absent', sentence: null });
  });
});

/*
  Each run's files named by the run (the coordinator, 19 Nov): the script wrote audit.json, audit.md and one Downloads file
  by model and effort, so every run overwrote the last, and the ten redrafts' audit json was lost to two control re-runs
  before a copy was made. Fails against a stem without the time.
*/
describe('auditFileStem', () => {
  it('names a run’s files by its time to the second, its model and its effort, so no run overwrites another', () => {
    expect(auditFileStem({ model: 'gpt-6.1-sol', effort: 'medium' }, new Date('2026-11-19T10:22:33Z'))).toBe('audit-2026-11-19T10-22-33Z-gpt-6.1-sol-medium');
    expect(auditFileStem({ model: 'gpt-6.1-sol', effort: 'medium' }, new Date('2026-11-19T10:22:34Z'))).not.toBe(auditFileStem({ model: 'gpt-6.1-sol', effort: 'medium' }, new Date('2026-11-19T10:22:33Z')));
  });
});

/*
  The ruled-false register (the coordinator, 19 Nov): the pass re-flagged Huey Lewis's Clearmountain shape a day after he
  ruled it false, so a repeat flag is marked as previously ruled, and counted apart, rather than re-adjudicated every run.
  By record and the claim's pattern, as the controls are, with the same limit: a restated claim will not match.
*/
describe('the ruled-false register', () => {
  const huey: AuditedDraft = {
    id: '7cfdc4cb-0000-4000-8000-000000000000', artist: 'Huey Lewis & The News', title: 'Sports',
    sentences: ["Bob Clearmountain's mix gives the whole thing a big, dry, forward snare.", 'A five-piece band.'],
    result: { ok: true, material: [
      { sentence: 1, quote: "Bob Clearmountain's mix gives the whole thing a big, dry, forward snare.", contradiction: 'A4 was mixed by Larry Alexander.', evidence: 'A4: Larry Alexander, Mixed By' },
      { sentence: 2, quote: 'A five-piece band.', contradiction: 'Six are credited.', evidence: 'credits' },
    ], knowledge: [], dropped: [], tokens: { input: 1, output: 1 } },
  };

  it('finds a ruling by the record and the claim, and none for a claim not ruled on', () => {
    expect(findRuling('7cfdc4cb', "Bob Clearmountain's mix gives the whole thing a big, dry, forward snare.")).toMatchObject({ ruled: 'the coordinator, 18 Nov' });
    expect(findRuling('7cfdc4cb', 'A five-piece band.')).toBeNull();
    expect(findRuling('01ad99d8', "Bob Clearmountain's mix gives the whole thing a big, dry, forward snare.")).toBeNull();
  });

  it('marks the ruled flag in the report as previously ruled false, with who and when, and counts it apart in the head', () => {
    const text = renderAudit([huey], 'Audit', { model: 'm', effort: 'medium' });
    expect(text).toMatch(/- 1\. Bob Clearmountain[^\n]*\n  Previously ruled false \(the coordinator, 18 Nov\): a mix credit/);
    expect(text).not.toMatch(/- 2\. A five-piece band\.\n  Previously ruled/);
    expect(text.slice(0, text.indexOf('## '))).toMatch(/2 sentences contradicted by the material, 1 of them previously ruled false/);
  });
});
