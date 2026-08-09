import { describe, expect, it } from 'vitest';
import type { OwnershipMatch } from '@/lib/db/queries/ownership';
import { toOwnershipPayload } from './ownership-payload';

/**
 * SPEC.md §5.7's wire shape for ownership, which is deliberately NOT the
 * internal one:
 *
 *   tier:  "owned_exact" | "owned_different_pressing" | "wanted" | null
 *   ownedPressing: { year, country, catalogNumber }
 *
 * The query layer uses `exact` / `different-pressing` and the pressing's own
 * column names. Mapping rather than renaming the internal type: the wire shape
 * is a contract §5.7 documents, the internal one mirrors the schema, and
 * collapsing them would mean a column rename silently changing the API.
 */

const owned: OwnershipMatch = {
  tier: 'exact',
  recordId: 'r1',
  ownedPressing: { catalogNumber: 'CLAY LP 3', countryPressed: 'UK', yearPressed: 1982 },
  wantList: null,
};

const different: OwnershipMatch = {
  tier: 'different-pressing',
  recordId: 'r2',
  ownedPressing: { catalogNumber: 'CLAY LP 3', countryPressed: 'UK', yearPressed: 1989 },
  wantList: null,
};

describe('the §5.7 tier names', () => {
  it('maps the exact tier to owned_exact', () => {
    expect(toOwnershipPayload(owned).tier).toBe('owned_exact');
  });

  it('maps the different-pressing tier to owned_different_pressing', () => {
    expect(toOwnershipPayload(different).tier).toBe('owned_different_pressing');
  });

  it('maps the want-list tier to wanted', () => {
    expect(
      toOwnershipPayload({
        tier: 'wanted',
        recordId: null,
        ownedPressing: null,
        wantList: { id: 'w1', priority: 2, isTargetPressing: false },
      }).tier,
    ).toBe('wanted');
  });

  it('maps no match to a NULL tier, not to a string', () => {
    // §5.7 types this as `| null`. The string "none" would be truthy on the
    // client and render a badge for every unowned result.
    expect(
      toOwnershipPayload({ tier: 'none', recordId: null, ownedPressing: null, wantList: null })
        .tier,
    ).toBeNull();
  });

  it('never emits an internal tier name on the wire', () => {
    // The tell that the mapping was skipped: `different-pressing` reaching a
    // client that switches on `owned_different_pressing` renders NO badge —
    // silently, on the tier §7.7 exists to protect.
    const tiers = [owned, different].map((match) => toOwnershipPayload(match).tier);

    expect(tiers).not.toContain('exact');
    expect(tiers).not.toContain('different-pressing');
  });
});

describe('ownedPressing', () => {
  it('renames the pressing columns to the §5.7 field names', () => {
    expect(toOwnershipPayload(different).ownedPressing).toEqual({
      year: 1989,
      country: 'UK',
      catalogNumber: 'CLAY LP 3',
    });
  });

  it('is present on owned_different_pressing, which is where the question is', () => {
    // §5.7: "ownedPressing is present on owned_different_pressing and names the
    // year, country and catalog number of the copy already owned."
    expect(toOwnershipPayload(different).ownedPressing).not.toBeNull();
  });

  it('is null when the owned record has no pressing recorded', () => {
    /**
     * §5.7 calls this "the common result of §10's quick in-store entry". The
     * payload says null and the BADGE says so in words — the detail is not
     * silently dropped, it is reported as unknown.
     */
    const payload = toOwnershipPayload({ ...different, ownedPressing: null });

    expect(payload.tier).toBe('owned_different_pressing');
    expect(payload.ownedPressing).toBeNull();
  });

  it('is null for a want-list match, which owns nothing', () => {
    const payload = toOwnershipPayload({
      tier: 'wanted',
      recordId: null,
      ownedPressing: null,
      wantList: { id: 'w1', priority: 1, isTargetPressing: true },
    });

    expect(payload.ownedPressing).toBeNull();
  });
});

describe('wantedPriority', () => {
  it('carries the priority for a want-list match', () => {
    expect(
      toOwnershipPayload({
        tier: 'wanted',
        recordId: null,
        ownedPressing: null,
        wantList: { id: 'w1', priority: 3, isTargetPressing: false },
      }).wantedPriority,
    ).toBe(3);
  });

  it('is null when nothing is wanted', () => {
    expect(toOwnershipPayload(owned).wantedPriority).toBeNull();
  });

  it('reports whether this result is the target pressing', () => {
    // §7.7 requires it, and it is the difference between "you wanted this
    // album" and "this is the pressing you were hunting".
    expect(
      toOwnershipPayload({
        tier: 'wanted',
        recordId: null,
        ownedPressing: null,
        wantList: { id: 'w1', priority: 1, isTargetPressing: true },
      }).isTargetPressing,
    ).toBe(true);
  });
});

describe('what does NOT travel', () => {
  it('does not leak internal record or want-list ids', () => {
    /**
     * The payload answers "do I own this?", not "which row says so". A record
     * id on a Discogs result invites the client to link straight to it, which
     * is a different feature nobody specified — and §5.7's shape does not list
     * one.
     */
    const payload = toOwnershipPayload(owned) as Record<string, unknown>;

    expect(payload).not.toHaveProperty('recordId');
    expect(payload).not.toHaveProperty('wantList');
  });
});
