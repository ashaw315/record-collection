import { describe, expect, it } from 'vitest';
import type { OwnershipMatch } from '@/lib/db/queries/ownership';
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

const exact: OwnershipMatch = {
  tier: 'exact',
  recordId: 'r1',
  ownedPressing: { catalogNumber: 'CLAY LP 3', countryPressed: 'UK', yearPressed: 1982 },
  wantList: null,
};

const differentPressing: OwnershipMatch = {
  tier: 'different-pressing',
  recordId: 'r2',
  ownedPressing: { catalogNumber: 'CLAY LP 3', countryPressed: 'UK', yearPressed: 1989 },
  wantList: null,
};

const wanted: OwnershipMatch = {
  tier: 'wanted',
  recordId: null,
  ownedPressing: null,
  wantList: { id: 'w1', priority: 1, isTargetPressing: false },
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
    const badge = ownershipBadge({
      ...wanted,
      wantList: { id: 'w1', priority: 1, isTargetPressing: true },
    })!;

    expect(badge.label).toMatch(/THIS pressing/);
  });

  it('distinguishes the target-pressing case from the plain one', () => {
    const plain = ownershipBadge(wanted)!;
    const target = ownershipBadge({
      ...wanted,
      wantList: { id: 'w1', priority: 1, isTargetPressing: true },
    })!;

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
      tier: 'none',
      recordId: null,
      ownedPressing: null,
      wantList: null,
    });

    expect(badge).toBeNull();
  });
});

describe('describeOwnedPressing', () => {
  it('orders the fields as a collector reads them', () => {
    expect(
      describeOwnedPressing({ yearPressed: 1982, countryPressed: 'UK', catalogNumber: 'CLAY LP 3' }),
    ).toBe('1982 · UK · CLAY LP 3');
  });

  it('omits fields that are absent rather than leaving gaps', () => {
    expect(
      describeOwnedPressing({ yearPressed: null, countryPressed: 'UK', catalogNumber: null }),
    ).toBe('UK');
  });

  it('says the pressing is not recorded when nothing identifies it', () => {
    expect(
      describeOwnedPressing({ yearPressed: null, countryPressed: null, catalogNumber: null }),
    ).toBe('pressing not recorded');
  });

  it('does not put a thousands separator in the year', () => {
    // 1,982 is not a year. Same trap as the want-list summary.
    expect(
      describeOwnedPressing({ yearPressed: 1982, countryPressed: null, catalogNumber: null }),
    ).toBe('1982');
  });
});
