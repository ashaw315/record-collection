import { describe, expect, it } from 'vitest';
import { landedList, landedText } from '../../scripts/landed-list.mjs';

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
