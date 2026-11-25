'use client';

import { openSheet } from '@/app/ask/sheet-store';
import { NAV_TYPE } from '@/components/nav-type';

/**
 * **§24 and §67: the record's own way into the correcting sheet (Q90, 24 Nov).** First of the record's verbs, before Edit,
 * so the one irreversible act stays last. No answer opened it, so it carries no reason and no claims: the sheet opens
 * with no sentence open and nothing at its head but Close. "Matched text" is provisional (§24's Provisionals line).
 */
export function MatchedTextVerb({ recordId }: { recordId: string }) {
  return (
    <button
      type="button"
      data-control="matched-text"
      onClick={() => openSheet({ recordId, reason: null, claims: [] })}
      className={`${NAV_TYPE} cursor-pointer border-0 bg-transparent p-0 text-foreground hover:underline`}
    >
      Matched text
    </button>
  );
}
