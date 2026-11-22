import { describe, expect, it } from 'vitest';
import { mechanicalChecks } from './checks';
import type { ReviewDraft } from './review';

/**
 * **The checks that travel with a draft (Design's question; the coordinator, 22 Nov): the mechanical three and never the
 * drafting model's basis marks.** Fails against a result carrying `basis` or `supported` anywhere, one that misses a
 * self-consistency disagreement, and one whose numbered list counts a sentence whose people-count the credits cover.
 */
const draft = (sentences: string[], extra: Partial<ReviewDraft> = {}): ReviewDraft => ({
  id: '1611cb00-0000-4000-8000-000000000000', artist: 'Smerz', title: 'Believer', year: 2017, about: null, status: 'ok',
  sentences: sentences.map((text, i) => ({ text, basis: i % 2 === 0 ? 'supported' : 'inferred' })), unknown: [], ...extra,
});

describe('mechanicalChecks', () => {
  it('carries the dropped sentences, the self-consistency disagreements and the sentences with a figure to check, by 1-based index', () => {
    const d = draft([
      'The duo perform and engineer everything themselves.',
      'Kasper Marott and Peder Mannerfelt are credited on side two.',
      'A four-piece horn section lifts the closer.',
      'The record opens quietly.',
    ], { dropped: ['A sentence about the material.'], credited: 2 });
    const c = mechanicalChecks(d);
    expect(c.dropped).toEqual(['A sentence about the material.']);
    expect(c.disagreements.length, 'exclusivity beside a credited name').toBeGreaterThan(0);
    expect(c.disagreements[0]).toMatchObject({ a: 1, b: 2 });
    expect(c.numbered, 'four horns against two credited names').toEqual([3]);
  });

  it('is empty for a clean draft, and never carries a basis mark', () => {
    const c = mechanicalChecks(draft(['Slow piano, sparse.', 'Two voices, both credited.'], { credited: 2 }));
    expect(c).toEqual({ dropped: [], disagreements: [], numbered: [] });
    expect(JSON.stringify(c)).not.toMatch(/basis|supported|inferred/);
  });
});
