import { describe, expect, it } from 'vitest';
import { pickDisambiguated, type ArtistSearchHit } from './search-artist';

/**
 * SPEC.md §4.3 — finding the MusicBrainz artist for a local row.
 *
 * Hand-entered artists have no MBID, so a lineup walk must search by NAME — the
 * one thing §4.3 says cannot identify an artist. **The result is auto-accepted
 * only when no other result carries the same name.**
 *
 * **An earlier version of this used a score gap and was wrong**, which these
 * tests exist partly to prevent someone re-proposing. MusicBrainz ranks by how
 * well documented an artist is, so among four groups called Discharge the
 * famous d-beat band scores 100 and the others 83, 82, 82 (measured
 * 2026-08-14). A gap rule auto-accepts exactly the case it was written to
 * catch, and stays silent precisely where names are ambiguous.
 *
 * The name is what failed, so the name is what the rule keys on.
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

describe('auto-accepting a uniquely-named result', () => {
  it('accepts Hot Tuna: the runners-up are DIFFERENTLY named', () => {
    // Measured live. 5,725 results, and nothing else is called "Hot Tuna".
    const chosen = pickDisambiguated([
      hit('Hot Tuna', 100),
      hit('Acoustic Hot Tuna', 78),
      hit('Red Hot Chili Peppers', 47),
    ]);

    expect(chosen?.name).toBe('Hot Tuna');
  });

  it('accepts Carpenters, whose near-misses are all different names', () => {
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

  it('ignores a low score when the name is unique', () => {
    /**
     * The score is not the signal. A weak match on a unique name is still the
     * only artist by that name — and if MusicBrainz has the wrong artist, that
     * is a data problem no threshold here can detect.
     */
    expect(pickDisambiguated([hit('Obscure Band', 62)])?.name).toBe('Obscure Band');
  });
});

describe('refusing when the name is shared — the case the rule exists for', () => {
  it('does NOT choose between four artists called Discharge', () => {
    /**
     * **The load-bearing test, and the one the old rule got wrong.** Measured
     * live: a plain "Discharge" query returns four artists of that exact name
     * at 100, 83, 82 and 82. A score-gap rule accepts the first — the famous
     * band — and never asks. The names are identical; only a human can say
     * which one is meant.
     */
    const chosen = pickDisambiguated([
      hit('Discharge', 100, { disambiguation: 'UK hardcore punk/d-beat band' }),
      hit('Discharge', 83, { disambiguation: 'UK punk band, only one release' }),
      hit('Discharge', 82, { disambiguation: 'has song "Process"' }),
      hit('Discharge', 82, { disambiguation: 'Dutch band Discharge' }),
    ]);

    expect(chosen, 'the user has to decide').toBeNull();
  });

  it('finds a shared name that is NOT the runner-up', () => {
    /**
     * **The discriminating fixture.** With the duplicates adjacent, checking
     * only the runner-up gives the same answer as checking every hit — a
     * mutation doing exactly that passed. Here a differently-named artist
     * outscores the second Discharge, so a runner-up-only rule auto-accepts a
     * name with two claimants.
     *
     * Real shape: "Discharge" returns four same-named artists interleaved with
     * "Amphetamine Discharge" and "Triple Discharge".
     */
    const chosen = pickDisambiguated([
      hit('Discharge', 100),
      hit('Amphetamine Discharge', 76),
      hit('Discharge', 62),
    ]);

    expect(chosen, 'the third hit shares the name').toBeNull();
  });

  it('refuses on a shared name even when the gap is enormous', () => {
    /**
     * The discriminating case against the OLD rule, stated directly: 100
     * against 20 is the widest possible gap and still two artists with one
     * name.
     */
    expect(pickDisambiguated([hit('Discharge', 100), hit('Discharge', 20)])).toBeNull();
  });

  it('compares names case- and whitespace-insensitively', () => {
    /**
     * "discharge" and "Discharge " are the same name to a reader, and a rule
     * that missed them would auto-accept exactly the collision it exists to
     * catch. Whitespace especially — MusicBrainz names are user-submitted.
     */
    expect(pickDisambiguated([hit('Discharge', 100), hit('discharge', 40)])).toBeNull();
    expect(pickDisambiguated([hit('Discharge', 100), hit('Discharge ', 40)])).toBeNull();
  });

  it('refuses an empty result set rather than inventing a match', () => {
    expect(pickDisambiguated([])).toBeNull();
  });
});

describe('the rule is NAME identity, not score', () => {
  it('a shared name refuses while a unique name accepts, at identical scores', () => {
    /**
     * The pair that isolates the rule. Both sets score 100 and 83; only the
     * names differ, and only the names decide.
     */
    const shared = pickDisambiguated([hit('Discharge', 100), hit('Discharge', 83)]);
    const unique = pickDisambiguated([hit('Hot Tuna', 100), hit('Acoustic Hot Tuna', 83)]);

    expect(shared, 'same name, cannot choose').toBeNull();
    expect(unique?.name, 'different names, unambiguous').toBe('Hot Tuna');
  });

  it('picks the best-scoring hit when the name is unique but unsorted', () => {
    /**
     * MusicBrainz returns results score-descending, but relying on that makes
     * the rule depend on someone else's ordering guarantee. The weak match sits
     * BETWEEN the two so an unsorted implementation picks the wrong one.
     */
    const chosen = pickDisambiguated([hit('B', 40), hit('C', 10), hit('A', 100)]);

    expect(chosen?.name).toBe('A');
  });
});
