import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { discharged, stepsOf, type UnnumberedStep } from '../../scripts/handoff-twins.mjs';

/**
 * **Every unnumbered step in the handoff is discharged by a numbered one, or
 * listed as unbuilt (the coordinator, 4 Nov).** Design writes a step as
 * "Unnumbered, for Code to number"; Code numbers it by inserting its own Done
 * line and never edits Design's, so the two stand together and nothing said
 * which numbered line discharged which instruction, or whether the instruction
 * had moved since. On 4 Nov a pairing by subject found 37 unnumbered lines, 16
 * with an evident twin, 21 without, of which about ten could not be told built
 * from unbuilt by reading.
 *
 * The link is in Code's data: each code-region block carries `discharges`,
 * the unnumbered step's head and its clause AS IT STOOD when the work was
 * built. The quote, not a pointer: a pointer still resolves after Design edits
 * the line, and the Done is then read against text that moved; a quote that
 * no longer matches names the step and the drift (as assertions 6 and 13 do).
 * What no block discharges is `scripts/handoff-unbuilt.json`, the one list of
 * ruled work with nothing built against it, which this test keeps exact.
 *
 * Fails against a block with no `discharges`, a head that names no line, a
 * clause that moved, an unnumbered step that is neither discharged nor
 * listed, or one that is both.
 */
const HANDOFF = 'docs/design/HANDOFF-wall-and-pull.md';
const BLOCKS = 'scripts/handoff-code-region.json';
const UNBUILT = 'scripts/handoff-unbuilt.json';

/* `origin` is for a numbered Done whose instruction was not an unnumbered step: a half of a numbered step (121), a ruling or a defect Adam named (135 to 137, 147, 151 to 155). It says so, in words. */
type Block = { id: string; text: string; discharges?: { head: string; clause: string; part?: string }[]; origin?: string };

const handoff = () => readFileSync(HANDOFF, 'utf8');
const blocks = (): Block[] => JSON.parse(readFileSync(BLOCKS, 'utf8'));
const unbuilt = (): { head: string; status: string; evidence: string }[] => JSON.parse(readFileSync(UNBUILT, 'utf8'));

describe('stepsOf reads the unnumbered steps with their clauses', () => {
  it('takes a step as its line and the indented lines beneath it, up to the next top-level line', () => {
    const text = [
      '- **Unnumbered, for Code to number — §W.24: what search reaches.**',
      '  - **Extend** search to the tracklist.',
      '  > Search reaches every field.',
      '- **Unnumbered, for Code to number — §T.3: why a record matched.** Draw one line.',
      '',
      'No step: §G.7. It rules nothing.',
    ].join('\n');
    const steps = stepsOf(text);
    expect(steps.map((s) => s.head)).toEqual(['§W.24: what search reaches', '§T.3: why a record matched']);
    expect(steps[0].clause).toBe(['- **Unnumbered, for Code to number — §W.24: what search reaches.**', '  - **Extend** search to the tracklist.', '  > Search reaches every field.'].join('\n'));
    expect(steps[1].clause).toBe('- **Unnumbered, for Code to number — §T.3: why a record matched.** Draw one line.');
  });

  it('reads the handoff as it stands: 37 unnumbered steps on 4 Nov, every head distinct', () => {
    const steps = stepsOf(handoff());
    expect(steps.length).toBeGreaterThanOrEqual(37);
    expect(new Set(steps.map((s) => s.head)).size).toBe(steps.length);
  });
});

describe('every numbered Done line since step 120 says which unnumbered step it discharges', () => {
  const numbered = blocks().filter((b) => /^1[2-9]\d\. \*\*Done/.test(b.text));

  it('carries a discharges list, with a head and the clause as it stood, or names its origin in words', () => {
    const missing = numbered.filter((b) => (!Array.isArray(b.discharges) || b.discharges.length === 0) && !(typeof b.origin === 'string' && b.origin.length > 20)).map((b) => b.id);
    expect(missing, 'blocks with neither discharges nor an origin').toEqual([]);
    for (const b of numbered) for (const d of b.discharges ?? []) expect(typeof d.head === 'string' && d.head.length > 0 && typeof d.clause === 'string' && d.clause.length > 0, `${b.id}: head and clause`).toBe(true);
  });

  it('names heads the handoff holds, and the clause each names still reads as it stood', () => {
    const steps = stepsOf(handoff());
    const byHead = new Map(steps.map((s) => [s.head, s]));
    const unknown: string[] = []; const moved: string[] = [];
    for (const b of numbered) for (const d of b.discharges ?? []) {
      const step = byHead.get(d.head);
      if (step === undefined) { unknown.push(`${b.id} names "${d.head}"`); continue; }
      if (step.clause !== d.clause) moved.push(`${b.id}: "${d.head}" moved after its Done`);
    }
    expect(unknown, 'heads no unnumbered line carries').toEqual([]);
    expect(moved, 'instructions edited after the step that discharged them').toEqual([]);
  });
});

describe('the unbuilt list is exact: what no block discharges, and nothing else', () => {
  it('every unnumbered step is discharged or listed as unbuilt, and none is both', () => {
    const steps = stepsOf(handoff());
    const done = discharged(blocks());
    const listed = new Set(unbuilt().map((u) => u.head));
    const neither = steps.filter((s) => !done.has(s.head) && !listed.has(s.head)).map((s) => s.head);
    const both = steps.filter((s) => done.has(s.head) && listed.has(s.head)).map((s) => s.head);
    const stale = [...listed].filter((h) => !steps.some((s) => s.head === h));
    expect(neither, 'unnumbered steps neither discharged nor listed as unbuilt').toEqual([]);
    expect(both, 'listed as unbuilt and discharged').toEqual([]);
    expect(stale, 'listed as unbuilt but no longer in the handoff').toEqual([]);
  });

  it('every unbuilt entry says what was checked', () => {
    for (const u of unbuilt()) expect(u.evidence.length, `${u.head}: evidence`).toBeGreaterThan(20);
  });
});

export type { UnnumberedStep };
