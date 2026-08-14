import { describe, expect, it } from 'vitest';
import { pickDisambiguated, type ArtistSearchHit } from './search-artist';

/**
 * SPEC.md §4.3 — finding the MusicBrainz artist for a local row.
 *
 * Hand-entered artists have no MBID, so a lineup walk must search by NAME — the
 * one thing §4.3 says cannot identify an artist. The result is auto-accepted
 * only when it is *disambiguating*: top hit scores 100 and the next scores below
 * 90. A gap, not a high absolute.
 *
 * **The threshold is a guess and the tests say so.** Fitted to two observed
 * cases — Hot Tuna 100 against 78, Carpenters 100 against 66 — with no negative
 * case where the right answer is known. These tests pin the RULE, not the
 * numbers' correctness.
 */

const hit = (name: string, score: number, extra: Partial<ArtistSearchHit> = {}): ArtistSearchHit => ({
  mbid: `mb-${name.toLowerCase().replaceAll(' ', '-')}`,
  name,
  score,
  type: 'Group',
  country: 'US',
  disambiguation: null,
  ...extra,
});

describe('auto-accepting a disambiguating result', () => {
  it('accepts Hot Tuna: 100 against 78', () => {
    // Measured live, 2026-08-14. 5,725 total results, and still unambiguous.
    const chosen = pickDisambiguated([
      hit('Hot Tuna', 100),
      hit('Acoustic Hot Tuna', 78),
      hit('Red Hot Chili Peppers', 47),
    ]);

    expect(chosen?.name).toBe('Hot Tuna');
  });

  it('accepts Carpenters: 100 against 66', () => {
    const chosen = pickDisambiguated([
      hit('Carpenters', 100),
      hit('Cat Carpenters', 66),
      hit('Carpenters Once More', 59, { disambiguation: 'Carpenters tribute' }),
    ]);

    expect(chosen?.name).toBe('Carpenters');
  });

  it('accepts a lone result', () => {
    expect(pickDisambiguated([hit('Discharge', 100)])?.name).toBe('Discharge');
  });
});

describe('refusing to choose — the case the rule exists for', () => {
  it('does NOT choose between two artists both scoring 100', () => {
    /**
     * **The load-bearing test.** MusicBrainz carries two distinct UK groups
     * called Discharge, and both score 100 on a name search. Auto-accepting the
     * top hit here would attach thirty-one members to whichever band the API
     * happened to list first — §4.3's silent wrong merge, through a new door.
     */
    const chosen = pickDisambiguated([
      hit('Discharge', 100, { country: 'GB', disambiguation: 'UK hardcore punk/d-beat band' }),
      hit('Discharge', 100, { country: 'GB', disambiguation: 'UK punk band, one release' }),
    ]);

    expect(chosen, 'the user has to decide').toBeNull();
  });

  it('refuses when the runner-up is exactly at the boundary', () => {
    // 90 is not "below 90". The one value that distinguishes `<` from `<=`.
    expect(pickDisambiguated([hit('A', 100), hit('B', 90)])).toBeNull();
  });

  it('accepts when the runner-up is just under it', () => {
    expect(pickDisambiguated([hit('A', 100), hit('B', 89)])?.name).toBe('A');
  });

  it('refuses when the top hit is short of a perfect score', () => {
    /**
     * A gap is not sufficient on its own: 95 against 20 is a wide gap and still
     * an imperfect name match, which is the case where the artist may simply
     * not be in MusicBrainz under that name.
     */
    expect(pickDisambiguated([hit('A', 95), hit('B', 20)])).toBeNull();
  });

  it('refuses an empty result set rather than inventing a match', () => {
    expect(pickDisambiguated([])).toBeNull();
  });
});

describe('the rule is a GAP, not a high absolute', () => {
  it('two perfect scores refuse while one perfect and one high accepts', () => {
    /**
     * The discriminating pair, and the reason the rule is not "top hit must
     * score 100". Both sets have a 100; only the gap tells them apart.
     */
    const ambiguous = pickDisambiguated([hit('A', 100), hit('B', 100)]);
    const clear = pickDisambiguated([hit('A', 100), hit('B', 89)]);

    expect(ambiguous).toBeNull();
    expect(clear).not.toBeNull();
  });

  it('is unaffected by a long tail of weak matches', () => {
    /**
     * "Hot Tuna" returns 5,725 results. Only the two best scores decide, so the
     * tail is irrelevant however long it is.
     *
     * **This test originally asserted the opposite and was wrong.** It listed
     * `[100, 50, 100]` expecting the second 100 to be ignored as "third in the
     * array" — but the rule ranks by SCORE, so those are the top two and it
     * correctly refuses. The code was right; the test encoded a rule that would
     * have let a same-scoring artist through whenever the payload happened to
     * list a weak match between them.
     */
    const chosen = pickDisambiguated([
      hit('Hot Tuna', 100),
      hit('Acoustic Hot Tuna', 78),
      hit('Red Hot Chili Peppers', 47),
      hit('Hot Chocolate', 45),
      hit('Hot Snakes', 30),
    ]);

    expect(chosen?.name).toBe('Hot Tuna');
  });

  it('reads the ORDER from scores rather than trusting the array', () => {
    /**
     * MusicBrainz returns results score-descending, but relying on that makes
     * the rule depend on someone else's ordering guarantee. An out-of-order
     * payload must still be judged on its two best scores.
     */
    /**
     * **The weak match sits BETWEEN the two perfect scores**, which is what
     * makes this discriminating. With `[100, 100, 10]` the top two are already
     * adjacent, so sorted and unsorted agree and a mutation removing the sort
     * passed. Here an unsorted rule reads the runner-up as 10 and wrongly
     * accepts.
     */
    const chosen = pickDisambiguated([hit('B', 100), hit('C', 10), hit('A', 100)]);

    expect(chosen, 'two 100s, whatever order they arrive in').toBeNull();
  });
});
