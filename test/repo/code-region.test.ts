import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyRegion, readRegion } from '../../scripts/apply-code-region.mjs';

/**
 * **A Design export cannot remove what Code wrote into the handoff (8 Oct).**
 *
 * Design's exports replace `HANDOFF-wall-and-pull.md` wholesale from a
 * source that has never held Code's own lines. Step 71 was restored by
 * hand twenty-eight times, and it was the one line anybody noticed: two
 * sets of maintaining rules written at `87d0e87` and `bae5797` were
 * removed by the next drop and stood nowhere afterwards.
 *
 * So Code's lines live in `scripts/handoff-code-region.json`, which no
 * export touches, and the handoff in the tree is the export with those
 * blocks applied. The last test here is the guard: it reads the tree, and
 * a drop taken without applying the region fails the unit suite.
 */
const HANDOFF = join('docs', 'design', 'HANDOFF-wall-and-pull.md');
const block = { id: 'step-71', before: '72. ', text: '71. **Done.** The tile’s Delete control.' };
const exported = '70. Build the disc.\n\n72. Build the nav.\n\n## Maintaining this file\n';

describe('applyRegion', () => {
  /* Fails against an apply that appends: the step would land after the build order. */
  it('puts a block the export dropped back in front of its anchor, as a paragraph of its own', () => {
    const result = applyRegion(exported, [block]);
    expect(result.text).toBe('70. Build the disc.\n\n71. **Done.** The tile’s Delete control.\n\n72. Build the nav.\n\n## Maintaining this file\n');
    expect(result).toMatchObject({ restored: ['step-71'], present: [], unanchored: [] });
  });

  /* Fails against an apply that inserts without looking: a second run would write the step twice. */
  it('leaves a handoff that already carries the block exactly as it is', () => {
    const once = applyRegion(exported, [block]).text;
    const twice = applyRegion(once, [block]);
    expect(twice.text).toBe(once);
    expect(twice).toMatchObject({ restored: [], present: ['step-71'], unanchored: [] });
  });

  /* Fails against a match on a prefix: an edited step 71 from Design would count as Code's own. */
  it('counts a block present only when its whole line stands', () => {
    const edited = exported.replace('72. ', '71. **Done.** The tile’s Delete control. And more.\n\n72. ');
    expect(applyRegion(edited, [block]).present).toEqual([]);
  });

  /* Fails against an apply that drops a block it cannot place: the loss this exists to stop, made silent again. */
  it('reports a block whose anchor is gone, and does not write it anywhere', () => {
    const result = applyRegion('70. Build the disc.\n', [block]);
    expect(result.unanchored).toEqual(['step-71']);
    expect(result.text).toBe('70. Build the disc.\n');
  });

  it('anchors on a line’s start, not on text inside one', () => {
    const result = applyRegion('70. See step 72. It follows.\n\n72. Build the nav.\n', [block]);
    expect(result.text.indexOf('71. ')).toBeGreaterThan(result.text.indexOf('70. '));
    expect(result.text.indexOf('71. ')).toBeLessThan(result.text.indexOf('\n72. '));
  });
});

describe('Code’s region of the handoff', () => {
  type Block = { id: string; before: string; text: string };
  const region = readRegion() as Block[];

  it('holds step 71, anchored in front of step 72', () => {
    const step = region.find((entry) => entry.id === 'step-71');
    expect(step?.before).toBe('72. ');
    expect(step?.text).toMatch(/^71\. /);
  });

  /* The guard. Fails on a tree whose handoff is a raw export: run `node scripts/apply-code-region.mjs`. */
  it('stands whole in the handoff in the tree', () => {
    const result = applyRegion(readFileSync(HANDOFF, 'utf8'), region);
    expect(region.length).toBeGreaterThan(0);
    expect({ restored: result.restored, unanchored: result.unanchored }, 'blocks missing from the handoff').toEqual({ restored: [], unanchored: [] });
  });
});
