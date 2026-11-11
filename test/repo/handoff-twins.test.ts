import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { discharged, numberedNotBuilt, standing, stateErrors, STATES, stepsOf } from '../../scripts/handoff-twins.mjs';

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


/*
  Numbered is not built (the coordinator, 6 Nov). A block that discharges a head is Code's numbered line, and until
  6 Nov every such line was a Done line, so "discharged" and "built" were one bucket. Then §W.8 was numbered 170 on
  the coordinator's word with nothing measured, its unbuilt entry removed, and the twins counted it among the
  discharged: the backlog, the figure Adam and the coordinator steer by, undercounted by one, and the fact lived
  only in prose no test reads, the lapsed-deferral shape inside the instrument built to stop it. So a numbered line
  without "Done" is its own bucket, numbered and not built, printed by head beside the listed unbuilt.
*/
describe('numbered is not built: a numbered line without Done is its own bucket', () => {
  const done = { id: 'step-9', before: '- **Unnumbered, for Code to number — §Z: a thing.**', why: '', text: '9. **Done: built.** **§Z — a thing: Code’s number for that step.** Built.', discharges: [{ head: '§Z: a thing', clause: '' }] };
  const partly = { ...done, id: 'step-10', text: '10. **Done: built in part; the rest is owed.** **§Y — another: Code’s number for that step.**', discharges: [{ head: '§Y: another', clause: '' }] };
  const numbered = { ...done, id: 'step-11', text: '11. **§X — a third: Code’s number for that step.** Not built. Owed after the next unit.', discharges: [{ head: '§X: a third', clause: '' }] };

  it('reads a Done line, whole or in part, as built, and a numbered line without Done as not built', () => {
    expect(numberedNotBuilt([done, partly, numbered])).toEqual(new Map([['§X: a third', 'step-11']]));
  });

  /*
    One step discharged by two blocks (the coordinator, 7 Nov): §65 is one unnumbered instruction built as 172 (the
    words and the data) and 173 (the section). The step is built only when both are; a Done 172 beside a numbered 173
    is the §W.8 defect if the Done line decides. Nothing in the check knows a step needs two blocks; this holds only
    that an unfinished block is never outweighed by a finished one. Fails against a check where the last block decides.
  */
  it('reads a step discharged by a Done block and a numbered block, in either order, as numbered and not built', () => {
    const first = { ...done, id: 'step-12', discharges: [{ head: '§W: two halves', clause: '' }] };
    const second = { ...numbered, id: 'step-13', discharges: [{ head: '§W: two halves', clause: '' }] };
    expect(numberedNotBuilt([first, second]).get('§W: two halves')).toBe('step-13');
    expect(numberedNotBuilt([second, first]).get('§W: two halves')).toBe('step-13');
  });

  /* A snapshot of the handoff, moved when a step moves: 173 read Done in part on 10 Nov (173b), its states carrying what 173c still owes. */
  it('on the handoff as it stands, names steps 170 and 171 as numbered and not built, so the backlog is the listed unbuilt plus them; §65 no longer among them since 173 is Done in part beside 172, nor §T.6’s exits since 174 is Done in part (11 Nov)', () => {
    const blocks = JSON.parse(readFileSync('scripts/handoff-code-region.json', 'utf8'));
    const unbuilt = JSON.parse(readFileSync('scripts/handoff-unbuilt.json', 'utf8')) as { head: string }[];
    const numberedOnly = numberedNotBuilt(blocks);
    expect([...numberedOnly.values()].sort()).toEqual(['step-170', 'step-171']);
    expect(numberedOnly.get('§65: the tracklist and the credits'), 'both blocks that discharge §65 read Done, 173 in part, so it is not in this bucket').toBeUndefined();
    for (const head of numberedOnly.keys()) expect(unbuilt.some((u) => u.head === head), `${head} is numbered, so it is not also listed`).toBe(false);
  });

  it('prints the three buckets, with each numbered-and-not-built step by head, and exits 0 on the tree', () => {
    const out = spawnSync('node', ['scripts/handoff-twins.mjs'], { encoding: 'utf8' });
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/^unnumbered steps \d+: built \d+, numbered and not built 2, listed as unbuilt \d+, in neither 0$/m);
    expect(out.stdout).toMatch(/^  numbered §W\.8: the bound at a candidate  — not built \(step-170\)$/m);
    expect(out.stdout).toMatch(/^  numbered §43: which frame is first paint  — not built \(step-171\)$/m);
    expect(out.stdout, '§65 left the not-built bucket with 173b').not.toMatch(/^  numbered §65: the tracklist and the credits  — not built/m);
    /* 174 left the bucket on 11 Nov: Done in part beside its block, so its head is no longer printed as not built. */
    expect(out.stdout).not.toMatch(/not built \(step-174\)$/m);
  });
});

/*
  Q53 (the coordinator, 7 Nov): a Done line's head is a claim, not the state. Fifteen steps whose Done lines carried a
  qualifier were rechecked against the code and four moved; the 21 that carried none were counted clean on that alone,
  which is absent read as "nothing owed". So every discharging Done block declares its state in `states`, one or more
  of five names, the clean ones included: a block that omits it is refused, so an omission can never stand for
  "nothing owed". The step's standing is derived from its blocks, and the figure Adam steers by is printed from it.
*/
describe('every discharging Done block declares its state', () => {
  const block = (id: string, text: string, states?: unknown) => ({ id, before: '', why: '', text, discharges: [{ head: `§${id}: a step`, clause: '' }], ...(states === undefined ? {} : { states }) });

  it('names the five states', () => {
    expect(STATES).toEqual(['built, nothing owed', "Code's work unbuilt", 'capture or measurement owed', 'judgement held', 'look provisional']);
  });

  it('refuses a Done block with no states, an empty list, a name outside the five, a name twice, or "built, nothing owed" beside another; accepts more than one state', () => {
    const errors = stateErrors([
      block('a', '1. **Done: built.**'),
      block('b', '2. **Done: built.**', []),
      block('c', '3. **Done: built.**', ['built, mostly']),
      block('d', '4. **Done: built.**', ['judgement held', 'judgement held']),
      block('e', '5. **Done: built.**', ['built, nothing owed', 'judgement held']),
      block('f', '6. **Done: built.**', ["Code's work unbuilt", 'judgement held']),
      block('g', '7. **Done: built.**', ['built, nothing owed']),
      block('h', '8. **§H — numbered: Code’s number for that step.** Not built.'),
      { id: 'i', before: '', why: '', text: '9. **Done: built.**', origin: 'a half of a numbered step, in words long enough' },
    ]);
    expect(errors.map((e) => e.split(':')[0])).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('on the region as it stands, every discharging Done block declares its state', () => {
    expect(stateErrors(blocks())).toEqual([]);
  });
});

describe('the standing: each step by its blocks’ states, and the roll-up', () => {
  const steps = ['§A', '§B', '§C', '§D', '§E', '§F'].map((head) => ({ head, clause: '', line: 0 }));
  const done = (id: string, head: string, states: string[]) => ({ id, before: '', why: '', text: `${id}. **Done: built.**`, discharges: [{ head, clause: '' }], states });
  const blocksOf = [
    done('1', '§A', ['built, nothing owed']),
    done('2', '§B', ['built, nothing owed']),
    done('3', '§B', ['judgement held']),
    done('4', '§C', ["Code's work unbuilt", 'look provisional']),
    done('5', '§D', ['built, nothing owed']),
    { id: '6', before: '', why: '', text: '6. **§D — numbered.** Not built.', discharges: [{ head: '§D', clause: '' }] },
    done('7', '§F', ['capture or measurement owed']),
  ];
  const unbuilt = [{ head: '§E', status: 'not built', evidence: '' }];

  it('counts a step under every state its Done blocks name, "built, nothing owed" only when every block says it, unless numbered or listed; Code has work where any part is Code’s, else waits where anything is owed or held, else is done', () => {
    const s = standing(steps, blocksOf, unbuilt);
    expect(Object.fromEntries(s.byState)).toEqual({ 'built, nothing owed': 1, "Code's work unbuilt": 1, 'capture or measurement owed': 1, 'judgement held': 1, 'look provisional': 1 });
    expect({ numbered: s.numbered, listed: s.listed, codeHasWork: s.codeHasWork, waiting: s.waiting, done: s.done }).toEqual({ numbered: 1, listed: 1, codeHasWork: 3, waiting: 2, done: 1 });
  });

  it('prints the states and the roll-up on the tree, the roll-up summing to the steps', () => {
    const out = spawnSync('node', ['scripts/handoff-twins.mjs'], { encoding: 'utf8' });
    const states = out.stdout.match(/^built steps by state: built, nothing owed (\d+); Code's work unbuilt (\d+); capture or measurement owed (\d+); judgement held (\d+); look provisional (\d+)$/m);
    const roll = out.stdout.match(/^Code has work (\d+), waiting (\d+), done (\d+)$/m);
    const total = out.stdout.match(/^unnumbered steps (\d+):/m);
    expect(states, out.stdout).not.toBeNull();
    expect(roll, out.stdout).not.toBeNull();
    expect(Number(roll?.[1]) + Number(roll?.[2]) + Number(roll?.[3])).toBe(Number(total?.[1]));
  });
});
