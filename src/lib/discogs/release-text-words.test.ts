import { describe, expect, it } from 'vitest';
import { releaseTextWords } from './release-text-words';

/**
 * The words a release-text row is read in (§65 and §T.3, step 172). §T.3 rules
 * that a record which matched by its tracklist or credits carries a line saying
 * what matched, "the track by its position and title, or the credit by its name
 * and role"; §65 rules that the record page's TRACKLIST section uses those same
 * words for each line, "so a match reads the same in the result and on the
 * page", with the companies "by theirs". One function, so the two cannot drift:
 * the wording is Code's proposal and provisional until captured.
 *
 * Fails against: a track written title first; a credit written without its
 * role; a track credit losing its position; a missing detail printed as a
 * dangling separator or "null"; Discogs' disambiguating "(2)" left on a name.
 */
describe('releaseTextWords: one line per row, in the words §T.3 and §65 share', () => {
  it('reads a track by its position, then its title', () => {
    expect(releaseTextWords({ kind: 'track', text: 'The Blood Runs Red', detail: 'A1' })).toBe('A1 · The Blood Runs Red');
  });

  it('reads a credit by its name, then its role, and a track’s credit with the track’s position after the role', () => {
    expect(releaseTextWords({ kind: 'credit', text: 'BilBo', detail: 'Lacquer Cut By' })).toBe('BilBo · Lacquer Cut By');
    expect(releaseTextWords({ kind: 'credit', text: 'Cal', detail: 'Vocals, A1' })).toBe('Cal · Vocals, A1');
  });

  it('reads a company by its name, then its role, as a credit is read', () => {
    expect(releaseTextWords({ kind: 'company', text: 'Orlake Records Ltd.', detail: 'Pressed By' })).toBe('Orlake Records Ltd. · Pressed By');
  });

  it('with no detail, reads the name or title alone', () => {
    expect(releaseTextWords({ kind: 'track', text: 'Untitled', detail: null })).toBe('Untitled');
    expect(releaseTextWords({ kind: 'credit', text: 'Cal', detail: null })).toBe('Cal');
  });

  it('drops the number Discogs appends to tell two names apart from a credit’s or a company’s name, and not from a title', () => {
    expect(releaseTextWords({ kind: 'credit', text: 'Mike Stone (2)', detail: 'Producer' })).toBe('Mike Stone · Producer');
    expect(releaseTextWords({ kind: 'company', text: 'EMI (12)', detail: 'Distributed By' })).toBe('EMI · Distributed By');
    expect(releaseTextWords({ kind: 'track', text: 'Movement (2)', detail: 'B2' })).toBe('B2 · Movement (2)');
  });
});
