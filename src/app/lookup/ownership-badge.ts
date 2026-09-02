import type { OwnershipPayload } from '@/lib/discogs/ownership-payload';

/**
 * The §7.7 ownership badge, as DATA rather than JSX.
 *
 * Exported this way so the copy and the visual distinction are both testable —
 * the same reasoning as `want-list-format.ts`, and for a higher-stakes rule.
 * §7.7: "the UI must show which tier matched — never a bare yes/no."
 *
 * **The three tiers must be distinguishable at a glance on a phone, in a
 * shop.** "You own this pressing" and "You own a different pressing" differ by
 * one word; someone scanning a screen while holding a record reads the shape
 * and the colour before the sentence, and two badges differing only in text is
 * how the wrong one gets read. So tone, weight and label all differ, and a test
 * asserts they do.
 *
 * Takes the §5.7 WIRE shape rather than the internal match: the wire shape is
 * what the UI receives, and an earlier version of this module took the
 * internal one and had no caller — the component had quietly grown a second
 * copy of the copy. One definition, the shape that is actually rendered.
 */

export type BadgeTone = 'owned' | 'caution' | 'wanted';

export type OwnershipBadge = {
  /** Short label, read first. */
  label: string;
  /** The detail §7.7 requires for tier 2 — which pressing is owned. */
  detail: string | null;
  tone: BadgeTone;
};

/**
 * §7.7 requires the year, country and catalog of the pressing owned. Without
 * it the badge reports that a copy exists somewhere and leaves the actual
 * question — is the one in my hand better than the one at home? —
 * unanswerable in the only place it gets asked.
 */
export function describeOwnedPressing(
  pressing: { year: number | null; country: string | null; catalogNumber: string | null } | null,
): string {
  if (pressing === null) {
    // Honest about what is not known. A record can be logged before its
    // pressing is identified (§10's quick entry), and inventing a description
    // would be worse than admitting the gap.
    return 'pressing not recorded';
  }

  const parts = [
    // String(), not toLocaleString(): 1,982 is not a year.
    pressing.year === null ? null : String(pressing.year),
    pressing.country,
    pressing.catalogNumber,
  ].filter((part): part is string => part !== null && part.trim() !== '');

  return parts.length === 0 ? 'pressing not recorded' : parts.join(' · ');
}

export function ownershipBadge(ownership: OwnershipPayload): OwnershipBadge | null {
  switch (ownership.tier) {
    case 'owned_exact':
      return { label: 'You own this pressing', detail: null, tone: 'owned' };

    case 'owned_different_pressing':
      /**
       * **THE SIXTH MARK: owned elsewhere AND the pressing being hunted.**
       *
       * The strongest buy signal the app can produce — the user owns a copy,
       * and this exact pressing is the upgrade they have been looking for. It
       * was unreachable until the want list was carried through every tier
       * (see `ownership.ts`), so this branch had nothing to render and the
       * signal was silently dropped at the moment it mattered most.
       *
       * Tone stays `wanted` rather than `caution`: caution means "look
       * closely, you may already have this", and that is the wrong instruction
       * for a record the user has explicitly decided they want. The label
       * carries both facts because both are needed — owning a different copy
       * is what makes this an upgrade rather than a first purchase.
       */
      if (ownership.isTargetPressing) {
        return {
          label: 'Want list — THIS pressing · you own another',
          detail: `Yours: ${describeOwnedPressing(ownership.ownedPressing)}`,
          tone: 'wanted',
        };
      }

      /**
       * The tier §7.7 singles out, and the one that must never be mistaken for
       * the one above. A DIFFERENT tone, not merely different words — this is
       * the badge that means "look closely", where the exact badge means
       * "stop".
       */
      return {
        label: 'You own a DIFFERENT pressing',
        detail: `Yours: ${describeOwnedPressing(ownership.ownedPressing)}`,
        tone: 'caution',
      };

    case 'wanted':
      /**
       * §7.7: "Badge shows priority and, if `target_pressing_id` is set,
       * whether this result IS that target pressing." The difference between
       * "you wanted this album" and "this is the pressing you were hunting" is
       * the difference between thinking about it and buying it.
       */
      return {
        label: ownership.isTargetPressing ? 'Want list — THIS pressing' : 'On your want list',
        detail: ownership.wantedPriority === null ? null : `Priority ${ownership.wantedPriority}`,
        tone: 'wanted',
      };

    // §7.7: "No match: no badge." Not a badge reading "not owned" — silence is
    // the honest answer, and a screen of "not owned" badges is noise that makes
    // the real ones harder to see.
    case null:
      return null;
  }
}
