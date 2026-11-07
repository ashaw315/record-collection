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
 * A record since 7 Nov (the coordinator): the drop refs (`scripts/drop-ref.mjs`)
 * hold every change file as it arrived, and are local, never pushed and backed
 * up by nothing, so each intake (`scripts/apply-code-region.mjs`) appends the
 * file's name, its first ref and the capture's time to the committed
 * `docs/design-landed.jsonl`, whose first line is its horizon. A line's landing
 * is the first commit holding it; the backfill's lines carry theirs from
 * history (the first design-touching commit after the capture), since the
 * backfill commit is not when they landed. Two dating rules, because the
 * ruling's one rule ("the landing commit is the first commit holding the
 * line", 7 Nov) is right for a line an intake adds and cannot describe the
 * backfill, whose 54 lines arrive in one commit: the coordinator recorded the
 * hole against the ruling, and Code's build caught it before it shipped. The export reads HEAD's record, the
 * refs only where HEAD has none (`scripts/export-handoff.mjs`).
 * `test/repo/landed-list.test.ts` holds the pure part and the record against
 * the refs.
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

/* Absent is not empty: drop refs are local and never pushed, so a runner has none, and an empty list there would read as "Code applied nothing". A committed record is read in their place, and its horizon heads the list. */
export function landedText(list, { sha, date }, { drops, horizon = null } = { drops: list.length }) {
  const head = `Export note, not part of the file: the change files Code has applied, as of ${sha} on ${date}, each with the drop ref and date it arrived on and the commit it landed at. Read-only for Design: it is derived from ${horizon === null ? 'the drop refs' : 'the committed record (docs/design-landed.jsonl)'} and the history, and the comparison against Design's own list is Design's half.`;
  if (horizon === null && drops === 0) return `${head}\n\nNO DROP REFS in this repository: the list cannot be derived here, which is not the same as none applied.\n`;
  const lines = list.map((l) => `- ${l.file} — arrived ${l.ref} (${l.arrived}); ${l.landed === null ? 'not yet landed' : `landed ${l.landed.sha} (${l.landed.date})`}`);
  return `${head}\n\n${horizon === null ? '' : `${horizon}\n\n`}${lines.join('\n')}\n`;
}

/** The committed record of applied change files (the coordinator, 7 Nov). */
export const RECORD = 'docs/design-landed.jsonl';

/**
 * The record after an intake: created with its horizon if absent, then a line for each change file in the refs it
 * does not yet list, in arrival order. The head is derived from the refs at creation and never rewritten, so the
 * record says where it begins rather than letting its first entry pass for the beginning of the history.
 * @returns {{ text: string | null, appended: string[] }}
 */
export function recordUpdate(existing, drops, today, commits = []) {
  /* The backfill's lines carry their landing from history, since the commit adding them is not when they landed; an intake's own line is dated by the commit that adds it. */
  const arrivals = landedList({ drops, commits: existing === null ? commits : [] });
  const listed = new Set(existing === null ? [] : parseRecord(existing).entries.map((e) => e.file));
  const fresh = arrivals.filter((a) => !listed.has(a.file));
  if (existing === null && fresh.length === 0) return { text: null, appended: [] };
  if (fresh.length === 0) return { text: existing, appended: [] };
  let text = existing;
  if (text === null) {
    const [first, last] = [drops[0], drops[drops.length - 1]];
    const begins = fresh[0];
    const horizon =
      `This record begins at ${begins.ref} (${begins.arrived}), the first change file in the drop refs, backfilled on ${today} from ${drops.length} drop refs (${first.ref} to ${last.ref}). ` +
      `Drop refs begin at ${first.ref} (${first.date}); a change file applied before the first ref is not in this record, and nothing in the repository says whether there was one. ` +
      'From the backfill on, each intake appends its own lines; the landing commit of each is the first commit holding its line.';
    text = `${JSON.stringify({ horizon, begins: begins.arrived, first: begins.ref, backfilledOn: today })}\n`;
  }
  for (const a of fresh) {
    const entry = { file: a.file, ref: a.ref, captured: a.arrived };
    if (a.landed !== null) entry.landed = { ...a.landed, by: 'backfill: the first design-touching commit after the capture' };
    text += `${JSON.stringify(entry)}\n`;
  }
  return { text, appended: fresh.map((a) => a.file) };
}

/** The record's horizon sentence and its entries, each with the exact line `git log -S` finds its landing by. */
export function parseRecord(text) {
  const [head, ...rest] = text.trim().split('\n');
  const horizon = JSON.parse(head).horizon;
  return { horizon, entries: rest.map((line) => ({ ...JSON.parse(line), line })) };
}

/** The list from the record; `landingOf(line)` is the first commit holding the line, or null. */
export function landedFromRecord(record, landingOf) {
  return record.entries.map((e) => ({ file: e.file, ref: e.ref, arrived: e.captured, landed: e.landed === undefined ? landingOf(e.line) : { sha: e.landed.sha, date: e.landed.date } }));
}

/** The export's text: from the committed record at HEAD where it exists, else from the drop refs, else the absence line. */
export function landedExport({ sha, date }) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let committed = null;
  try { committed = git('show', `HEAD:${RECORD}`); } catch { committed = null; }
  if (committed !== null && committed.trim() !== '') {
    const record = parseRecord(committed);
    const landingOf = (line) => {
      const first = git('log', '--reverse', '--format=%h %cI', '-S', line, 'HEAD', '--', RECORD).trim().split('\n')[0];
      if (!first) return null;
      const [s, d] = first.split(' ');
      return { sha: s, date: d };
    };
    return landedText(landedFromRecord(record, landingOf), { sha, date }, { drops: 0, horizon: record.horizon });
  }
  const input = fromGit();
  return landedText(landedList(input), { sha, date }, { drops: input.drops.length });
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
  process.stdout.write(landedExport({ sha, date }));
}
