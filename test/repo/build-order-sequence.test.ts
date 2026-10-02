import { describe, expect, it } from 'vitest';
import { doneStepsAbsent, isDone, parseSteps, stepSequence } from '../../scripts/build-order.mjs';

/**
 * **Design's exports replace the handoff wholesale, so a step inserted
 * between two exports vanishes without a trace.** Step 71 was lost that way
 * twice in two days: the export carried an italic placeholder where the
 * numbered, done-marked step had been, and the order ran 70 then 72.
 *
 * Assertion 3 compared each step's number with its position, which fails on
 * such a tree but names the wrong step: `gap-at 72`, then `gap-at 73`, when
 * the absent number is 71. Nothing named a duplicate as a duplicate, and
 * nothing said that the step which vanished had been marked done. These
 * functions do each of those, and `check-index.mjs` reports from them.
 */

const order = (...lines: string[]) => lines.join('\n');

describe('parseSteps: a step is a line matching `^\\d+\\. `, and nothing else', () => {
  /* Fails against the STEP regex in parseSteps: a placeholder or a quote line read as a step would give four entries. */
  it('reads the number and the text, and skips the placeholder and quote lines between steps', () => {
    const steps = parseSteps(
      order(
        '70. **§60 — the disc.** Size it.',
        '   > The Images quarter-disc is sized against a stated reference.',
        '',
        "*Step 71, the tile's Delete control, is Code's and arrives with its drop.*",
        '',
        '72. **§61 — the newest cover.** Display it.',
      ),
    );
    expect(steps.map((s) => s.n)).toEqual([70, 72]);
    expect(steps[0].text).toBe('**§60 — the disc.** Size it.');
    expect(steps[1].text).toBe('**§61 — the newest cover.** Display it.');
  });
});

describe('stepSequence: numbers run 0 to N with no gaps and no duplicates', () => {
  /* Fails against the `missing` loop in stepSequence: the position-based check names 3, the step after the gap. */
  it('names the absent number, not the step that follows it', () => {
    const steps = parseSteps(order('0. a', '1. b', '3. d'));
    expect(stepSequence(steps)).toEqual({ last: 3, missing: [2], duplicates: [] });
  });

  /* Fails against the `missing` loop's lower bound: an order starting at 1 is missing 0. */
  it('starts at 0', () => {
    expect(stepSequence(parseSteps(order('1. b', '2. c'))).missing).toEqual([0]);
  });

  /* Fails against the `duplicates` count in stepSequence: by position alone, 0,1,1,2 reads as two gaps. */
  it('names a duplicated number as a duplicate, with nothing missing', () => {
    const steps = parseSteps(order('0. a', '1. b', '1. b again', '2. c'));
    expect(stepSequence(steps)).toEqual({ last: 2, missing: [], duplicates: [1] });
  });

  /* Fails against both loops at once: a lost step and a doubled step in one order are two findings, not one. */
  it('reports a gap and a duplicate in the same order separately', () => {
    const steps = parseSteps(order('0. a', '2. c', '2. c again'));
    expect(stepSequence(steps)).toEqual({ last: 2, missing: [1], duplicates: [2] });
  });

  /* Fails against the empty case: `last` must be null, not -1 or 0, so the script can fail `3 empty` rather than pass a vacuous set. */
  it('reports an empty order as having no last step', () => {
    expect(stepSequence([])).toEqual({ last: null, missing: [], duplicates: [] });
  });
});

describe('isDone: the handoff marks a finished step with a bold Done or Built prefix', () => {
  /* Fails against the DONE regex in isDone. */
  it('recognises both prefixes and no other bold opening', () => {
    expect(isDone('**Done: built and deployed at 8b98e11.** **The tile’s Delete control.**')).toBe(true);
    expect(isDone('**Built. The field’s floor and ceiling are provisional in §49.**')).toBe(true);
    expect(isDone('**§61 — the newest cover.** Display it.')).toBe(false);
    expect(isDone('**Superseded by step 51 — do not build.** **§41 — the band.**')).toBe(false);
  });
});

describe('doneStepsAbsent: a step the committed order marked done must still be numbered in the tree', () => {
  const committed = parseSteps(
    order(
      '63. **Done: answered by Code’s table.** **Per-record counts.**',
      '70. **§60 — the disc.** Size it.',
      '71. **Done: built and deployed at 8b98e11.** **The tile’s Delete control — report, then fix.**',
    ),
  );

  /* Fails against the filter in doneStepsAbsent: without the `isDone` test every absent step would be returned, and without the number lookup none would. */
  it('returns the done step whose number the tree lacks, with its text, and not the done step it keeps', () => {
    const tree = parseSteps(order('63. **Done: answered by Code’s table.** **Per-record counts.**', '70. **§60 — the disc.** Size it.', '72. **§61.** Display it.'));
    expect(doneStepsAbsent(committed, tree)).toEqual([
      { n: 71, text: '**Done: built and deployed at 8b98e11.** **The tile’s Delete control — report, then fix.**' },
    ]);
  });

  /* Fails against the `isDone` filter: an unmarked absent step is the sequence check's finding, not this one's. */
  it('leaves an absent step that was not marked done to the sequence check', () => {
    const tree = parseSteps(order('63. **Done: answered by Code’s table.** **Per-record counts.**', '71. **Done: built and deployed at 8b98e11.** **The tile’s Delete control — report, then fix.**'));
    expect(doneStepsAbsent(committed, tree)).toEqual([]);
  });

  /* Fails against the number lookup: matching by text would flag a done step whose wording Design edited. */
  it('matches by number, so a done step whose text Design reworded is not reported', () => {
    const tree = parseSteps(order('63. **Done: answered before this step was written; §55 withdrew from it.** **Per-record counts.**', '70. a', '71. **Done: built and deployed at 8b98e11.** **The tile’s Delete control.**'));
    expect(doneStepsAbsent(committed, tree)).toEqual([]);
  });
});
