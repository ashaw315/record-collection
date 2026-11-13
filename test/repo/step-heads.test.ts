import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { absent, GONE, headsNamed, RECORD, staleGone } from '../../scripts/step-heads.mjs';

/**
 * **A step a change file names is a step the handoff holds (the coordinator, 13 Nov).** Six of Design's unnumbered
 * steps were removed by Code's own commits, 177 to 182, and the twins test could not see it: a step that is gone is
 * neither discharged nor unbuilt. Twice it surfaced only when a later change file anchored on the missing step.
 * `scripts/step-heads.mjs` records, from the drop refs, the heads every landed change file inserts or anchors on; this
 * holds that committed record to the handoff on every commit, where the refs may be absent and the record is not.
 *
 * Fails against a Done line that replaces its step, against a step applied and replaced in one commit (the case the
 * 12 Nov sweep missed, since the step never stood in the tree), and against an excuse for a head the handoff holds.
 */
const HANDOFF = 'docs/design/HANDOFF-wall-and-pull.md';
type Entry = { file: string; heads: { head: string; how: string }[] };
type Gone = { head: string; by: string; how: string; line: string };

const STEP = [
  '- **Unnumbered, for Code to number — §P.6: the not-configured message, reworded.** Draw "Not set up yet.".',
  '  > Where asking cannot reach its provider, the slot says so.',
].join('\n');
const DONE = '181. **Done: built.** **§P.6 — the not-configured message, reworded: Code\'s number for that unnumbered step.**';

describe('headsNamed reads the steps a change file names', () => {
  it('takes the heads it inserts and the heads it anchors on, without the closing period', () => {
    const text = `## Change 1\n\n${STEP}\n\n## Change 2\n\nIn the step headed "§P.4, §P.5 and §P.6: what the ask field's captures found.", replace the bullet.\nIn the step headed "Unnumbered, for Code to number — §65: the tracklist and the credits." add a line.`;
    expect(headsNamed(text)).toEqual([
      { head: '§P.6: the not-configured message, reworded', how: 'inserts' },
      { head: "§P.4, §P.5 and §P.6: what the ask field's captures found", how: 'anchors' },
      { head: '§65: the tracklist and the credits', how: 'anchors' },
    ]);
  });
});

describe('absent names a recorded head the handoff does not hold', () => {
  const record: Entry[] = [{ file: 'Markers split and slot reworded', heads: [{ head: '§P.6: the not-configured message, reworded', how: 'inserts' }] }];

  it('passes the step standing under its Done line', () => {
    expect(absent(record, `${DONE}\n\n${STEP}\n\nNo step: §G.7.\n`, [])).toEqual([]);
  });

  it('fails the Done line standing where the step was, which the twins test passes', () => {
    expect(absent(record, `${DONE}\n\nNo step: §G.7.\n`, [])).toEqual([{ head: '§P.6: the not-configured message, reworded', files: ['Markers split and slot reworded'] }]);
  });

  it('excuses a head a Design file removed, and calls the excuse stale once the head is back', () => {
    const gone: Gone[] = [{ head: '§P.6: the not-configured message, reworded', by: 'X', how: 'deleted', line: 'Delete the step' }];
    expect(absent(record, `${DONE}\n`, gone)).toEqual([]);
    expect(staleGone(`${DONE}\n\n${STEP}\n`, gone)).toEqual(['§P.6: the not-configured message, reworded']);
  });
});

describe('the committed record against the handoff', () => {
  const record: Entry[] = JSON.parse(readFileSync(RECORD, 'utf8'));
  const gone: Gone[] = JSON.parse(readFileSync(GONE, 'utf8'));
  const handoff = readFileSync(HANDOFF, 'utf8');

  it('holds every head a landed change file names, or a Design file removed it', () => {
    expect(record.length, 'the record is not empty').toBeGreaterThan(30);
    expect(absent(record, handoff, gone)).toEqual([]);
  });

  it('excuses no head the handoff holds', () => {
    expect(staleGone(handoff, gone)).toEqual([]);
  });
});
