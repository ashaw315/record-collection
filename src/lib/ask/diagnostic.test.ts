import { describe, expect, it } from 'vitest';
import { parseMarks, renderPicks, renderReveal, type DiagnosticRun } from './diagnostic';

/**
 * **Step 3, unit 5: the diagnostic, picks before reasons (the coordinator, 14 and 15 Nov).** A persuasive reason talks a
 * reader into a bad pick, so the first file shows only what was picked, and the reasons come after Adam's marks. The
 * pool is stated every time: ten described records are not the collection, and a pick among ten judged as a pick among
 * fifty-five corrupts the judgement. Each phrase is run at two efforts, shown only as A and B until the reveal.
 */
const runs: DiagnosticRun[] = [
  { phrase: 'something calm', label: 'A', effort: 'low', ms: 1840, verdict: 'answer', picks: [{ id: 'r1', artist: 'James Taylor', title: 'Sweet Baby James', reason: 'Voice and guitar, close and unhurried.' }, { id: 'r2', artist: 'Carpenters', title: 'Carpenters', reason: 'Slow and low.' }] },
  { phrase: 'something calm', label: 'B', effort: 'medium', ms: 4120, verdict: 'nothing-fits', picks: [] },
  { phrase: 'loud and fast', label: 'A', effort: 'medium', ms: 3900, verdict: null, failure: 'the model refused: no', picks: [] },
  { phrase: 'loud and fast', label: 'B', effort: 'low', ms: 1500, verdict: 'answer', picks: [{ id: 'r3', artist: 'Mandy, Indiana', title: 'URGH', reason: 'Loud, dry drums.' }] },
];

describe('the picks file', () => {
  const out = renderPicks(runs, { described: 10, collection: 55 });

  it('states the pool on every phrase: among the described records, not the collection', () => {
    expect(out).toMatch(/among the 10 described records, not the collection’s 55/);
    expect(out.match(/among the 10 described records/g)?.length).toBe(1 + 2);
  });

  it('shows what was picked with a box to mark, and no reason and no effort', () => {
    expect(out).toContain('- [ ] James Taylor — Sweet Baby James');
    expect(out).not.toContain('Voice and guitar');
    expect(out).not.toMatch(/\b(low|medium)\b/);
  });

  it('shows a run that picked nothing as its verdict, and a failure as a failure', () => {
    expect(out).toMatch(/B: nothing fits/);
    expect(out).toMatch(/A: no answer \(failed\)/);
  });
});

describe('the marks and the reveal', () => {
  const marked = renderPicks(runs, { described: 10, collection: 55 }).replace('- [ ] James Taylor', '- [y] James Taylor').replace('- [ ] Carpenters', '- [n] Carpenters');

  it('reads each box as fits, does not, or unmarked', () => {
    const marks = parseMarks(marked);
    expect(marks.get('something calm|A|r1')).toBe('y');
    expect(marks.get('something calm|A|r2')).toBe('n');
    expect(marks.get('loud and fast|B|r3')).toBeUndefined();
  });

  it('reveals each pick’s reason beside the mark, which effort each run was, its time, and a summary per effort', () => {
    const out = renderReveal(runs, parseMarks(marked), { described: 10, collection: 55 });
    expect(out).toContain('- [y] James Taylor — Sweet Baby James: Voice and guitar, close and unhurried.');
    expect(out).toMatch(/A, at low, 1840ms/);
    expect(out).toMatch(/B, at medium, 4120ms: nothing fits/);
    expect(out).toMatch(/low: 1 of 2 marked picks fit; times 1500, 1840ms/);
    expect(out).toMatch(/medium: 0 of 0 marked picks fit; times 3900, 4120ms/);
    expect(out).toMatch(/among the 10 described records, not the collection’s 55/);
  });
});
