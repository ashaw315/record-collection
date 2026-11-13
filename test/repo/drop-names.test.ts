import { describe, expect, it } from 'vitest';
import { misnamed, newestAdded } from '../../scripts/drop-names.mjs';

/**
 * **A misnamed change file fails the intake on its name alone (the coordinator, 13 Nov).** The landed list reads the
 * name and nothing else, so a change file without " - for Code to <verb>" applied and was never recorded: staged in a
 * clone on 13 Nov, a prose-only file so named passed the intake, INTAKE OK, 0 recorded. "P4 watch and P6 count line
 * 13 Nov" failed only because it also deleted a step.
 */
describe('misnamed', () => {
  it('names a Markdown file new in the drop that is no change file, note or standing document', () => {
    expect(misnamed(['P4 watch and P6 count line 13 Nov.md'])).toEqual(['P4 watch and P6 count line 13 Nov.md']);
  });

  it('passes change files with any verb, with or without .md, FOR CODE notes, the standing documents and cards', () => {
    expect(misnamed([
      'P2 paragraph split - for Code to apply.md',
      'Provisionals - for Code to insert',
      'DESIGN-RULES - for Code to add.md',
      'FOR CODE - zoom is not a navigation.md',
      'HANDOFF-wall-and-pull.md', 'DESIGN-RULES.md', 'WITHDRAWALS.md',
      'Mood Pick - build target.dc.html',
    ])).toEqual([]);
  });
});

describe('newestAdded', () => {
  const refs = 'refs/drops/2026-11-13-03\nrefs/drops/2026-11-13-04\nrefs/drops/2026-11-12-06\n';
  const trees: Record<string, string> = {
    'refs/drops/2026-11-13-03': 'docs/design/A - for Code to apply.md\ndocs/design/WITHDRAWALS.md\n',
    'refs/drops/2026-11-13-04': 'docs/design/A - for Code to apply.md\ndocs/design/WITHDRAWALS.md\ndocs/design/B.md\n',
  };
  const git = (...args: string[]) => (args[0] === 'for-each-ref' ? refs : trees[args[args.length - 2]] ?? '');

  it('lists the names in the newest drop ref, by name, that the one before it did not hold', () => {
    expect(newestAdded(git)).toEqual({ ref: 'refs/drops/2026-11-13-04', added: ['B.md'] });
  });

  it('is empty where the checkout holds no drop refs, as CI\'s does', () => {
    expect(newestAdded(() => '')).toEqual({ ref: null, added: [] });
  });
});
