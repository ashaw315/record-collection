import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { consistency, parseQueue, restatements } from '../../scripts/check-queue.mjs';

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

  it('reports a status outside open, done, dropped and ruled', () => {
    const items = parseQueue(FIXTURE.replace('| Q2 | open |', '| Q2 | maybe |'));
    expect(consistency(items, { resolves, targetsText })).toContainEqual('Q2: status "maybe" is not one of open, done, dropped, ruled (line 8)');
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
    Assertion 1, the one numbered line in the check (the coordinator, 5 Nov):
    QUEUE.md restates no unbuilt handoff step. The motivating defect is the
    coordinator's own, named by them: the queue content handed over restated
    all six unbuilt steps as items Q13 to Q18, carrying their heads verbatim,
    and they had to be retired. Two hand-maintained copies of one list, in the
    document the assertion guards.
  */
  it('assertion 1: restates no unbuilt handoff step', () => {
    const heads = (JSON.parse(readFileSync('scripts/handoff-unbuilt.json', 'utf8')) as Array<{ head: string }>).map((u) => u.head);
    expect(restatements(parseQueue(text), heads)).toEqual([]);
  });
});

describe('the check as a command', () => {
  const run = (queueFile: string) => {
    const r = spawnSync('node', ['scripts/check-queue.mjs'], { env: { ...process.env, QUEUE_FILE: queueFile }, encoding: 'utf8' });
    return { status: r.status, out: r.stdout };
  };

  it('exits 0 on the repo’s QUEUE.md and prints the report-only lines with no PASS or FAIL beside them', () => {
    const { status, out } = run('QUEUE.md');
    expect(status).toBe(0);
    expect(out).toMatch(/consistency, report only/);
    expect(out).toMatch(/^PASS 1 restates no unbuilt handoff step/m);
  });

  it('exits 1 with FAIL 1 on a staged file that carries an unbuilt step’s head as an item, and still prints the report', () => {
    const staged = join(tmpdir(), `queue-${process.pid}.md`);
    writeFileSync(staged, '## Q\n\n| id | status | item | record lives in |\n|---|---|---|---|\n| Q18 | open | §65: the tracklist and the credits, read from the release text | the handoff |\n');
    try {
      const { status, out } = run(staged);
      expect(status).toBe(1);
      expect(out).toMatch(/^FAIL 1 restates no unbuilt handoff step/m);
      expect(out).toMatch(/Q18 restates "§65: the tracklist and the credits"/);
      expect(out).toMatch(/consistency, report only/);
    } finally {
      unlinkSync(staged);
    }
  });
});
