import { cn } from '@/lib/utils';
import type { OwnershipPayload } from '@/lib/discogs/ownership-payload';
import { ownershipBadge, TONE_STYLES } from './ownership-badge';

/**
 * The §7.7 badge, rendered.
 *
 * The copy, the tone AND the classes each tone renders as all come from
 * `ownership-badge.ts`, which is tested as data; this file is ONLY the markup
 * they go into. An earlier version restated the copy here — two definitions of
 * the most consequential text in the app, which is the create-schema failure
 * exactly. §7.7: "the UI must show which tier matched — never a bare yes/no."
 *
 * **`TONE_STYLES` moved out rather than staying local**, so the classes are
 * assertable without a component test — see the note on it there. While it
 * lived here, the only test of the three tiers' appearance compared tone NAMES,
 * which cannot fail if every tone maps to the same class string.
 */

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
        'inline-flex flex-col gap-0.5 rounded-xs border px-2 py-1 text-label',
        TONE_STYLES[badge.tone],
        className,
      )}
    >
      <span className="whitespace-nowrap">{badge.label}</span>
      {badge.detail !== null && (
        <span data-testid="ownership-detail" className="font-mono text-meta opacity-90">
          {badge.detail}
        </span>
      )}
    </div>
  );
}
