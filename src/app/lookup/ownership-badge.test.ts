import { describe, expect, it } from 'vitest';
import type { OwnershipPayload } from '@/lib/discogs/ownership-payload';
import { describeOwnedPressing, ownershipBadge } from './ownership-badge';

/**
 * SPEC.md §7.7's badge: "the UI must show which tier matched — never a bare
 * yes/no."
 *
 * Tested as data rather than through the rendered screen, for the same reason
 * `want-list-format.ts` is: the copy IS the feature here. A well-meaning edit
 * making the two ownership labels read alike would pass every rendering test in
 * the suite while making the app confidently misleading in the one place it
 * costs money.
 */

const exact: OwnershipPayload = {
  tier: 'owned_exact',
  ownedPressing: { year: 1982, country: 'UK', catalogNumber: 'CLAY LP 3' },
  wantedPriority: null,
  isTargetPressing: false,
};

const differentPressing: OwnershipPayload = {
  tier: 'owned_different_pressing',
  ownedPressing: { year: 1989, country: 'UK', catalogNumber: 'CLAY LP 3' },
  wantedPriority: null,
  isTargetPressing: false,
};

const wanted: OwnershipPayload = {
  tier: 'wanted',
  ownedPressing: null,
  wantedPriority: 1,
  isTargetPressing: false,
};

describe('the three tiers are distinguishable at a glance', () => {
  /**
   * THE requirement this module exists for. Someone scanning a phone in a shop
   * reads shape and colour before they read a sentence, so two badges differing
   * only in wording is how the wrong one gets read.
   */
  it('gives each tier a different TONE, not just different words', () => {
    const tones = [exact, differentPressing, wanted].map((match) => ownershipBadge(match)?.tone);

    expect(new Set(tones).size, 'three tiers, three tones').toBe(3);
  });

  it('does not let the two ownership labels differ by only one word', () => {
    /**
     * "You own this pressing" versus "You own a different pressing" is a
     * one-word difference in a sentence someone is not reading carefully. The
     * labels must diverge in a way that survives being glanced at.
     */
    const owned = ownershipBadge(exact)!;
    const other = ownershipBadge(differentPressing)!;

    expect(owned.tone).not.toBe(other.tone);
    expect(other.label, 'the difference is emphasised, not buried').toMatch(/DIFFERENT/);
  });

  it('never labels a different pressing as owning this one', () => {
    // The specific misreading §7.7 forbids: the tier-2 label must not be a
    // prefix or substring of the tier-1 label.
    const owned = ownershipBadge(exact)!;
    const other = ownershipBadge(differentPressing)!;

    expect(other.label).not.toBe(owned.label);
    expect(owned.label.startsWith(other.label)).toBe(false);
  });
});

describe('tier 1 — you own this pressing', () => {
  it('says so plainly', () => {
    expect(ownershipBadge(exact)?.label).toBe('You own this pressing');
  });

  it('needs no further detail — the pressing IS the one on screen', () => {
    expect(ownershipBadge(exact)?.detail).toBeNull();
  });
});

describe('tier 2 — you own a different pressing', () => {
  it('names which pressing is owned, per §7.7', () => {
    /**
     * §7.7 requires "the year/country/catalog of the one owned". This is the
     * whole decision: is the copy in my hand better than the one at home?
     */
    const badge = ownershipBadge(differentPressing)!;

    expect(badge.detail).toContain('1989');
    expect(badge.detail).toContain('UK');
    expect(badge.detail).toContain('CLAY LP 3');
  });

  it('marks the detail as YOURS, so it is not read as the result on screen', () => {
    // A bare "1989 · UK · CLAY LP 3" next to a search result invites reading it
    // as a property of the result rather than of the copy at home.
    expect(ownershipBadge(differentPressing)?.detail).toMatch(/^Yours:/);
  });

  it('admits when the owned pressing is unknown rather than inventing one', () => {
    /**
     * The likeliest real case: §10's quick in-store entry creates records
     * without pressings, so a user who logged a record fast owns an album with
     * no pressing recorded. "Pressing not recorded" is honest; a blank detail
     * would read as though the badge had nothing to say.
     */
    const badge = ownershipBadge({ ...differentPressing, ownedPressing: null })!;

    expect(badge.detail).toBe('Yours: pressing not recorded');
  });
});

describe('tier 3 — on the want list', () => {
  it('shows the priority, per §7.7', () => {
    expect(ownershipBadge(wanted)?.detail).toContain('1');
  });

  it('says when this result IS the pressing being hunted', () => {
    // §7.7: the difference between "you wanted this album" and "this is the
    // exact pressing you were hunting" is the difference between thinking
    // about it and buying it.
    const badge = ownershipBadge({ ...wanted, isTargetPressing: true })!;

    expect(badge.label).toMatch(/THIS pressing/);
  });

  it('distinguishes the target-pressing case from the plain one', () => {
    const plain = ownershipBadge(wanted)!;
    const target = ownershipBadge({ ...wanted, isTargetPressing: true })!;

    expect(plain.label).not.toBe(target.label);
  });
});

describe('no match', () => {
  it('shows NO badge rather than one reading "not owned"', () => {
    /**
     * §7.7: "No match: no badge." A screen of "not owned" badges is noise that
     * makes the three real ones harder to see — and in a shop the badge is
     * meant to catch the eye precisely because it is unusual.
     */
    const badge = ownershipBadge({
      tier: null,
      ownedPressing: null,
      wantedPriority: null,
      isTargetPressing: false,
    });

    expect(badge).toBeNull();
  });
});

describe('describeOwnedPressing', () => {
  it('orders the fields as a collector reads them', () => {
    expect(
      describeOwnedPressing({ year: 1982, country: 'UK', catalogNumber: 'CLAY LP 3' }),
    ).toBe('1982 · UK · CLAY LP 3');
  });

  it('omits fields that are absent rather than leaving gaps', () => {
    expect(
      describeOwnedPressing({ year: null, country: 'UK', catalogNumber: null }),
    ).toBe('UK');
  });

  it('says the pressing is not recorded when nothing identifies it', () => {
    expect(
      describeOwnedPressing({ year: null, country: null, catalogNumber: null }),
    ).toBe('pressing not recorded');
  });

  it('does not put a thousands separator in the year', () => {
    // 1,982 is not a year. Same trap as the want-list summary.
    expect(
      describeOwnedPressing({ year: 1982, country: null, catalogNumber: null }),
    ).toBe('1982');
  });
});

/**
 * **The sixth mark.**
 *
 * Five marks shipped before this: no badge, own-this, own-different, wanted,
 * wanted-this-pressing. That count was accurate for the mapper and wrong for
 * the app — the query could reach a sixth state the mapper had no branch for,
 * and the mapper could not have been fixed alone because the state never
 * arrived. See `test/integration/ownership-six-states.test.ts`.
 */
describe('owning a copy AND hunting this pressing is its own mark', () => {
  const OWNED = { year: 1982, country: 'UK', catalogNumber: 'CLAY LP 3' };

  /** Fails against the five-branch mapper, which rendered the tier-2 caution badge. */
  it('does not render the same badge as an ordinary different-pressing match', () => {
    const upgrade = ownershipBadge({
      tier: 'owned_different_pressing',
      ownedPressing: OWNED,
      wantedPriority: 1,
      isTargetPressing: true,
    });
    const ordinary = ownershipBadge({
      tier: 'owned_different_pressing',
      ownedPressing: OWNED,
      wantedPriority: null,
      isTargetPressing: false,
    });

    expect(upgrade?.label).not.toBe(ordinary?.label);
  });

  /**
   * **Both facts, because either alone misleads.** "You own a different
   * pressing" reads as a reason to put it down; "want list — this pressing"
   * omits that they already have a copy, which is what makes this an upgrade
   * rather than a first buy.
   */
  it('says both that it is wanted and that another copy is owned', () => {
    const badge = ownershipBadge({
      tier: 'owned_different_pressing',
      ownedPressing: OWNED,
      wantedPriority: 1,
      isTargetPressing: true,
    });

    expect(badge?.label).toMatch(/want list/i);
    expect(badge?.label).toMatch(/own/i);
    expect(badge?.detail, 'and still names the copy at home').toContain('CLAY LP 3');
  });

  /**
   * **Tone is `wanted`, not `caution`.** Caution means "look closely, you may
   * already have this" — the wrong instruction for a record the user has
   * explicitly decided they want.
   */
  it('uses the wanted tone rather than the caution tone', () => {
    const badge = ownershipBadge({
      tier: 'owned_different_pressing',
      ownedPressing: OWNED,
      wantedPriority: 1,
      isTargetPressing: true,
    });

    expect(badge?.tone).toBe('wanted');
  });

  /** The tier-2 badge is unchanged when no want entry rode along. */
  it('leaves an ordinary different-pressing match on the caution tone', () => {
    const badge = ownershipBadge({
      tier: 'owned_different_pressing',
      ownedPressing: OWNED,
      wantedPriority: null,
      isTargetPressing: false,
    });

    expect(badge?.tone).toBe('caution');
    expect(badge?.label).toBe('You own a DIFFERENT pressing');
  });
});
