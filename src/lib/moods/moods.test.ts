import { describe, expect, it } from 'vitest';
import { MOODS } from './moods';

/**
 * SPEC.md §7.12 (A76): the eight moods, fixed in code. Pinned to the literal
 * because `e2e/ring-144.spec.ts` derives the rail's expected Tab stops from
 * this list (§P.5: "the control draws whatever that list holds, in its
 * order"; §P.6: the stops are fixed by the list and not by the tags), so a
 * change to the list must be a deliberate change here, seen by a failing
 * pin, and never a silent move of the walk's contract. A renamed mood edits
 * this test with the list, and re-runs the tagging script (§7.12).
 */
describe('MOODS', () => {
  it('is the eight of §7.12, in this order', () => {
    expect(MOODS).toEqual(['sleepy', 'jacked up', 'dancing', 'zone out', 'smooth', 'loud and dirty', 'showing off', 'sunny']);
  });
});
