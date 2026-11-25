/**
 * **§67's sheet, opened from any host (24 Nov).** One sheet for the page, mounted at the root (CorrectingSheetHost); a
 * reason in any host, the grid's cell, the band's, the far view's column or the shelf's panel, opens it with the record,
 * the reason and the claims the reason rests on. A save is told to whoever listens: the shelf's control discards its
 * queue, as §67 has it, since a queued record was chosen on the text before the correction. A plain store rather than a
 * context, because the hosts sit in separate trees on one page.
 */
/* reason is null where no answer opened the sheet: from the record page's verb (§67, 24 Nov). */
export type SheetRequest = { recordId: string; reason: string | null; claims: readonly string[] };

let current: SheetRequest | null = null;
const watchers = new Set<() => void>();
const saved = new Set<(recordId: string) => void>();

export const sheetState = (): SheetRequest | null => current;

export function subscribeSheet(watch: () => void): () => void {
  watchers.add(watch);
  return () => watchers.delete(watch);
}

export function openSheet(request: SheetRequest): void {
  current = request;
  for (const w of watchers) w();
}

export function closeSheet(): void {
  current = null;
  for (const w of watchers) w();
}

export function onSheetSaved(hear: (recordId: string) => void): () => void {
  saved.add(hear);
  return () => saved.delete(hear);
}

export function sheetSaved(recordId: string): void {
  for (const h of saved) h(recordId);
}
