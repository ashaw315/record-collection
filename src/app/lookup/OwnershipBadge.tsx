import { cn } from '@/lib/utils';
import type { OwnershipPayload } from '@/lib/discogs/ownership-payload';
import { ownershipBadge } from './ownership-badge';

/**
 * The §7.7 badge, rendered.
 *
 * The copy and the tone come from `ownership-badge.ts`, which is tested as
 * data; this file is ONLY how they look. An earlier version restated the copy
 * here — two definitions of the most consequential text in the app, which is
 * the create-schema failure exactly. §7.7: "the UI must show which tier
 * matched — never a bare yes/no."
 *
 * **The tones are chosen to be distinguishable at arm's length on a phone**,
 * because that is the reading situation: someone holding a record in one hand,
 * glancing at a screen in the other, in a shop. Two badges that differ only in
 * wording get read wrong there — and reading "you own this pressing" when it
 * says "you own a DIFFERENT pressing" is the mistake that makes them put back
 * a record they wanted.
 */

const TONE_STYLES = {
  /**
   * Solid and quiet. This badge means "stop, you have it" — it does not need
   * to shout, and it should not compete with the caution tone.
   */
  owned: 'bg-muted text-foreground border-border',
  /**
   * The loudest thing on the card, deliberately. This is the tier §7.7 singles
   * out: the user owns the album but NOT this pressing, so the badge has to
   * survive being glanced at and say "look closer" rather than "move on".
   */
  caution: 'bg-primary text-primary-foreground border-primary font-semibold',
  /** Outlined rather than filled — a want is a plan, not a fact about the shelf. */
  wanted: 'bg-background text-foreground border-foreground border-dashed',
} as const;

export function OwnershipBadge({
  ownership,
  className,
}: {
  ownership: OwnershipPayload;
  className?: string;
}) {
  const badge = ownershipBadge(ownership);

  // §7.7: "No match: no badge." Not a badge reading "not owned" — a screen of
  // those is noise that makes the three real ones harder to see.
  if (badge === null) return null;

  return (
    <div
      data-testid="ownership-badge"
      data-tier={ownership.tier}
      className={cn(
        'inline-flex flex-col gap-0.5 rounded-xs border px-2 py-1 text-xs',
        TONE_STYLES[badge.tone],
        className,
      )}
    >
      <span className="whitespace-nowrap">{badge.label}</span>
      {badge.detail !== null && (
        <span data-testid="ownership-detail" className="font-mono text-[0.7rem] opacity-90">
          {badge.detail}
        </span>
      )}
    </div>
  );
}
