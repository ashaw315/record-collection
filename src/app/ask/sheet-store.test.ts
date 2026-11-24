import { describe, expect, it } from 'vitest';
import { closeSheet, onSheetSaved, openSheet, sheetSaved, sheetState } from './sheet-store';

/**
 * **§67's sheet, opened from any host (step 3, the sheet's second commit, 24 Nov).** One sheet for the page, mounted at
 * the root; a reason in any host opens it with its record, its reason and the claims the reason rests on; a save tells
 * whoever listens, so the shelf's control can discard its queue as §67 has it. Fails against a store that keeps the last
 * sheet after a close, one that opens without the claims, and a save that reaches no listener.
 */
describe('the sheet store', () => {
  it('opens with the record, the reason and the claims, and closes to nothing', () => {
    openSheet({ recordId: 'r1', reason: 'Slow and warm.', claims: ['Side two is quieter.'] });
    expect(sheetState()).toEqual({ recordId: 'r1', reason: 'Slow and warm.', claims: ['Side two is quieter.'] });
    closeSheet();
    expect(sheetState()).toBeNull();
  });

  it('tells every listener of a save, with the record saved, and stops telling one that has left', () => {
    const heard: string[] = [];
    const stop = onSheetSaved((id) => heard.push(id));
    sheetSaved('r1');
    stop();
    sheetSaved('r2');
    expect(heard).toEqual(['r1']);
  });
});
