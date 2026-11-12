import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockedOnAdam, blockedOnAdamLine, consistency, parseQueue, queue2Coverage, queue2Line, restatements, summaryLine, waitingOnLanded } from '../../scripts/check-queue.mjs';

/**
 * **`QUEUE.md` has no second record, and its check says so (the coordinator,
 * 5 Nov).** The twins test can pair Design's unnumbered instruction with
 * Code's Done because two independent records exist; a queue file is one
 * record, so a check over it can hold ids unique, statuses valid, closed
 * items resolving against git and rulings against the targets, and nothing
 * more. It cannot notice an item that was never written down, which is the
 * failure the file exists to prevent, and a green over it must not read as
 * proof the list is complete. So these tests cover the CHECK, on fixtures:
 * that it reports what it should and stays quiet where it should. The one
 * claim made on the real file is that it parses and carries the sentence
 * saying what its check cannot do.
 *
 * Fails against: a parser that drops a row or a section; a report that
 * misses a duplicate id, an unknown status, a closed item naming no commit
 * or one git cannot resolve, a ruling naming a section no target holds; a
 * restatement detector that flags a bare section reference, or misses a
 * row carrying an unbuilt step's own words.
 */
const FIXTURE = `# The queue

## Blocked on Adam

| id | status | item | record lives in |
|---|---|---|---|
| Q1 | open | Store the 45 ABOUT notes | the drafts file |
| Q2 | open | The 640px rail captures | nothing |

## In flight

| id | status | item | record lives in |
|---|---|---|---|
| Q9 | open | The four-worker unit | NOTES |
| Q11 | done 194ac24 | Remove rule 3 and its test | NOTES |
| Q12 | ruled §43 | Whether first-painted means the first styled frame | §43 |
`;

describe('parseQueue', () => {
  it('reads every row of every table with its section, id, status, reference, item and record', () => {
    const items = parseQueue(FIXTURE);
    expect(items.map((i) => i.id)).toEqual(['Q1', 'Q2', 'Q9', 'Q11', 'Q12']);
    expect(items[0]).toEqual({ id: 'Q1', status: 'open', ref: null, item: 'Store the 45 ABOUT notes', record: 'the drafts file', section: 'Blocked on Adam', line: 7 });
    expect(items[3]).toMatchObject({ id: 'Q11', status: 'done', ref: '194ac24', section: 'In flight' });
    expect(items[4]).toMatchObject({ id: 'Q12', status: 'ruled', ref: '§43' });
  });

  it('skips header and separator rows, and prose between tables', () => {
    expect(parseQueue('| id | status | item | record |\n|---|---|---|---|\nQ1 is not a row\n')).toEqual([]);
  });
});

describe('consistency', () => {
  const resolves = (sha: string) => sha === '194ac24';
  const targetsText = 'x §43 y §55 z';
  const clean = parseQueue(FIXTURE);

  it('reports nothing on a consistent file', () => {
    expect(consistency(clean, { resolves, targetsText })).toEqual([]);
  });

  it('reports a duplicate id with both lines', () => {
    const items = parseQueue(FIXTURE.replace('| Q2 |', '| Q1 |'));
    expect(consistency(items, { resolves, targetsText })).toContainEqual('duplicate id Q1 at lines 7 and 8');
  });

  it('reports a status outside open, done, dropped, ruled and parked', () => {
    const items = parseQueue(FIXTURE.replace('| Q2 | open |', '| Q2 | maybe |'));
    expect(consistency(items, { resolves, targetsText })).toContainEqual('Q2: status "maybe" is not one of open, done, dropped, ruled, parked (line 8)');
  });

  /*
    **`parked` is a status (the coordinator, 11 Nov): real, and nobody works it.** Before it, Q3 and Q60 wrote PARKED
    inside an open row, so the counts and the blocked-on-Adam line read them as open. Fails against STATUSES without it
    (the row is reported as unknown), and against a summary that folds parked rows into open.
  */
  it('accepts parked as a status, names no commit or section for it, and counts it apart from open', () => {
    const items = parseQueue(FIXTURE.replace('| Q2 | open |', '| Q2 | parked |'));
    expect(consistency(items, { resolves, targetsText })).toEqual([]);
    expect(items[1]).toMatchObject({ id: 'Q2', status: 'parked', ref: null });
    expect(summaryLine(items)).toBe('QUEUE.md: 5 items in 2 sections; open 2, done 1, dropped 0, ruled 1, parked 1');
    expect(blockedOnAdam(items, new Date(2026, 10, 11, 12)).map((r) => r.id), 'a parked row under Blocked on Adam is not waiting on him').toEqual(['Q1']);
    expect(queue2Coverage(items).open, 'nor counted among the open rows queue-2 covers').toBe(2);
  });

  it('reports a done or dropped item naming no commit, and one naming a commit git cannot resolve', () => {
    const none = parseQueue(FIXTURE.replace('| Q11 | done 194ac24 |', '| Q11 | done |'));
    expect(consistency(none, { resolves, targetsText })).toContainEqual('Q11: done names no commit (line 15)');
    const stale = parseQueue(FIXTURE.replace('194ac24', 'abcdef0'));
    expect(consistency(stale, { resolves, targetsText })).toContainEqual('Q11: done names abcdef0, which git does not resolve (line 15)');
  });

  it('reports a ruling naming a section no target holds', () => {
    const items = parseQueue(FIXTURE.replace('| Q12 | ruled §43 |', '| Q12 | ruled §99 |'));
    expect(consistency(items, { resolves, targetsText })).toContainEqual('Q12: ruled §99, which no design target or withdrawal holds (line 16)');
  });

  it('reports a ruled item naming no section', () => {
    const items = parseQueue(FIXTURE.replace('| Q12 | ruled §43 |', '| Q12 | ruled |'));
    expect(consistency(items, { resolves, targetsText })).toContainEqual('Q12: ruled names no section (line 16)');
  });
});

describe('restatements', () => {
  const heads = ['§65: the tracklist and the credits', "ring-144's two cases", '§T.3: why a record matched'];

  it('flags a row carrying an unbuilt step’s own words, after the section prefix, in any case', () => {
    const items = parseQueue('## Q\n\n| id | status | item | record |\n|---|---|---|---|\n| Q18 | open | §65 — one TRACKLIST section: The Tracklist And The Credits | the handoff |\n');
    expect(restatements(items, heads)).toEqual(['Q18 restates "§65: the tracklist and the credits", held by the twins test (line 5)']);
  });

  it('flags a row carrying a head that has no section prefix', () => {
    const items = parseQueue('## Q\n\n| id | status | item | record |\n|---|---|---|---|\n| Q15 | open | ring-144’s two cases, the chip ring and the kept ring | the handoff |\n');
    expect(restatements(items, heads)).toHaveLength(1);
  });

  it('leaves a bare section reference alone: a row that names §65 without its words is a reference, not a copy', () => {
    const items = parseQueue('## Q\n\n| id | status | item | record |\n|---|---|---|---|\n| Q22 | open | The vibe search, after §65 lands | nothing yet |\n');
    expect(restatements(items, heads)).toEqual([]);
  });
});

/*
  queue-2 (the coordinator, 10 Nov): a row waiting on a Design ruling names the ruling, and the check resolves the name
  against the second records that exist for it, the landed list and WITHDRAWALS.md. Q10 and Q28 sat open four days after
  §43's ruling landed in "First paint is styled", and with Q10 open record-band-43:33's failures read as waiting on
  Design: a stale open row gave a live failure a false cause. A row waiting on a ruling that has landed now fails.
*/
describe('waitingOnLanded', () => {
  const landed = { files: new Set(['First paint is styled']), withdrawalIds: new Set(['65/place-by-25']) };
  const rows = (item: string, status = 'open') => parseQueue(`## Q\n\n| id | status | item | record |\n|---|---|---|---|\n| Q10 | ${status} | ${item} | §43 |\n`);

  it('fails an open row waiting on a change file that has landed, naming it', () => {
    expect(waitingOnLanded(rows('Which frame first paint is. **Waits on:** "First paint is styled"'), landed)).toEqual({ landed: ['Q10 waits on "First paint is styled", which has landed (line 5)'], unknown: [] });
  });

  it('fails an open row waiting on a withdrawal id that WITHDRAWALS.md holds', () => {
    expect(waitingOnLanded(rows('The placement. **Waits on:** `65/place-by-25`'), landed).landed).toEqual(['Q10 waits on `65/place-by-25`, which has landed (line 5)']);
  });

  it('passes a row waiting on a ruling not yet landed, and reports a name that resolves to nothing', () => {
    const r = waitingOnLanded(rows('A ruling to come. **Waits on:** "A file not sent yet"'), landed);
    expect(r.landed).toEqual([]);
    expect(r.unknown).toEqual(['Q10 waits on "A file not sent yet", which nothing holds yet (line 5)']);
  });

  it('leaves a closed row and a row that names no ruling alone', () => {
    expect(waitingOnLanded(rows('Closed. **Waits on:** "First paint is styled"', 'ruled §43'), landed)).toEqual({ landed: [], unknown: [] });
    expect(waitingOnLanded(rows('Waits on Design, unnamed'), landed)).toEqual({ landed: [], unknown: [] });
  });
});

/*
  **queue-2 says how much it checked, every run (the coordinator, 10 Nov).** Most open rows carry no **Waits on:**
  name, because most rulings have no title or id until Design sends them, so a correct check applied to about no rows
  and read PASS. The watch's fix applied here: gate-report says NO LOG rather than reading a missing log as clean, and
  this line says NOTHING CHECKED rather than PASS when no open row names its ruling. Not a failure and not clean.
*/
describe('queue-2’s coverage, beside its verdict', () => {
  const table = (...rows: Array<[string, string]>) => parseQueue(`## Q\n\n| id | status | item | record |\n|---|---|---|---|\n${rows.map(([s, item], i) => `| Q${i + 1} | ${s} | ${item} | x |`).join('\n')}\n`);

  it('counts the open rows that name their ruling and the open rows that do not; closed rows are not counted', () => {
    const items = table(['open', 'A. **Waits on:** "Some file"'], ['open', 'B, unnamed'], ['open', 'C, unnamed'], ['ruled §43', 'D. **Waits on:** "First paint is styled"']);
    expect(queue2Coverage(items)).toEqual({ named: 1, open: 3 });
  });

  it('prints NOTHING CHECKED, never PASS, when no open row names its ruling, with the count', () => {
    const line = queue2Line({ landed: [], unknown: [] }, { named: 0, open: 46 });
    expect(line).toBe('NOTHING CHECKED queue-2 no open row waits on a ruling that has landed — 0 of 46 open rows name their ruling, so none was checked');
  });

  it('prints PASS with the count when some are checked and none has landed, and FAIL with it when one has', () => {
    expect(queue2Line({ landed: [], unknown: [] }, { named: 2, open: 46 })).toBe('PASS queue-2 no open row waits on a ruling that has landed — 2 of 46 open rows name their ruling, 44 do not and were not checked');
    expect(queue2Line({ landed: ['x'], unknown: [] }, { named: 2, open: 46 })).toBe('FAIL queue-2 no open row waits on a ruling that has landed (1) — 2 of 46 open rows name their ruling, 44 do not and were not checked');
  });
});

/*
  **Rows blocked on Adam are reported with how long they have waited (the coordinator, 10 Nov).** queue-2 resolves rows
  waiting on Design; nothing covered rows waiting on Adam, where both of the day's stale rows were: Q10 open four days
  after its ruling, and Q2, Q4 and Q5 relayed to him as waiting after he had decided them. A row under "Blocked on Adam"
  carries the date it was put to him, "**Put to Adam:** 6 Nov", and his answer when it comes, "**Answer:** …". The check
  reports, never refuses: every open row there with no answer recorded, and the days it has waited, so a row that has
  sat eleven days is re-read instead of re-relayed.
*/
describe('blockedOnAdam', () => {
  const file = (rows: string, heading = 'Blocked on Adam') => parseQueue(`## ${heading}\n\n| id | status | item | record |\n|---|---|---|---|\n${rows}\n\n## Code's queue\n\n| id | status | item | record |\n|---|---|---|---|\n| Q90 | open | Elsewhere. **Put to Adam:** 1 Nov | x |\n`);
  const today = new Date('2026-11-10T12:00:00-05:00');

  it('lists only the open rows under the Blocked on Adam heading', () => {
    const items = file('| Q1 | open | Store the notes. **Put to Adam:** 6 Nov | x |\n| Q2 | ruled §W.13 | Closed. **Put to Adam:** 6 Nov | x |');
    expect(blockedOnAdam(items, today).map((r) => r.id)).toEqual(['Q1']);
  });

  it('reads the date it was put to him and counts the days waited', () => {
    const [row] = blockedOnAdam(file('| Q1 | open | Store the notes. **Put to Adam:** 6 Nov | x |'), today);
    expect(row).toEqual({ id: 'Q1', putTo: '6 Nov', days: 4, answered: false, line: 5 });
  });

  it('does not list a row whose answer is recorded, and says when no date is', () => {
    const rows = blockedOnAdam(file('| Q5 | open | The look. **Put to Adam:** 6 Nov **Answer:** "sounds god" | x |\n| Q47 | open | Three notes, no date | x |'), today);
    expect(rows).toEqual([{ id: 'Q47', putTo: null, days: null, answered: false, line: 6 }]);
  });

  it('prints a report-only line naming each row and its wait, and says so when none waits', () => {
    expect(blockedOnAdamLine([{ id: 'Q1', putTo: '6 Nov', days: 4, answered: false, line: 5 }, { id: 'Q47', putTo: null, days: null, answered: false, line: 6 }], 3))
      .toBe('report only: 3 open rows blocked on Adam, 2 with no answer recorded: Q1 (put to him 6 Nov, 4 days), Q47 (no date recorded)');
    expect(blockedOnAdamLine([], 0)).toBe('report only: 0 open rows blocked on Adam');
  });
});

describe('the repo’s QUEUE.md', () => {
  const text = readFileSync('QUEUE.md', 'utf8');

  it('parses to items with stable ids, every one in a named section', () => {
    const items = parseQueue(text);
    expect(items.length).toBeGreaterThanOrEqual(30);
    for (const item of items) {
      expect(item.id, `an id at line ${item.line}`).toMatch(/^Q\d+$/);
      expect(item.section, `${item.id} is under a heading`).not.toBe('');
    }
  });

  it('says in one line what its check cannot do: a clean report is not proof the list is complete', () => {
    /* Whitespace-tolerant: the sentence wraps at 80 in the file, and the claim is the sentence, not its line breaks. */
    expect(text).toMatch(/cannot\s+notice\s+an\s+item\s+that\s+was\s+never\s+written\s+down/);
    expect(text).toMatch(/not\s+proof\s+(that\s+)?the\s+list\s+is\s+complete/);
  });

  it('does not list the unbuilt handoff steps as items: they are the twins test’s, derived and never restated', () => {
    expect(text).toMatch(/handoff-unbuilt\.json/);
  });

  /*
    Assertion queue-1, the one numbered line in the check (the coordinator, 5 Nov;
    named for its script, since check-index's assertion 1 is "§65 rows=0"):
    QUEUE.md restates no unbuilt handoff step. The motivating defect is the
    coordinator's own, named by them: the queue content handed over restated
    all six unbuilt steps as items Q13 to Q18, carrying their heads verbatim,
    and they had to be retired. Two hand-maintained copies of one list, in the
    document the assertion guards.
  */
  it('assertion queue-1: restates no unbuilt handoff step', () => {
    const heads = (JSON.parse(readFileSync('scripts/handoff-unbuilt.json', 'utf8')) as Array<{ head: string }>).map((u) => u.head);
    expect(restatements(parseQueue(text), heads)).toEqual([]);
  });
});

describe('the check as a command', () => {
  const run = (queueFile: string, unbuiltFile?: string) => {
    const r = spawnSync('node', ['scripts/check-queue.mjs'], { env: { ...process.env, QUEUE_FILE: queueFile, ...(unbuiltFile === undefined ? {} : { UNBUILT_FILE: unbuiltFile }) }, encoding: 'utf8' });
    return { status: r.status, out: r.stdout };
  };

  it('exits 0 on the repo’s QUEUE.md and prints the report-only lines with no PASS or FAIL beside them', () => {
    const { status, out } = run('QUEUE.md');
    expect(status).toBe(0);
    expect(out).toMatch(/consistency, report only/);
    expect(out).toMatch(/^PASS queue-1 restates no unbuilt handoff step/m);
  });

  it('prints the blocked-on-Adam line on the repo’s QUEUE.md', () => {
    expect(run('QUEUE.md').out).toMatch(/^report only: \d+ open rows blocked on Adam/m);
  });

  it('prints queue-2’s coverage on the repo’s QUEUE.md, the open rows counted from the file', () => {
    const { out } = run('QUEUE.md');
    const open = parseQueue(readFileSync('QUEUE.md', 'utf8')).filter((i) => i.status === 'open').length;
    expect(out).toMatch(new RegExp(`^(NOTHING CHECKED|PASS) queue-2 .* — \\d+ of ${open} open rows name their ruling`, 'm'));
  });

  it('exits 1 with FAIL queue-1 on a staged file that carries an unbuilt step’s head as an item, and still prints the report', () => {
    /*
      A step written for this test, in a list written for this test, that no one will build. Until 7 Nov the fixture
      named a live step, §65, and failed when step 172 numbered it (expected 1, got 0); naming another live step only
      moves the day it breaks (the coordinator, 7 Nov).
    */
    const head = '§Z.0: a step that exists only in this test';
    const unbuilt = join(tmpdir(), `unbuilt-${process.pid}.json`);
    writeFileSync(unbuilt, JSON.stringify([{ head, status: 'unbuilt', evidence: 'synthetic' }]));
    const staged = join(tmpdir(), `queue-${process.pid}.md`);
    writeFileSync(staged, `## Q\n\n| id | status | item | record lives in |\n|---|---|---|---|\n| Q18 | open | ${head}, restated as an item | the handoff |\n`);
    try {
      const { status, out } = run(staged, unbuilt);
      expect(status).toBe(1);
      expect(out).toMatch(/^FAIL queue-1 restates no unbuilt handoff step/m);
      expect(out).toContain(`Q18 restates "${head}"`);
      expect(out).toMatch(/consistency, report only/);
    } finally {
      unlinkSync(staged);
      unlinkSync(unbuilt);
    }
  });
});
