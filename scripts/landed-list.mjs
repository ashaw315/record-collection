#!/usr/bin/env node
/**
 * **The change files Code has applied, with the drop ref and date each came
 * in on and the commit it landed at (Design's ask, approved by the
 * coordinator, 6 Nov).**
 *
 *     node scripts/landed-list.mjs     # prints the list as the export writes it
 *
 * "First paint is styled" was offered on 5 Nov and never reached Code, so
 * §43's ruling sat in the repo for a day with no step. Design's sends state
 * each change file's state (offered, relayed by Adam, landed) with its dates;
 * Code's export lists what it applied, so a file in Design's list and missing
 * from Code's never arrived, and one in Code's and not in Design's is one
 * Code applied that Design does not own. The arrival ref and date beside each
 * file are the coordinator's addition: a comparison by name alone lets a file
 * sit in "relayed, not yet in an export" indefinitely with nothing firing;
 * with dates on both sides a gap of more than one export cycle is visible.
 *
 * A listing, not a record: the drop refs (`scripts/drop-ref.mjs`) hold every
 * change file as it arrived, the first ref holding a file is its arrival, and
 * its landing is the first commit on HEAD's history after that capture which
 * touches docs/design or the handoff's code region or unbuilt list, which is
 * what an intake commit is. The export writes it beside the handoff
 * (`scripts/export-handoff.mjs`). `test/repo/landed-list.test.ts` holds the
 * pure part.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const CHANGE_FILE = /^docs\/design\/(.+) - for Code to apply\.md$/;

/**
 * @param {{ drops: { ref: string, date: string, files: string[] }[], commits: { sha: string, date: string, touchesDesign: boolean }[] }} input
 *   drops oldest first; commits oldest first, HEAD's history.
 */
export function landedList({ drops, commits }) {
  const seen = new Map();
  for (const d of drops) {
    for (const f of d.files) {
      const m = f.match(CHANGE_FILE);
      if (m === null || seen.has(m[1])) continue;
      seen.set(m[1], { file: m[1], ref: d.ref, arrived: d.date });
    }
  }
  return [...seen.values()].map((entry) => {
    const at = Date.parse(entry.arrived);
    const landing = commits.find((c) => c.touchesDesign && Date.parse(c.date) > at);
    return { ...entry, landed: landing === undefined ? null : { sha: landing.sha, date: landing.date } };
  });
}

/* Absent is not empty: drop refs are local and never pushed, so a runner has none, and an empty list there would read as "Code applied nothing". */
export function landedText(list, { sha, date }, { drops } = { drops: list.length }) {
  const head = `Export note, not part of the file: the change files Code has applied, as of ${sha} on ${date}, each with the drop ref and date it arrived on and the commit it landed at. Read-only for Design: it is derived from the drop refs and the history, and the comparison against Design's own list is Design's half.`;
  if (drops === 0) return `${head}\n\nNO DROP REFS in this repository: the list cannot be derived here, which is not the same as none applied.\n`;
  const lines = list.map((l) => `- ${l.file} — arrived ${l.ref} (${l.arrived}); ${l.landed === null ? 'not yet landed' : `landed ${l.landed.sha} (${l.landed.date})`}`);
  return `${head}\n\n${lines.join('\n')}\n`;
}

/** The drop refs and HEAD's history, from git. */
export function fromGit() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  const refs = git('for-each-ref', '--sort=committerdate', '--format=%(refname) %(committerdate:iso-strict)', 'refs/drops').trim().split('\n').filter(Boolean);
  const drops = refs.map((line) => {
    const [ref, date] = line.split(' ');
    return { ref, date, files: git('ls-tree', '-r', '--name-only', ref).trim().split('\n') };
  });
  const log = git('log', '--reverse', '--format=%x00%h %cI', '--name-only', 'HEAD').split('\0').filter((c) => c.trim() !== '');
  const commits = log.map((chunk) => {
    const [first, ...files] = chunk.trim().split('\n');
    const [sha, date] = first.split(' ');
    return { sha, date, touchesDesign: files.some((f) => f.startsWith('docs/design/') || f === 'scripts/handoff-code-region.json' || f === 'scripts/handoff-unbuilt.json') };
  });
  return { drops, commits };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const input = fromGit();
  process.stdout.write(landedText(landedList(input), { sha, date }, { drops: input.drops.length }));
}
