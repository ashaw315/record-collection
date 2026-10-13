import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { misplacedEntries } from '../../scripts/withdrawals.mjs';

/**
 * **An entry sits under its own target's heading** (the coordinator, 13 Oct).
 * `WITHDRAWALS.md` groups its bullets under "The wall", "The nav", "The
 * modal" and "The table and grid", and its own text says the headings are
 * for people: the index reads the bullets and nothing reads which heading
 * a bullet sits under. It had drifted: ten entries under the table and
 * grid's heading belong elsewhere, seven `W.24/*`, one `W.29/*`, one
 * `G.3/*`, and the day's two ring entries, `W.33/*` and `M.6/*`. An id's
 * prefix decides its heading: `W.` the wall, `G.` the nav, `M.` the modal,
 * `T.` the table and grid, and a numeric id the main list at the top.
 *
 * Fails against the index as it was, which read no heading.
 */
describe('misplacedEntries', () => {
  it('names an entry under another target’s heading, with the heading it belongs under', () => {
    const text = [
      '# Withdrawals',
      '',
      '- **`28/one`**: §28, withdrawn by §33. One.',
      '- **`W.24/stray`**: §W.24, withdrawn by §W.24. Stray.',
      '',
      '## The wall',
      '',
      '- **`W.30/fine`**: §W.30, withdrawn by §W.33. Fine.',
      '- **`2.1/stray`**: §2.1, withdrawn by §28. Stray.',
      '',
      '## The table and grid',
      '',
      '- **`T.6/fine`**: §T.6, withdrawn by §T.6. Fine.',
      '- **`M.6/stray`**: §M.6, withdrawn by §T.6. Stray.',
      '',
    ].join('\n');
    expect(misplacedEntries(text)).toEqual([
      { id: 'W.24/stray', line: 4, under: '# Withdrawals', belongs: '## The wall' },
      { id: '2.1/stray', line: 9, under: '## The wall', belongs: '# Withdrawals' },
      { id: 'M.6/stray', line: 14, under: '## The table and grid', belongs: '## The modal' },
    ]);
  });

  it('names nothing in a file whose every entry is under its own heading', () => {
    const text = ['# Withdrawals', '', '- **`28/one`**: §28, withdrawn by §33. One.', '', '## The nav', '', '- **`G.3/one`**: §G.3, withdrawn by §G.3. One.', ''].join('\n');
    expect(misplacedEntries(text)).toEqual([]);
  });
});

describe('against this repository’s own history', () => {
  /* The file as the 14:31 drop brought it (`b371ca5`, raw): the regression material, which does not move when the live file is repaired. */
  it('names the ten entries under the table and grid’s heading that belong elsewhere, as the file stood at b371ca5', () => {
    const text = execFileSync('git', ['show', 'b371ca5:docs/design/WITHDRAWALS.md'], { encoding: 'utf8' });
    const found = misplacedEntries(text);
    expect(found.map((entry) => entry.id)).toEqual([
      'G.3/header-screen-measure',
      'W.24/search-less-20',
      'W.24/narrow-far-view',
      'W.24/three-view-names',
      'W.24/shelf-pin-390',
      'W.24/band-far-view-reason',
      'W.29/route-opens-far',
      'W.24/shelf-every-pointer',
      'W.33/ring-shelf-only',
      'M.6/ring-this-file',
    ]);
    expect(new Set(found.map((entry) => entry.under)), 'all ten under the one heading').toEqual(new Set(['## The table and grid']));
  });
});
