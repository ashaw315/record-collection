import { describe, expect, it } from 'vitest';
import { renderReview, type ReviewDraft } from './review';

/**
 * **The matched-text review file, for Adam to mark (step 3, unit 4; the coordinator, 14 Nov).** Each sentence carries
 * whether it rests on the supplied material or on the model's own knowledge, so the inferred are read hardest, where the
 * fame bias sits; what was not known is listed, not filled; the ABOUT is shown as the context it was, not as a source.
 */
const drafts: ReviewDraft[] = [
  {
    id: 'e315c6a7-ac45-4dd3-a5d5-d58eeaa608a2', artist: 'The Doors', title: 'The Doors', year: 1967, about: 'A nightclub set pressed to vinyl.', status: 'finished',
    sentences: [{ text: 'Organ carries the hooks and the bass.', basis: 'supported' }, { text: 'Side two ends long and slow.', basis: 'inferred' }],
    unknown: ['how loud the mix runs'],
  },
  { id: 'dbcf97f0-c4fc-40d6-97cc-214e203ce7fe', artist: 'The Ink Spots (3)', title: 'Greatest', year: 1957, about: null, status: 'failed: cut', sentences: [], unknown: [] },
];

describe('renderReview', () => {
  const out = renderReview(drafts, 'Matched text drafts, 15 Nov');

  it('marks every sentence supported or inferred, and says to read the inferred hardest', () => {
    expect(out).toContain('- [supported] Organ carries the hooks and the bass.');
    expect(out).toContain('- [inferred] Side two ends long and slow.');
    expect(out).toMatch(/inferred.*hardest/i);
  });

  it('lists what was not known, shows the ABOUT as context, and gives the id to mark', () => {
    expect(out).toContain('Not known: how loud the mix runs');
    expect(out).toContain('ABOUT, given as context only: A nightclub set pressed to vinyl.');
    expect(out).toContain('`e315c6a7`');
  });

  it('says a draft that did not finish has none, rather than showing nothing', () => {
    expect(out).toMatch(/The Ink Spots \(3\) — Greatest[\s\S]*No draft: failed: cut/);
  });

  /* The same record drafted at two efforts, shown together, each marked so Adam can name which to store. */
  it('shows a record drafted at two efforts together, each under its effort, with how to store either', () => {
    const two = renderReview([
      { ...drafts[0], effort: 'medium' },
      { ...drafts[0], effort: 'high', sentences: [{ text: 'Organ and bass, the drums swinging.', basis: 'inferred' }] },
    ], 'Compared');
    expect(two.match(/## The Doors — The Doors/g)?.length, 'one heading for the record').toBe(1);
    expect(two).toMatch(/At medium:[\s\S]*Organ carries the hooks[\s\S]*At high:[\s\S]*Organ and bass, the drums swinging\./);
    expect(two).toMatch(/e315c6a7 high/);
  });
});

