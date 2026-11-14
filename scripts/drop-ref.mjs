#!/usr/bin/env node
/**
 * **docs/design as captured when a Design drop lands, before anything runs against it.**
 *
 *     node scripts/drop-ref.mjs    # on arrival, before the index; exits 1 on the committed state
 *
 * Keeps docs/design as it stands on disk at capture, ignored files included, as a commit
 * under refs/drops/<date>-NN whose parent is the drop before it. It goes in
 * through a throwaway index, so HEAD, the real index and the working tree
 * are untouched, and the ref is on no branch, so neither the commit path nor
 * a push of the branch carries it.
 *
 * Then it says what differs from the last drop, file by file and sentence by
 * sentence. A drop sits uncommitted while the index runs, and on 25 Oct a
 * corrected drop was relayed with nothing saying a new generation had
 * arrived, so a failing assertion read as an unexplained edit. It also gives
 * Design a copy of its own send to compare a claim against.
 *
 * Read one back with `git show refs/drops/<name>:docs/design/<file>`, and
 * compare two with `git diff <a> <b>`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { blocksOf, diffProse, sentencesOf } from './export-diff.mjs';

const DIR = 'docs/design';
const PREFIX = 'refs/drops/';

/** The next name for `date`: numbered within the day, so two drops in one day keep two refs. */
export function nextRefName(existing, date) {
  const taken = existing
    .map((name) => new RegExp(`^${PREFIX}${date}-(\\d+)$`).exec(name)?.[1])
    .filter((n) => n !== undefined)
    .map(Number);
  const next = taken.length === 0 ? 1 : Math.max(...taken) + 1;
  return `${PREFIX}${date}-${String(next).padStart(2, '0')}`;
}

const git = (args, env) => execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/*
  A ref is named by when it was captured, never by what arrived (the coordinator, 25 Oct). It is the whole
  directory, so one captured after a single file was copied in holds every other file as it stood before:
  "the 12:53 drop" would be wrong about 49 of its 50 files, and "captured at 13:21" is not.
*/
const capturedAt = (ref) => git(['log', '-1', '--format=%cd', '--date=format-local:%H:%M:%S on %Y-%m-%d', ref]);

/** The tree of docs/design as on disk, written through an index of its own. */
function treeOfDisk() {
  const scratch = mkdtempSync(join(tmpdir(), 'drop-ref-'));
  try {
    const env = { GIT_INDEX_FILE: join(scratch, 'index') };
    git(['add', '--force', '--', DIR], env);
    return git(['write-tree'], env);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Each file under docs/design in a tree or commit, path to blob. */
function blobs(ref) {
  const entries = git(['ls-tree', '-r', '-z', ref, '--', DIR]).split('\0').filter(Boolean);
  return new Map(entries.map((entry) => { const [meta, path] = entry.split('\t'); return [path, meta.split(' ')[2]]; }));
}

/*
  The committed state is not a drop (26 Oct). Run to find out whether a drop had arrived, this once captured
  the tree after an intake, whose differences from the last drop were Code's own restored lines. That state is
  the one that matches HEAD: every tracked file as committed, and every file HEAD does not hold as the last drop
  had it. "Nothing uncommitted" is not the test, because a drop that brings a file not yet allowlisted is
  ignored and invisible to git status, as the Mood Pick target was when it arrived.
*/
function isCommittedState(tree, previous) {
  const [disk, head, last] = [blobs(tree), blobs('HEAD'), blobs(previous)];
  for (const [path, blob] of head) if (disk.get(path) !== blob) return false;
  for (const [path, blob] of disk) if (!head.has(path) && last.get(path) !== blob) return false;
  return true;
}

const isBinary = (ref, path) => git(['diff', '--numstat', `${ref.from}`, `${ref.to}`, '--', path]).startsWith('-\t-\t');

/** What differs between two drops, as lines to print. */
function report(from, to) {
  const lines = [];
  const changes = git(['diff', '--name-status', '--no-renames', from, to]).split('\n').filter(Boolean);
  for (const change of changes) {
    const [status, path] = change.split('\t');
    if (status === 'A') { lines.push(`  added    ${path}`); continue; }
    if (status === 'D') { lines.push(`  gone     ${path}`); continue; }
    lines.push(`  changed  ${path}`);
    if (isBinary({ from, to }, path)) { lines.push('    (binary)'); continue; }
    const d = diffProse(git(['show', `${from}:${path}`]), git(['show', `${to}:${path}`]));
    if (d.removed.length + d.reworded.length + d.added.length === 0) { lines.push('    markup only: no sentence differs'); continue; }
    for (const r of d.reworded) lines.push(`    reworded`, `      was: ${r.was}`, `      now: ${r.now}`);
    for (const s of d.removed) lines.push(`    removed: ${s}`);
    for (const s of d.added) lines.push(`    added: ${s}`);
  }
  return lines;
}

/*
  A section's governs row follows its target, or the drop says it stands
  (the coordinator, 28 Oct). Thirteen of 59 rows were stale, six because a
  withdrawal moved a ruling between sections and seven because a ruling was
  added to a section whose row never mentioned it; both happen when a change
  file is written, so this reads at arrival. For every §-section whose
  sentences differ between the last drop and this one, a change file in the
  drop (a .md that is not the handoff, WITHDRAWALS or DESIGN-RULES) must edit
  the row ("§T.2, description:" or "§T.2, title:") or say it stands ("§T.2"
  in a sentence with "row stands", "row unchanged" or "no change"). A
  section unaddressed is named and the run exits 1, which stops the intake.
*/
const OWN_FILES = new Set(['HANDOFF-wall-and-pull.md', 'WITHDRAWALS.md', 'DESIGN-RULES.md']);

function sentencesBySection(html) {
  const out = new Map();
  for (const { sectionId: id, block } of blocksOf(html)) {
    if (id === null) continue;
    out.set(id, [...(out.get(id) ?? []), ...sentencesOf(block)]);
  }
  return out;
}

/*
  What no section claims, named where it is read (8 Nov): since 9 Nov a caption ends no section (`headingOf`), so this
  is only a change before a card's first section heading; it is attributed to no section and no governs row is checked
  for it, and it is named so a green check is not read as covering it.
*/
function sentencesByCaption(html) {
  const out = new Map();
  for (const { section, sectionId, block } of blocksOf(html)) {
    if (sectionId !== null) continue;
    const heading = section.split(' › ')[0];
    if (heading === '') continue;
    out.set(heading, [...(out.get(heading) ?? []), ...sentencesOf(block)]);
  }
  return out;
}

export function unattributedChanges(before, after) {
  const [was, now] = [sentencesByCaption(before), sentencesByCaption(after)];
  const headings = [...new Set([...was.keys(), ...now.keys()])];
  return headings.filter((h) => JSON.stringify([...(was.get(h) ?? [])].sort()) !== JSON.stringify([...(now.get(h) ?? [])].sort()));
}

export function changedSections(before, after) {
  const [was, now] = [sentencesBySection(before), sentencesBySection(after)];
  const ids = new Set([...was.keys(), ...now.keys()]);
  return [...ids].filter((id) => JSON.stringify([...(was.get(id) ?? [])].sort()) !== JSON.stringify([...(now.get(id) ?? [])].sort())).sort();
}

/**
 * How a change file addresses a section's row: 'edited', 'stands' or null.
 * Read in Design's own phrasings, not one form (28 Oct, when the first
 * detector refused "Anchored on the row's first cell, `| §W.8 |`. Append to
 * its description" and "The §T.6 governs row is unchanged, because"): a
 * paragraph that names the section and the row, its description or its
 * title is an edit; a sentence that names the section and says the row
 * stands, is unchanged or needs no change is a standing.
 */
export function rowAddressed(changeFile, id) {
  /* Not §W.80 or §W.8.1; a full stop that ends "**§P.5.**" is still §P.5. */
  const names = new RegExp(`§${id.replace('.', '\\.')}(?!\\d|\\.\\d)`);
  const stands = sentencesOf(changeFile).some((s) => names.test(s) && /\brow (?:is |was )?(?:stands|unchanged)\b|\bno change\b/i.test(s));
  if (stands) return 'stands';
  const edited = changeFile.split(/\n[ \t]*\n/).some((para) => names.test(para) && /\b(?:description|title|governs row)\b/i.test(para));
  if (edited) return 'edited';
  /* "## Change 4 — governs rows" over a list of "- **§P.5.** Append: …" (8 Nov): the heading names the rows. */
  const underRowsHeading = changeFile
    .split(/^(?=#{1,6} )/m)
    .some((part) => /^#{1,6} [^\n]*\bgoverns rows?\b/i.test(part) && names.test(part));
  return underRowsHeading ? 'edited' : null;
}

function governs(from, to) {
  const changes = git(['diff', '--name-status', '--no-renames', from, to]).split('\n').filter(Boolean).map((c) => c.split('\t'));
  const changeFiles = changes
    .filter(([status, path]) => status !== 'D' && path.endsWith('.md') && !OWN_FILES.has(path.split('/').pop()))
    .map(([, path]) => ({ path, text: git(['show', `${to}:${path}`]) }));
  const lines = [];
  let unaddressed = 0;
  for (const [status, path] of changes) {
    if (status !== 'M' || !path.endsWith('.dc.html')) continue;
    for (const caption of unattributedChanges(git(['show', `${from}:${path}`]), git(['show', `${to}:${path}`]))) {
      lines.push(`  governs: a change under "${caption.slice(0, 70)}" in ${path} stands before any section heading, so it is attributed to no section and no governs row was checked for it (read that change by hand)`);
    }
    for (const id of changedSections(git(['show', `${from}:${path}`]), git(['show', `${to}:${path}`]))) {
      const found = changeFiles.map((f) => ({ ...f, how: rowAddressed(f.text, id) })).find((f) => f.how !== null);
      if (found === undefined) {
        unaddressed += 1;
        lines.push(`  governs: §${id} changed in ${path}, and no change file in the drop edits its governs row or says it stands`);
      } else {
        lines.push(`  governs: §${id} changed in ${path}; its row is ${found.how === 'edited' ? 'edited' : 'said to stand'} in ${found.path}`);
      }
    }
  }
  return { lines, unaddressed };
}

/** A change file's name without its " - for Code to <verb>" ending, as the landed lists name files. */
const changeFileName = (path) => /([^/]+) - for Code to [a-z]+(?:\.md)?$/.exec(path)?.[1] ?? null;

/**
 * The files a change file's landed list says Design has offered: the quoted names on its "Offered" lines, never "this
 * file", and nothing from the list's other lines (superseded, held) or from outside the list (the coordinator, 14 Nov).
 */
export function offeredNames(text) {
  const at = text.search(/^## Landed list/m);
  if (at < 0) return [];
  const list = text.slice(at).split('\n').slice(1);
  const end = list.findIndex((l) => /^## /.test(l));
  return (end < 0 ? list : list.slice(0, end))
    .filter((l) => /^- \*\*Offered/.test(l))
    .flatMap((l) => [...l.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1].trim()))
    /* Design's file names start with a capital; a quoted word in the line's prose ("now", 10 Nov) is not a file. */
    .filter((name) => /^[A-Z0-9]/.test(name));
}

/** Each name offered by a newly arrived change file's landed list that no drop ref and no disk holds, with the file that named it. */
export function offeredMissing(added, known) {
  const missing = [];
  for (const { name, text } of added) for (const offered of offeredNames(text)) if (!known.has(offered) && !missing.some((m) => m.name === offered)) missing.push({ name: offered, by: name });
  return missing;
}

/*
  At the drop, not an export later: "Answer below the count line" was offered and never reached the disk, and nothing
  said so for a day. Read only from the new change files' lists, so the caveat is printed with every result.
*/
function landedLists(from, to, refs) {
  const added = git(['diff', '--name-status', '--no-renames', from, to, '--', DIR]).split('\n').filter((l) => l.startsWith('A\t')).map((l) => l.slice(2))
    .filter((path) => changeFileName(path) !== null)
    .map((path) => ({ name: changeFileName(path), text: git(['cat-file', 'blob', `${to}:${path}`]) }));
  if (added.length === 0) return [];
  const known = new Set(refs.flatMap((ref) => git(['ls-tree', '-r', '--name-only', ref, '--', DIR]).split('\n')).map(changeFileName).filter((n) => n !== null));
  const named = new Set(added.flatMap((a) => offeredNames(a.text)));
  const missing = offeredMissing(added, known);
  const lines = missing.map((m) => `  offered, not on disk or in any ref: "${m.name}" (named by ${m.by}\u2019s landed list)`);
  if (missing.length === 0) lines.push(`  landed lists: ${named.size} offered file${named.size === 1 ? '' : 's'} named by the new change files, all on disk or in a ref`);
  lines.push('  (this reads only as complete as Design\u2019s landed lists: a file no list names is not looked for, so a clean line is not proof nothing is missing)');
  return lines;
}

function main() {
  const existing = git(['for-each-ref', '--format=%(refname)', PREFIX]).split('\n').filter(Boolean).sort();
  const previous = existing.at(-1);
  const tree = treeOfDisk();
  if (previous !== undefined && git(['rev-parse', `${previous}^{tree}`]) === tree) {
    process.stdout.write(`The same as ${previous}: nothing new has arrived, and no ref was recorded.\n`);
    return 0;
  }
  if (previous !== undefined && isCommittedState(tree, previous)) {
    process.stderr.write(`${DIR} matches HEAD, and nothing HEAD does not hold differs from ${previous}: this is the committed state after an intake, not a drop, and no ref was recorded.\n`);
    return 1;
  }
  const now = new Date();
  const name = nextRefName(existing, localDate(now));
  const parent = previous === undefined ? [] : ['-p', previous];
  const commit = git(['commit-tree', tree, ...parent, '-m', `${DIR} as captured at ${localDate(now)} ${localTime(now)}: the whole directory as it stood, not only what a drop changed`]);
  const captured = `Captured ${DIR} at ${localTime(now)} on ${localDate(now)} as ${name}.`;
  /* The empty old value refuses a name already taken rather than moving it. */
  git(['update-ref', name, commit, '']);
  if (previous === undefined) {
    process.stdout.write(`${captured} The first drop ref: nothing earlier to compare it with.\n`);
    return 0;
  }
  const lines = report(previous, name);
  process.stdout.write(`${captured} It differs from ${previous}, captured at ${capturedAt(previous)}, in ${lines.filter((l) => /^ {2}\S/.test(l)).length} file(s):\n${lines.join('\n')}\n`);
  const offered = landedLists(previous, name, [...existing, name]);
  if (offered.length > 0) process.stdout.write(`${offered.join('\n')}\n`);
  const rows = governs(previous, name);
  if (rows.lines.length > 0) process.stdout.write(`${rows.lines.join('\n')}\n`);
  if (rows.unaddressed > 0) {
    process.stdout.write(`${rows.unaddressed} changed section(s) with the governs row unaddressed: the drop ref stands, and the intake waits for a change file that edits the row or says it stands.\n`);
    return 1;
  }
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
