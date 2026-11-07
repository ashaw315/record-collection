import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RECORD, fromGit, landedFromRecord, landedList, landedText, parseRecord, recordUpdate } from '../../scripts/landed-list.mjs';

/**
 * **The export bundle lists every change file Code has applied, with the
 * drop ref and date it came in on and the commit it landed at (Design's
 * ask, approved by the coordinator, 6 Nov).**
 *
 * "First paint is styled" was offered for download on 5 Nov and never
 * reached Code, so §43's ruling sat in the repo for a day with no step, and
 * no check reads a step that never arrived. Design's sends now state which
 * change files have landed; Code's export lists what it applied, so a file
 * in Design's list and missing from Code's is one that never arrived. The
 * coordinator's addition: Design's list has three states and a comparison
 * by name uses two, so a file can sit in "relayed, not yet in an export"
 * indefinitely with nothing firing. The arrival date beside each applied
 * file gives the other side a comparable date, so a gap of more than one
 * export cycle is visible rather than inferred.
 *
 * A listing, not a record: the drop refs hold every change file as it
 * arrived, and an intake commit is the first commit on main after the
 * capture that touches docs/design or the handoff's code region or unbuilt
 * list. Pure over what git reports, so it is staged here without git.
 *
 * Fails against a list keyed on the latest ref holding a file rather than
 * the first; one that takes any later commit as the landing rather than the
 * first design-touching one; one that lists a file arrived and not yet
 * landed as landed.
 */
const drops = [
  { ref: 'refs/drops/2026-11-05-01', date: '2026-11-05T10:07:18-05:00', files: ['docs/design/Tracklist and credits - for Code to apply.md'] },
  { ref: 'refs/drops/2026-11-06-01', date: '2026-11-06T17:36:09-05:00', files: ['docs/design/Tracklist and credits - for Code to apply.md', 'docs/design/Rules not snapshots - for Code to apply.md'] },
  { ref: 'refs/drops/2026-11-06-03', date: '2026-11-06T19:04:58-05:00', files: ['docs/design/Tracklist and credits - for Code to apply.md', 'docs/design/Rules not snapshots - for Code to apply.md', 'docs/design/First paint is styled - for Code to apply.md'] },
];
const commits = [
  { sha: 'aaaaaaa', date: '2026-11-05T09:00:00-05:00', touchesDesign: true },
  { sha: 'fcab6ed', date: '2026-11-05T11:30:00-05:00', touchesDesign: true },
  { sha: 'bbbbbbb', date: '2026-11-06T17:40:00-05:00', touchesDesign: false },
  { sha: '41bbc92', date: '2026-11-06T17:55:00-05:00', touchesDesign: true },
];

describe('landedList', () => {
  it('lists each change file once, with the FIRST drop ref holding it and that ref’s date', () => {
    const list = landedList({ drops, commits });
    expect(list.map((l) => [l.file, l.ref, l.arrived])).toEqual([
      ['Tracklist and credits', 'refs/drops/2026-11-05-01', '2026-11-05T10:07:18-05:00'],
      ['Rules not snapshots', 'refs/drops/2026-11-06-01', '2026-11-06T17:36:09-05:00'],
      ['First paint is styled', 'refs/drops/2026-11-06-03', '2026-11-06T19:04:58-05:00'],
    ]);
  });
  it('takes the landing as the first design-touching commit after the capture, not any later commit', () => {
    const list = landedList({ drops, commits });
    expect(list[0].landed).toEqual({ sha: 'fcab6ed', date: '2026-11-05T11:30:00-05:00' });
    expect(list[1].landed, 'bbbbbbb came first but touched no design file').toEqual({ sha: '41bbc92', date: '2026-11-06T17:55:00-05:00' });
  });
  it('lists a file that arrived with no design-touching commit after it as arrived and not landed', () => {
    const list = landedList({ drops, commits });
    expect(list[2].landed).toBeNull();
  });
});

describe('landedText', () => {
  it('writes one line per file in arrival order, the name, the ref and date, and the commit and date or "not yet landed"', () => {
    const text = landedText(landedList({ drops, commits }), { sha: '41bbc92', date: '2026-11-06' });
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^Export note, not part of the file: the change files Code has applied, as of 41bbc92 on 2026-11-06/);
    expect(text).toContain('- Tracklist and credits — arrived refs/drops/2026-11-05-01 (2026-11-05T10:07:18-05:00); landed fcab6ed (2026-11-05T11:30:00-05:00)');
    expect(text).toContain('- First paint is styled — arrived refs/drops/2026-11-06-03 (2026-11-06T19:04:58-05:00); not yet landed');
  });
});

/*
  **The record made durable (the coordinator, 7 Nov).** The list above lives in this working copy's drop refs:
  local, never pushed, backed up by nothing, and the thing Design diffs against. Each intake appends the change
  file's name, its drop ref and the capture's time to a committed file, `docs/design-landed.jsonl`; the landing
  commit is the first commit holding the line (a file cannot name the commit that adds it), found with `git log -S`
  in any clone. **The record's first line is its horizon**, derived when the file is created: what it was
  backfilled from, where it begins, and that a change file applied before that is not in it, so a reader does not
  take its first entry for the beginning of the history. Fails against: a record without its head; a head written
  from anything but the refs; an append that repeats a listed file or rewrites the head; a list that reads the
  refs when the record exists; landing commits taken from anything but the line's first commit.
*/
describe('the committed record', () => {
  const refs = [
    { ref: 'refs/drops/2026-10-25-00', date: '2026-10-25T09:51:27-04:00', files: ['docs/design/HANDOFF-wall-and-pull.md'] },
    ...drops,
  ];
  it('is created with its horizon as the first line, derived from the refs, then one line per change file in arrival order', () => {
    const { text, appended } = recordUpdate(null, refs, '2026-11-07');
    const lines = (text ?? '').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines[0].horizon).toMatch(/^This record begins at refs\/drops\/2026-11-05-01 \(2026-11-05T10:07:18-05:00\), the first change file in the drop refs, backfilled on 2026-11-07 from 4 drop refs \(refs\/drops\/2026-10-25-00 to refs\/drops\/2026-11-06-03\)\./);
    expect(lines[0].horizon).toMatch(/Drop refs begin at refs\/drops\/2026-10-25-00 \(2026-10-25T09:51:27-04:00\); a change file applied before the first ref is not in this record, and nothing in the repository says whether there was one\./);
    expect(lines[0].begins).toBe('2026-11-05T10:07:18-05:00');
    expect(lines.slice(1)).toEqual([
      { file: 'Tracklist and credits', ref: 'refs/drops/2026-11-05-01', captured: '2026-11-05T10:07:18-05:00' },
      { file: 'Rules not snapshots', ref: 'refs/drops/2026-11-06-01', captured: '2026-11-06T17:36:09-05:00' },
      { file: 'First paint is styled', ref: 'refs/drops/2026-11-06-03', captured: '2026-11-06T19:04:58-05:00' },
    ]);
    expect(appended).toEqual(['Tracklist and credits', 'Rules not snapshots', 'First paint is styled']);
  });
  it('appends only files it does not list, and never rewrites its head', () => {
    const first = recordUpdate(null, refs.slice(0, 3), '2026-11-07').text ?? '';
    const { text, appended } = recordUpdate(first, refs, '2026-11-09');
    expect(appended).toEqual(['First paint is styled']);
    expect((text ?? '').startsWith(first)).toBe(true);
    expect(recordUpdate(text, refs, '2026-11-10')).toEqual({ text, appended: [] });
  });
  it('with no record and no change file in any ref writes nothing', () => {
    expect(recordUpdate(null, refs.slice(0, 1), '2026-11-07')).toEqual({ text: null, appended: [] });
  });
  it('a backfilled line carries its landing from history, since the backfill commit is not when it landed; an intake’s line does not', () => {
    const backfill = recordUpdate(null, refs.slice(0, 3), '2026-11-07', commits).text ?? '';
    const lines = backfill.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines[1].landed, 'Tracklist and credits landed at fcab6ed, not at the backfill').toEqual({ sha: 'fcab6ed', date: '2026-11-05T11:30:00-05:00', by: 'backfill: the first design-touching commit after the capture' });
    const later = parseRecord(recordUpdate(backfill, refs, '2026-11-09', commits).text ?? '');
    expect(later.entries[2].landed, 'appended by an intake: its landing is the commit that adds the line').toBeUndefined();
    const list = landedFromRecord(later, () => ({ sha: 'b4ckf11', date: '2026-11-07T09:30:00-05:00' }));
    expect(list[0].landed?.sha, 'a backfilled landing is read, not the -S commit').toBe('fcab6ed');
    expect(list[2].landed?.sha, 'an appended line is dated by the first commit holding it').toBe('b4ckf11');
  });
  it('lists from the record with each landing as the first commit holding its line, and prints the horizon at the head', () => {
    const text = recordUpdate(null, refs, '2026-11-07').text ?? '';
    const record = parseRecord(text);
    const list = landedFromRecord(record, (line: string) => (line.includes('First paint') ? null : { sha: 'abc1234', date: '2026-11-07T09:40:00-05:00' }));
    expect(list.map((l: { file: string; ref: string; landed: { sha: string } | null }) => [l.file, l.ref, l.landed?.sha ?? null])).toEqual([
      ['Tracklist and credits', 'refs/drops/2026-11-05-01', 'abc1234'],
      ['Rules not snapshots', 'refs/drops/2026-11-06-01', 'abc1234'],
      ['First paint is styled', 'refs/drops/2026-11-06-03', null],
    ]);
    const out = landedText(list, { sha: 'abc1234', date: '2026-11-07' }, { drops: 0, horizon: record.horizon });
    expect(out).toMatch(/^This record begins at refs\/drops\/2026-11-05-01/m);
    expect(out).toContain('- First paint is styled — arrived refs/drops/2026-11-06-03 (2026-11-06T19:04:58-05:00); not yet landed');
    expect(out, 'a record read with no refs is not the absence line').not.toMatch(/NO DROP REFS/);
  });
});

/*
  Absent is not empty (6 Nov): drop refs are local and never pushed, so on the gate's runner there are none, and
  the export test that asserted the 6 Nov files failed there (run 42324913034). An empty list would read as "Code
  applied nothing"; with no drop refs the text says the list cannot be derived here.
*/
describe('with no drop refs the list says it cannot be derived, not that nothing was applied', () => {
  it('writes the absence as its one line', () => {
    const text = landedText(landedList({ drops: [], commits }), { sha: '41bbc92', date: '2026-11-06' }, { drops: 0 });
    expect(text).toMatch(/^NO DROP REFS in this repository: the list cannot be derived here, which is not the same as none applied\.$/m);
    expect(text).not.toMatch(/^- /m);
  });
});

/*
  The intake's append, held by its outcome: the record in the tree lists every change file this working copy's drop
  refs hold. Fails when an intake ran without appending, or a drop was captured and its intake not run. Drop refs are
  local and never pushed, so on a runner there are none and nothing to compare: skipped there, by name.
*/
const hasRefs = execFileSync('git', ['for-each-ref', '--count=1', 'refs/drops'], { encoding: 'utf8' }).trim() !== '';
describe('the record against the drop refs', () => {
  it.skipIf(!hasRefs)('lists every change file in this working copy’s drop refs (skipped where there are no refs, as on a runner)', () => {
    const existing = existsSync(RECORD) ? readFileSync(RECORD, 'utf8') : null;
    expect(existing, 'the record exists').not.toBeNull();
    expect(recordUpdate(existing, fromGit().drops, 'today').appended, 'change files in the refs the record does not list').toEqual([]);
  });
});
