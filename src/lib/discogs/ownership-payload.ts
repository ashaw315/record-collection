import type { OwnershipMatch } from '@/lib/db/queries/ownership';

/**
 * The §7.7 match, in SPEC.md §5.7's wire shape.
 *
 * The names differ from the internal ones deliberately, and this module is the
 * one place that knows both. The query layer's `exact` / `different-pressing`
 * and the pressing table's own column names mirror the SCHEMA; §5.7's
 * `owned_exact` / `owned_different_pressing` and `{ year, country,
 * catalogNumber }` are the CONTRACT. Collapsing the two would make a column
 * rename silently change the API.
 *
 * The mapping is small enough to look like ceremony, which is why the tests
 * assert the specific failure it prevents: an internal tier name reaching a
 * client that switches on the §5.7 names renders NO badge at all — silently,
 * and on the tier §7.7 exists to protect.
 */

export type OwnershipPayload = {
  tier: 'owned_exact' | 'owned_different_pressing' | 'wanted' | null;
  ownedPressing: { year: number | null; country: string | null; catalogNumber: string | null } | null;
  wantedPriority: number | null;
  /** §7.7: whether this result IS the pressing being hunted. */
  isTargetPressing: boolean;
};

const TIERS = {
  exact: 'owned_exact',
  'different-pressing': 'owned_different_pressing',
  wanted: 'wanted',
  // §5.7 types the tier as `| null`. A string here would be truthy on the
  // client and put a badge on every unowned result — noise that makes the real
  // ones harder to see, which §7.7 forbids in as many words.
  none: null,
} as const;

export function toOwnershipPayload(match: OwnershipMatch): OwnershipPayload {
  return {
    tier: TIERS[match.tier],
    /**
     * Present on `owned_different_pressing`, where the question is whether the
     * copy in hand beats the one at home. Null when the owned record has no
     * pressing recorded — §5.7 calls that "the common result of §10's quick
     * in-store entry", and the badge reports it in words rather than rendering
     * an empty detail.
     */
    ownedPressing:
      match.ownedPressing === null
        ? null
        : {
            year: match.ownedPressing.yearPressed,
            country: match.ownedPressing.countryPressed,
            catalogNumber: match.ownedPressing.catalogNumber,
          },
    wantedPriority: match.wantList?.priority ?? null,
    isTargetPressing: match.wantList?.isTargetPressing ?? false,
  };
}
