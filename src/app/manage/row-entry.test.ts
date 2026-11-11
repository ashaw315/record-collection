import { describe, expect, it } from 'vitest';
import { landing, rowEntry } from './row-entry';

/**
 * **§T.6, the row's entry reopens it (Design, 11 Nov; step 177).** "The row’s entry names the row it opened, and landing
 * on it opens that row with its saved values." The entry is read by the list that lands on it, and by the screen when the
 * row is another section's. Each case here fails against one branch of `landing`.
 */
const rows = [{ id: 'a' }, { id: 'b' }];

describe('rowEntry: the entry names the row it opened', () => {
  it('carries the row and its section', () => {
    expect(rowEntry('a', 'stores')).toEqual({ manageRow: 'a', manageSection: 'stores' });
  });
});

describe('landing: what an entry asks of the list that lands on it', () => {
  it('a state that is not a row’s entry lands nowhere: null, the menu’s, a bare object', () => {
    expect(landing(null, 'stores', rows)).toEqual({ kind: 'none' });
    expect(landing({ appMenu: true }, 'stores', rows)).toEqual({ kind: 'none' });
    expect(landing({}, 'stores', rows)).toEqual({ kind: 'none' });
  });

  it('this section’s row, present in the list: open it', () => {
    expect(landing({ manageRow: 'b', manageSection: 'stores' }, 'stores', rows)).toEqual({ kind: 'open', id: 'b' });
  });

  it('this section’s row, no longer in the list: replace the entry and stay closed', () => {
    expect(landing({ manageRow: 'gone', manageSection: 'stores' }, 'stores', rows)).toEqual({ kind: 'replace' });
  });

  it('another section’s row: the screen changes section first, and that list lands', () => {
    expect(landing({ manageRow: 'a', manageSection: 'tags' }, 'stores', rows)).toEqual({ kind: 'elsewhere', section: 'tags' });
  });

  it('an entry from before the section was stored is read as this section’s', () => {
    expect(landing({ manageRow: 'a' }, 'stores', rows)).toEqual({ kind: 'open', id: 'a' });
  });
});
