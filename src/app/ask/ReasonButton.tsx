'use client';

import { openSheet } from './sheet-store';

/**
 * **§67: the sheet opens from an answer's reason, over the ask, in every host (24 Nov).** The reason's own words, pressable;
 * drawn above the cell's whole-cell link, whose `::after` covers the cell, so a press on the reason opens the sheet and a
 * press anywhere else still goes to the record. The claims the reason rests on travel with it, so the sheet opens on the
 * sentence named.
 */
export function ReasonButton({ recordId, reason, claims }: { recordId: string; reason: string; claims: readonly string[] }) {
  return (
    <button
      type="button"
      data-open-sheet=""
      onClick={() => openSheet({ recordId, reason, claims })}
      className="relative z-[1] cursor-pointer border-0 bg-transparent p-0 text-left [font:inherit] text-inherit underline-offset-4 hover:underline"
    >
      {reason}
    </button>
  );
}
